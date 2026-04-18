from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LLMTextChunk(BaseModel):
    index: int = Field(ge=0)
    text: str
    token_count: int = Field(ge=0)
    char_count: int = Field(ge=0)


class LLMReadyBundle(BaseModel):
    chunks: list[LLMTextChunk] = Field(default_factory=list)
    summary_hint: str = Field(
        default="",
        description="Short neutral description derived from the document text (no classification).",
    )


class LLMNormalizedDocument(BaseModel):
    text: str = Field(description="Full cleaned document text for LLM context.")
    structured: Any = Field(description="Structured JSON extracted by Nanonets (typically result.json.content).")
    metadata: dict[str, Any] = Field(default_factory=dict)
    llm_ready: LLMReadyBundle
