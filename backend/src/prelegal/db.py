"""SQLite access for the scratch database.

The database is a scratch store: `reset` drops and recreates every table on
startup, so a container always begins empty. That is deliberate and PL-7 keeps
it — saved documents last as long as the server does, and the sign-in screen
says so rather than implying otherwise.

There is no migration mechanism because there is nothing to migrate: a schema
change is an edit to `_SCHEMA`.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from . import config

#: Dropped in reverse order of creation, so a table never outlives what it
#: references. `fields` is JSON text because SQLite has no JSON column type and
#: the shape depends on which agreement it is — the browser and the extraction
#: model both already treat it as one bag of values.
_SCHEMA = """
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Timestamps to the millisecond, not the second: the list is ordered by
-- updated_at, and datetime('now') is coarse enough that two documents saved
-- in the same second would be ordered by id instead of by recency.
CREATE TABLE documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    document_type TEXT NOT NULL,
    fields        TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX documents_by_user ON documents (user_id, updated_at DESC);
"""


@contextmanager
def connect(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Yields a connection that commits on success and always closes.

    Rows come back as `sqlite3.Row`, so callers can read them by column name.
    """
    path = db_path or config.DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def reset(db_path: Path | None = None) -> None:
    """Drops and recreates the schema, leaving an empty database."""
    with connect(db_path) as connection:
        connection.executescript(_SCHEMA)
