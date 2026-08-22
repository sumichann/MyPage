"""Fetch, normalize, and expose a note.com RSS feed as source material."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable

from .http_client import request_text


TextRequester = Callable[..., str]
DEFAULT_NOTE_RSS_URL = "https://note.com/chenchuchu/rss"
MAX_DESCRIPTION_LENGTH = 3000


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"br", "p", "blockquote", "figcaption"}:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"p", "blockquote", "figure", "figcaption"}:
            self.parts.append(" ")


def _plain_text(html: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(html)
    parser.close()
    return re.sub(r"\s+", " ", "".join(parser.parts)).strip()


def parse_note_feed(xml_text: str) -> dict[str, object]:
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        raise ValueError("The note RSS feed has no channel element.")

    articles = []
    for item in channel.findall("item"):
        description = _plain_text(item.findtext("description", default=""))
        articles.append(
            {
                "title": item.findtext("title", default="").strip(),
                "description": description[:MAX_DESCRIPTION_LENGTH],
                "publishedAt": item.findtext("pubDate", default="").strip(),
                "url": item.findtext("link", default="").strip(),
            }
        )

    return {
        "channel": {
            "title": channel.findtext("title", default="").strip(),
            "url": channel.findtext("link", default="").strip(),
        },
        "articles": articles,
    }


def fetch_note_feed(
    rss_url: str = DEFAULT_NOTE_RSS_URL,
    requester: TextRequester = request_text,
) -> dict[str, object]:
    xml_text = requester(
        rss_url,
        headers={
            "Accept": "application/rss+xml, application/xml",
            "User-Agent": "kusahata-note-feed-sync",
        },
    )
    return parse_note_feed(xml_text)


def write_note_feed(path: Path, feed: dict[str, object]) -> bool:
    serialized = json.dumps(feed, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == serialized:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialized, encoding="utf-8")
    return True


def collect_note_source(path: Path) -> dict[str, str]:
    feed = json.loads(path.read_text(encoding="utf-8"))
    channel_url = feed.get("channel", {}).get("url", "note.com/chenchuchu")
    source_name = channel_url.removeprefix("https://").removeprefix("http://").rstrip("/")
    return {
        "source": source_name,
        "text": json.dumps(feed, ensure_ascii=False, indent=2),
    }
