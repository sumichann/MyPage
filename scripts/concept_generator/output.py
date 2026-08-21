"""Persistence for the generated public concept map."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def write_concepts(
    output_path: Path,
    model: str,
    concepts: list[dict[str, Any]],
    clock: Clock = utc_now,
) -> None:
    timestamp = clock().astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "generatedAt": timestamp,
        "model": model,
        "concepts": concepts,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n",
        encoding="utf-8",
    )
