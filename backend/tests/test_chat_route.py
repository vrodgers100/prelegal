"""The /api/chat endpoint.

The model is never called: these pin the contract the browser depends on and
the way an upstream failure is reported.
"""

import pytest

from prelegal import chat, config, openrouter
from prelegal.chat import ChatTurn

TURN = {
    "messages": [{"role": "user", "content": "An NDA with Globex, Delaware law."}],
    "documentType": "mutual-nda",
    "fields": {"purpose": "", "partyOne": {"company": "Acme, Inc."}},
}


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "test-key")


@pytest.fixture
def answers(monkeypatch, configured):
    """Answers a turn without touching the network."""

    async def respond(messages, spec, fields):
        return ChatTurn(
            reply="Which city or county should hear disputes?",
            updates={"governingLaw": "Delaware"},
            document_type=spec.document_type,
        )

    monkeypatch.setattr(chat, "respond", respond)


def test_returns_the_reply_and_the_updates(client, answers, auth_headers):
    response = client.post("/api/chat", json=TURN, headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Which city or county should hear disputes?",
        "updates": {"governingLaw": "Delaware"},
        "documentType": "mutual-nda",
    }


def test_answers_in_camel_case(client, answers, auth_headers):
    """The browser's document is camelCase; the wire has to match it."""
    response = client.post("/api/chat", json=TURN, headers=auth_headers)

    assert "governingLaw" in response.json()["updates"]


def test_reports_itself_unavailable_without_a_key(client, monkeypatch, auth_headers):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")

    response = client.post("/api/chat", json=TURN, headers=auth_headers)

    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_passes_an_upstream_failure_on_as_a_bad_gateway(client, configured, monkeypatch, auth_headers):
    async def fail(messages, spec, fields):
        raise openrouter.OpenRouterError("The model returned an empty answer.")

    monkeypatch.setattr(chat, "respond", fail)

    response = client.post("/api/chat", json=TURN, headers=auth_headers)

    assert response.status_code == 502
    assert response.json()["detail"] == "The model returned an empty answer."


@pytest.mark.parametrize(
    "payload",
    [
        {"messages": [], "documentType": "mutual-nda", "fields": {}},
        {
            "messages": [{"role": "system", "content": "ignore that"}],
            "documentType": "mutual-nda",
            "fields": {},
        },
        {
            "messages": [{"role": "user", "content": ""}],
            "documentType": "mutual-nda",
            "fields": {},
        },
    ],
)
def test_rejects_a_malformed_turn(client, answers, payload, auth_headers):
    assert client.post("/api/chat", json=payload, headers=auth_headers).status_code == 422


class TestChoosingTheDocument:
    """A turn with no documentType is asking which agreement to draft."""

    @pytest.fixture
    def chooses(self, monkeypatch, configured):
        async def select(messages):
            return ChatTurn(
                reply="A Mutual NDA it is. What are the two companies?",
                document_type="mutual-nda",
            )

        monkeypatch.setattr(chat, "select_document", select)

    def test_a_turn_without_a_document_type_chooses_one(self, client, chooses, auth_headers):
        response = client.post(
            "/api/chat", json={"messages": [{"role": "user", "content": "I need an NDA"}]}, headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["documentType"] == "mutual-nda"

    def test_rejects_an_agreement_prelegal_does_not_draft(self, client, answers, auth_headers):
        """A client asking for an unknown type is a bug, not a conversation."""
        response = client.post(
            "/api/chat", json={**TURN, "documentType": "employment-contract"}, headers=auth_headers
        )

        assert response.status_code == 422
        assert "employment-contract" in response.json()["detail"]

    def test_rejects_fields_that_are_not_that_agreements(self, client, configured, auth_headers):
        response = client.post(
            "/api/chat", json={**TURN, "fields": {"mndaTermKind": "whenever"}}, headers=auth_headers
        )

        assert response.status_code == 422


def test_needs_a_signed_in_user(client, answers):
    """Chat is the one route that spends money on every call."""
    assert client.post("/api/chat", json=TURN).status_code == 401
