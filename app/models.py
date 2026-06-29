"""SQLAlchemy models.

Two groups:
  1. Identity/control — `Customer`, `Store`.
  2. Synced read-model — replicas of branch business tables, every row keyed by
     (store_id, local_id) so branches never collide. Each keeps a few promoted,
     typed columns for fast reporting plus a `raw` JSONB with the full row as the
     branch sent it. v1 sync is one-way up, so these are downstream replicas.

The `SYNC_MODELS` + `PROMOTED` registry at the bottom drives the generic ingest
endpoint (app/routers/sync.py).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


# ============================================================
# Identity / control
# ============================================================
class Customer(Base):
    """A multi-store business owner. Matches a license `customer_id` issued by
    the activator. Authenticates to the consolidated console with email+password."""

    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(256), unique=True, nullable=False, index=True)
    name = Column(String(256), nullable=True)

    password_hash = Column(String(256), nullable=True)  # null until owner sets it
    setup_token_hash = Column(String(128), nullable=True)
    setup_token_expires = Column(DateTime, nullable=True)

    seats = Column(Integer, nullable=False, default=1)  # max stores
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=_utcnow)


class Store(Base):
    """One branch. Registered by a branch presenting a valid multi_store license.
    Pushes data with its `store_token` (only the hash is stored)."""

    __tablename__ = "stores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_pk = Column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id = Column(String(128), nullable=False, index=True)  # denormalized join key
    store_id = Column(UUID(as_uuid=True), unique=True, nullable=False, index=True, default=uuid.uuid4)
    name = Column(String(256), nullable=False)

    store_token_hash = Column(String(128), unique=True, nullable=False, index=True)
    license_key_id = Column(String(128), nullable=True)
    machine_fp = Column(String(128), nullable=True)

    created_at = Column(DateTime, nullable=False, default=_utcnow)
    last_seen_at = Column(DateTime, nullable=True)
    active = Column(Boolean, nullable=False, default=True)


# ============================================================
# Synced read-model — shared mixin
# ============================================================
class _Synced:
    """Composite-keyed replica row. Subclasses add promoted columns."""

    store_id = Column(UUID(as_uuid=True), primary_key=True)
    local_id = Column(Integer, primary_key=True)
    raw = Column(JSONB, nullable=True)
    synced_at = Column(DateTime, nullable=False, default=_utcnow)


class Sale(_Synced, Base):
    __tablename__ = "sales"
    total = Column(Numeric, nullable=True)
    subtotal = Column(Numeric, nullable=True)
    discount = Column(Numeric, nullable=True)
    tax = Column(Numeric, nullable=True)
    payment_method = Column(String(64), nullable=True)
    status = Column(String(32), nullable=True)
    cashier_local_id = Column(Integer, nullable=True)
    client_local_id = Column(Integer, nullable=True)
    created_at = Column(String(40), nullable=True, index=True)


class SaleItem(_Synced, Base):
    __tablename__ = "sale_items"
    sale_local_id = Column(Integer, nullable=True, index=True)
    product_local_id = Column(Integer, nullable=True)
    name = Column(Text, nullable=True)
    quantity = Column(Numeric, nullable=True)
    unit_price = Column(Numeric, nullable=True)
    created_at = Column(String(40), nullable=True)


class SalePayment(_Synced, Base):
    __tablename__ = "sale_payments"
    sale_local_id = Column(Integer, nullable=True, index=True)
    method = Column(String(64), nullable=True)
    amount = Column(Numeric, nullable=True)
    created_at = Column(String(40), nullable=True)


class Product(_Synced, Base):
    __tablename__ = "products"
    name = Column(Text, nullable=True)
    sku = Column(String(128), nullable=True)
    barcode = Column(String(128), nullable=True)
    price = Column(Numeric, nullable=True)
    cost = Column(Numeric, nullable=True)
    stock = Column(Numeric, nullable=True)
    category = Column(String(128), nullable=True)
    active = Column(Integer, nullable=True)
    unit = Column(String(16), nullable=True)  # display label: "kg", "g", "L", "unit"
    sold_by_weight = Column(Integer, nullable=True)  # 1 if quantities may be fractional
    created_at = Column(String(40), nullable=True)
    updated_at = Column(String(40), nullable=True)


class StockMovement(_Synced, Base):
    __tablename__ = "stock_movements"
    product_local_id = Column(Integer, nullable=True, index=True)
    delta = Column(Numeric, nullable=True)
    reason = Column(String(64), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(String(40), nullable=True)


class Expense(_Synced, Base):
    __tablename__ = "expenses"
    amount = Column(Numeric, nullable=True)
    category = Column(String(128), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(String(40), nullable=True, index=True)


class Employee(_Synced, Base):
    __tablename__ = "employees"
    username = Column(String(128), nullable=True)
    full_name = Column(Text, nullable=True)
    role = Column(String(64), nullable=True)
    active = Column(Integer, nullable=True)
    created_at = Column(String(40), nullable=True)


class Client(_Synced, Base):
    __tablename__ = "clients"
    name = Column(Text, nullable=True)
    phone = Column(String(64), nullable=True)
    email = Column(String(256), nullable=True)
    loyalty_points = Column(Numeric, nullable=True)
    created_at = Column(String(40), nullable=True)


class Shift(_Synced, Base):
    __tablename__ = "shifts"
    cashier_local_id = Column(Integer, nullable=True)
    opening_cash = Column(Numeric, nullable=True)
    closing_cash = Column(Numeric, nullable=True)
    opened_at = Column(String(40), nullable=True)
    closed_at = Column(String(40), nullable=True)


class IngestCursor(Base):
    """Per (store, table) watermark the branch reports so both sides can resume
    incrementally. Purely informational on the cloud side (ingest is idempotent
    regardless), but handy for diagnostics + the branch's own bookkeeping."""

    __tablename__ = "ingest_cursors"
    store_id = Column(UUID(as_uuid=True), primary_key=True)
    table_name = Column(String(64), primary_key=True)
    last_local_id = Column(Integer, nullable=True)
    last_updated_at = Column(String(40), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


# ============================================================
# Sync registry — drives the generic ingest endpoint.
# `PROMOTED[table]` lists the row keys copied into typed columns; everything is
# also stored in `raw`. The branch sync engine must send these keys (+ `local_id`
# or `id`) for each table.
# ============================================================
SYNC_MODELS = {
    "sales": Sale,
    "sale_items": SaleItem,
    "sale_payments": SalePayment,
    "products": Product,
    "stock_movements": StockMovement,
    "expenses": Expense,
    "employees": Employee,
    "clients": Client,
    "shifts": Shift,
}

PROMOTED = {
    "sales": ["total", "subtotal", "discount", "tax", "payment_method", "status",
              "cashier_local_id", "client_local_id", "created_at"],
    "sale_items": ["sale_local_id", "product_local_id", "name", "quantity",
                   "unit_price", "created_at"],
    "sale_payments": ["sale_local_id", "method", "amount", "created_at"],
    "products": ["name", "sku", "barcode", "price", "cost", "stock", "category",
                 "active", "unit", "sold_by_weight", "created_at", "updated_at"],
    "stock_movements": ["product_local_id", "delta", "reason", "note", "created_at"],
    "expenses": ["amount", "category", "note", "created_at"],
    "employees": ["username", "full_name", "role", "active", "created_at"],
    "clients": ["name", "phone", "email", "loyalty_points", "created_at"],
    "shifts": ["cashier_local_id", "opening_cash", "closing_cash", "opened_at", "closed_at"],
}
