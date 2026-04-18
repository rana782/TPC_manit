from __future__ import annotations

import json


def resolve_json_options(*, json_options: str | None, json_schema: str | None) -> str | None:
    """
    Nanonets accepts ``json_options`` as a string (field list JSON, flags, or JSON Schema string).
    ``json_schema`` is a convenience alias: if provided and ``json_options`` is empty, the schema
    is minified and sent as ``json_options``.
    """
    if json_options is not None and json_options.strip() != "":
        return json_options.strip()
    if json_schema is None or json_schema.strip() == "":
        return None
    parsed = json.loads(json_schema.strip())
    return json.dumps(parsed, separators=(",", ":"))
