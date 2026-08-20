"""Saved documents.

The browser autosaves as the user drafts, so these routes are written to be
called often and to be dull: create one when an agreement is chosen, replace
its fields when they change, list them, read one back.

Fields are replaced wholesale rather than merged, for the same reason the chat
is stateless: the browser owns the document, and a merge on this side would be
a second opinion about a value the user can see on their screen.
"""

from fastapi import APIRouter, HTTPException, status

from .. import db, documents
from ..dependencies import CurrentUser
from ..schemas import DocumentFields, DocumentSummary, NewDocument, SavedDocument
from ._shared import require_fields, require_spec

router = APIRouter(prefix="/documents", tags=["documents"])

_MISSING = "That document does not exist."


@router.post("", status_code=status.HTTP_201_CREATED)
def start(request: NewDocument, user: CurrentUser) -> SavedDocument:
    """Starts saving a new document for the signed-in user."""
    spec = require_spec(request.document_type)
    with db.connect() as connection:
        row = documents.create(connection, user["id"], spec.document_type)
    return _saved(row)


@router.get("")
def index(user: CurrentUser) -> list[DocumentSummary]:
    """The signed-in user's documents, most recently worked on first."""
    with db.connect() as connection:
        rows = documents.list_for_user(connection, user["id"])
    return [DocumentSummary(**_summary(row)) for row in rows]


@router.get("/{document_id}")
def show(document_id: int, user: CurrentUser) -> SavedDocument:
    """One of the signed-in user's documents."""
    with db.connect() as connection:
        row = documents.find(connection, document_id, user["id"])
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _MISSING)
    return _saved(row)


@router.put("/{document_id}/fields")
def save(document_id: int, request: DocumentFields, user: CurrentUser) -> SavedDocument:
    """Replaces a document's fields. This is what autosave calls."""
    with db.connect() as connection:
        existing = documents.find(connection, document_id, user["id"])
        if existing is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, _MISSING)

        spec = require_spec(existing["document_type"])
        valid = require_fields(spec, request.fields)
        row = documents.update_fields(
            connection,
            document_id,
            user["id"],
            valid.model_dump(by_alias=True, exclude_none=True),
        )

    return _saved(row)


def _summary(row) -> dict:
    return {
        "id": row["id"],
        "document_type": row["document_type"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _saved(row) -> SavedDocument:
    return SavedDocument(**_summary(row), fields=documents.read_fields(row))
