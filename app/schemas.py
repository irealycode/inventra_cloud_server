from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ---- owner auth --------------------------------------------------------------
class SetPasswordIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeOut(BaseModel):
    customer_id: str
    email: EmailStr
    name: str | None = None
    seats: int
    store_count: int


# ---- operator admin ----------------------------------------------------------
class AdminCustomerCreate(BaseModel):
    customer_id: str
    email: EmailStr
    name: str | None = None
    seats: int = Field(default=1, ge=1)


class AdminCustomerOut(BaseModel):
    customer_id: str
    email: EmailStr
    name: str | None = None
    seats: int
    status: str
    has_password: bool
    store_count: int
    created_at: datetime
    # Present only right after creation: the one-time set-password token.
    setup_token: str | None = None


class StoreOut(BaseModel):
    store_id: str
    name: str
    customer_id: str
    active: bool
    created_at: datetime
    last_seen_at: datetime | None = None


# ---- branch registration / sync ----------------------------------------------
class StoreRegisterIn(BaseModel):
    license_token: str
    store_name: str


class StoreRegisterOut(BaseModel):
    store_id: str
    store_token: str


class SyncBatch(BaseModel):
    table: str
    rows: list[dict[str, Any]] = Field(default_factory=list)


class SyncIn(BaseModel):
    batches: list[SyncBatch] = Field(default_factory=list)
    cursors: dict[str, Any] = Field(default_factory=dict)


class SyncResult(BaseModel):
    ok: bool = True
    upserted: dict[str, int] = Field(default_factory=dict)
    skipped: list[str] = Field(default_factory=list)


# ---- reporting ---------------------------------------------------------------
class StoreSales(BaseModel):
    store_id: str
    store_name: str
    sales_count: int
    revenue: float


class SalesReport(BaseModel):
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    total_revenue: float
    total_sales: int
    by_store: list[StoreSales]

    model_config = {"populate_by_name": True}
