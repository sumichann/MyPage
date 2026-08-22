"""Collect public channel and video metadata through the YouTube Data API."""

from __future__ import annotations

import json
import urllib.parse
from pathlib import Path
from typing import Any, Callable

from .http_client import request_json


JsonRequester = Callable[..., Any]
YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


def _request_youtube_resource(
    resource: str,
    parameters: dict[str, Any],
    api_key: str,
    requester: JsonRequester,
) -> dict[str, Any]:
    query = urllib.parse.urlencode({**parameters, "key": api_key})
    url = f"{YOUTUBE_API_BASE}/{resource}?{query}"
    try:
        return requester(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "kusahata-concept-generator",
            },
        )
    except RuntimeError as error:
        raise RuntimeError(str(error).replace(api_key, "[REDACTED]")) from error


def collect_public_youtube_channel(
    handle: str,
    api_key: str,
    max_videos: int = 30,
    requester: JsonRequester = request_json,
) -> dict[str, str]:
    public_channel = fetch_public_youtube_channel(
        handle,
        api_key,
        max_videos,
        requester,
    )
    normalized_handle = handle if handle.startswith("@") else f"@{handle}"
    return {
        "source": f"youtube.com/{normalized_handle}",
        "text": json.dumps(public_channel, ensure_ascii=False, indent=2),
    }


def fetch_public_youtube_channel(
    handle: str,
    api_key: str,
    max_videos: int = 30,
    requester: JsonRequester = request_json,
) -> dict[str, Any]:
    normalized_handle = handle if handle.startswith("@") else f"@{handle}"
    channel_response = _request_youtube_resource(
        "channels",
        {
            "part": "snippet,contentDetails",
            "forHandle": normalized_handle,
        },
        api_key,
        requester,
    )
    channels = channel_response.get("items", [])
    if not channels:
        raise RuntimeError(f"YouTube channel {normalized_handle} was not found.")

    channel = channels[0]
    uploads_playlist = channel.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
    if not uploads_playlist:
        raise RuntimeError(f"YouTube channel {normalized_handle} has no uploads playlist.")

    playlist_response = _request_youtube_resource(
        "playlistItems",
        {
            "part": "contentDetails",
            "playlistId": uploads_playlist,
            "maxResults": max_videos,
        },
        api_key,
        requester,
    )
    video_ids = [
        item.get("contentDetails", {}).get("videoId")
        for item in playlist_response.get("items", [])
    ]
    video_ids = [video_id for video_id in video_ids if video_id]

    videos_by_id: dict[str, dict[str, Any]] = {}
    if video_ids:
        videos_response = _request_youtube_resource(
            "videos",
            {
                "part": "snippet,contentDetails",
                "id": ",".join(video_ids),
            },
            api_key,
            requester,
        )
        videos_by_id = {video["id"]: video for video in videos_response.get("items", [])}

    snippet = channel.get("snippet", {})
    public_channel = {
        "channel": {
            "id": channel.get("id"),
            "handle": normalized_handle,
            "title": snippet.get("title"),
            "description": snippet.get("description"),
            "publishedAt": snippet.get("publishedAt"),
            "country": snippet.get("country"),
        },
        "videos": [],
    }

    for video_id in video_ids:
        video = videos_by_id.get(video_id)
        if not video:
            continue
        video_snippet = video.get("snippet", {})
        public_channel["videos"].append(
            {
                "id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "title": video_snippet.get("title"),
                "description": (video_snippet.get("description") or "")[:2000],
                "publishedAt": video_snippet.get("publishedAt"),
                "tags": video_snippet.get("tags", []),
                "categoryId": video_snippet.get("categoryId"),
                "duration": video.get("contentDetails", {}).get("duration"),
            }
        )

    return public_channel


def write_youtube_feed(path: Path, feed: dict[str, Any]) -> bool:
    serialized = json.dumps(feed, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == serialized:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialized, encoding="utf-8")
    return True


def collect_youtube_source(path: Path) -> dict[str, str]:
    feed = json.loads(path.read_text(encoding="utf-8"))
    handle = feed.get("channel", {}).get("handle", "@sumihosdrums")
    return {
        "source": f"youtube.com/{handle}",
        "text": json.dumps(feed, ensure_ascii=False, indent=2),
    }
