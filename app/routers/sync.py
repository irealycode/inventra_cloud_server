"""Branch ingest. Store-and-forward: branches POST batches of rows here; we
upsert them into the consolidated read model keyed by (store_id, local_id).

Every upsert is idempotent (Postgres ON CONFLICT DO UPDATE), so re-sending a
batch after a flaky connection is always safe. The authenticated store stamps
`store_id` server-side — a store can only ever write its own data."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_store
from app.models import PROMOTED, SYNC_MODELS, IngestCursor, Store
from app.schemas import SyncIn, SyncResult

router = APIRouter(prefix="/api/v1", tags=["sync"])


def _build_values(table: str, store_id, row: dict) -> dict:
    """Project a branch row into this table's column set. Missing keys -> None,
    so every row in a batch has an identical key set (required by executemany)."""
    local_id = row.get("local_id", row.get("id"))
    values = {"store_id": store_id, "local_id": local_id, "raw": row, "synced_at": datetime.utcnow()}
    for col in PROMOTED[table]:
        values[col] = row.get(col)
    return values


@router.post("/sync", response_model=SyncResult)
def sync(body: SyncIn, store: Store = Depends(get_current_store), db: Session = Depends(get_db)) -> SyncResult:
    result = SyncResult()

    for batch in body.batches:
        model = SYNC_MODELS.get(batch.table)
        if model is None:
            result.skipped.append(batch.table)
            continue

        rows = []
        max_local_id = None
        for row in batch.rows:
            local_id = row.get("local_id", row.get("id"))
            if local_id is None:
                continue  # can't key it; skip silently (branch bug guard)
            rows.append(_build_values(batch.table, store.store_id, row))
            if isinstance(local_id, int):
                max_local_id = local_id if max_local_id is None else max(max_local_id, local_id)

        if not rows:
            result.upserted[batch.table] = 0
            continue

        table = model.__table__
        stmt = pg_insert(table).values(rows)
        update_cols = {
            c.name: stmt.excluded[c.name]
            for c in table.columns
            if c.name not in ("store_id", "local_id")
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=["store_id", "local_id"], set_=update_cols
        )
        db.execute(stmt)
        result.upserted[batch.table] = len(rows)

        # Advance the per-table cursor (informational/diagnostic).
        cursor = (
            db.query(IngestCursor)
            .filter(IngestCursor.store_id == store.store_id, IngestCursor.table_name == batch.table)
            .first()
        )
        if cursor is None:
            cursor = IngestCursor(store_id=store.store_id, table_name=batch.table)
            db.add(cursor)
        if max_local_id is not None:
            cursor.last_local_id = max(cursor.last_local_id or 0, max_local_id)

    store.last_seen_at = datetime.utcnow()
    db.commit()
    return result
