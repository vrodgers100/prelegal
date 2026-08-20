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

Choosing the agreement is the same shape of turn with a smaller schema: decide
which document is wanted, then reply knowing what was decided. It runs while
the browser has no document yet.

Once a document is open the same decision is asked again on every turn, so that
"actually, make it a pilot agreement" is heard rather than answered as if it
were an NDA question. It reads the same transcript as the extraction and needs
nothing from it, so the two run together: three calls, still two round trips.

Nothing is remembered between turns: the browser owns the document and sends it
back with every message.
"""

import asyncio
import json
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel
from pydantic.alias_generators import to_snake

from . import openrouter
from .document_schema import (
    DOCUMENTS,
    CamelModel,
    DocumentSpec,
    fields_model,
    strict_schema,
)

#: How much transcript to send. Long enough for a whole agreement several times
#: over, short enough that a runaway client cannot send an unbounded prompt.
MAX_HISTORY = 40


class ChatTurn(CamelModel):
    """What the model returns for one turn: what to say, and what it learned.

    `updates` is a plain dict because its shape depends on which agreement is
    being drafted. The browser merges it against the same schema this end used
    to extract it.
    """

    reply: str
    updates: dict[str, Any] = {}
    #: Set by a turn that settles which agreement to draft, null otherwise.
    document_type: str | None = None


TALK_PROMPT = """\
You are the drafting assistant for Prelegal. You help one person fill in a \
{name} by talking to them.

How to write:
- One to three short sentences of plain prose. No markdown, no headings, no \
bullet lists, and never JSON.
- Ask about one thing at a time — two only when they belong together, such as \
a signatory's name and their title.
- Never read back the values you have captured. The document is on screen next \
to this conversation and the user can already see it.
- Take whatever the user offers, in whatever order they offer it.
- Once nothing is left to fill in, say the agreement looks complete and point \
at the Download button.

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
Read the conversation and record the {name} cover page details it contains.

Rules:
- Record only values the user actually stated. Leave everything else null.
- Never invent a company, a person, an address or a date.
{parties}- Report only what the user has newly stated or corrected in the latest \
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


def known_json(fields: BaseModel) -> str:
    """What the browser currently holds, as the prompts present it."""
    known = _filled(fields.model_dump(by_alias=True, exclude_none=True))
    return json.dumps(known, indent=2) if known else "Nothing yet."


def fields_prompt(spec: DocumentSpec) -> str:
    """The agreement's fields, as the prompts describe them to the model."""
    return "\n".join(f"- {field.key}: {field.prompt}" for field in spec.fields)


#: The four details every party needs, as the assistant should refer to them.
#: Deliberately different wording from the form's own labels: the form mirrors
#: the cover page ("Print Name"), while the assistant has to say it out loud.
PARTY_LABELS = {
    "company": "company name",
    "signatory_name": "signatory name",
    "signatory_title": "signatory title",
    "notice_address": "notice address",
}


def outstanding(spec: DocumentSpec, fields: BaseModel) -> list[str]:
    """What still has to be asked about, most useful first.

    Worked out here rather than left to the model. Asked to spot the gap
    between what it knew and what it had just captured, it would now and then
    ask again for a value it already held.

    Only required fields count: a field with a default is already answered, and
    an optional one never needs asking about.
    """
    missing: list[str] = []

    for field in spec.fields:
        if not field.required:
            continue
        value = getattr(fields, to_snake(field.key), None)

        if field.type == "party":
            missing += [
                f"{field.label.lower()} {label}"
                for name, label in PARTY_LABELS.items()
                if not ((getattr(value, name, None) or "").strip() if value else "")
            ]
        elif not str(value or "").strip():
            missing.append(f"the {field.label.lower()}")

    return missing


def _party_rule(spec: DocumentSpec) -> str:
    """Tells the extraction which field each named company belongs in.

    Without it the model reads both companies past on a dense message: measured
    at 0 recorded in 5, against 5 in 5 once the mapping was spelled out.
    """
    parties = [field for field in spec.fields if field.type == "party"]
    if len(parties) != 2:
        return ""

    first, second = (field.key for field in parties)
    return (
        f"- When the user names the two companies, record them as {first}.company "
        f"and {second}.company, in the order they are given. A message that also "
        "settles other details still names the parties, and they must be "
        "recorded too.\n"
    )


def talk_prompt(
    spec: DocumentSpec, fields: BaseModel, captured: BaseModel | None = None
) -> str:
    """Instructions for the call that writes the reply."""
    captured = captured if captured is not None else fields_model(spec.document_type)()
    left = outstanding(spec, merge(spec, fields, captured))
    return TALK_PROMPT.format(
        name=spec.name,
        fields=fields_prompt(spec),
        known=known_json(fields),
        captured=known_json(captured),
        outstanding="\n".join(f"- {item}" for item in left)
        if left
        else "Nothing. Say the agreement looks complete.",
    )


def merge(spec: DocumentSpec, fields: BaseModel, updates: BaseModel) -> BaseModel:
    """Applies a turn's findings, for working out what is left to ask about.

    The browser does the merge that matters; this one never leaves the prompt.
    """
    merged = fields.model_dump(by_alias=True, exclude_none=True)
    for key, value in updates.model_dump(by_alias=True, exclude_none=True).items():
        if isinstance(value, dict):
            merged[key] = {**(merged.get(key) or {}), **value}
        else:
            merged[key] = value
    return fields_model(spec.document_type).model_validate(merged)


def extract_prompt(
    spec: DocumentSpec, fields: BaseModel, today: date | None = None
) -> str:
    """Instructions for the call that reads field values out of the transcript."""
    return EXTRACT_PROMPT.format(
        name=spec.name,
        fields=fields_prompt(spec),
        known=known_json(fields),
        parties=_party_rule(spec),
        today=(today or date.today()).isoformat(),
    )


async def respond(
    messages: list[dict[str, str]], spec: DocumentSpec, fields: BaseModel
) -> ChatTurn:
    """Answers the latest message and reports whatever fields it learned.

    Asking for a different agreement is answered before anything else: the
    fields just extracted belong to the document being left behind, so they are
    dropped rather than merged into the new one.
    """
    history = messages[-MAX_HISTORY:]
    model = fields_model(spec.document_type)

    change, extracted = await asyncio.gather(
        reconsider(history, spec),
        openrouter.structured_completion(
            [{"role": "system", "content": extract_prompt(spec, fields)}, *history],
            strict_schema(model),
            f"{spec.document_type.replace('-', '_')}_fields",
        ),
    )

    if change is not None:
        reply = await openrouter.completion(
            [{"role": "system", "content": select_talk_prompt(change)}, *history]
        )
        return ChatTurn(
            reply=reply.strip(),
            document_type=change.document_type or spec.document_type,
        )

    updates = model.model_validate(extracted)
    reply = await openrouter.completion(
        [{"role": "system", "content": talk_prompt(spec, fields, updates)}, *history]
    )
    return ChatTurn(
        reply=reply.strip(),
        updates=updates.model_dump(by_alias=True, exclude_none=True),
        document_type=spec.document_type,
    )


# --- Choosing the agreement ---------------------------------------------------

#: Restricting the answer to the catalogue is what stops the model inventing a
#: document Prelegal cannot draft and then trying to fill it in.
DocumentId = Literal[tuple(DOCUMENTS)]


class DocumentChoice(CamelModel):
    """Which agreement the user wants, or the nearest one to what they asked."""

    #: What the user asked to draft, in their own words, or null if they have
    #: not asked for anything. First because the fields are decoded in order
    #: and the model has to say what it heard before it can place it: with the
    #: two ids alone, a request for a document Prelegal does not draft came
    #: back as two nulls rather than a nearest match, 6 times in 6.
    asked_for: str | None = None
    #: Null until the user has said enough to be sure.
    document_type: DocumentId | None = None
    #: Set instead of `document_type` when nothing in the catalogue fits.
    nearest_match: DocumentId | None = None


SELECT_PROMPT = """\
Read the conversation and decide which agreement the user wants to draft.

These are the only agreements Prelegal can draft:
{catalogue}

Rules:
- Set documentType only when the user has made clear which one they want.
- Asking what Prelegal can draft, asking for the list, or asking which one \
they need is a question, not a choice. Leave both fields null and let the \
reply answer them.
- If they describe a document that is not on the list, leave documentType null \
and set nearestMatch to whichever listed agreement comes closest.
- If they have not said what they want yet, leave both null.
- Never answer with a document that is not on the list.
"""

SWITCH_PROMPT = """\
The user is part-way through drafting a {name}. Decide whether their latest \
message asks to draft a different agreement instead.

These are the only agreements Prelegal can draft:
{catalogue}

Judge the latest message only. Set askedFor to the document it asks you to \
draft, in the user's own words, or null if it asks for no new document. Then \
decide which of three things the message is:

1. It carries on with the {name}: answering a question about it, correcting a \
value in it, or mentioning another document in passing. Leave documentType and \
nearestMatch null.
2. It asks to draft one of the agreements above instead. Set documentType to \
that agreement.
3. It asks to draft some other kind of document, one not on the list above. \
Leave documentType null and set nearestMatch to whichever listed agreement \
comes closest to it.

Never answer with a document that is not on the list.
"""

SELECT_TALK_PROMPT = """\
You are the drafting assistant for Prelegal, which drafts these agreements and \
no others:
{catalogue}

How to write:
- One to three short sentences of plain prose. No markdown, no headings and \
never JSON.
- Name at most three agreements as examples, so an ordinary answer stays short.
- The one exception: when the user asks what Prelegal can draft, asks for the \
list, or asks which one they need, tell them all of it. Every agreement above, \
one short line each, named and said what it is for. Refusing the list, or \
naming three of eleven, leaves them thinking Prelegal drafts three documents.

{instruction}
"""

_CHOSEN = """\
The user wants a {name}, and it is now open on screen beside this \
conversation. Say you will help them draft it, then ask them for {first}.\
"""

_NEAREST = """\
Prelegal cannot draft what the user asked for. Say so plainly in one sentence, \
without apologising twice. Then say a {name} is the closest thing Prelegal can \
draft, say in a few words what it covers, and ask whether they would like to \
use it.\
"""

_UNDECIDED = """\
The user has not said which agreement they want. Ask them what they need to \
put together, and name two or three of the agreements above as examples. If \
they asked what Prelegal can draft, asked for the list, or asked which one \
they need, list all of them first and then ask.\
"""


def catalogue() -> str:
    """The agreements on offer, as the prompts list them."""
    return "\n".join(
        f"- {spec.document_type}: {spec.name} — {spec.description}"
        for spec in DOCUMENTS.values()
    )


def select_prompt() -> str:
    """Instructions for the call that decides which agreement is wanted."""
    return SELECT_PROMPT.format(catalogue=catalogue())


def _first_question(spec: DocumentSpec) -> str:
    """What to ask about first, so the reply opens on something useful."""
    empty = fields_model(spec.document_type)()
    left = outstanding(spec, empty)
    return left[0] if left else "anything they would like to change"


def select_talk_prompt(choice: DocumentChoice) -> str:
    """Instructions for the reply that tells the user what was decided."""
    if choice.document_type:
        spec = DOCUMENTS[choice.document_type]
        instruction = _CHOSEN.format(name=spec.name, first=_first_question(spec))
    elif choice.nearest_match:
        instruction = _NEAREST.format(name=DOCUMENTS[choice.nearest_match].name)
    else:
        instruction = _UNDECIDED

    return SELECT_TALK_PROMPT.format(catalogue=catalogue(), instruction=instruction)


def switch_prompt(spec: DocumentSpec) -> str:
    """Instructions for the call that asks whether the agreement has changed."""
    return SWITCH_PROMPT.format(name=spec.name, catalogue=catalogue())


async def reconsider(
    messages: list[dict[str, str]], spec: DocumentSpec
) -> DocumentChoice | None:
    """Whether the user has just asked for a different agreement, or nothing.

    Without this a drafting turn can only answer about the document it was
    handed, so "actually, make it a pilot agreement" came back as another
    question about the NDA, 3 times in 3.

    A choice naming the document already open is not a change, and neither is a
    nearest match for it. Both mean the conversation is simply carrying on.
    """
    answer = await openrouter.structured_completion(
        [{"role": "system", "content": switch_prompt(spec)}, *messages],
        strict_schema(DocumentChoice),
        "document_choice",
    )
    choice = DocumentChoice.model_validate(answer)

    if choice.document_type:
        if choice.document_type != spec.document_type:
            return DocumentChoice(document_type=choice.document_type)
    elif choice.nearest_match and choice.nearest_match != spec.document_type:
        return DocumentChoice(nearest_match=choice.nearest_match)
    return None


async def select_document(messages: list[dict[str, str]]) -> ChatTurn:
    """Works out which agreement to draft, and says so.

    The same two-call shape as a drafting turn, and for the same reason: the
    reply has to know what the decision was before it can announce it.
    """
    history = messages[-MAX_HISTORY:]

    chosen = await openrouter.structured_completion(
        [{"role": "system", "content": select_prompt()}, *history],
        strict_schema(DocumentChoice),
        "document_choice",
    )
    choice = DocumentChoice.model_validate(chosen)

    reply = await openrouter.completion(
        [{"role": "system", "content": select_talk_prompt(choice)}, *history]
    )
    return ChatTurn(reply=reply.strip(), document_type=choice.document_type)
