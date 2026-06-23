#!/usr/bin/env python3
"""Inventra Cloud Server — operator admin CLI.

Facilitates owner-account (customer) provisioning against the cloud server's
`/admin/*` endpoints. Stdlib only (urllib) — no pip install needed.

Auth: the cloud server gates /admin with the `X-Admin-Token` header (set via the
server's ADMIN_TOKEN env). This script reads the same `ADMIN_TOKEN` from the
environment or from a local `.env` file, or via --admin-token.

Examples:
    # Create an owner account (returns a one-time set-password link)
    python inventra_admin.py create-customer \
        --customer-id cust_123 --email owner@shop.com --name "Owner" --seats 5

    # Against a remote server
    python inventra_admin.py --url https://cloud.example.com create-customer \
        --customer-id cust_123 --email owner@shop.com

    python inventra_admin.py list-customers
    python inventra_admin.py list-stores

Env / overrides:
    CLOUD_URL          base URL of the cloud server   (default http://localhost:32950)
    CLOUD_CONSOLE_URL  base URL the owner opens        (default = CLOUD_URL)
    ADMIN_TOKEN        operator admin token            (or --admin-token)
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_dotenv() -> None:
    """Populate os.environ from a sibling .env (without overriding real env)."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


class CloudAdmin:
    def __init__(self, base_url: str, admin_token: str):
        self.base_url = base_url.rstrip("/")
        self.admin_token = admin_token

    def _request(self, method: str, path: str, body: dict | None = None):
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("X-Admin-Token", self.admin_token)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(detail)
                detail = parsed.get("detail", detail)
            except Exception:
                pass
            print(f"[ERROR] {exc.code}: {detail}")
            sys.exit(1)
        except urllib.error.URLError as exc:
            print(f"[ERROR] could not reach {self.base_url}: {exc.reason}")
            sys.exit(1)

    def create_customer(self, customer_id, email, name=None, seats=1):
        payload = {"customer_id": customer_id, "email": email, "seats": seats}
        if name:
            payload["name"] = name
        return self._request("POST", "/admin/customers", payload)

    def list_customers(self):
        return self._request("GET", "/admin/customers")

    def list_stores(self):
        return self._request("GET", "/admin/stores")


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Inventra Cloud Server admin CLI")
    parser.add_argument(
        "--url",
        default=os.getenv("CLOUD_URL", "http://localhost:32950"),
        help="Cloud server base URL (env CLOUD_URL)",
    )
    parser.add_argument(
        "--console-url",
        default=os.getenv("CLOUD_CONSOLE_URL"),
        help="Base URL the owner opens for the set-password link (default: --url)",
    )
    parser.add_argument(
        "--admin-token",
        default=os.getenv("ADMIN_TOKEN"),
        help="Operator admin token (env ADMIN_TOKEN)",
    )

    sub = parser.add_subparsers(dest="command")

    create = sub.add_parser("create-customer", help="Create an owner (stores admin) account")
    create.add_argument("--customer-id", required=True, help="Must match the license key's customer_id")
    create.add_argument("--email", required=True)
    create.add_argument("--name")
    create.add_argument("--seats", type=int, default=1, help="Max number of stores")

    sub.add_parser("list-customers", help="List owner accounts")
    sub.add_parser("list-stores", help="List registered branches")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    if not args.admin_token:
        print("[ERROR] No admin token. Set ADMIN_TOKEN (env or .env) or pass --admin-token.")
        sys.exit(1)

    admin = CloudAdmin(args.url, args.admin_token)
    console_url = (args.console_url or args.url).rstrip("/")

    if args.command == "create-customer":
        data = admin.create_customer(args.customer_id, args.email, args.name, args.seats)
        setup_token = data.get("setup_token", "")
        print("\n=== CUSTOMER CREATED ===")
        print(f"customer_id : {data.get('customer_id')}")
        print(f"email       : {data.get('email')}")
        print(f"name        : {data.get('name') or '-'}")
        print(f"seats       : {data.get('seats')}")
        print("\nSend this set-password link to the owner:")
        print(f"  {console_url}/set-password?token={setup_token}")
        print("\n(The link is single-use and expires per the server's SETUP_TOKEN_TTL_HOURS.)")

    elif args.command == "list-customers":
        for c in admin.list_customers() or []:
            flag = "set" if c.get("has_password") else "PENDING"
            print(
                f"{c.get('customer_id'):<20} {c.get('email'):<30} "
                f"stores={c.get('store_count')}/{c.get('seats')} password={flag}"
            )

    elif args.command == "list-stores":
        for s in admin.list_stores() or []:
            print(
                f"{s.get('store_id'):<38} {s.get('name'):<24} "
                f"customer={s.get('customer_id'):<16} active={s.get('active')} "
                f"last_seen={s.get('last_seen_at') or 'never'}"
            )


if __name__ == "__main__":
    main()
