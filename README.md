# Inventra Cloud Server

Central aggregation tier for Inventra's `multi_store` feature. Branches push
their data here (store-and-forward); a store owner views consolidated, read-only
reporting across all their stores.

**Read [CONTEXT.md](CONTEXT.md) first** — it has the full architecture, identity
model, API surface, and roadmap.

## Run

```bash
cp .env.example .env          # set ADMIN_TOKEN, JWT_SECRET, POSTGRES_*
docker compose up --build
curl localhost:32950/health   # {"status":"ok","db":"ok"}
```

API docs: http://localhost:32950/docs

With `docker compose up --build`, the **owner web console** is bundled and served
at the root: http://localhost:32950/ (login with the owner email/password).

## Web console (owner dashboard)

A Vite + React SPA in `web/`. In production the Dockerfile builds it and FastAPI
serves `web/dist`. For local UI development:

```bash
cd web
npm install
npm run dev        # http://localhost:5180  (proxies /api -> localhost:32950)
```

The owner's set-password link is `<console-url>/set-password?token=<setup_token>`
(the `setup_token` returned by `POST /admin/customers`).

## Onboarding flow (quick reference)

1. **Create the owner** (operator) — easiest via the admin CLI:
   ```bash
   ADMIN_TOKEN=... python inventra_admin.py create-customer \
     --customer-id cust_123 --email owner@shop.com --name "Owner" --seats 5
   # -> prints the ready-to-send set-password link
   ```
   (Or raw: `POST /admin/customers` with header `X-Admin-Token`, returning a
   one-time `setup_token`.) See `inventra_admin.py` for `list-customers` /
   `list-stores` too.
2. **Owner sets password**:
   `POST /api/v1/auth/set-password { "token": "<setup_token>", "password": "..." }`
3. **Owner logs in**:
   `POST /api/v1/auth/login { "email": "...", "password": "..." }` -> JWT
4. **Branch registers** (with its multi_store license token):
   `POST /api/v1/stores/register { "license_token": "...", "store_name": "Downtown" }`
   -> `{ store_id, store_token }`
5. **Branch syncs**: `POST /api/v1/sync` with `Authorization: Bearer <store_token>`
6. **Owner reads**: `GET /api/v1/reports/sales` with `Authorization: Bearer <JWT>`

`customer_id` in step 1 must match the `customer_id` on the activator license key.
