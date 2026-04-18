import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO
from uuid import UUID

from app.config import Settings

logger = logging.getLogger(__name__)

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


@dataclass(frozen=True)
class StoredArtifact:
    document_id: UUID
    absolute_path: Path
    relative_path: Path
    stored_filename: str
    manifest_path: Path


class LocalObjectStorage:
    """Persists uploads under ``storage_root / {document_id} /``."""

    def __init__(self, settings: Settings) -> None:
        self._root = settings.storage_root.resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        *,
        document_id: UUID,
        job_id: UUID,
        original_filename: str,
        stream: BinaryIO,
        content_type: str,
        user_id: str | None,
        max_bytes: int,
    ) -> StoredArtifact:
        safe = _SAFE_NAME.sub("_", original_filename or "upload").strip("._") or "upload"
        if len(safe) > 180:
            safe = safe[:180]
        doc_dir = self._root / str(document_id)
        doc_dir.mkdir(parents=True, exist_ok=True)
        dest = doc_dir / safe
        written = 0
        with dest.open("wb") as out:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    try:
                        dest.unlink(missing_ok=True)
                    except OSError:
                        logger.exception("Failed to remove oversize partial file %s", dest)
                    raise ValueError(f"File exceeds maximum allowed size ({max_bytes} bytes).")
                out.write(chunk)
        logger.info(
            "Stored upload document_id=%s bytes=%s path=%s",
            document_id,
            written,
            dest,
        )
        manifest = {
            "document_id": str(document_id),
            "job_id": str(job_id),
            "stored_filename": safe,
            "content_type": content_type,
            "user_id": user_id,
        }
        manifest_path = doc_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        rel = dest.relative_to(self._root)
        return StoredArtifact(
            document_id=document_id,
            absolute_path=dest.resolve(),
            relative_path=rel,
            stored_filename=safe,
            manifest_path=manifest_path,
        )
