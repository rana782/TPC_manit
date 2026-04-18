"""Canonical job lifecycle states for the document pipeline."""

from __future__ import annotations

QUEUED = "queued"
PROCESSING = "processing"
COMPLETED = "completed"
FAILED = "failed"

TERMINAL = frozenset({COMPLETED, FAILED})

ACTIVE_POLL_STATES = frozenset({QUEUED, PROCESSING})
