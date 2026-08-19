"""Request and response models for the API."""

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
