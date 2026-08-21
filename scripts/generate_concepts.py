#!/usr/bin/env python3
"""Generate the public concept map from editorial notes and GitHub metadata."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path.cwd()
CONTENT_DIR = ROOT / "content"
OUTPUT_PATH = ROOT / "data" / "concepts.json"
API_KEY = os.environ.get("OPENAI_API_KEY")
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
GITHUB_USERNAME = os.environ.get("GITHUB_USERNAME", "sumichann")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")

if not API_KEY:
    raise RuntimeError(
        "OPENAI_API_KEY is required. Store it as a GitHub Actions secret; "
        "never commit it."
    )


def request_json(
    url: str,
    *,
    headers: dict[str, str],
    method: str = "GET",
    payload: dict[str, Any] | None = None,
) -> Any:
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Request failed ({error.code}) for {url}: {message}") from error


def collect_editorial_sources() -> list[dict[str, str]]:
    return [
        {
            "source": source.relative_to(ROOT).as_posix(),
            "text": source.read_text(encoding="utf-8"),
        }
        for source in sorted(CONTENT_DIR.glob("*.md"))
    ]


def collect_public_github_profile() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "kusahata-concept-generator",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    user = request_json(
        f"https://api.github.com/users/{urllib.parse.quote(GITHUB_USERNAME)}",
        headers=headers,
    )
    query = urllib.parse.urlencode({"per_page": 100, "sort": "updated"})
    repositories = request_json(
        f"https://api.github.com/users/{urllib.parse.quote(GITHUB_USERNAME)}/repos?{query}",
        headers=headers,
    )

    public_profile = {
        "profile": {
            "name": user.get("name"),
            "bio": user.get("bio"),
            "company": user.get("company"),
            "location": user.get("location"),
            "blog": user.get("blog"),
        },
        "repositories": [
            {
                "name": repository.get("name"),
                "description": repository.get("description"),
                "homepage": repository.get("homepage"),
                "language": repository.get("language"),
                "topics": repository.get("topics", []),
            }
            for repository in repositories
            if not repository.get("fork")
        ],
    }

    return {
        "source": f"github.com/{GITHUB_USERNAME}",
        "text": json.dumps(public_profile, ensure_ascii=False, indent=2),
    }


CONCEPT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "concepts": {
            "type": "array",
            "minItems": 12,
            "maxItems": 36,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "label": {"type": "string", "minLength": 1, "maxLength": 40},
                    "summary": {"type": "string", "minLength": 1, "maxLength": 180},
                    "weight": {"type": "integer", "minimum": 1, "maximum": 100},
                    "category": {"type": "string", "minLength": 1, "maxLength": 32},
                    "related": {
                        "type": "array",
                        "maxItems": 6,
                        "items": {"type": "string", "minLength": 1, "maxLength": 40},
                    },
                    "evidence": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 6,
                        "items": {"type": "string", "minLength": 1, "maxLength": 120},
                    },
                },
                "required": [
                    "label",
                    "summary",
                    "weight",
                    "category",
                    "related",
                    "evidence",
                ],
            },
        }
    },
    "required": ["concepts"],
}


def response_text(response: dict[str, Any]) -> str:
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                return content["text"]
    raise RuntimeError("OpenAI response did not contain output text.")


sources = [*collect_editorial_sources(), collect_public_github_profile()]
openai_response = request_json(
    "https://api.openai.com/v1/responses",
    method="POST",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    payload={
        "model": MODEL,
        "store": False,
        "instructions": " ".join(
            [
                "You are an editorial researcher creating a personal concept map.",
                "Extract distinctive concepts grounded only in the supplied sources.",
                "Prefer specific nouns and short noun phrases over generic personality adjectives.",
                "Merge duplicates, preserve meaningful contrasts, and write concise Japanese summaries.",
                "Weights represent identity relevance, not raw frequency.",
                "Evidence must name source identifiers, never invent private facts.",
            ]
        ),
        "input": json.dumps(sources, ensure_ascii=False),
        "text": {
            "format": {
                "type": "json_schema",
                "name": "personal_concept_map",
                "strict": True,
                "schema": CONCEPT_SCHEMA,
            }
        },
    },
)

result = json.loads(response_text(openai_response))
output = {
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "model": MODEL,
    "concepts": result["concepts"],
}
OUTPUT_PATH.write_text(
    f"{json.dumps(output, ensure_ascii=False, indent=2)}\n",
    encoding="utf-8",
)

print(f"Generated {len(result['concepts'])} concepts with {MODEL}.")
