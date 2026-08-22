#!/usr/bin/env python3
"""Synchronize meaningful public YouTube metadata into stable local JSON."""

from __future__ import annotations

import os
from pathlib import Path

from concept_generator.youtube import fetch_public_youtube_channel, write_youtube_feed


def main() -> None:
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        raise RuntimeError("YOUTUBE_API_KEY is required; never commit it.")

    max_videos = int(os.environ.get("YOUTUBE_MAX_VIDEOS", "30"))
    if not 1 <= max_videos <= 50:
        raise ValueError("YOUTUBE_MAX_VIDEOS must be between 1 and 50.")

    root = Path(__file__).resolve().parents[1]
    output_path = root / "data" / "youtube-feed.json"
    feed = fetch_public_youtube_channel(
        os.environ.get("YOUTUBE_HANDLE", "@sumihosdrums"),
        api_key,
        max_videos,
    )
    changed = write_youtube_feed(output_path, feed)
    print(f"{'Updated' if changed else 'No changes to'} {output_path.relative_to(root)}.")


if __name__ == "__main__":
    main()
