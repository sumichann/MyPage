"""Environment-backed configuration for concept generation."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class Settings:
    root: Path
    content_dir: Path
    output_path: Path
    api_key: str
    model: str
    github_username: str
    github_token: str | None

    @classmethod
    def from_environment(
        cls,
        environment: Mapping[str, str] | None = None,
        root: Path | None = None,
    ) -> "Settings":
        values = os.environ if environment is None else environment
        project_root = Path.cwd() if root is None else root
        api_key = values.get("OPENAI_API_KEY")

        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is required. Store it as a GitHub Actions secret; "
                "never commit it."
            )

        return cls(
            root=project_root,
            content_dir=project_root / "content",
            output_path=project_root / "data" / "concepts.json",
            api_key=api_key,
            model=values.get("OPENAI_MODEL", "gpt-5.4-mini"),
            github_username=values.get("GITHUB_USERNAME", "sumichann"),
            github_token=values.get("GITHUB_TOKEN"),
        )
