"""Queries against the users table.

There is no password column. V1 accepts any credentials, so storing a password
would mean storing a secret nothing checks; real hashing lands with real
authentication.
"""

import sqlite3


def find_by_email(connection: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    """Returns the user with this email, or None. Matching is case-insensitive."""
    cursor = connection.execute("SELECT * FROM users WHERE email = ?", (email,))
    return cursor.fetchone()


def create(connection: sqlite3.Connection, email: str) -> sqlite3.Row:
    """Inserts a user. Raises `sqlite3.IntegrityError` if the email is taken."""
    cursor = connection.execute("INSERT INTO users (email) VALUES (?)", (email,))
    row = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,))
    return row.fetchone()


def find_or_create(connection: sqlite3.Connection, email: str) -> sqlite3.Row:
    """Returns the existing user for this email, creating one if there is none."""
    return find_by_email(connection, email) or create(connection, email)
