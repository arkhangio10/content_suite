from __future__ import annotations

import asyncio
import json
from functools import lru_cache
from typing import Any

import structlog

from app.config import get_settings
from app.modules.brand_dna.chunking import ChunkRecord, chunk_brand_manual
from app.modules.brand_dna.schemas import BrandManual

log = structlog.get_logger(__name__)

_VOYAGE_BATCH_SIZE = 64


@lru_cache(maxsize=1)
def _get_voyage_client() -> Any:
    import voyageai
    settings = get_settings()
    return voyageai.Client(api_key=settings.voyage_api_key)


def _embed_batch_sync(texts: list[str], model: str) -> list[list[float]]:
    client = _get_voyage_client()
    result = client.embed(texts, model=model, input_type="document")
    return result.embeddings


async def embed_texts(texts: list[str]) -> list[list[float]]:
    settings = get_settings()
    model = settings.voyage_model
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), _VOYAGE_BATCH_SIZE):
        batch = texts[i : i + _VOYAGE_BATCH_SIZE]
        embeddings = await asyncio.to_thread(_embed_batch_sync, batch, model)
        all_embeddings.extend(embeddings)
        log.info(
            "embedding_batch_complete",
            batch_start=i,
            batch_size=len(batch),
            total=len(texts),
        )

    return all_embeddings


def _vec_to_str(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in vec) + "]"


async def embed_and_store(
    manual: BrandManual,
    db_pool: Any | None = None,
) -> list[ChunkRecord]:
    chunks = chunk_brand_manual(manual)
    texts = [c.content for c in chunks]

    log.info("embedding_start", brand_id=manual.meta.brand_id, chunks=len(chunks))
    embeddings = await embed_texts(texts)

    if db_pool is not None:
        await _upsert_chunks(chunks, embeddings, db_pool)
    else:
        log.warning("embedding_no_db_pool", reason="chunks not persisted to database")

    return chunks


async def _upsert_chunks(
    chunks: list[ChunkRecord],
    embeddings: list[list[float]],
    db_pool: Any,
) -> None:
    async with db_pool.acquire() as conn:
        await conn.executemany(
            """
            insert into public.brand_chunks
              (brand_id, manual_version, section_name, chunk_id, content, embedding, metadata)
            values ($1, $2, $3, $4, $5, $6::vector, $7)
            on conflict (brand_id, manual_version, chunk_id)
            do update set
              content   = excluded.content,
              embedding = excluded.embedding,
              metadata  = excluded.metadata,
              embedded_at = now()
            """,
            [
                (
                    c.brand_id,
                    c.manual_version,
                    c.section_name,
                    c.chunk_id,
                    c.content,
                    _vec_to_str(emb),
                    json.dumps(c.metadata),
                )
                for c, emb in zip(chunks, embeddings)
            ],
        )
    log.info("chunks_upserted", count=len(chunks))
