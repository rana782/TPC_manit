from __future__ import annotations

import re


_CONTROL_EXCEPT_TAB_NEWLINE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def strip_control_noise(text: str) -> str:
    """Removes NULL/C0 control characters except tab/newline (common PDF extraction noise)."""
    if not text:
        return ""
    return _CONTROL_EXCEPT_TAB_NEWLINE.sub("", text)


def strip_zero_width_and_bom(text: str) -> str:
    if not text:
        return ""
    return (
        text.replace("\ufeff", "")
        .replace("\u200b", "")
        .replace("\u200c", "")
        .replace("\u200d", "")
        .replace("\u2060", "")
    )
