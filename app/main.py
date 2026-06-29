from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.db import Base, engine
from app.routers import admin, auth, health, reports, stores, sync

app = FastAPI(title="Inventra Cloud Server", version="0.1.0")

# Additive column migrations for already-created tables. `create_all` only
# creates missing *tables*, never new columns on existing ones, so promoted
# columns added after a deployment need an explicit (idempotent) ALTER. Postgres
# `ADD COLUMN IF NOT EXISTS` makes each safe to run on every boot. Swap the whole
# lot for Alembic once the schema stabilizes (CONTEXT §12).
_COLUMN_MIGRATIONS = (
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(16)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_by_weight INTEGER",
)


@app.on_event("startup")
def _init_db() -> None:
    # v1: create tables on boot. Swap for Alembic migrations once the schema
    # stabilizes (CONTEXT §12).
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for stmt in _COLUMN_MIGRATIONS:
            conn.execute(text(stmt))


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(stores.router)
app.include_router(sync.router)
app.include_router(reports.router)


# Serve the built owner web console (web/dist) if present. The API routers above
# are registered first, so /api/*, /admin/*, /health, /docs always win; this
# catch-all handles the SPA's own routes (deep links like /stores) by returning
# index.html. No-op in API-only deployments where the SPA wasn't built.
_WEB_DIR = Path(__file__).resolve().parent.parent / "web" / "dist"
if _WEB_DIR.is_dir():

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = _WEB_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_WEB_DIR / "index.html")
