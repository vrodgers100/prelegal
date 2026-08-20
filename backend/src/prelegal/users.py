"""Queries against the users table.

The password is stored as a salted scrypt hash and never in the clear; see
`security.py`. `find_or_create` is gone: it existed so that V1's sign-in could
accept any email, and letting sign-in quietly register an unknown address is
exactly what real authentication must not do.
"""

import sqlite3


def find_by_email(connection: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    """Returns the user with this email, or None. Matching is case-insensitive."""
    cursor = connection.execute("SELECT * FROM users WHERE email = ?", (email,))
    return cursor.fetchone()


def create(
    connection: sqlite3.Connection, email: str, password_hash: str
) -> sqlite3.Row:
    """Inserts a user. Raises `sqlite3.IntegrityError` if the email is taken."""
    cursor = connection.execute(
        "INSERT INTO users (email, password_hash) VALUES (?, ?)",
        (email, password_hash),
    )
    row = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,))
    return row.fetchone()
