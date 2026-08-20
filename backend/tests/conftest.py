"""Test fixtures.

Each test gets its own SQLite file in a temporary directory, so tests never
share state and never touch a developer's local database.
"""

import pytest
from fastapi.testclient import TestClient

from prelegal import config, db
from prelegal.main import app


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    """Points the application at a throwaway database."""
    path = tmp_path / "test.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    return path


@pytest.fixture
def client(db_path):
    """A client whose startup has created the schema."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def anyio_backend():
    """Runs `@pytest.mark.anyio` tests on asyncio, the only backend in use."""
    return "asyncio"


#: A password long enough for `Credentials` to accept.
PASSWORD = "correct horse battery staple"


@pytest.fixture
def register(client):
    """Registers a user and returns their bearer headers.

    Takes an email so a test that needs two users can tell them apart, which is
    what the privacy tests are made of.
    """

    def _register(email: str = "ada@example.com") -> dict[str, str]:
        response = client.post(
            "/api/auth/signup", json={"email": email, "password": PASSWORD}
        )
        assert response.status_code == 201, response.text
        return {"Authorization": f"Bearer {response.json()['token']}"}

    return _register


@pytest.fixture
def auth_headers(register):
    """Bearer headers for one signed-in user."""
    return register()
