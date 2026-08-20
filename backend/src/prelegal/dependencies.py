"""Who is asking.

One dependency, resolving a bearer token to the user it signs in. It is a plain
`def`, which FastAPI runs in a threadpool, so it composes with the sync handlers
in `routers/auth.py` and `routers/documents.py` and with the async one in
`routers/chat.py` without either side knowing about the other.
"""

import sqlite3
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from . import db, sessions

#: The one message for every authentication failure. A missing token, a
#: malformed header and a token from a database that has since restarted are
#: the same thing to the caller: sign in again.
UNAUTHENTICATED = "Sign in to continue."


def bearer_token(authorization: str | None) -> str | None:
    """Pulls the token out of an `Authorization: Bearer <token>` header."""
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> sqlite3.Row:
    """The signed-in user, or 401."""
    token = bearer_token(authorization)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, UNAUTHENTICATED)

    with db.connect() as connection:
        user = sessions.find_user(connection, token)

    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, UNAUTHENTICATED)
    return user


#: What a route writes to require a signed-in user.
CurrentUser = Annotated[sqlite3.Row, Depends(current_user)]
