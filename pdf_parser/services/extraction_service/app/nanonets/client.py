from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


def _auth_headers(settings: Settings) -> dict[str, str]:
    key = settings.nanonets_api_key
    if key is None:
        raise RuntimeError("NANONETS_API_KEY is not configured.")
    token = key.get_secret_value().strip()
    if not token:
        raise RuntimeError("NANONETS_API_KEY is empty.")
    return {"Authorization": f"Bearer {token}"}


def _retryable_status(code: int) -> bool:
    return code == 429 or code == 408 or (500 <= code <= 599)


async def _sleep_backoff(
    *,
    attempt: int,
    response: httpx.Response | None,
    settings: Settings,
) -> None:
    if response is not None and response.status_code == 429:
        ra = response.headers.get("Retry-After")
        if ra:
            try:
                wait = min(float(ra), float(settings.max_retry_after_seconds))
                logger.warning("Rate limited by Nanonets; honoring Retry-After=%s", wait)
                await asyncio.sleep(wait)
                return
            except ValueError:
                pass
    delay = settings.base_backoff_seconds * (2 ** (attempt - 1))
    await asyncio.sleep(delay)


async def request_with_retries(
    settings: Settings,
    method: str,
    url: str,
    *,
    data: dict[str, str] | None = None,
    file_field: tuple[str, bytes, str] | None = None,
) -> httpx.Response:
    """
    Performs an HTTP call to Nanonets with retries on transport errors and retryable status codes.
    For multipart POSTs, ``file_field`` is (filename, body_bytes, content_type); a fresh BytesIO
    is used on each attempt so retries re-send the full payload.
    """
    last: httpx.Response | None = None
    timeout = httpx.Timeout(settings.nanonets_http_timeout_seconds)
    headers = _auth_headers(settings)

    for attempt in range(1, settings.max_http_retries + 1):
        files: dict[str, Any] | None = None
        if file_field is not None:
            name, body, ctype = file_field
            files = {"file": (name, BytesIO(body), ctype or "application/octet-stream")}

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, url, headers=headers, files=files, data=data)
            last = resp
            if not _retryable_status(resp.status_code):
                return resp
            logger.warning(
                "Nanonets HTTP %s on %s %s (attempt %s/%s)",
                resp.status_code,
                method,
                url,
                attempt,
                settings.max_http_retries,
            )
        except httpx.HTTPError as exc:
            logger.warning(
                "Nanonets transport error on %s %s (attempt %s/%s): %s",
                method,
                url,
                attempt,
                settings.max_http_retries,
                exc,
            )
            last = None

        if attempt < settings.max_http_retries:
            await _sleep_backoff(attempt=attempt, response=last, settings=settings)

    if last is not None:
        return last
    raise RuntimeError("Nanonets request failed after retries.")
