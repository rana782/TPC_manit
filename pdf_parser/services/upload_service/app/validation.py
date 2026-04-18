import logging
from pathlib import Path

from app.config import Settings

logger = logging.getLogger(__name__)

_PDF_MAGIC = b"%PDF-"
_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_GIF_MAGIC = (b"GIF87a", b"GIF89a")
_WEBP_MAGIC = b"RIFF"
_TIFF_LE = b"II*\x00"
_TIFF_BE = b"MM\x00*"


def sniff_kind(path: Path) -> str | None:
    """Return a coarse kind label or None if unknown."""
    try:
        head = path.read_bytes()[:32]
    except OSError:
        return None
    if head.startswith(_PDF_MAGIC):
        return "pdf"
    if head.startswith(_JPEG_MAGIC):
        return "jpeg"
    if head.startswith(_PNG_MAGIC):
        return "png"
    if any(head.startswith(m) for m in _GIF_MAGIC):
        return "gif"
    if head.startswith(_TIFF_LE) or head.startswith(_TIFF_BE):
        return "tiff"
    if len(head) >= 12 and head.startswith(_WEBP_MAGIC) and head[8:12] == b"WEBP":
        return "webp"
    return None


def assert_extension_allowed(filename: str, settings: Settings) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in settings.allowed_extensions:
        raise ValueError(f"Unsupported file extension: {suffix or '(none)'}")
    return suffix


def assert_magic_matches_extension(path: Path, suffix: str) -> None:
    kind = sniff_kind(path)
    if kind is None:
        raise ValueError("File content does not match a known PDF or image signature.")
    ext_map = {
        ".pdf": ("pdf",),
        ".jpg": ("jpeg",),
        ".jpeg": ("jpeg",),
        ".png": ("png",),
        ".gif": ("gif",),
        ".webp": ("webp",),
        ".tif": ("tiff",),
        ".tiff": ("tiff",),
    }
    expected = ext_map.get(suffix)
    if not expected or kind not in expected:
        raise ValueError(f"Content type mismatch: extension {suffix} vs detected {kind}")
