"""Operator endpoints (header X-Admin-Token). Used to provision owner accounts
and inspect customers/stores. This is how you 'create a new customer'."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import require_admin
from app.models import Customer, Store
from app.schemas import AdminCustomerCreate, AdminCustomerOut, StoreOut
from app.security import hash_token, new_opaque_token

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _customer_out(db: Session, c: Customer, setup_token: str | None = None) -> AdminCustomerOut:
    store_count = db.query(Store).filter(Store.customer_id == c.customer_id).count()
    return AdminCustomerOut(
        customer_id=c.customer_id,
        email=c.email,
        name=c.name,
        seats=c.seats,
        status=c.status,
        has_password=bool(c.password_hash),
        store_count=store_count,
        created_at=c.created_at,
        setup_token=setup_token,
    )


@router.post("/customers", response_model=AdminCustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(body: AdminCustomerCreate, db: Session = Depends(get_db)) -> AdminCustomerOut:
    """Create an owner account for a multi_store license holder. `customer_id`
    must match the `customer_id` on the activator license key. Returns a one-time
    setup token the owner uses at /api/v1/auth/set-password to choose a password."""
    email = str(body.email).lower()
    if db.query(Customer).filter(
        (Customer.customer_id == body.customer_id) | (Customer.email == email)
    ).first():
        raise HTTPException(status_code=409, detail="customer_id or email already exists")

    setup_token = new_opaque_token()
    customer = Customer(
        customer_id=body.customer_id,
        email=email,
        name=body.name,
        seats=body.seats,
        setup_token_hash=hash_token(setup_token),
        setup_token_expires=datetime.utcnow() + timedelta(hours=settings.setup_token_ttl_hours),
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _customer_out(db, customer, setup_token=setup_token)


@router.get("/customers", response_model=list[AdminCustomerOut])
def list_customers(db: Session = Depends(get_db)) -> list[AdminCustomerOut]:
    return [_customer_out(db, c) for c in db.query(Customer).order_by(Customer.created_at.desc()).all()]


@router.get("/stores", response_model=list[StoreOut])
def list_stores(db: Session = Depends(get_db)) -> list[StoreOut]:
    stores = db.query(Store).order_by(Store.created_at.desc()).all()
    return [
        StoreOut(
            store_id=str(s.store_id),
            name=s.name,
            customer_id=s.customer_id,
            active=s.active,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
        )
        for s in stores
    ]
