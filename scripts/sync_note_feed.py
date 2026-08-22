#!/usr/bin/env python3
"""Synchronize the public note RSS feed into a stable local JSON file."""

from __future__ import annotations

import os
from pathlib import Path

from concept_generator.note import DEFAULT_NOTE_RSS_URL, fetch_note_feed, write_note_feed


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    rss_url = os.environ.get("NOTE_RSS_URL", DEFAULT_NOTE_RSS_URL)
    output_path = root / "data" / "note-feed.json"
    changed = write_note_feed(output_path, fetch_note_feed(rss_url))
    print(f"{'Updated' if changed else 'No changes to'} {output_path.relative_to(root)}.")


if __name__ == "__main__":
    main()
