"""Calls to the OpenRouter chat completions API.

Two shapes: plain prose, and a JSON answer constrained by a schema. Anything
that goes wrong arrives at the caller as an `OpenRouterError`.
"""

import json
from typing import Any

import httpx2

from . import config


class OpenRouterError(RuntimeError):
    """The model could not be reached, or did not answer in the agreed shape."""


async def completion(messages: list[dict[str, str]]) -> str:
    """Returns the model's reply as text."""
    return _content(await _post({"messages": messages}))


async def structured_completion(
    messages: list[dict[str, str]], schema: dict[str, Any], schema_name: str
) -> dict[str, Any]:
    """Returns the model's answer parsed as JSON, constrained by `schema`."""
    body = await _post(
        {
            "messages": messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "strict": True,
                    "schema": schema,
                },
            },
        }
    )

    content = _content(body)
    try:
        return json.loads(content)
    except json.JSONDecodeError as error:
        raise OpenRouterError(f"The model did not return JSON: {content[:200]}") from error


async def _post(payload: dict[str, Any]) -> dict[str, Any]:
    request = {
        "model": config.OPENROUTER_MODEL,
        "provider": {
            # Structured output matters enough here to rule out providers that
            # do not implement it, rather than risk getting prose back.
            "require_parameters": True,
            # Novita answers structured requests for this model with a null
            # content and finish_reason "stop" — measured 0 usable replies in
            # 3, against 21 in 21 across CoreWeave, DeepInfra and SiliconFlow.
            "ignore": config.OPENROUTER_IGNORED_PROVIDERS,
            # A turn is two calls one after the other, so provider speed lands
            # squarely on the user. Sorting by throughput halved a measured
            # turn from 12.2s to 6.2s with no loss of accuracy.
            "sort": "throughput",
        },
        **payload,
    }

    try:
        async with httpx2.AsyncClient(
            timeout=config.OPENROUTER_TIMEOUT_SECONDS
        ) as client:
            response = await client.post(
                config.OPENROUTER_URL,
                headers={"Authorization": f"Bearer {config.OPENROUTER_API_KEY}"},
                json=request,
            )
    except httpx2.HTTPError as error:
        raise OpenRouterError(f"Could not reach the model: {error}") from error

    if not response.is_success:
        raise OpenRouterError(_failure_detail(response))
    return response.json()


def _failure_detail(response: httpx2.Response) -> str:
    """OpenRouter puts a human-readable reason under `error.message`."""
    try:
        message = response.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        message = response.text[:200]
    return f"The model refused the request ({response.status_code}): {message}"


def _content(body: dict[str, Any]) -> str:
    """Pulls the assistant's message out of a completion.

    A null `content` is not hypothetical: providers occasionally return one
    even on a 200, which is a failed turn rather than an empty answer.
    """
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise OpenRouterError(f"Unexpected response from the model: {body}") from error

    if not isinstance(content, str) or not content.strip():
        raise OpenRouterError("The model returned an empty answer.")
    return content
