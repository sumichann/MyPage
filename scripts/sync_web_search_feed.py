#!/usr/bin/env python3
"""Synchronize public pages discovered through Brave Search."""

from __future__ import annotations

import json
import os
from pathlib import Path

from concept_generator.web_search import (
    DEFAULT_QUERY,
    build_web_search_feed,
    write_web_search_feed,
)


def main() -> None:
    api_key = os.environ.get("BRAVE_SEARCH_API_KEY")
    if not api_key:
        raise RuntimeError("BRAVE_SEARCH_API_KEY is required; never commit it.")

    root = Path(__file__).resolve().parents[1]
    output_path = root / "data" / "web-search-feed.json"
    previous_feed = None
    if output_path.exists():
        previous_feed = json.loads(output_path.read_text(encoding="utf-8"))
    query = os.environ.get("WEB_SEARCH_QUERY", DEFAULT_QUERY)
    changed = write_web_search_feed(
        output_path,
        build_web_search_feed(api_key, previous_feed, query=query),
    )
    print(f"{'Updated' if changed else 'No changes to'} {output_path.relative_to(root)}.")


if __name__ == "__main__":
    main()
