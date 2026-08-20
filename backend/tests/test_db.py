"""The scratch database contract: every boot starts from an empty schema."""

import pytest
from conftest import PASSWORD
from fastapi.testclient import TestClient

from prelegal import db, security, users
from prelegal.main import app

SIGNUP = {"email": "ada@example.com", "password": PASSWORD}


@pytest.mark.parametrize("table", ["users", "sessions", "documents"])
def test_reset_creates_an_empty_table(db_path, table):
    db.reset(db_path)

    with db.connect(db_path) as connection:
        count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        assert count == 0


def test_reset_discards_existing_users(db_path):
    db.reset(db_path)
    with db.connect(db_path) as connection:
        users.create(connection, "ada@example.com", security.hash_password(PASSWORD))

    db.reset(db_path)

    with db.connect(db_path) as connection:
        assert users.find_by_email(connection, "ada@example.com") is None


def test_startup_wipes_users_from_the_previous_run(client, db_path):
    """A second boot against the same file starts empty, as a container does."""
    assert client.post("/api/auth/signup", json=SIGNUP).status_code == 201

    with TestClient(app) as rebooted:
        assert rebooted.post("/api/auth/signup", json=SIGNUP).status_code == 201


def test_startup_wipes_saved_documents_too(client, db_path, auth_headers):
    """Saved documents last as long as the server does, and no longer."""
    client.post(
        "/api/documents", json={"documentType": "mutual-nda"}, headers=auth_headers
    )

    with TestClient(app) as rebooted:
        assert rebooted.get("/api/documents", headers=auth_headers).status_code == 401


def test_a_password_is_never_stored_in_the_clear(client, db_path):
    """The column holds a hash; the password itself must not appear anywhere."""
    client.post("/api/auth/signup", json=SIGNUP)

    assert PASSWORD not in db_path.read_bytes().decode("utf8", errors="ignore")
