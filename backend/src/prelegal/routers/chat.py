"""The drafting conversation.

Stateless: the browser sends the transcript and the document it currently
holds, and gets back what to say plus whichever fields the model learned. It
merges them itself, so a reply can never overwrite an edit made while the
request was in flight.
"""

from fastapi import APIRouter, HTTPException, status

from .. import chat, config, openrouter
from ..nda import ChatTurn
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
        return await chat.respond(messages, request.fields)
    except openrouter.OpenRouterError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from None
