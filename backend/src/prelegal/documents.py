"""Queries against the documents table.

Every lookup is scoped by `user_id` in the SQL itself rather than fetched and
then checked, so there is no path through this module that can return one
person's document to another. A document belonging to someone else is
indistinguishable from one that does not exist, which is the point: a 404 tells
an attacker nothing, a 403 confirms the id is real.

`fields` is JSON text in the database and a dict everywhere else; this module
is the only place that knows which is which.
"""

import json
import sqlite3
from typing import Any


def create(
    connection: sqlite3.Connection, user_id: int, document_type: str
) -> sqlite3.Row:
    """Starts an empty document for this user."""
    cursor = connection.execute(
        "INSERT INTO documents (user_id, document_type) VALUES (?, ?)",
        (user_id, document_type),
    )
    return _get_by_id(connection, cursor.lastrowid)


def list_for_user(connection: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    """This user's documents, most recently worked on first."""
    cursor = connection.execute(
        "SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
        (user_id,),
    )
    return cursor.fetchall()


def find(
    connection: sqlite3.Connection, document_id: int, user_id: int
) -> sqlite3.Row | None:
    """One of this user's documents, or None if it is not theirs or not there."""
    cursor = connection.execute(
        "SELECT * FROM documents WHERE id = ? AND user_id = ?", (document_id, user_id)
    )
    return cursor.fetchone()


def update_fields(
    connection: sqlite3.Connection,
    document_id: int,
    user_id: int,
    fields: dict[str, Any],
) -> sqlite3.Row | None:
    """Replaces the fields wholesale, as the browser owns the document.

    Returns None when the document is not this user's, so the caller answers
    exactly as it would for one that does not exist.
    """
    cursor = connection.execute(
        """
        UPDATE documents SET fields = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND user_id = ?
        """,
        (json.dumps(fields), document_id, user_id),
    )
    if cursor.rowcount == 0:
        return None
    return _get_by_id(connection, document_id)


def read_fields(row: sqlite3.Row) -> dict[str, Any]:
    """The stored fields as a dict."""
    return json.loads(row["fields"])


def _get_by_id(connection: sqlite3.Connection, document_id: int) -> sqlite3.Row:
    cursor = connection.execute(
        "SELECT * FROM documents WHERE id = ?", (document_id,)
    )
    return cursor.fetchone()
