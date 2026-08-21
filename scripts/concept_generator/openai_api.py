"""OpenAI Responses API integration for structured concept extraction."""

from __future__ import annotations

import json
from typing import Any, Callable

from .http_client import request_json
from .schema import CONCEPT_SCHEMA


JsonRequester = Callable[..., Any]

INSTRUCTIONS = " ".join(
    [
        "You are an editorial researcher creating a personal concept map.",
        "Extract distinctive concepts grounded only in the supplied sources.",
        "Prefer specific nouns and short noun phrases over generic personality adjectives.",
        "Merge duplicates, preserve meaningful contrasts, and write concise Japanese summaries.",
        "Weights represent identity relevance, not raw frequency.",
        "Evidence must name source identifiers, never invent private facts.",
    ]
)


def build_request_payload(model: str, sources: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "model": model,
        "store": False,
        "instructions": INSTRUCTIONS,
        "input": json.dumps(sources, ensure_ascii=False),
        "text": {
            "format": {
                "type": "json_schema",
                "name": "personal_concept_map",
                "strict": True,
                "schema": CONCEPT_SCHEMA,
            }
        },
    }


def extract_response_text(response: dict[str, Any]) -> str:
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                return content["text"]
    raise RuntimeError("OpenAI response did not contain output text.")


def generate_concepts(
    api_key: str,
    model: str,
    sources: list[dict[str, str]],
    requester: JsonRequester = request_json,
) -> list[dict[str, Any]]:
    response = requester(
        "https://api.openai.com/v1/responses",
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        payload=build_request_payload(model, sources),
    )
    result = json.loads(extract_response_text(response))
    return result["concepts"]
