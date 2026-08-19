"""SQLite access for the temporary V1 database.

The database is a scratch store: `reset` drops and recreates every table on
startup, so a container always begins with an empty users table. Persistence
arrives with real authentication.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from . import config

_SCHEMA = """
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
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
