"""Collect public-safe editorial and GitHub source material."""

from __future__ import annotations

import json
import urllib.parse
from pathlib import Path
from typing import Any, Callable

from .http_client import request_json


JsonRequester = Callable[..., Any]


def collect_editorial_sources(content_dir: Path, root: Path) -> list[dict[str, str]]:
    return [
        {
            "source": source.relative_to(root).as_posix(),
            "text": source.read_text(encoding="utf-8"),
        }
        for source in sorted(content_dir.glob("*.md"))
    ]


def collect_public_github_profile(
    username: str,
    token: str | None,
    requester: JsonRequester = request_json,
) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "kusahata-concept-generator",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    encoded_username = urllib.parse.quote(username)
    user = requester(
        f"https://api.github.com/users/{encoded_username}",
        headers=headers,
    )
    query = urllib.parse.urlencode({"per_page": 100, "sort": "updated"})
    repositories = requester(
        f"https://api.github.com/users/{encoded_username}/repos?{query}",
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
        "source": f"github.com/{username}",
        "text": json.dumps(public_profile, ensure_ascii=False, indent=2),
    }
