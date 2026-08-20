"""The drafting conversation.

Stateless: the browser sends the transcript and the document it currently
holds, and gets back what to say plus whichever fields the model learned. It
merges them itself, so a reply can never overwrite an edit made while the
request was in flight.

A turn with no `documentType` is asking which agreement to draft; one with a
`documentType` is filling that agreement in.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import ValidationError

from .. import chat, config, openrouter
from ..chat import ChatTurn
from ..document_schema import DOCUMENTS, fields_model
from ..schemas import ChatRequest

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("")
async def send(request: ChatRequest) -> ChatTurn:
    """Answers the latest message and reports the fields it filled in."""
    if not config.OPENROUTER_API_KEY:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The drafting assistant is not configured. Set OPENROUTER_API_KEY "
            "to use it; the fields below can be filled in by hand meanwhile.",
        )

    messages = [message.model_dump() for message in request.messages]

    try:
        if request.document_type is None:
            return await chat.select_document(messages)

        spec = DOCUMENTS.get(request.document_type)
        if spec is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Prelegal does not draft a {request.document_type!r}.",
            )

        try:
            fields = fields_model(spec.document_type).model_validate(request.fields)
        except ValidationError as error:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Those are not valid {spec.name} fields: {error}",
            ) from None

        return await chat.respond(messages, spec, fields)
    except openrouter.OpenRouterError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from None
