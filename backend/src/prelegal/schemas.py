"""Request and response models for the API."""

from collections.abc import Mapping
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


class Credentials(BaseModel):
    """What the sign-in and sign-up forms submit."""

    email: EmailStr
    #: Eight characters is the shortest length worth calling a password. It is
    #: enforced here rather than in the browser alone, because the browser is
    #: not the only thing that can post to this API.
    password: str = Field(min_length=8, max_length=256)


class User(BaseModel):
    """A user as the API returns it.

    Built field by field from the database row rather than by splatting it, so
    that the `password_hash` column cannot reach a response by accident.
    """

    id: int
    email: EmailStr
    created_at: str

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "User":
        return cls(id=row["id"], email=row["email"], created_at=row["created_at"])


class AuthResponse(BaseModel):
    """A signed-in user and the token that proves it."""

    user: User
    token: str


class DocumentSummary(BaseModel):
    """A saved document as the list shows it, without its contents."""

    id: int
    document_type: str = Field(serialization_alias="documentType")
    created_at: str = Field(serialization_alias="createdAt")
    updated_at: str = Field(serialization_alias="updatedAt")

    model_config = {"populate_by_name": True}


class SavedDocument(DocumentSummary):
    """A saved document, with the fields needed to put it back on screen."""

    fields: dict[str, Any]


class NewDocument(BaseModel):
    """Which agreement to start saving."""

    document_type: str = Field(alias="documentType")

    model_config = {"populate_by_name": True}


class DocumentFields(BaseModel):
    """A document's fields, as autosave sends them."""

    fields: dict[str, Any] = Field(default_factory=dict)


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
