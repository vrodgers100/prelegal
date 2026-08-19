"""Request and response models for the API."""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from .nda import NdaFields


class Credentials(BaseModel):
    """What the sign-in and sign-up forms submit.

    `password` is accepted so the client shape is already right, but it is
    discarded: V1 has no authentication. It will be hashed and stored once
    real sign-in lands.
    """

    email: EmailStr
    password: str = Field(min_length=1)


class User(BaseModel):
    """A user as the API returns it."""

    id: int
    email: EmailStr
    created_at: str


class ChatMessage(BaseModel):
    """One line of the drafting conversation, as the browser holds it."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    """A turn: the transcript so far, and the document as it currently stands.

    The browser owns the document, so it sends the current fields with every
    message rather than the server keeping a session.
    """

    messages: list[ChatMessage] = Field(min_length=1)
    fields: NdaFields
