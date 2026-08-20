"""The agreements Prelegal can draft, and the fields each one needs.

One JSON file per agreement lives in `schemas/` at the repository root, and
both halves of the product read it: the browser builds its form and cover page
from it, and this module turns it into the Pydantic model that describes the
extraction schema to the language model.

The shape used to be written twice, once in `nda.py` and once in
`frontend/src/lib/nda.ts`, which was tolerable for one agreement. It is not
tolerable for eleven, so the JSON is now the single source of truth and both
sides are generic.
"""

import functools
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, create_model
from pydantic.alias_generators import to_camel, to_snake

from . import config

FieldType = Literal["text", "date", "years", "choice", "party", "state"]


class CamelModel(BaseModel):
    """Speaks camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Party(CamelModel):
    """One side of an agreement, as it signs.

    Every agreement names its parties differently — Provider and Customer,
    Company and Partner — but each one needs the same four details, so one
    model serves them all.
    """

    company: str | None = None
    signatory_name: str | None = None
    signatory_title: str | None = None
    notice_address: str | None = None


class Option(BaseModel):
    """One choice in a mutually exclusive set, as the cover page lists it.

    `label` may contain `{years}`, filled from whichever years field depends on
    this option — that is how "Expires 2 years from Effective Date" is built.
    """

    value: str
    label: str


class Dependency(BaseModel):
    """Ties a years field to the option that makes it meaningful."""

    field: str
    value: str


class FieldSpec(BaseModel):
    """One fill-in slot on a cover page.

    Most of this describes how the browser should render the field; only
    `prompt`, `label` and `required` reach the language model.
    """

    model_config = ConfigDict(populate_by_name=True)

    key: str
    type: FieldType
    label: str
    #: How the assistant should describe the field when asking about it.
    prompt: str = ""
    required: bool = False
    default: str | int | None = None
    #: Choice fields only.
    options: list[Option] = Field(default_factory=list)
    #: Years fields only.
    depends_on: Dependency | None = Field(default=None, alias="dependsOn")


class CoverPage(BaseModel):
    """The wording around the fields on a generated cover page."""

    title: str
    using_heading: str = Field(default="", alias="usingHeading")
    intro: str = ""
    attestation: str = ""
    attribution: str = ""


class DocumentSpec(BaseModel):
    """An agreement Prelegal can draft."""

    model_config = ConfigDict(populate_by_name=True)

    document_type: str = Field(alias="documentType")
    name: str
    short_name: str = Field(default="", alias="shortName")
    description: str
    template_file: str = Field(alias="templateFile")
    cover_page: CoverPage = Field(alias="coverPage")
    fields: list[FieldSpec]

    def field(self, key: str) -> FieldSpec | None:
        return next((item for item in self.fields if item.key == key), None)


def _load() -> dict[str, DocumentSpec]:
    """Reads every schema in `schemas/`, keyed by document type."""
    specs = {}
    for path in sorted(config.SCHEMAS_DIR.glob("*.json")):
        if path.stem == "us-states":
            continue
        spec = DocumentSpec.model_validate(json.loads(path.read_text(encoding="utf8")))
        specs[spec.document_type] = spec
    return specs


DOCUMENTS: dict[str, DocumentSpec] = _load()

#: The states a `state` field will accept, shared by every agreement that has
#: one. Kept beside the schemas so the browser reads the same list.
US_STATES: list[str] = json.loads(
    (config.SCHEMAS_DIR / "us-states.json").read_text(encoding="utf8")
)


_PYTHON_TYPES: dict[str, Any] = {
    "text": str,
    "date": str,
    "state": str,
    "years": int,
    "party": Party,
}


def _annotation(spec: FieldSpec) -> Any:
    if spec.type == "choice":
        return Literal[tuple(option.value for option in spec.options)]
    return _PYTHON_TYPES[spec.type]


@functools.lru_cache
def fields_model(document_type: str) -> type[CamelModel]:
    """The Pydantic model for one agreement's fields.

    Built rather than written out because there are eleven agreements and the
    JSON already says everything the model needs. Every field is optional: a
    conversation fills the document in piecemeal, and a turn that learns
    nothing new sends back an empty object.

    Cached because the schemas never change while the process is running, and
    a stable class keeps `strict_schema` from rebuilding the same JSON twice.
    """
    spec = DOCUMENTS[document_type]
    definitions = {
        to_snake(field.key): (_annotation(field) | None, None) for field in spec.fields
    }
    return create_model(
        f"{_class_name(document_type)}Fields",
        __base__=CamelModel,
        __doc__="Cover Page fields, in both directions: what is known, and what changed.",
        **definitions,
    )


def _class_name(document_type: str) -> str:
    return "".join(part.title() for part in document_type.split("-"))


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
