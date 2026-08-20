"""Validation shared by the routes that accept a document.

Both the drafting conversation and autosave are handed an agreement name and a
bag of fields by the browser, and both have to answer the same two questions:
is that an agreement Prelegal drafts, and are those fields valid for it. Asking
them in one place is what stops a document being saved that the conversation
would have rejected, or the reverse.
"""

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError

from ..document_schema import DOCUMENTS, DocumentSpec, fields_model


def require_spec(document_type: str) -> DocumentSpec:
    """The agreement by that name, or 422."""
    spec = DOCUMENTS.get(document_type)
    if spec is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Prelegal does not draft a {document_type!r}.",
        )
    return spec


def require_fields(spec: DocumentSpec, fields: dict) -> BaseModel:
    """Those fields validated against that agreement's model, or 422."""
    try:
        return fields_model(spec.document_type).model_validate(fields)
    except ValidationError as error:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Those are not valid {spec.name} fields: {error}",
        ) from None
