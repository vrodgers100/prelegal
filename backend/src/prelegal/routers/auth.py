"""Sign-up, sign-in and sign-out.

Passwords are hashed on the way in and verified on the way back; a successful
call opens a session and returns its token, which the browser sends as a bearer
token from then on.

Sign-in answers the same way whether the email is unknown or the password is
wrong. Distinguishing them would let anyone discover who has an account here,
which for a product about confidential agreements is worth more than the
marginally friendlier error message.
"""

import sqlite3

from fastapi import APIRouter, Header, HTTPException, Response, status

from .. import db, security, sessions, users
from ..dependencies import bearer_token
from ..schemas import AuthResponse, Credentials, User

router = APIRouter(prefix="/auth", tags=["auth"])

_REJECTED = "That email and password do not match an account."


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(credentials: Credentials) -> AuthResponse:
    """Registers a new user and signs them in. Conflicts if the email is taken."""
    with db.connect() as connection:
        try:
            row = users.create(
                connection, credentials.email, security.hash_password(credentials.password)
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "That email is already registered."
            ) from None
        token = sessions.create(connection, row["id"])

    return AuthResponse(user=User.from_row(row), token=token)


@router.post("/login")
def login(credentials: Credentials) -> AuthResponse:
    """Signs an existing user in. Unknown emails are not registered on the way past."""
    with db.connect() as connection:
        row = users.find_by_email(connection, credentials.email)
        if row is None or not security.verify_password(
            credentials.password, row["password_hash"]
        ):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, _REJECTED)
        token = sessions.create(connection, row["id"])

    return AuthResponse(user=User.from_row(row), token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(authorization: str | None = Header(default=None)) -> Response:
    """Closes this session. Signing out twice is not an error."""
    token = bearer_token(authorization)
    if token:
        with db.connect() as connection:
            sessions.delete(connection, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
