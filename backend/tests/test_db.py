"""The scratch database contract: every boot starts from an empty schema."""

from fastapi.testclient import TestClient

from prelegal import db, users
from prelegal.main import app


def test_reset_creates_an_empty_users_table(db_path):
    db.reset(db_path)

    with db.connect(db_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_reset_discards_existing_users(db_path):
    db.reset(db_path)
    with db.connect(db_path) as connection:
        users.create(connection, "ada@example.com")

    db.reset(db_path)

    with db.connect(db_path) as connection:
        assert users.find_by_email(connection, "ada@example.com") is None


def test_startup_wipes_users_from_the_previous_run(client, db_path):
    """A second boot against the same file starts empty, as a container does."""
    signup = {"email": "ada@example.com", "password": "x"}
    assert client.post("/api/auth/signup", json=signup).status_code == 201

    with TestClient(app) as rebooted:
        assert rebooted.post("/api/auth/signup", json=signup).status_code == 201
