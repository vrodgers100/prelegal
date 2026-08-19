"""The NDA field models and the schema handed to the language model."""

from prelegal.nda import ChatTurn, NdaFields, Party, strict_schema


def test_fields_speak_camel_case_on_the_wire():
    fields = NdaFields.model_validate({"effectiveDate": "2026-08-19"})

    assert fields.effective_date == "2026-08-19"
    assert fields.model_dump(by_alias=True)["effectiveDate"] == "2026-08-19"


def test_every_field_is_optional():
    fields = NdaFields()

    assert fields.purpose is None
    assert fields.party_one is None


def test_a_turn_without_updates_means_no_change():
    turn = ChatTurn.model_validate({"reply": "Who signs for Acme?"})

    assert turn.updates == NdaFields()


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


def test_a_party_round_trips_through_aliases():
    party = Party.model_validate({"signatoryName": "Jane Doe"})

    assert party.signatory_name == "Jane Doe"
    assert party.model_dump(by_alias=True, exclude_none=True) == {
        "signatoryName": "Jane Doe"
    }
