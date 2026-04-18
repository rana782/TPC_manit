from __future__ import annotations

import asyncio
import json
import logging
import time

import httpx

from app.config import Settings
from app.nanonets.client import request_with_retries

logger = logging.getLogger(__name__)

OUTPUT_FORMAT_JSON = "json"


def _build_form_data(*, json_options: str | None) -> dict[str, str]:
    data: dict[str, str] = {"output_format": OUTPUT_FORMAT_JSON}
    if json_options is not None and json_options.strip() != "":
        data["json_options"] = json_options
    return data


async def run_nanonets_extraction(
    settings: Settings,
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    json_options: str | None,
    use_async: bool,
) -> httpx.Response:
    """
    Calls Nanonets sync or async+poll. Returns the final provider HTTP response
    (status + body are passed through to callers).
    """
    base = settings.nanonets_base_url
    data = _build_form_data(json_options=json_options)
    file_field = (filename, file_bytes, content_type)

    if not use_async:
        url = f"{base}/api/v1/extract/sync"
        return await request_with_retries(
            settings,
            "POST",
            url,
            data=data,
            file_field=file_field,
        )

    url = f"{base}/api/v1/extract/async"
    queued = await request_with_retries(
        settings,
        "POST",
        url,
        data=data,
        file_field=file_field,
    )

    if queued.status_code not in (200, 202):
        return queued

    try:
        payload = queued.json()
    except json.JSONDecodeError:
        return queued

    record_id = payload.get("record_id")
    if not record_id:
        logger.error("Nanonets async response missing record_id; returning queue response as-is.")
        return queued

    return await _poll_until_terminal(settings, record_id=str(record_id))


async def _poll_until_terminal(settings: Settings, *, record_id: str) -> httpx.Response:
    base = settings.nanonets_base_url
    results_url = f"{base}/api/v1/extract/results/{record_id}"
    deadline = time.monotonic() + settings.poll_timeout_seconds
    last: httpx.Response | None = None

    while time.monotonic() < deadline:
        last = await request_with_retries(settings, "GET", results_url)
        if last.status_code != 200:
            return last
        try:
            body = last.json()
        except json.JSONDecodeError:
            return last

        status = str(body.get("status", "")).lower()
        if status in {"completed", "failed"}:
            return last

        await asyncio.sleep(settings.poll_interval_seconds)

    logger.error("Timed out polling Nanonets record_id=%s", record_id)
    raise httpx.TimeoutException(
        f"Timed out after {settings.poll_timeout_seconds}s polling Nanonets record_id={record_id}"
    )
