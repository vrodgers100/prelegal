"""Sign-up and sign-in.

V1 has no authentication: passwords are ignored and sign-in accepts any email,
creating the user if it is new. The endpoints exist so the browser, the API and
the database exercise the same path real authentication will use.
"""

import sqlite3

from fastapi import APIRouter, HTTPException, status

from .. import db, users
from ..schemas import Credentials, User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(credentials: Credentials) -> User:
    """Registers a new user. Conflicts if the email is already registered."""
    with db.connect() as connection:
        try:
            row = users.create(connection, credentials.email)
        except sqlite3.IntegrityError:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "That email is already registered."
            ) from None
    return User(**dict(row))


@router.post("/login")
def login(credentials: Credentials) -> User:
    """Signs the user in, registering them first if the email is unknown."""
    with db.connect() as connection:
        row = users.find_or_create(connection, credentials.email)
    return User(**dict(row))
