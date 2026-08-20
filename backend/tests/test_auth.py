"""Sign-up, sign-in and sign-out."""

import pytest

from conftest import PASSWORD

CREDENTIALS = {"email": "ada@example.com", "password": PASSWORD}


def signup(client, **overrides):
    return client.post("/api/auth/signup", json={**CREDENTIALS, **overrides})


def login(client, **overrides):
    return client.post("/api/auth/login", json={**CREDENTIALS, **overrides})


class TestSignup:
    def test_registers_a_user_and_signs_them_in(self, client):
        response = signup(client)

        assert response.status_code == 201
        body = response.json()
        assert body["user"]["email"] == "ada@example.com"
        assert body["user"]["id"]
        assert body["token"]

    def test_never_returns_the_password_or_its_hash(self, client):
        """The response is built field by field for exactly this reason."""
        body = signup(client).text

        assert PASSWORD not in body
        assert "password" not in body

    def test_rejects_a_duplicate_email(self, client):
        signup(client)

        response = signup(client, password="a different password")

        assert response.status_code == 409
        assert "already registered" in response.json()["detail"]

    def test_treats_email_case_insensitively(self, client):
        signup(client)

        assert signup(client, email="ADA@example.com").status_code == 409

    @pytest.mark.parametrize(
        "overrides",
        [
            {"email": "not-an-email"},
            {"email": ""},
            {"password": "short"},
            {"password": ""},
        ],
    )
    def test_rejects_malformed_credentials(self, client, overrides):
        assert signup(client, **overrides).status_code == 422


class TestLogin:
    def test_signs_an_existing_user_back_in(self, client):
        signup(client)

        response = login(client)

        assert response.status_code == 200
        assert response.json()["user"]["email"] == "ada@example.com"
        assert response.json()["token"]

    def test_issues_a_new_token_each_time(self, client):
        """Sessions are rows, so signing in again does not end the last one."""
        first = signup(client).json()["token"]

        second = login(client).json()["token"]

        assert first != second

    def test_leaves_the_earlier_session_working(self, client):
        """Signing in on a second device must not sign you out on the first."""
        first = signup(client).json()["token"]
        login(client)

        response = client.get(
            "/api/documents", headers={"Authorization": f"Bearer {first}"}
        )

        assert response.status_code == 200

    def test_rejects_the_wrong_password(self, client):
        signup(client)

        response = login(client, password="not the right password")

        assert response.status_code == 401

    def test_does_not_register_an_unknown_email(self, client):
        """V1 signed anyone in. Real sign-in must not create accounts."""
        response = login(client, email="nobody@example.com")

        assert response.status_code == 401

    def test_says_the_same_thing_for_a_wrong_password_and_an_unknown_email(
        self, client
    ):
        """Otherwise the errors tell an attacker who has an account here."""
        signup(client)

        wrong_password = login(client, password="not the right password")
        unknown_email = login(client, email="nobody@example.com")

        assert wrong_password.json() == unknown_email.json()


class TestLogout:
    def test_ends_the_session(self, client, auth_headers):
        assert client.post("/api/auth/logout", headers=auth_headers).status_code == 204

        assert client.get("/api/documents", headers=auth_headers).status_code == 401

    def test_leaves_the_other_sessions_alone(self, client):
        first = signup(client).json()["token"]
        second = login(client).json()["token"]

        client.post("/api/auth/logout", headers={"Authorization": f"Bearer {first}"})

        response = client.get(
            "/api/documents", headers={"Authorization": f"Bearer {second}"}
        )
        assert response.status_code == 200

    def test_signing_out_twice_is_not_an_error(self, client, auth_headers):
        client.post("/api/auth/logout", headers=auth_headers)

        assert client.post("/api/auth/logout", headers=auth_headers).status_code == 204

    def test_signing_out_without_a_session_is_not_an_error(self, client):
        assert client.post("/api/auth/logout").status_code == 204


class TestAuthentication:
    """What the bearer token does and does not open."""

    def test_rejects_a_request_with_no_token(self, client):
        assert client.get("/api/documents").status_code == 401

    def test_rejects_an_unknown_token(self, client):
        response = client.get(
            "/api/documents", headers={"Authorization": "Bearer made-up"}
        )

        assert response.status_code == 401

    @pytest.mark.parametrize(
        "header", ["", "Bearer", "Bearer ", "made-up", "Basic abc123"]
    )
    def test_rejects_a_malformed_authorization_header(self, client, header):
        response = client.get("/api/documents", headers={"Authorization": header})

        assert response.status_code == 401

    def test_accepts_the_scheme_in_any_case(self, client, client_token):
        """HTTP schemes are case-insensitive, and clients differ."""
        response = client.get(
            "/api/documents", headers={"Authorization": f"bearer {client_token}"}
        )

        assert response.status_code == 200


@pytest.fixture
def client_token(client):
    return signup(client).json()["token"]
