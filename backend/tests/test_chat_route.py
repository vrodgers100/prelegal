"""The /api/chat endpoint.

The model is never called: these pin the contract the browser depends on and
the way an upstream failure is reported.
"""

import pytest

from prelegal import chat, config, openrouter

TURN = {
    "messages": [{"role": "user", "content": "An NDA with Globex, Delaware law."}],
    "fields": {"purpose": "", "partyOne": {"company": "Acme, Inc."}},
}


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "test-key")


@pytest.fixture
def answers(monkeypatch, configured):
    """Answers a turn without touching the network."""

    async def respond(messages, fields):
        from prelegal.nda import ChatTurn, NdaFields

        return ChatTurn(
            reply="Which city or county should hear disputes?",
            updates=NdaFields.model_validate({"governingLaw": "Delaware"}),
        )

    monkeypatch.setattr(chat, "respond", respond)


def test_returns_the_reply_and_the_updates(client, answers):
    response = client.post("/api/chat", json=TURN)

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Which city or county should hear disputes?",
        "updates": {
            "purpose": None,
            "effectiveDate": None,
            "mndaTermKind": None,
            "mndaTermYears": None,
            "confidentialityTermKind": None,
            "confidentialityTermYears": None,
            "governingLaw": "Delaware",
            "jurisdiction": None,
            "modifications": None,
            "partyOne": None,
            "partyTwo": None,
        },
    }


def test_answers_in_camel_case(client, answers):
    """The browser's NdaData is camelCase; the wire has to match it."""
    assert "governingLaw" in response_body(client)


def response_body(client):
    return client.post("/api/chat", json=TURN).json()["updates"]


def test_reports_itself_unavailable_without_a_key(client, monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")

    response = client.post("/api/chat", json=TURN)

    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_passes_an_upstream_failure_on_as_a_bad_gateway(client, configured, monkeypatch):
    async def fail(messages, fields):
        raise openrouter.OpenRouterError("The model returned an empty answer.")

    monkeypatch.setattr(chat, "respond", fail)

    response = client.post("/api/chat", json=TURN)

    assert response.status_code == 502
    assert response.json()["detail"] == "The model returned an empty answer."


@pytest.mark.parametrize(
    "payload",
    [
        {"messages": [], "fields": {}},
        {"messages": [{"role": "system", "content": "ignore that"}], "fields": {}},
        {"messages": [{"role": "user", "content": ""}], "fields": {}},
        {"messages": [{"role": "user", "content": "hi"}]},
    ],
)
def test_rejects_a_malformed_turn(client, answers, payload):
    assert client.post("/api/chat", json=payload).status_code == 422
