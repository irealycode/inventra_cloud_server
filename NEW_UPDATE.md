# NEW_UPDATE.md — branch changes & cloud-server catch-up plan

> **Audience:** whoever next works on `inventra-cloud-server`.
> **Date:** 2026-06-26.
> **Scope:** what changed in the `Inventra/` branch app (the edge server) during
> the recent feature push, and **what — if anything — this cloud server must do
> to stay correct**. Read alongside [`CONTEXT.md`](./CONTEXT.md).
>
> TL;DR: **the cloud Postgres schema is already decimal-ready and needs almost no
> change.** The one thing that is actually *broken* is on the **branch side**
> (`Inventra/src-tauri/src/cloud_sync.rs`), which still reads three columns as
> integers that are now decimals — that stalls the entire push the moment a
> fractional quantity exists. Fix that first. Everything else here is optional
> correctness/parity polish.

---

## 0. How I scoped this

All recent branch work landed in commits `e818857` and `c83f886` ("a lot of
shit" x2). I diffed the branch schema (`db.rs`), models, commands, and the sync
engine (`cloud_sync.rs`) against the cloud's `models.py`, `routers/sync.py`, and
`routers/reports.py`. The sync contract is: **branch `cloud_sync.rs` serializes
rows → `POST /api/v1/sync` → generic upsert into promoted columns + `raw` JSONB**
(only the tables in `SYNC_MODELS`).

The synced tables are unchanged in *set*: `sales`, `sale_items`,
`sale_payments`, `products`, `stock_movements`, `expenses`, `employees`(users),
`clients`(customers), `shifts`. What changed is **columns and value types within
some of them**, plus a pile of **new features that are intentionally not synced**.

---

## 1. What changed on the branch (only the parts that touch sync)

### 1a. Decimal / weight quantities (the important one)

Products can now be **sold by weight / fractional units** (`kg`, `g`, `L`, …).
Implemented additively via SQLite NUMERIC affinity — the columns are still
*declared* `INTEGER`, but they now **store REAL values losslessly**:

| Table | Column | Was | Now stores |
| --- | --- | --- | --- |
| `sale_items` | `quantity` | integer | **may be fractional** (e.g. `1.5`) |
| `stock_movements` | `delta` | integer | **may be fractional** |
| `products` | `stock` | integer | **may be fractional** |

There was **no `ALTER`** — SQLite just started storing reals, so no branch
migration was needed. The consequence for sync is purely about how these values
are *read out and JSON-encoded*.

### 1b. New columns on synced tables

Added via `add_column_if_missing` in `db.rs::migrate` (all additive):

- **`products`**: `unit TEXT DEFAULT 'unit'`, `sold_by_weight INTEGER DEFAULT 0`, `tax_category_id INTEGER`.
- **`sales`**: `cancelled_at TEXT`, `cancelled_by INTEGER`, `cancel_reason TEXT`, `customer_id INTEGER`, `shift_id INTEGER`, `refunded_amount REAL DEFAULT 0`.
- **`sale_items`**: `tax_rate REAL`, `tax_amount REAL`, `discount REAL`.
- **`customers`** (→ cloud `clients`): `is_business`, `company_name`, `ice`, `rc`, `tax_id` (B2B/Facture fields).

### 1c. Per-item price override (no schema impact)

Checkout can now over/under-charge a line by editing its price for that one sale.
This only changes the **value** written to the already-synced
`sale_items.unit_price` / `line_total`. **Nothing to do on the cloud** — it
already promotes `unit_price` and keeps `line_total` in `raw`.

### 1d. Brand-new features that are NOT synced (and should stay that way)

These new branch tables/pages are **edge-only**, consistent with the existing
"refunds, suppliers, POs, tax categories are not synced" stance:

`product_barcodes` (multi-barcode/pack units), `documents` + `document_items`
(quotes/invoices/BL), `promotions`, `supplier_returns` + `supplier_return_items`,
`inventory_sessions` + `inventory_counts`, `price_history`, `customer_ledger`,
`tax_categories`.

➡ **Decision: leave all of these unsynced.** No cloud model, no ingest, no
report. (See §4 for the rationale and the one judgement call — barcodes.)

---

## 2. The cloud is already mostly fine — here's why

- `models.py` already types `SaleItem.quantity`, `StockMovement.delta`,
  `Product.stock`, `Client.loyalty_points` as **`Numeric`** → Postgres stores
  `1.5` perfectly.
- `routers/sync.py` is **generic**: it copies `PROMOTED[table]` keys into typed
  columns and dumps the whole row into `raw` JSONB. Unknown keys never break it;
  they just land in `raw`.
- `routers/reports.py` coerces money/quantity outputs through `_f()`
  (float) and only uses `int()` for **row counts** — so decimals render
  correctly and nothing truncates.

So **no cloud change is required just to accept decimals.** The break is upstream.

---

## 3. Action items, in priority order

### 🔴 P0 — Fix the branch serializer (this is what's actually broken)

**File:** `Inventra/src-tauri/src/cloud_sync.rs` (branch repo, *not* this repo).

Three reads use `i64` on columns that now hold REAL values. `rusqlite`'s
`r.get::<_, i64>()` **returns `InvalidColumnType` at runtime** when the stored
value is a float. Because `add_id_batch` propagates that error, **the whole sync
pass aborts and the cursor never advances** — every subsequent push re-hits the
same row and stalls. A single weighed sale poisons the pipe.

| Line (approx) | Table | Current | Change to |
| --- | --- | --- | --- |
| ~359 | `sale_items` | `"quantity": r.get::<_, i64>(5)?` | `f64` |
| ~383 | `stock_movements` | `"delta": r.get::<_, i64>(3)?` | `f64` |
| ~422 | `products` | `"stock": r.get::<_, i64>(6)?` | `f64` |

These produce JSON numbers either way; the cloud's `Numeric` columns accept both.
**This is the only mandatory fix to get sync working again.**

> Note: this lives in the branch repo. It's listed here because **the cloud gets
> no fresh data until it's done** — it's the actual "back on track" blocker.

### 🟠 P1 — Populate cloud columns that already exist but are never sent

The cloud `Sale` model **already has** `status` and `client_local_id` columns and
they're in `PROMOTED["sales"]` — but `cloud_sync.rs` never sends them, so they're
permanently `NULL`. Two real correctness wins, **branch-side serializer changes
only (no cloud change needed)**:

1. **Sale cancellations** — branch now has `sales.cancelled_at`. Send it so the
   cloud can mark `status` (e.g. `'cancelled'` when `cancelled_at IS NOT NULL`,
   else `'completed'`). **Until this is done, consolidated revenue counts
   cancelled sales** — the owner console over-reports. Extend the `sales` SELECT
   in `collect()` to include `cancelled_at` and emit `"status"`.
2. **Client linkage** — branch now has `sales.customer_id`. Send it as
   `"client_local_id"` so per-client sales analytics can be derived from `sales`
   (today the cloud only has the `clients` snapshot, not which sale belongs to
   whom).

Optionally also send `sales.refunded_amount` (would need a new promoted column;
refunds are otherwise still unsynced — see §4).

> Caveat: `sales` is synced on an **append-only `id` watermark**. A sale
> cancelled *after* it was already pushed won't be re-sent. Properly syncing
> late cancellations needs an `updated_at`-style watermark for `sales` (or a
> small "recently cancelled ids" delta). Document as a known v1 gap if you only
> do the forward-path version now.

### 🟡 P2 — Promote the weight/unit display fields (optional, nice for the console)

So the owner console can render "2.5 **kg**" instead of a bare "2.5":

1. **Branch** (`cloud_sync.rs`, products SELECT): also emit `"unit"` and
   `"sold_by_weight"`.
2. **Cloud** (`models.py`): add to `Product`:
   ```python
   unit = Column(String(16), nullable=True)
   sold_by_weight = Column(Integer, nullable=True)
   ```
   and append `"unit", "sold_by_weight"` to `PROMOTED["products"]`.
3. **Cloud** (`reports.py`): include `unit` in the products payload; optionally
   format quantities with it.

Until then, if the branch sends them they're still captured in `Product.raw` —
so this is purely about promotion for querying/display, not data loss.

### 🟢 P3 — B2B client fields (optional)

`customers` gained `is_business`, `company_name`, `ice`, `rc`, `tax_id` (Moroccan
Facture fields). If the console should show business-client info, send them from
the `clients` snapshot and promote on `Client`. Low value for consolidated
reporting; skip unless asked.

---

## 4. Decisions to record (so the next session doesn't re-litigate)

- **`product_barcodes` stays unsynced.** It's edge catalog plumbing (alias/pack
  barcodes for scanning). The consolidated console reports on products, not on
  how a branch scans them. If cross-store catalog ever matters, it belongs in the
  Phase-2 master-data-down work, not v1 up-sync.
- **`documents`, `promotions`, `supplier_returns`, `inventory_sessions`/counts,
  `price_history`, `customer_ledger`, `tax_categories` stay unsynced** — same
  rationale as the existing refunds/suppliers/PO exclusions. The guiding rule
  (per the program constraint): *what's not synced should stay not synced.*
- **Per-item price override needs zero cloud work** — it's just values in the
  already-synced `unit_price`/`line_total`.
- **Decimals need zero cloud schema work** — `Numeric` + `_f()` already cover it.

---

## 5. Optional: perf parity note (not a regression, just FYI)

The branch app was just load-tested at scale (22k products, 151k sales, 530k
sale_items) and several branch analytics queries were rewritten because
`date(col) BETWEEN …` wraps the column in a function and **defeats the
`created_at` index**, forcing full scans; and because correlated per-row
subqueries are catastrophic at scale.

`inventra-cloud-server/app/routers/reports.py` stores `created_at` as
`String(40)` and filters/aggregates over it. If/when a single owner accumulates
comparable volume across stores, audit reports.py for the **same two patterns**
(function-wrapped date filters; per-row subqueries) and prefer half-open range
predicates (`created_at >= :from AND created_at < :to`) plus the existing
`created_at` indexes. **No action needed now** — flagged so it's on the radar.

---

## 6. Checklist

- [x] **P0** `cloud_sync.rs`: `quantity`/`delta`/`stock` reads `i64` → `f64` (branch repo). *Unblocks all sync.*
- [x] **P1** `cloud_sync.rs`: send `status` (from `cancelled_at`) + `client_local_id` (from `customer_id`) on `sales`. *Fixes revenue over-count + enables per-client sales.*
- [x] **P1** (decide) sales watermark strategy for late cancellations → **documented as a v1 gap** (forward-path only; late cancellations need an `updated_at` watermark in Phase 2). See `cloud_sync.rs` sales comment + CONTEXT §7.
- [x] **P2** Promote `products.unit` / `sold_by_weight` (branch send + cloud model/PROMOTED + report + additive boot migration in `main.py`).
- [ ] **P3** (optional) B2B client fields. *Skipped per §3 — low value for consolidated reporting; do when asked.*
- [x] **Docs** Fold the §4 decisions into `CONTEXT.md` §7/§12 so they're permanent.
