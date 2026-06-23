#!/usr/bin/env python3
"""End-to-end smoke test for a running Inventra Cloud Server.

Exercises the full owner + branch flow over HTTP against a live server (default
http://localhost:32950). Stdlib only — no pip install needed.

What it checks:
  1. GET  /health
  2. POST /admin/customers           (operator creates an owner)            [needs ADMIN_TOKEN]
  3. POST /api/v1/auth/login         (must 401 before a password is set)
  4. POST /api/v1/auth/set-password  (the 500 we just fixed)
  5. POST /api/v1/auth/login         (email + password -> JWT)
  6. GET  /api/v1/me
  7. GET  /api/v1/stores
  8. GET  /api/v1/reports/sales

  If LICENSE_TOKEN is set (a signed multi_store license), it also:
  9. POST /api/v1/stores/register    (branch onboarding -> store_token)
 10. POST /api/v1/sync               (push one sample sale)
 11. GET  /api/v1/reports/sales      (the sale shows up)

Usage:
    ADMIN_TOKEN=... python smoke_test.py
    CLOUD_URL=https://cloud.example.com ADMIN_TOKEN=... python smoke_test.py
    ADMIN_TOKEN=... LICENSE_TOKEN=... python smoke_test.py     # full incl. sync
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.getenv("CLOUD_URL", "http://localhost:32950").rstrip("/")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")
LICENSE_TOKEN = os.getenv("LICENSE_TOKEN")

SUFFIX = str(int(time.time()))
CUSTOMER_ID = f"smoke_{SUFFIX}"
EMAIL = f"smoke_{SUFFIX}@example.com"
PASSWORD = "smoke-pass-123"

_passed = 0
_failed = 0


def http(method, path, body=None, headers=None):
    """Return (status, parsed_json_or_text). Never raises on HTTP status."""
    url = f"{BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, _maybe_json(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        return exc.code, _maybe_json(raw)
    except urllib.error.URLError as exc:
        return 0, f"connection failed: {exc.reason}"


def _maybe_json(raw):
    try:
        return json.loads(raw)
    except Exception:
        return raw


def check(name, ok, detail=""):
    global _passed, _failed
    if ok:
        _passed += 1
        print(f"[PASS] {name}")
    else:
        _failed += 1
        print(f"[FAIL] {name}  -> {detail}")
    return ok


def main():
    print(f"Target: {BASE}\n")

    # 1. health
    st, body = http("GET", "/health")
    check("health", st == 200 and isinstance(body, dict) and body.get("status") == "ok", f"{st} {body}")

    if not ADMIN_TOKEN:
        print("\n[SKIP] ADMIN_TOKEN not set - cannot run the owner/branch flow.")
        _summary()
        return

    admin_h = {"X-Admin-Token": ADMIN_TOKEN}

    # 2. create customer
    st, body = http("POST", "/admin/customers", {
        "customer_id": CUSTOMER_ID, "email": EMAIL, "name": "Smoke Test", "seats": 3,
    }, admin_h)
    setup_token = body.get("setup_token") if isinstance(body, dict) else None
    check("admin create-customer", st == 201 and bool(setup_token), f"{st} {body}")
    if not setup_token:
        _summary()
        return

    # 3. login before password is set -> must be rejected
    st, body = http("POST", "/api/v1/auth/login", {"email": EMAIL, "password": PASSWORD})
    check("login rejected before set-password", st == 401, f"expected 401, got {st} {body}")

    # 4. set-password (this is the path that was 500ing)
    st, body = http("POST", "/api/v1/auth/set-password", {"token": setup_token, "password": PASSWORD})
    token = body.get("access_token") if isinstance(body, dict) else None
    check("set-password", st == 200 and bool(token), f"{st} {body}")

    # 5. login with the new password
    st, body = http("POST", "/api/v1/auth/login", {"email": EMAIL, "password": PASSWORD})
    token = body.get("access_token") if isinstance(body, dict) else token
    check("login", st == 200 and bool(token), f"{st} {body}")
    if not token:
        _summary()
        return
    owner_h = {"Authorization": f"Bearer {token}"}

    # 6. me
    st, body = http("GET", "/api/v1/me", headers=owner_h)
    check("me scoped to owner", st == 200 and isinstance(body, dict) and body.get("customer_id") == CUSTOMER_ID, f"{st} {body}")

    # 7. stores (empty so far)
    st, body = http("GET", "/api/v1/stores", headers=owner_h)
    check("list stores", st == 200 and isinstance(body, list), f"{st} {body}")

    # 8. reports/sales (zeros, no data yet)
    st, body = http("GET", "/api/v1/reports/sales", headers=owner_h)
    check("reports/sales", st == 200 and isinstance(body, dict) and "total_revenue" in body, f"{st} {body}")

    # bad-token guard
    st, _ = http("GET", "/api/v1/me", headers={"Authorization": "Bearer not-a-real-token"})
    check("reject invalid JWT", st == 401, f"expected 401, got {st}")

    # --- branch flow (only with a real multi_store license token) -----------
    if not LICENSE_TOKEN:
        print("\n[SKIP] LICENSE_TOKEN not set - skipping store register + sync.")
        _summary()
        return

    st, body = http("POST", "/api/v1/stores/register", {
        "license_token": LICENSE_TOKEN, "store_name": f"Smoke Store {SUFFIX}",
    })
    store_token = body.get("store_token") if isinstance(body, dict) else None
    check("store register", st == 200 and bool(store_token), f"{st} {body}")
    if not store_token:
        _summary()
        return
    store_h = {"Authorization": f"Bearer {store_token}"}

    # push one sample sale
    st, body = http("POST", "/api/v1/sync", {
        "batches": [{
            "table": "sales",
            "rows": [{
                "local_id": 1, "total": 42.50, "subtotal": 42.50, "discount": 0,
                "tax": 0, "payment_method": "cash", "status": "completed",
                "cashier_local_id": 1, "created_at": "2026-06-23 10:00:00",
            }],
        }],
    }, store_h)
    check("sync sample sale", st == 200 and isinstance(body, dict) and body.get("ok"), f"{st} {body}")

    # owner now sees the revenue
    st, body = http("GET", "/api/v1/reports/sales", headers=owner_h)
    revenue = body.get("total_revenue") if isinstance(body, dict) else 0
    check("reports reflect synced sale", st == 200 and float(revenue or 0) >= 42.5, f"{st} revenue={revenue}")

    _summary()


def _summary():
    print(f"\n{_passed} passed, {_failed} failed")
    sys.exit(1 if _failed else 0)


if __name__ == "__main__":
    main()
