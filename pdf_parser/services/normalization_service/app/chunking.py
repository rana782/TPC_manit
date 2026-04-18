from __future__ import annotations

import re
from dataclasses import dataclass

import tiktoken

from app.config import Settings
from app.schema.llm_document import LLMTextChunk


@dataclass(frozen=True)
class _Encoder:
    enc: tiktoken.Encoding

    def count(self, text: str) -> int:
        return len(self.enc.encode(text or ""))

    def split_oversized(self, text: str, max_tokens: int) -> list[str]:
        if max_tokens <= 0:
            return [text]
        ids = self.enc.encode(text)
        parts: list[str] = []
        for i in range(0, len(ids), max_tokens):
            parts.append(self.enc.decode(ids[i : i + max_tokens]))
        return parts


_PARA_SPLIT = re.compile(r"\n\s*\n+")


def chunk_text_for_llm(text: str, *, settings: Settings) -> list[LLMTextChunk]:
    min_t = min(settings.chunk_min_tokens, settings.chunk_max_tokens)
    max_t = settings.chunk_max_tokens
    enc = _Encoder(tiktoken.get_encoding(settings.tiktoken_encoding))

    paragraphs = [p.strip() for p in _PARA_SPLIT.split(text or "") if p.strip()]
    if not paragraphs and (text or "").strip():
        paragraphs = [(text or "").strip()]

    normalized_paras: list[str] = []
    for p in paragraphs:
        if enc.count(p) <= max_t:
            normalized_paras.append(p)
            continue
        normalized_paras.extend(enc.split_oversized(p, max_t))

    chunks_text: list[str] = []
    buf: list[str] = []
    buf_tokens = 0

    def flush() -> None:
        nonlocal buf, buf_tokens
        if buf:
            chunks_text.append("\n\n".join(buf).strip())
            buf = []
            buf_tokens = 0

    for p in normalized_paras:
        pt = enc.count(p)
        if pt >= min_t:
            flush()
            chunks_text.append(p)
            continue

        if buf_tokens + pt > max_t and buf_tokens >= min_t:
            flush()

        if pt > max_t:
            flush()
            for piece in enc.split_oversized(p, max_t):
                chunks_text.append(piece)
            continue

        if buf_tokens + pt > max_t and buf_tokens > 0:
            flush()

        buf.append(p)
        buf_tokens += pt
        if buf_tokens >= max_t:
            flush()

    flush()

    if not chunks_text and (text or "").strip():
        chunks_text = enc.split_oversized((text or "").strip(), max_t) or [(text or "").strip()]

    out: list[LLMTextChunk] = []
    for i, chunk in enumerate(chunks_text):
        tc = enc.count(chunk)
        out.append(LLMTextChunk(index=i, text=chunk, token_count=tc, char_count=len(chunk)))
    return out
