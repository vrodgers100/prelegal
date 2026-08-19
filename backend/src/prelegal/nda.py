"""The Mutual NDA fields, as the chat model reads and writes them.

This mirrors `NdaData` in `frontend/src/lib/nda.ts`, which remains the
canonical shape: the browser owns the document and merges what comes back.
The model here exists to describe the extraction schema to the language model
and to validate its answer.

Every field is optional. A conversation fills the document in piecemeal, and a
turn that learns nothing new sends back an empty object.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

MndaTermKind = Literal["expires", "untilTerminated"]
ConfidentialityTermKind = Literal["years", "perpetual"]


class CamelModel(BaseModel):
    """Speaks camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Party(CamelModel):
    """One of the two signing parties."""

    company: str | None = None
    signatory_name: str | None = None
    signatory_title: str | None = None
    notice_address: str | None = None


class NdaFields(CamelModel):
    """Cover Page fields, in both directions: what is known, and what changed."""

    purpose: str | None = None
    effective_date: str | None = None
    mnda_term_kind: MndaTermKind | None = None
    mnda_term_years: int | None = None
    confidentiality_term_kind: ConfidentialityTermKind | None = None
    confidentiality_term_years: int | None = None
    governing_law: str | None = None
    jurisdiction: str | None = None
    modifications: str | None = None
    party_one: Party | None = None
    party_two: Party | None = None


class ChatTurn(CamelModel):
    """What the model returns for one turn: what to say, and what it learned."""

    reply: str
    # A turn that learns nothing still has to answer, so an absent `updates`
    # means "no change" rather than a malformed reply.
    updates: NdaFields = Field(default_factory=NdaFields)


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Renders a model as a JSON Schema that strict structured outputs accept.

    Strict mode wants every property listed in `required` and every object
    closed with `additionalProperties: false` — Pydantic does neither for
    optional fields, since to Pydantic "optional" means "may be omitted". The
    two notions are reconciled by making every field required but nullable,
    which is what the field types already say.
    """
    schema = model.model_json_schema(by_alias=True)
    for definition in [schema, *schema.get("$defs", {}).values()]:
        _close(definition)
    return schema


def _close(definition: dict[str, Any]) -> None:
    properties = definition.get("properties")
    if not properties:
        return
    definition["required"] = list(properties)
    definition["additionalProperties"] = False
    for prop in properties.values():
        # `default: null` is rejected alongside a required key; the null branch
        # of the field's own type already carries the same meaning.
        prop.pop("default", None)
