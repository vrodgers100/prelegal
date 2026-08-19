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
