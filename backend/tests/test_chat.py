"""The drafting conversation: prompts, and the two calls a turn makes."""

from datetime import date

import pytest

from prelegal import chat, openrouter
from prelegal.document_schema import DOCUMENTS, fields_model, strict_schema

NDA = DOCUMENTS["mutual-nda"]
NdaFields = fields_model("mutual-nda")

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
        prompt = chat.extract_prompt(NDA, NdaFields(), today=date(2026, 8, 19))

        assert "2026-08-19" in prompt

    def test_the_extract_prompt_spells_out_where_the_companies_go(self):
        """Without this the model reads both companies past on a dense message.

        Measured: a message naming the parties *and* settling the governing law
        recorded neither company 5 times in 5, against 5 in 5 once the mapping
        was spelled out.
        """
        prompt = chat.extract_prompt(NDA, NdaFields())

        assert "partyOne.company and partyTwo.company" in prompt

    def test_the_extract_prompt_protects_edits_made_by_hand(self):
        """Re-reporting an unchanged value would undo a correction in the form."""
        assert "already recorded and unchanged" in chat.extract_prompt(NDA, NdaFields())

    def test_the_talk_prompt_separates_what_was_just_captured(self):
        prompt = chat.talk_prompt(NDA, NdaFields(), captured=FILLED)

        assert "Delaware" in prompt
        assert "Captured from the message you are replying to" in prompt

    def test_the_talk_prompt_forbids_markdown(self):
        assert "No markdown" in chat.talk_prompt(NDA, NdaFields())

    def test_the_talk_prompt_names_what_is_left_to_ask_about(self):
        """The model asked again for values it held when left to work this out."""
        prompt = chat.talk_prompt(NDA, NdaFields(), captured=FILLED)

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

        assert chat.outstanding(NDA, complete) == []
        assert "Say the agreement looks complete" in chat.talk_prompt(NDA, complete)


class TestOutstanding:
    """What the assistant is told is still to ask about."""

    def test_lists_everything_for_an_empty_agreement(self):
        missing = chat.outstanding(NDA, NdaFields())

        assert missing[:4] == [
            "the purpose",
            "the effective date",
            "the governing law",
            "the jurisdiction",
        ]
        assert len(missing) == 12

    def test_drops_what_has_been_filled_in(self):
        assert "the governing law" not in chat.outstanding(NDA, FILLED)

    def test_counts_a_partly_filled_party(self):
        missing = chat.outstanding(NDA, FILLED)

        assert "party 1 company name" not in missing
        assert "party 1 signatory name" in missing

    def test_treats_a_blank_string_as_missing(self):
        """The form posts "" for a box the user cleared."""
        assert "the purpose" in chat.outstanding(NDA, NdaFields.model_validate({"purpose": " "}))

    def test_ignores_the_optional_fields(self):
        """Modifications are optional and the term options always have a default."""
        missing = chat.outstanding(NDA, NdaFields())

        assert not any("modification" in item for item in missing)
        assert not any("term" in item for item in missing)


class TestRespond:
    """A turn extracts and reconsiders, then writes a reply knowing both."""

    @pytest.fixture
    def calls(self, monkeypatch):
        """Records every call and answers it with fixed content.

        The two structured calls are told apart by their schema name: the
        extraction and the "is this still the right document" question run
        together and either may land first.
        """
        recorded = {"choice": {}}

        async def structured(messages, schema, name):
            if name == "document_choice":
                recorded["reconsider"] = messages
                return recorded["choice"]
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
        turn = await chat.respond(
            [{"role": "user", "content": "Delaware law."}], NDA, NdaFields()
        )

        assert turn.reply == "Which state's courts should hear disputes?"
        assert turn.updates["governingLaw"] == "Delaware"

    @pytest.mark.anyio
    async def test_tells_the_reply_what_the_extraction_just_found(self, calls):
        """Without this the assistant asks again for what it was just given."""
        await chat.respond(
            [{"role": "user", "content": "Delaware law."}], NDA, NdaFields()
        )

        assert "Delaware" in calls["talk"][0]["content"]

    @pytest.mark.anyio
    async def test_puts_the_instructions_first_and_keeps_the_transcript(self, calls):
        history = [
            {"role": "user", "content": "Acme and Globex."},
            {"role": "assistant", "content": "Who signs?"},
            {"role": "user", "content": "Delaware law."},
        ]

        await chat.respond(history, NDA, NdaFields())

        assert calls["extract"][0]["role"] == "system"
        assert calls["extract"][1:] == history

    @pytest.mark.anyio
    async def test_sends_only_the_most_recent_history(self, calls):
        """A runaway client must not be able to send an unbounded prompt."""
        history = [
            {"role": "user", "content": f"message {index}"}
            for index in range(chat.MAX_HISTORY + 10)
        ]

        await chat.respond(history, NDA, NdaFields())

        sent = calls["extract"][1:]
        assert len(sent) == chat.MAX_HISTORY
        assert sent[-1]["content"] == f"message {chat.MAX_HISTORY + 9}"

    @pytest.mark.anyio
    async def test_carries_on_with_the_same_agreement_by_default(self, calls):
        """The usual turn: nothing about the document has changed."""
        turn = await chat.respond(
            [{"role": "user", "content": "Delaware law."}], NDA, NdaFields()
        )

        assert turn.document_type == "mutual-nda"
        assert turn.updates["governingLaw"] == "Delaware"

    @pytest.mark.anyio
    async def test_changes_the_agreement_when_the_user_asks_for_another(self, calls):
        """The reported fault: the preview never followed the conversation."""
        calls["choice"] = {"documentType": "pilot-agreement"}

        turn = await chat.respond(
            [{"role": "user", "content": "Actually, make it a pilot agreement."}],
            NDA,
            NdaFields(),
        )

        assert turn.document_type == "pilot-agreement"
        assert "Pilot Agreement" in calls["talk"][0]["content"]

    @pytest.mark.anyio
    async def test_drops_fields_extracted_for_the_agreement_being_left(self, calls):
        """They are keyed to the old schema, so they cannot follow the user."""
        calls["choice"] = {"documentType": "pilot-agreement"}

        turn = await chat.respond(
            [{"role": "user", "content": "Actually, make it a pilot agreement."}],
            NDA,
            NdaFields(),
        )

        assert turn.updates == {}

    @pytest.mark.anyio
    async def test_offers_the_nearest_match_for_something_not_drafted(self, calls):
        calls["choice"] = {"nearestMatch": "professional-services-agreement"}

        turn = await chat.respond(
            [{"role": "user", "content": "Can you do an employment contract?"}],
            NDA,
            NdaFields(),
        )

        assert turn.document_type == "mutual-nda"
        assert "cannot draft what the user asked for" in calls["talk"][0]["content"]

    @pytest.mark.anyio
    async def test_reconsiders_from_the_same_transcript_as_the_extraction(self, calls):
        history = [{"role": "user", "content": "Delaware law."}]

        await chat.respond(history, NDA, NdaFields())

        assert calls["reconsider"][1:] == history
        assert "part-way through drafting" in calls["reconsider"][0]["content"]


class TestReconsider:
    """A turn only changes the agreement when the user asks it to."""

    def _answer(self, monkeypatch, choice):
        async def structured(messages, schema, name):
            return choice

        monkeypatch.setattr(openrouter, "structured_completion", structured)

    @pytest.mark.anyio
    async def test_hears_nothing_when_the_conversation_carries_on(self, monkeypatch):
        self._answer(monkeypatch, {})

        assert await chat.reconsider([], NDA) is None

    @pytest.mark.anyio
    async def test_ignores_a_choice_naming_the_document_already_open(self, monkeypatch):
        """Every NDA turn's transcript still says "I need an NDA"."""
        self._answer(monkeypatch, {"documentType": "mutual-nda"})

        assert await chat.reconsider([], NDA) is None

    @pytest.mark.anyio
    async def test_ignores_a_nearest_match_for_the_document_already_open(
        self, monkeypatch
    ):
        self._answer(monkeypatch, {"nearestMatch": "mutual-nda"})

        assert await chat.reconsider([], NDA) is None

    @pytest.mark.anyio
    async def test_reports_a_different_agreement(self, monkeypatch):
        self._answer(monkeypatch, {"documentType": "pilot-agreement"})

        change = await chat.reconsider([], NDA)

        assert change.document_type == "pilot-agreement"

    @pytest.mark.anyio
    async def test_reports_a_nearest_match_for_something_not_drafted(self, monkeypatch):
        self._answer(monkeypatch, {"nearestMatch": "pilot-agreement"})

        change = await chat.reconsider([], NDA)

        assert change.document_type is None
        assert change.nearest_match == "pilot-agreement"

    def test_says_what_was_asked_for_before_placing_it(self):
        """Strict decoding fills the fields in order, so the order matters.

        With the two ids alone, a request for a document Prelegal does not
        draft came back as two nulls instead of a nearest match.
        """
        assert list(strict_schema(chat.DocumentChoice)["properties"]) == [
            "askedFor",
            "documentType",
            "nearestMatch",
        ]

    def test_the_switch_prompt_names_the_document_in_hand(self):
        prompt = chat.switch_prompt(NDA)

        assert "part-way through drafting a Mutual Non-Disclosure Agreement" in prompt
        assert "pilot-agreement" in prompt


class TestSelectPrompts:
    """Choosing which agreement to draft."""

    def test_the_select_prompt_lists_only_what_prelegal_drafts(self):
        prompt = chat.select_prompt()

        assert "mutual-nda" in prompt
        assert "Never answer with a document that is not on the list" in prompt

    def test_a_chosen_agreement_is_named_and_asked_about(self):
        prompt = chat.select_talk_prompt(
            chat.DocumentChoice(document_type="mutual-nda")
        )

        assert "Mutual Non-Disclosure Agreement" in prompt
        assert "the purpose" in prompt

    def test_an_unsupported_request_offers_the_nearest_match(self):
        """The ticket asks for an explanation plus something we can draft."""
        prompt = chat.select_talk_prompt(
            chat.DocumentChoice(nearest_match="mutual-nda")
        )

        assert "cannot draft what the user asked for" in prompt
        assert "closest thing" in prompt
        assert "Mutual Non-Disclosure Agreement" in prompt

    def test_a_question_about_the_catalogue_is_not_a_choice(self):
        """Asked "what are my options?", it used to open an NDA on the user."""
        assert "is a question, not a choice" in chat.select_prompt()

    def test_the_reply_may_list_every_agreement_when_asked_for_it(self):
        """It used to refuse, saying it could not provide the whole catalogue."""
        prompt = chat.select_talk_prompt(chat.DocumentChoice())

        assert "asks for the list" in prompt
        assert "Every agreement above, one short line each" in prompt
        # All eleven have to be in front of it before it can list them.
        assert all(document_type in prompt for document_type in chat.DOCUMENTS)
        assert len(chat.DOCUMENTS) == 11

    def test_an_undecided_user_is_asked_what_they_need(self):
        prompt = chat.select_talk_prompt(chat.DocumentChoice())

        assert "has not said which agreement" in prompt

    def test_the_choice_refuses_a_document_prelegal_does_not_draft(self):
        with pytest.raises(ValueError):
            chat.DocumentChoice.model_validate({"documentType": "employment-contract"})


class TestSelectDocument:
    """Choosing is the same two calls as drafting: decide, then say so."""

    @pytest.fixture
    def calls(self, monkeypatch):
        recorded = {}

        async def structured(messages, schema, name):
            recorded["select"] = messages
            recorded["schema"] = schema
            return {"documentType": "mutual-nda"}

        async def completion(messages):
            recorded["talk"] = messages
            return "  Happy to help with that NDA.  "

        monkeypatch.setattr(openrouter, "structured_completion", structured)
        monkeypatch.setattr(openrouter, "completion", completion)
        return recorded

    @pytest.mark.anyio
    async def test_reports_the_agreement_it_settled_on(self, calls):
        turn = await chat.select_document([{"role": "user", "content": "I need an NDA"}])

        assert turn.document_type == "mutual-nda"
        assert turn.reply == "Happy to help with that NDA."

    @pytest.mark.anyio
    async def test_tells_the_reply_what_was_just_decided(self, calls):
        await chat.select_document([{"role": "user", "content": "I need an NDA"}])

        assert "Mutual Non-Disclosure Agreement" in calls["talk"][0]["content"]

    @pytest.mark.anyio
    async def test_constrains_the_answer_to_the_catalogue(self, calls):
        """An unconstrained pick invents documents Prelegal cannot draft."""
        await chat.select_document([{"role": "user", "content": "I need an NDA"}])

        chosen = calls["schema"]["properties"]["documentType"]
        assert _allowed(chosen) == set(chat.DOCUMENTS)


def _allowed(prop: dict) -> set[str]:
    """The values a nullable Literal permits.

    Pydantic writes a one-value Literal as `const` and a longer one as `enum`,
    so a test that reads only one of them passes today and breaks on the next
    agreement added.
    """
    branch = prop["anyOf"][0]
    return set(branch["enum"]) if "enum" in branch else {branch["const"]}
