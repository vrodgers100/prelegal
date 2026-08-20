"""Request and response models for the API."""

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


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

    `fields` stays untyped here because its shape depends on `document_type`,
    which is only known once the body is read. The router validates it against
    that agreement's own model. A null `document_type` means no agreement has
    been chosen yet, and the turn is a choosing turn.
    """

    messages: list[ChatMessage] = Field(min_length=1)
    document_type: str | None = Field(default=None, alias="documentType")
    fields: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}
