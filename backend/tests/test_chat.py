"""The drafting conversation: prompts, and the two calls a turn makes."""

from datetime import date

import pytest

from prelegal import chat, openrouter
from prelegal.nda import NdaFields

FILLED = NdaFields.model_validate(
    {"governingLaw": "Delaware", "partyOne": {"company": "Acme, Inc."}}
)


class TestKnownJson:
    """What the prompts are told is already in the document."""

    def test_says_so_when_nothing_is_filled_in(self):
        assert chat.known_json(NdaFields()) == "Nothing yet."

    def test_lists_what_is_filled_in(self):
        known = chat.known_json(FILLED)

        assert '"governingLaw": "Delaware"' in known
        assert '"company": "Acme, Inc."' in known

    def test_omits_blanks_the_browser_sends_for_empty_boxes(self):
        """The form posts "" for an untouched box; that is not a known value."""
        known = chat.known_json(
            NdaFields.model_validate({"purpose": "", "jurisdiction": "New Castle, DE"})
        )

        assert "purpose" not in known
        assert "New Castle, DE" in known

    def test_omits_a_party_with_nothing_in_it(self):
        known = chat.known_json(NdaFields.model_validate({"partyTwo": {"company": ""}}))

        assert known == "Nothing yet."


class TestPrompts:
    def test_the_extract_prompt_dates_the_conversation(self):
        """"Start it today" only resolves if the model knows the date."""
        prompt = chat.extract_prompt(NdaFields(), today=date(2026, 8, 19))

        assert "2026-08-19" in prompt

    def test_the_extract_prompt_spells_out_where_the_companies_go(self):
        """Without this the model reads both companies past on a dense message.

        Measured: a message naming the parties *and* settling the governing law
        recorded neither company 5 times in 5, against 5 in 5 once the mapping
        was spelled out.
        """
        prompt = chat.extract_prompt(NdaFields())

        assert "partyOne.company and partyTwo.company" in prompt

    def test_the_extract_prompt_protects_edits_made_by_hand(self):
        """Re-reporting an unchanged value would undo a correction in the form."""
        assert "already recorded and unchanged" in chat.extract_prompt(NdaFields())

    def test_the_talk_prompt_separates_what_was_just_captured(self):
        prompt = chat.talk_prompt(NdaFields(), captured=FILLED)

        assert "Delaware" in prompt
        assert "Captured from the message you are replying to" in prompt

    def test_the_talk_prompt_forbids_markdown(self):
        assert "No markdown" in chat.talk_prompt(NdaFields())

    def test_the_talk_prompt_names_what_is_left_to_ask_about(self):
        """The model asked again for values it held when left to work this out."""
        prompt = chat.talk_prompt(NdaFields(), captured=FILLED)

        assert "- the jurisdiction" in prompt
        assert "- party 2 company name" in prompt
        # Both arrived in `captured`, so neither is still outstanding.
        assert "- the governing law" not in prompt
        assert "- party 1 company name" not in prompt

    def test_the_talk_prompt_says_when_the_agreement_is_done(self):
        complete = NdaFields.model_validate(
            {
                "purpose": "Evaluating a partnership.",
                "effectiveDate": "2026-08-19",
                "governingLaw": "Delaware",
                "jurisdiction": "New Castle, DE",
                **{
                    party: {
                        "company": "Acme, Inc.",
                        "signatoryName": "Jane Doe",
                        "signatoryTitle": "CEO",
                        "noticeAddress": "legal@acme.com",
                    }
                    for party in ("partyOne", "partyTwo")
                },
            }
        )

        assert chat.outstanding(complete) == []
        assert "Say the agreement looks complete" in chat.talk_prompt(complete)


class TestOutstanding:
    """What the assistant is told is still to ask about."""

    def test_lists_everything_for_an_empty_agreement(self):
        missing = chat.outstanding(NdaFields())

        assert missing[:4] == [
            "the purpose",
            "the effective date",
            "the governing law",
            "the jurisdiction",
        ]
        assert len(missing) == 12

    def test_drops_what_has_been_filled_in(self):
        assert "the governing law" not in chat.outstanding(FILLED)

    def test_counts_a_partly_filled_party(self):
        missing = chat.outstanding(FILLED)

        assert "party 1 company name" not in missing
        assert "party 1 signatory name" in missing

    def test_treats_a_blank_string_as_missing(self):
        """The form posts "" for a box the user cleared."""
        assert "the purpose" in chat.outstanding(NdaFields.model_validate({"purpose": " "}))

    def test_ignores_the_optional_fields(self):
        """Modifications are optional and the term options always have a default."""
        missing = chat.outstanding(NdaFields())

        assert not any("modification" in item for item in missing)
        assert not any("term" in item for item in missing)


class TestRespond:
    """A turn extracts first, then writes a reply that knows what was found."""

    @pytest.fixture
    def calls(self, monkeypatch):
        """Records both calls and answers them with fixed content."""
        recorded = {}

        async def structured(messages, schema, name):
            recorded["extract"] = messages
            return {"governingLaw": "Delaware"}

        async def completion(messages):
            recorded["talk"] = messages
            return "  Which state's courts should hear disputes?  "

        monkeypatch.setattr(openrouter, "structured_completion", structured)
        monkeypatch.setattr(openrouter, "completion", completion)
        return recorded

    @pytest.mark.anyio
    async def test_returns_the_reply_and_what_it_learned(self, calls):
        turn = await chat.respond([{"role": "user", "content": "Delaware law."}], NdaFields())

        assert turn.reply == "Which state's courts should hear disputes?"
        assert turn.updates.governing_law == "Delaware"

    @pytest.mark.anyio
    async def test_tells_the_reply_what_the_extraction_just_found(self, calls):
        """Without this the assistant asks again for what it was just given."""
        await chat.respond([{"role": "user", "content": "Delaware law."}], NdaFields())

        assert "Delaware" in calls["talk"][0]["content"]

    @pytest.mark.anyio
    async def test_puts_the_instructions_first_and_keeps_the_transcript(self, calls):
        history = [
            {"role": "user", "content": "Acme and Globex."},
            {"role": "assistant", "content": "Who signs?"},
            {"role": "user", "content": "Delaware law."},
        ]

        await chat.respond(history, NdaFields())

        assert calls["extract"][0]["role"] == "system"
        assert calls["extract"][1:] == history

    @pytest.mark.anyio
    async def test_sends_only_the_most_recent_history(self, calls):
        """A runaway client must not be able to send an unbounded prompt."""
        history = [
            {"role": "user", "content": f"message {index}"}
            for index in range(chat.MAX_HISTORY + 10)
        ]

        await chat.respond(history, NdaFields())

        sent = calls["extract"][1:]
        assert len(sent) == chat.MAX_HISTORY
        assert sent[-1]["content"] == f"message {chat.MAX_HISTORY + 9}"
