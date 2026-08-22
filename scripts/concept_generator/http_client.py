"""Small HTTP client built on the Python standard library."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


def request_json(
    url: str,
    *,
    headers: dict[str, str],
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: int = 60,
) -> Any:
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    response_text = request_text(
        url,
        headers=headers,
        method=method,
        data=data,
        timeout=timeout,
    )
    return json.loads(response_text)


def request_text(
    url: str,
    *,
    headers: dict[str, str],
    method: str = "GET",
    data: bytes | None = None,
    timeout: int = 60,
) -> str:
    request = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Request failed ({error.code}) for {url}: {message}") from error
