"""The drafting conversation.

A turn is two calls to the model. The first reads the transcript for field
values; the second, told what was just captured, writes the reply. They are
separate on purpose. Asking one constrained call to do both produced replies
like "updates" or "" roughly three times in four, because the model wants to
emit the fields first and strict decoding had already committed it to writing
the prose. Split apart, each call does one job and both are reliable.

They run in order rather than together so the reply knows what the extraction
just found. Run in parallel it would ask again for a value the user had given
moments earlier, which is the most irritating thing a chat can do.

Nothing is remembered between turns: the browser owns the document and sends it
back with every message.
"""

import json
from datetime import date
from typing import Any

from . import openrouter
from .nda import ChatTurn, NdaFields, strict_schema

#: How much transcript to send. Long enough for a whole NDA several times over,
#: short enough that a runaway client cannot send an unbounded prompt.
MAX_HISTORY = 40

_FIELDS = """\
- purpose: what the parties may use each other's confidential information for, \
in one sentence.
- effectiveDate: the date the NDA starts, as yyyy-mm-dd.
- mndaTermKind: "expires" when the NDA runs a fixed number of years, \
"untilTerminated" when it continues until someone ends it.
- mndaTermYears: whole years, when mndaTermKind is "expires".
- confidentialityTermKind: "years" for a fixed confidentiality period, \
"perpetual" for indefinitely.
- confidentialityTermYears: whole years, when confidentialityTermKind is "years".
- governingLaw: the full name of the US state whose law governs, such as \
"Delaware". Always a state, never a country or a city.
- jurisdiction: the city or county and state where disputes are heard, such as \
"New Castle, DE".
- modifications: changes to the standard terms. Usually there are none.
- partyOne and partyTwo: for each side, the company's legal entity name, the \
signatory's name and title, and a notice address (an email or a postal address).\
"""

TALK_PROMPT = """\
You are the drafting assistant for Prelegal. You help one person fill in a \
Common Paper Mutual Non-Disclosure Agreement by talking to them.

The Mutual NDA is the only agreement Prelegal drafts today. If the user asks \
for a different document, say so plainly and offer to carry on with the NDA.

How to write:
- One to three short sentences of plain prose. No markdown, no headings, no \
bullet lists, and never JSON.
- Ask about one thing at a time — two only when they belong together, such as \
a signatory's name and their title.
- Never read back the values you have captured. The document is on screen next \
to this conversation and the user can already see it.
- Take whatever the user offers, in whatever order they offer it.
- Once nothing is left to fill in, say the agreement looks complete and point \
at the Download NDA button.

The agreement needs these details:
{fields}

Filled in before this message, as JSON:
{known}

Captured from the message you are replying to, as JSON:
{captured}

Still outstanding — ask about one of these and nothing else:
{outstanding}
"""

EXTRACT_PROMPT = """\
Read the conversation and record the Mutual NDA cover page details it contains.

Rules:
- Record only values the user actually stated. Leave everything else null.
- Never invent a company, a person, an address or a date.
- When the user names the two companies, record them as partyOne.company and \
partyTwo.company, in the order they are given. A message that also settles \
other details still names the parties, and they must be recorded too.
- Report only what the user has newly stated or corrected in the latest \
message. If a value below is already recorded and unchanged, leave that field \
null: repeating it risks overwriting an edit the user made by hand.
- Today is {today}.

The fields:
{fields}

Already recorded:
{known}
"""


def _filled(value: Any) -> Any:
    """Strips blanks, so the prompts show only what is genuinely known."""
    if isinstance(value, dict):
        kept = {key: _filled(item) for key, item in value.items() if item not in (None, "")}
        return {key: item for key, item in kept.items() if item not in (None, {}, "")}
    return value


def known_json(fields: NdaFields) -> str:
    """What the browser currently holds, as the prompts present it."""
    known = _filled(fields.model_dump(by_alias=True, exclude_none=True))
    return json.dumps(known, indent=2) if known else "Nothing yet."


#: What the cover page needs before it can be signed, as the assistant should
#: refer to it. Mirrors `missingFieldLabels` in frontend/src/lib/format.ts; the
#: term options always carry a default, and modifications are optional.
_NEEDED = {
    "purpose": "the purpose",
    "effective_date": "the effective date",
    "governing_law": "the governing law",
    "jurisdiction": "the jurisdiction",
}
_NEEDED_PER_PARTY = {
    "company": "company name",
    "signatory_name": "signatory name",
    "signatory_title": "signatory title",
    "notice_address": "notice address",
}


def outstanding(fields: NdaFields) -> list[str]:
    """What still has to be asked about, most useful first.

    Worked out here rather than left to the model. Asked to spot the gap
    between what it knew and what it had just captured, it would now and then
    ask again for a value it already held.
    """
    missing = [
        label for name, label in _NEEDED.items() if not (getattr(fields, name) or "").strip()
    ]

    for number, name in ((1, "party_one"), (2, "party_two")):
        party = getattr(fields, name)
        missing += [
            f"party {number} {label}"
            for field, label in _NEEDED_PER_PARTY.items()
            if not ((getattr(party, field, None) or "").strip() if party else "")
        ]

    return missing


def talk_prompt(fields: NdaFields, captured: NdaFields | None = None) -> str:
    """Instructions for the call that writes the reply."""
    captured = captured or NdaFields()
    left = outstanding(merge(fields, captured))
    return TALK_PROMPT.format(
        fields=_FIELDS,
        known=known_json(fields),
        captured=known_json(captured),
        outstanding="\n".join(f"- {item}" for item in left)
        if left
        else "Nothing. Say the agreement looks complete.",
    )


def merge(fields: NdaFields, updates: NdaFields) -> NdaFields:
    """Applies a turn's findings, for working out what is left to ask about.

    The browser does the merge that matters; this one never leaves the prompt.
    """
    merged = fields.model_dump(by_alias=True, exclude_none=True)
    for key, value in updates.model_dump(by_alias=True, exclude_none=True).items():
        if isinstance(value, dict):
            merged[key] = {**(merged.get(key) or {}), **value}
        else:
            merged[key] = value
    return NdaFields.model_validate(merged)


def extract_prompt(fields: NdaFields, today: date | None = None) -> str:
    """Instructions for the call that reads field values out of the transcript."""
    return EXTRACT_PROMPT.format(
        fields=_FIELDS,
        known=known_json(fields),
        today=(today or date.today()).isoformat(),
    )


async def respond(messages: list[dict[str, str]], fields: NdaFields) -> ChatTurn:
    """Answers the latest message and reports whatever fields it learned."""
    history = messages[-MAX_HISTORY:]

    extracted = await openrouter.structured_completion(
        [{"role": "system", "content": extract_prompt(fields)}, *history],
        strict_schema(NdaFields),
        "nda_fields",
    )
    updates = NdaFields.model_validate(extracted)

    reply = await openrouter.completion(
        [{"role": "system", "content": talk_prompt(fields, updates)}, *history]
    )
    return ChatTurn(reply=reply.strip(), updates=updates)
