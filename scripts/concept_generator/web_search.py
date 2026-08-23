"""Discover and normalize public pages about Sumiaki Kusahata."""

from __future__ import annotations

import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable

from .http_client import request_json


JsonRequester = Callable[..., Any]
PageFetcher = Callable[[str], tuple[str, str]]
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
DEFAULT_QUERY = "sumiaki kusahata"
MAX_RESULTS = 10
MAX_PAGES = 30
MAX_HTML_BYTES = 2_000_000
MAX_TEXT_LENGTH = 6000
IDENTITY_MARKERS = (
    "sumiaki kusahata",
    "kusahata sumiaki",
    "草将 澄秋",
    "草将澄秋",
)
EXCLUDED_HOSTS = {
    "kusahata.com",
    "github.com",
    "note.com",
    "youtube.com",
    "www.youtube.com",
    "google.com",
    "www.google.com",
}


def _canonicalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query = [(key, value) for key, value in query if not key.lower().startswith("utm_")]
    return urllib.parse.urlunsplit(
        (parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or "/", urllib.parse.urlencode(query), "")
    )


class _VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hidden_depth = 0
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "svg", "noscript", "template"}:
            self.hidden_depth += 1
        elif tag == "title" and self.hidden_depth == 0:
            self.in_title = True
        elif tag in {"p", "br", "li", "h1", "h2", "h3", "h4", "td", "th"}:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "svg", "noscript", "template"}:
            self.hidden_depth = max(0, self.hidden_depth - 1)
        elif tag == "title":
            self.in_title = False
        elif tag in {"p", "li", "h1", "h2", "h3", "h4", "tr"}:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self.hidden_depth:
            return
        self.parts.append(data)
        if self.in_title:
            self.title_parts.append(data)


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def extract_visible_text(html: str) -> tuple[str, str]:
    parser = _VisibleTextParser()
    parser.feed(html)
    parser.close()
    return _normalize_text("".join(parser.title_parts)), _normalize_text("".join(parser.parts))


def _identity_position(text: str) -> int | None:
    folded = text.casefold()
    positions = [folded.find(marker.casefold()) for marker in IDENTITY_MARKERS]
    positions = [position for position in positions if position >= 0]
    return min(positions) if positions else None


def _relevant_excerpt(text: str) -> str | None:
    position = _identity_position(text)
    if position is None:
        return None
    start = max(0, position - 1000)
    return text[start : start + MAX_TEXT_LENGTH].strip()


def _validate_public_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        raise ValueError(f"Unsafe public page URL: {url}")
    default_port = 443 if parsed.scheme == "https" else 80
    for result in socket.getaddrinfo(
        parsed.hostname,
        parsed.port or default_port,
        type=socket.SOCK_STREAM,
    ):
        address = ipaddress.ip_address(result[4][0])
        if not address.is_global:
            raise ValueError(f"Public page URL resolves to a non-public address: {url}")


class _PublicRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_public_html(url: str) -> tuple[str, str]:
    _validate_public_url(url)
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html, application/xhtml+xml",
            "Accept-Encoding": "identity",
            "User-Agent": "kusahata-public-profile-indexer/1.0",
        },
    )
    opener = urllib.request.build_opener(_PublicRedirectHandler())
    try:
        with opener.open(request, timeout=20) as response:
            final_url = response.geturl()
            _validate_public_url(final_url)
            content_type = response.headers.get_content_type()
            if content_type not in {"text/html", "application/xhtml+xml"}:
                raise RuntimeError(f"Unsupported content type {content_type} for {final_url}")
            raw = response.read(MAX_HTML_BYTES + 1)
            if len(raw) > MAX_HTML_BYTES:
                raise RuntimeError(f"Page is larger than {MAX_HTML_BYTES} bytes: {final_url}")
            charset = response.headers.get_content_charset() or "utf-8"
            return final_url, raw.decode(charset, errors="replace")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Page request failed ({error.code}) for {url}") from error


def discover_brave_urls(
    api_key: str,
    query: str = DEFAULT_QUERY,
    requester: JsonRequester = request_json,
) -> list[str]:
    parameters = urllib.parse.urlencode({"q": query, "count": MAX_RESULTS, "country": "JP"})
    try:
        response = requester(
            f"{BRAVE_SEARCH_URL}?{parameters}",
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": api_key,
            },
        )
    except RuntimeError as error:
        raise RuntimeError(str(error).replace(api_key, "[REDACTED]")) from error

    urls = []
    for result in response.get("web", {}).get("results", []):
        url = _canonicalize_url(result.get("url", ""))
        parsed = urllib.parse.urlsplit(url)
        host = (parsed.hostname or "").lower()
        excluded = any(host == domain or host.endswith(f".{domain}") for domain in EXCLUDED_HOSTS)
        if parsed.scheme in {"http", "https"} and not excluded and url not in urls:
            urls.append(url)
    return urls


def build_web_search_feed(
    api_key: str,
    previous_feed: dict[str, Any] | None = None,
    *,
    query: str = DEFAULT_QUERY,
    search_requester: JsonRequester = request_json,
    page_fetcher: PageFetcher = fetch_public_html,
) -> dict[str, Any]:
    previous_pages = {
        page["url"]: page
        for page in (previous_feed or {}).get("pages", [])
        if isinstance(page, dict) and page.get("url")
    }
    discovered_urls = discover_brave_urls(api_key, query, search_requester)
    candidate_urls = list(dict.fromkeys([*discovered_urls, *previous_pages]))[:MAX_PAGES]
    pages = []

    for requested_url in candidate_urls:
        try:
            final_url, html = page_fetcher(requested_url)
            title, visible_text = extract_visible_text(html)
            excerpt = _relevant_excerpt(visible_text)
            if excerpt is None:
                continue
            pages.append({"url": final_url, "title": title, "text": excerpt})
        except (OSError, RuntimeError, UnicodeError, ValueError):
            if requested_url in previous_pages:
                pages.append(previous_pages[requested_url])

    pages_by_url = {page["url"]: page for page in pages}
    return {"query": query, "pages": [pages_by_url[url] for url in sorted(pages_by_url)]}


def write_web_search_feed(path: Path, feed: dict[str, Any]) -> bool:
    serialized = json.dumps(feed, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == serialized:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialized, encoding="utf-8")
    return True


def collect_web_search_sources(path: Path) -> list[dict[str, str]]:
    feed = json.loads(path.read_text(encoding="utf-8"))
    return [
        {"source": page["url"], "text": f"{page['title']}\n{page['text']}"}
        for page in feed.get("pages", [])
    ]
