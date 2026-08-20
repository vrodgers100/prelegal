"""Queries against the sessions table.

A session is a row rather than a column on the user, so signing in on a second
device does not sign you out of the first. Tokens do not expire: the database
is dropped on every restart, which ends every session with it.
"""

import sqlite3

from . import security


def create(connection: sqlite3.Connection, user_id: int) -> str:
    """Opens a session for this user and returns its token."""
    token = security.generate_token()
    connection.execute(
        "INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id)
    )
    return token


def find_user(connection: sqlite3.Connection, token: str) -> sqlite3.Row | None:
    """Returns the user this token signs in, or None if it signs in nobody."""
    cursor = connection.execute(
        """
        SELECT users.* FROM users
        JOIN sessions ON sessions.user_id = users.id
        WHERE sessions.token = ?
        """,
        (token,),
    )
    return cursor.fetchone()


def delete(connection: sqlite3.Connection, token: str) -> None:
    """Closes a session. Closing one that does not exist is not an error."""
    connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
