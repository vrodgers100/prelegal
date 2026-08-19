"""Sign-up and sign-in behaviour.

V1 deliberately has no authentication: the tests below pin that any password is
accepted and that sign-in never turns a user away.
"""

import pytest

CREDENTIALS = {"email": "ada@example.com", "password": "irrelevant"}


def test_signup_creates_a_user(client):
    response = client.post("/api/auth/signup", json=CREDENTIALS)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert body["id"] > 0
    assert body["created_at"]


def test_signup_rejects_a_duplicate_email(client):
    client.post("/api/auth/signup", json=CREDENTIALS)

    response = client.post("/api/auth/signup", json=CREDENTIALS)

    assert response.status_code == 409


def test_signup_treats_email_case_insensitively(client):
    client.post("/api/auth/signup", json=CREDENTIALS)

    response = client.post(
        "/api/auth/signup", json={**CREDENTIALS, "email": "ADA@example.com"}
    )

    assert response.status_code == 409


def test_login_registers_an_unknown_email(client):
    response = client.post("/api/auth/login", json=CREDENTIALS)

    assert response.status_code == 200
    assert response.json()["email"] == "ada@example.com"


def test_login_returns_the_existing_user(client):
    created = client.post("/api/auth/signup", json=CREDENTIALS).json()

    response = client.post("/api/auth/login", json=CREDENTIALS)

    assert response.status_code == 200
    assert response.json() == created


def test_login_ignores_the_password(client):
    client.post("/api/auth/signup", json=CREDENTIALS)

    response = client.post(
        "/api/auth/login", json={**CREDENTIALS, "password": "something-else"}
    )

    assert response.status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": "x"},
        {"email": "ada@example.com", "password": ""},
        {"email": "ada@example.com"},
    ],
)
def test_rejects_malformed_credentials(client, payload):
    response = client.post("/api/auth/login", json=payload)

    assert response.status_code == 422
