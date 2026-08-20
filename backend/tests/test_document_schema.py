"""The document schemas, and the models built from them.

The schemas in `schemas/` are the single source of truth for what each
agreement needs, so these pin both that they load and that the model built
from one is the model the language model is actually handed.
"""

import pytest
from pydantic.alias_generators import to_camel, to_snake

from prelegal import chat
from prelegal.document_schema import (
    DOCUMENTS,
    US_STATES,
    Party,
    fields_model,
    strict_schema,
)

NdaFields = fields_model("mutual-nda")


def test_every_schema_loads():
    assert DOCUMENTS, "no schemas were found"
    assert "mutual-nda" in DOCUMENTS


@pytest.mark.parametrize("document_type", sorted(DOCUMENTS))
def test_a_schema_describes_itself_consistently(document_type):
    spec = DOCUMENTS[document_type]

    assert spec.document_type == document_type
    assert spec.fields, f"{document_type} has no fields"
    assert len({field.key for field in spec.fields}) == len(spec.fields)


@pytest.mark.parametrize("document_type", sorted(DOCUMENTS))
def test_every_field_tells_the_assistant_what_it_is(document_type):
    """A field with no prompt is one the assistant cannot ask about."""
    for field in DOCUMENTS[document_type].fields:
        assert field.prompt, f"{document_type}.{field.key} has no prompt"
        assert field.label, f"{document_type}.{field.key} has no label"


@pytest.mark.parametrize("document_type", sorted(DOCUMENTS))
def test_a_choice_field_offers_choices(document_type):
    for field in DOCUMENTS[document_type].fields:
        if field.type == "choice":
            assert len(field.options) >= 2, f"{document_type}.{field.key}"
        else:
            assert not field.options, f"{document_type}.{field.key}"


@pytest.mark.parametrize("document_type", sorted(DOCUMENTS))
def test_a_years_field_depends_on_a_choice_that_exists(document_type):
    spec = DOCUMENTS[document_type]

    for field in spec.fields:
        if not field.depends_on:
            continue
        parent = spec.field(field.depends_on.field)
        assert parent is not None, f"{document_type}.{field.key} depends on nothing"
        assert field.depends_on.value in {option.value for option in parent.options}


def test_the_states_are_the_ones_a_governing_law_field_expects():
    assert len(US_STATES) == 51
    assert "Delaware" in US_STATES
    assert "District of Columbia" in US_STATES


@pytest.mark.parametrize("document_type", sorted(DOCUMENTS))
def test_every_field_key_survives_the_round_trip(document_type):
    """A key the aliases do not invert is a field that silently never fills in.

    The browser sends camelCase, Pydantic holds snake_case, and the alias has
    to turn it back into the same camelCase the browser used. Most keys manage
    that without anyone thinking about it, which is exactly why a key that does
    not would go unnoticed until a field mysteriously stayed empty.
    """
    model = fields_model(document_type)

    for field in DOCUMENTS[document_type].fields:
        attribute = to_snake(field.key)

        assert to_camel(attribute) == field.key, f"{field.key} does not round-trip"
        assert hasattr(model(), attribute)
        assert model.model_validate({field.key: None}) is not None


def test_the_assistant_has_a_word_for_every_part_of_a_party():
    """A party detail with no label is one the assistant can never ask for."""
    assert set(chat.PARTY_LABELS) == set(Party.model_fields)


class TestFieldsModel:
    """The Pydantic model built from a schema."""

    def test_fields_speak_camel_case_on_the_wire(self):
        fields = NdaFields.model_validate({"effectiveDate": "2026-08-19"})

        assert fields.effective_date == "2026-08-19"
        assert fields.model_dump(by_alias=True)["effectiveDate"] == "2026-08-19"

    def test_every_field_is_optional(self):
        fields = NdaFields()

        assert fields.purpose is None
        assert fields.party_one is None

    def test_the_same_agreement_gives_back_the_same_model(self):
        """Rebuilding it per turn would be waste; the schemas never change."""
        assert fields_model("mutual-nda") is NdaFields

    def test_a_choice_field_refuses_a_value_it_was_not_offered(self):
        with pytest.raises(ValueError):
            NdaFields.model_validate({"mndaTermKind": "whenever"})

    @pytest.mark.parametrize("document_type", sorted(DOCUMENTS))
    def test_every_agreement_builds_a_model(self, document_type):
        model = fields_model(document_type)

        assert set(model.model_fields) == {
            to_snake(field.key) for field in DOCUMENTS[document_type].fields
        }


class TestStrictSchema:
    """Strict structured outputs need every key required and every object closed."""

    def test_requires_every_property(self):
        schema = strict_schema(NdaFields)

        assert set(schema["required"]) == set(schema["properties"])
        assert "governingLaw" in schema["required"]

    def test_closes_nested_objects_too(self):
        party = strict_schema(NdaFields)["$defs"]["Party"]

        assert party["additionalProperties"] is False
        assert set(party["required"]) == {
            "company",
            "signatoryName",
            "signatoryTitle",
            "noticeAddress",
        }

    def test_drops_defaults(self):
        """A `default` alongside a required key is rejected as contradictory."""
        properties = strict_schema(NdaFields)["properties"]

        assert all("default" not in prop for prop in properties.values())

    def test_keeps_the_term_options_as_enums(self):
        kind = strict_schema(NdaFields)["properties"]["mndaTermKind"]

        assert {"expires", "untilTerminated"} == set(kind["anyOf"][0]["enum"])

    def test_lets_every_field_be_null(self):
        """Required-but-nullable is how "optional" survives strict mode."""
        purpose = strict_schema(NdaFields)["properties"]["purpose"]

        assert {"type": "null"} in purpose["anyOf"]

    @pytest.mark.parametrize("document_type", sorted(DOCUMENTS))
    def test_every_agreement_closes_its_schema(self, document_type):
        schema = strict_schema(fields_model(document_type))

        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"])


def test_a_party_round_trips_through_aliases():
    party = Party.model_validate({"signatoryName": "Jane Doe"})

    assert party.signatory_name == "Jane Doe"
    assert party.model_dump(by_alias=True, exclude_none=True) == {
        "signatoryName": "Jane Doe"
    }
