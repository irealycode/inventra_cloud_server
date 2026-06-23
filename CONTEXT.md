# Inventra Cloud Server — CONTEXT.md

> Living handoff doc. Read this end-to-end before touching the code. It explains
> **what this service is, why it exists, how it fits the wider Inventra system,
> the decisions already made, and what's done vs. still to do.** Keep it updated
> as the project evolves — a new session should be able to get fully oriented
> from this file alone.

---

## 0. TL;DR

`inventra-cloud-server` is the **central aggregation tier** for Inventra's
`multi_store` feature. Each retail **branch** runs its own offline-first LAN
server (the existing `Inventra/` desktop app). Branches **push** their data up
to this cloud server on a schedule ("store-and-forward"). A **store owner**
(the multi-store admin) logs into this server to see **consolidated, read-only
reporting across all their stores** — sales, products, expenses, employees,
clients, analytics.

This is the same pattern big retailers (Walmart's "Triplet Model", etc.) use:
**autonomy at the edge, consolidation in the cloud.** The hot path (ringing up
sales) never depends on this server being reachable.

- **Stack:** Python 3.12 · FastAPI · SQLAlchemy · PostgreSQL · Docker (chosen to
  match the sibling `inventra-cloud-activator` service).
- **Status:** early scaffold. See [§12 Status](#12-status--roadmap).

---

## 1. Where this sits in the wider system

The `inventra_combined/` workspace contains four projects:

| Folder | What it is | Touch? |
| --- | --- | --- |
| `Inventra/` | The desktop POS/inventory app (Tauri v2 + React + Rust + SQLite). This is the **branch / edge server**. | Yes (separate phases) |
| `inventra-mobile/` | Expo/React Native client that pairs to a branch over LAN. | **NO — do not touch** |
| `inventra-cloud-activator/` | FastAPI service that issues **Ed25519-signed license tokens**. Source of truth for entitlements. | **NO — do not touch** (read-only reference) |
| `inventra-cloud-server/` | **This project** — the multi-store aggregation tier. | Yes |

### The 2-tier topology (decided with the user)

The user explicitly wants each branch to keep its own LAN server (max speed,
min loss), with periodic sync up to this cloud:

```
Branch A (LAN server + SQLite)  ──push──┐
Branch B (LAN server + SQLite)  ──push──┼──▶  inventra-cloud-server (Postgres)  ◀── Owner "All stores" console (web, email+password)
Branch C (LAN server + SQLite)  ──push──┘            per-store + aggregate, read-only
```

This is the canonical retail pattern **minus the per-terminal database tier**:
big chains do terminal → in-store edge server → cloud (3 tiers). Inventra
collapses the terminal tier — registers/tablets are thin LAN clients of the
branch server — so we run **2 tiers**: branch edge server → cloud. Accepted
trade-off: if a branch's own server dies the whole branch is down (mitigate with
reliable branch hardware/UPS), but a cloud outage never affects a branch.

---

## 2. The `multi_store` feature (gating)

`multi_store` is a **licensed feature**, not in the standard product. Gating
reuses the existing license machinery:

- **Branch side (`Inventra/src-tauri`):** `FEATURE_MULTI_STORE = "multi_store"`,
  checked with `require_feature(&state, "multi_store")`; UI gated with
  `hasFeature("multi_store")`. (To be added in the branch repo — separate phase.)
- **License tokens** are issued by the activator with a `features: string[]`
  array. A customer who paid for multi-store has `"multi_store"` in that array.
- **This server** verifies the signed license token offline (same Ed25519 public
  key) and refuses branch registration / console access unless the token is
  valid, unexpired, and contains `multi_store`.

---

## 3. Identity model (the part the user asked about)

Three distinct principals. **Do not conflate them.**

| Principal | Who | Credential | Scope |
| --- | --- | --- | --- |
| **Operator** | You (Inventra vendor) | `ADMIN_TOKEN` (env, header `X-Admin-Token`) | Provision customers, inspect everything |
| **Owner / customer** | The multi-store business owner | **email + password → JWT** | Read consolidated data for *their* stores only |
| **Store / branch** | Each branch server | opaque `store_token` (Bearer) | Push (sync) data for *that one store* |

### Key join column: `customer_id`

`customer_id` is the string that links all three systems:
- Activator: `keys.customer_id` (set when you create a license key).
- License token payload: `"customer_id": "..."`.
- This server: `customers.customer_id` (unique) and `stores.customer_id` (FK).

> **Important:** the license token payload contains `customer_id`, `features`,
> `expires_at`, `app`, `machine_fp`, `key_id`, `issued_at` — but **NOT the
> customer's email.** Therefore the owner's email/password account cannot be
> derived purely from a license token; the operator seeds it (see §4).

### Login decision (user chose **B**: email/password web portal)

The owner logs into a browser/phone console with **email + password** so they
can check their stores from anywhere (off-device). This is why we run a real
account+password system here, rather than license-as-identity. Branches still
authenticate with `store_token`s regardless.

---

## 4. The two questions the user asked, answered concretely

### "How can I create a new customer (stores admin)?"

1. In the **activator**, issue a license key with `"multi_store"` in `features`
   and `seats` = max number of stores (you already do this via
   `inventra-cloud-activator/inventra_admin.py` / `POST /admin/keys`). Set
   `customer_id` + `customer_email` on the key.
2. In **this server**, the operator creates the owner account:
   `POST /admin/customers` (header `X-Admin-Token`) with
   `{ customer_id, email, name, seats }`. This creates a `customers` row and
   returns a **one-time set-password token** (link the owner uses to choose
   their password). `customer_id` must match the license key's `customer_id`.
   Easiest via the bundled CLI: `python inventra_admin.py create-customer
   --customer-id … --email … --seats …`, which prints the ready-to-send link.

> Future nicety: have the activator call this endpoint automatically when a
> `multi_store` key is created, so step 2 is implicit. For now it's a manual
> operator step (keeps the activator untouched, as required).

### "How would a customer login?"

1. First time: owner opens the set-password link →
   `POST /api/v1/auth/set-password { token, password }`.
2. Thereafter: `POST /api/v1/auth/login { email, password }` → returns a **JWT**
   (Bearer) used for all `/api/v1/reports/*` and `/api/v1/stores` reads. JWT is
   scoped to their `customer_id`, so they only ever see their own stores.

### Branch onboarding (how a store gets its token)

Branch holds its license token (from activating against the activator). It calls
`POST /api/v1/stores/register { license_token, store_name }`. This server:
1. Verifies the Ed25519 signature with the embedded public key.
2. Checks `app == "inventra"`, not expired, and `"multi_store"` in `features`.
3. Resolves/creates the `customers` row by `customer_id`.
4. Enforces the store cap (`seats` from the license / customer record).
5. Creates a `stores` row and returns `{ store_id, store_token }`.

The branch persists `store_token` and sends it as `Authorization: Bearer
<store_token>` on every `POST /api/v1/sync`.

---

## 5. Data model (Postgres)

### Identity / control tables
- **customers** — `id (uuid pk)`, `customer_id (str unique)`, `email (unique)`,
  `name`, `password_hash (nullable until set)`, `setup_token (nullable)`,
  `setup_token_expires`, `seats (int)`, `status`, `created_at`.
- **stores** — `id (uuid pk)`, `customer_pk (fk customers.id)`,
  `customer_id (str, denormalized)`, `store_id (uuid, public id)`,
  `name`, `store_token_hash`, `license_key_id`, `created_at`, `last_seen_at`,
  `active`.

### Synced business tables (the consolidated read model)

Every synced row is keyed by **`(store_id, local_id)`** so branches never
collide (each branch keeps its own SQLite autoincrement ids). v1 is **one-way
up**, so there are no merge conflicts — the cloud is a downstream replica.

Tables mirror the branch schema, scoped by `store_id`:
`sales`, `sale_items`, `sale_payments`, `products`, `stock_movements`,
`expenses`, `employees`, `clients` (the shop's customers/loyalty),
`shifts`. Each carries `store_id`, `local_id`, the business columns, and an
`updated_at`/`synced_at`.

### Sync bookkeeping
- **ingest_cursors** — `(store_id, table_name) -> last_local_id / last_updated_at`
  watermark, so the server (and branch) can resume incrementally and ingest is
  idempotent.

> Schema is structured around the **transactions-up vs master-down** split from
> day one (see §7), even though v1 only does "up", so phase 2 needs no redesign.

---

## 6. API surface (`/api/v1` unless noted)

### Public / health
- `GET /health` — liveness + DB check.

### Owner auth
- `POST /api/v1/auth/set-password` `{ token, password }` → sets password, clears token.
- `POST /api/v1/auth/login` `{ email, password }` → `{ access_token, token_type }` (JWT).
- `GET  /api/v1/me` (Bearer JWT) → owner profile + store count.

### Owner reporting (Bearer JWT, auto-scoped to the owner's `customer_id`)
- `GET /api/v1/stores` — the owner's stores + last-seen/health.
- `GET /api/v1/reports/sales?from&to&store_id` — totals + per-store breakdown.
- `GET /api/v1/reports/overview?from&to&store_id` — KPI counts (revenue, sales, expenses, products, clients, staff).
- `GET /api/v1/reports/sales-list?from&to&store_id&limit&offset` — individual sales (+cashier name).
- `GET /api/v1/reports/products?search&store_id&limit&offset`
- `GET /api/v1/reports/movements?store_id&limit&offset`
- `GET /api/v1/reports/expenses?from&to&store_id&limit&offset` (+ total_amount)
- `GET /api/v1/reports/clients?search&store_id&limit&offset`
- `GET /api/v1/reports/employees?store_id`
- `GET /api/v1/reports/shifts?store_id&limit&offset`
  All optional `store_id` (validated as the owner's); omit for all-stores.
- *(intentionally not exposed: refunds, suppliers, purchase orders, tax categories — not synced.)*

### Branch (Bearer `store_token`)
- `POST /api/v1/stores/register` `{ license_token, store_name }` → `{ store_id, store_token }` (no auth; license is the proof).
- `POST /api/v1/sync` — batched idempotent upserts: `{ batches: [{ table, rows: [...] }], cursors: {...} }`.
- `POST /api/v1/stores/heartbeat` — updates `last_seen_at`.

### Operator (header `X-Admin-Token`)
- `POST /admin/customers` `{ customer_id, email, name, seats }` → creates owner + returns setup token.
- `GET  /admin/customers`, `GET /admin/stores` — inspection.

---

## 7. Sync design (store-and-forward)

- **Direction (v1): up only.** Branch is the source of truth for its own rows.
  - **Transactions (append-only): up** — `sales`, `sale_items`, `sale_payments`,
    `stock_movements`, `expenses`, `shifts`. Trivial: monotonic local ids.
  - **Master-ish (mutable): up for now** — `products`, `employees`, `clients`.
    Ride an `updated_at` watermark.
- **Idempotency:** every upsert is keyed by `(store_id, local_id)` using
  Postgres `INSERT ... ON CONFLICT DO UPDATE`. Re-sending a batch is always safe.
- **Cadence:** branch pushes every few minutes + on-demand "Sync now"; offline →
  it queues and drains when online. Branch-side engine (`sync.rs`) lives in the
  `Inventra/` repo and is a **separate phase** (not in this repo).
- **Phase 2 (master-down):** central catalog/pricing edited by the owner pushes
  *down* to branches. Schema/`updated_at` already accommodate this; the transport
  becomes bidirectional. Not built yet.

---

## 8. License verification

The signed license token format (produced by the activator's `signing.py`):

```
token = base64url(canonical_json(payload)) + "." + base64url(ed25519_sig)
```

- `canonical_json` = `json.dumps(payload, sort_keys=True, separators=(",",":"),
  ensure_ascii=False)`. The signature is over **exactly** those bytes, i.e. the
  bytes you get back by base64url-decoding the first segment.
- We verify with the **embedded Ed25519 public key** (same one the branch and
  activator use):
  `363fac89690e36cdef4c7f6cd2afcac7a97c288deda4e3b5b3306e2893423cbe` (32 bytes,
  hex). See `app/signing.py`.
- After verifying the signature we check: `app == "inventra"`, not expired
  (`expires_at`), and `"multi_store" in features`.

This is fully **offline** — the cloud server never has to call the activator to
validate a token.

---

## 9. Configuration (env)

Mirrors the activator's conventions. See `.env.example`.

| Var | Meaning |
| --- | --- |
| `DATABASE_URL` | `postgresql+psycopg2://user:pass@db:5432/cloud` |
| `ADMIN_TOKEN` | operator admin token (header `X-Admin-Token`) |
| `JWT_SECRET` | HMAC secret for signing owner JWTs |
| `JWT_EXPIRE_MINUTES` | owner session lifetime (default e.g. 720) |
| `SETUP_TOKEN_TTL_HOURS` | set-password link lifetime (default 72) |

No private signing key here — this service only **verifies** licenses, it never
issues them (that's the activator's job).

---

## 10. Running it

```bash
cp .env.example .env          # fill in ADMIN_TOKEN, JWT_SECRET, POSTGRES_*
docker compose up --build     # starts Postgres + API
curl localhost:32950/health   # -> {"status":"ok","db":"ok"}
```

Port **32950** (activator uses 32942; keep them distinct).

Local dev without Docker:
```bash
python -m venv .venv && . .venv/Scripts/activate   # (Windows: Git Bash)
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg2://inventra:inventra@localhost:5432/cloud
uvicorn app.main:app --reload --port 32950
```

---

## 11. Repo layout

```
inventra-cloud-server/
├─ CONTEXT.md                this file
├─ README.md                 short run/deploy notes (roadmap)
├─ inventra_admin.py         operator CLI (create-customer / list-customers / list-stores)
├─ requirements.txt
├─ Dockerfile
├─ docker-compose.yml        api + postgres + volume
├─ .env.example  .gitignore  .dockerignore
├─ web/                     owner web console (Vite + React + TS + Tailwind)
│  ├─ src/
│  │  ├─ main.tsx  App.tsx
│  │  ├─ lib/ (api.ts, auth.tsx)
│  │  ├─ components/ (Layout.tsx)
│  │  └─ pages/ (Login, SetPassword, Dashboard, Stores)
│  ├─ index.html  vite.config.ts  tailwind.config.js  package.json
│  └─ dist/                 built SPA (gitignored; FastAPI serves it if present)
└─ app/
   ├─ __init__.py
   ├─ main.py                FastAPI app, router wiring, table create-on-boot,
   │                         + SPA catch-all that serves web/dist when built
   ├─ config.py              pydantic-settings
   ├─ db.py                  engine, SessionLocal, Base, get_db
   ├─ security.py            password hashing + JWT encode/decode
   ├─ signing.py             Ed25519 license-token verification (embedded pubkey)
   ├─ models.py              SQLAlchemy models (identity + synced tables)
   ├─ schemas.py             Pydantic request/response models
   ├─ deps.py                auth dependencies (admin / owner JWT / store token)
   └─ routers/
      ├─ __init__.py
      ├─ health.py
      ├─ auth.py             owner login / set-password / me
      ├─ admin.py            operator: create/list customers + stores
      ├─ stores.py           branch register / heartbeat + owner store list
      ├─ sync.py             branch ingest (idempotent upserts)
      └─ reports.py          consolidated reporting (sales first; rest roadmap)
```

---

## 12. Status / roadmap

### Done
- _(fill in as built — see git log)_

### In progress / next
1. **Scaffold + identity** — config, db, models, signing, health; owner auth
   (login/set-password/JWT); operator `create customer`; branch `register`.
2. **Sync ingest** — `/api/v1/sync` generic idempotent upsert for the synced
   tables + cursors.
3. **Reporting** — ✅ DONE: overview KPIs + sales aggregate/list + products,
   movements, expenses, clients, employees, shifts (all store-scopable).
4. **Branch sync engine** — ✅ DONE in `Inventra/` repo:
   `src-tauri/src/cloud_sync.rs` (store-and-forward loop, gated on `multi_store`
   + server mode), commands `register_store` / `get_cloud_sync_status` /
   `set_cloud_sync_enabled` / `cloud_sync_now` / `disconnect_store`, and a
   Settings → "Multi-store (cloud)" UI section. Pushes sales/sale_items/
   sale_payments/stock_movements/expenses (id watermark), products (updated_at
   watermark), and employees/clients/shifts (snapshot). **Known v1 gaps:**
   refunds and sale cancellations aren't synced yet (cloud has no refunds
   table); expense edits/deletes don't propagate (id-watermark, append-only).
5. **Owner web console** — ✅ STARTED in `web/` (Vite + React + TS + Tailwind,
   Inventra brand tokens). Done: email/password login, set-password (from the
   operator's setup-token link at `/set-password?token=…`), JWT in localStorage,
   app shell (sidebar + sign-out), **Overview** dashboard (consolidated sales:
   store filter + date range + per-store revenue bars, consuming
   `/api/v1/reports/sales`), and a **Stores** list. Served by FastAPI from
   `web/dist` in production (single container), or `npm run dev` (port 5180, with
   a proxy to the API) in dev. **Now restyled to match the desktop app** (Inter +
   Anek Tamil fonts, ink/accent tokens, card/pop shadows, gradient active-nav,
   chevron motif, hero with blurred blobs) and structured like the desktop for
   familiarity. A **store switcher** (All stores / a specific branch) scopes the
   whole console; pages: **Dashboard** (hero + KPI cards + revenue-by-store),
   **Sales**, **Products**, **Stock movements**, **Clients**, **Shifts**,
   **Expenses**, **Staff** — each with a Store column in all-stores mode.
6. **Phase 2** — master-data push-down, cross-store client dedup, two-way sync,
   stock transfers.

---

## 13. Conventions & guardrails

- **Match the activator's style** (FastAPI routers, SQLAlchemy `Column` models,
  pydantic schemas, `X-Admin-Token` admin auth, Dockerfile shape).
- **Never** put the signing **private** key here. Verify-only.
- Owners are **always** scoped to their `customer_id`; never let one owner read
  another's stores. Enforce in the JWT dependency, not per-query ad hoc.
- Sync is **idempotent** — design every ingest path so a duplicate batch is a
  no-op.
- Don't break branch autonomy: nothing here is on a branch's hot path.
- Do not modify `inventra-mobile/` or `inventra-cloud-activator/`.

---

## 14. History / decisions log

- Multi-store requested as a licensed (`multi_store`) feature: owner with several
  branches sees sales/products/expenses/employees/clients/analytics per store and
  aggregated.
- User chose: **each branch keeps its own LAN server** + periodic sync to an
  online server → 2-tier local-first + async replication (validated against how
  Walmart et al. operate).
- Non-admin staff are **bound to one store** (each branch DB is one store; the
  consolidated view is owner/operator only).
- Owner login method: **B — email/password web portal** (so the owner can check
  stores from anywhere).
- Cloud stack: **Python/FastAPI/Postgres**, matching `inventra-cloud-activator`
  (originally floated Rust/axum; switched for one-consistent-cloud-stack ops).
- v1 sync is **one-way up**, read-only consolidated console; master-down is
  phase 2.
```
