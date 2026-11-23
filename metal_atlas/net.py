"""HTTP access: Metal Archives pages (polite, with retries) and the iTunes Search API (paced to its rate limit).

Requests go through ``curl``: Metal Archives sits behind Cloudflare, which accepts curl's TLS fingerprint.
"""

import json
import subprocess
import threading
import time
from typing import Any

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
COURTESY_DELAY = 0.8  # seconds to wait after every successful Metal Archives request


class FetchError(RuntimeError):
    """A URL kept failing after every retry."""


def _curl(url: str, *, ajax: bool = False, user_agent: str | None = USER_AGENT) -> tuple[int, str]:
    """One GET request: (HTTP status, body). Status 0 means no response at all."""
    cmd = ["curl", "-s", "--max-time", "120", "-w", "\n%{http_code}"]
    if user_agent:
        cmd += ["-A", user_agent]
    if ajax:
        cmd += ["-H", "X-Requested-With: XMLHttpRequest"]
    result = subprocess.run([*cmd, url], capture_output=True)
    body, _, code = result.stdout.rpartition(b"\n")
    return int(code or 0), body.decode("utf-8", "replace")


def fetch(url: str, *, ajax: bool = False, retries: int = 8, delay: float = COURTESY_DELAY) -> str | None:
    """GET a Metal Archives URL. Returns the body, or None for a 404.

    Retries with growing waits (10 s, 20 s, 40 s… up to 5 min) and raises FetchError when it gives up.
    ajax: send the header Metal Archives' JSON endpoints expect.
    """
    status = 0
    for attempt in range(retries):
        status, body = _curl(url, ajax=ajax)
        if status == 200:
            time.sleep(delay)
            return body
        if status == 404:
            return None
        wait = min(300, 10 * 2**attempt)
        print(f"  HTTP {status} {url[:90]}, retry in {wait}s", flush=True)
        time.sleep(wait)
    raise FetchError(f"HTTP {status} after {retries} attempts: {url}")


def fetch_json(url: str, **kwargs: Any) -> Any:
    """GET a Metal Archives JSON endpoint (its responses contain raw control characters, hence strict=False)."""
    body = fetch(url, ajax=True, **kwargs)
    return None if body is None else json.loads(body, strict=False)


class ITunes:
    """iTunes Search API client, one call at a time and at most one every ``gap`` seconds.

    iTunes allows roughly 20 calls per minute per IP and answers 403 for a long while once exceeded, so on a 403 it
    pauses 15 minutes (then 30) instead of insisting, which seems to extend the block.
    """

    BASE = "https://itunes.apple.com/"

    def __init__(self, gap: float = 6.0, attempts: int = 10):
        self.gap = gap
        self.attempts = attempts
        self._lock = threading.Lock()
        self._last = 0.0

    def get(self, query: str) -> list[dict]:
        """The ``results`` of ``<BASE><query>``, e.g. ``search?entity=musicArtist&term=…``."""
        with self._lock:
            for attempt in range(self.attempts):
                wait = self._last + self.gap - time.time()
                if wait > 0:
                    time.sleep(wait)
                status, body = _curl(self.BASE + query, user_agent=None)
                self._last = time.time()
                if status == 200:
                    return json.loads(body)["results"]
                pause = min(900 * (attempt + 1), 1800)
                print(f"{time.strftime('%H:%M')} itunes {status}, pausing {pause // 60} min", flush=True)
                time.sleep(pause)
        raise FetchError("iTunes unavailable")
