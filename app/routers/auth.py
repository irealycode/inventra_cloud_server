"""Owner authentication: set initial password (from the operator-issued setup
token), log in (email+password -> JWT), and read own profile."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_owner
from app.models import Customer, Store
from app.schemas import LoginIn, MeOut, SetPasswordIn, TokenOut
from app.security import (
    create_access_token,
    hash_password,
    hash_token,
    verify_password,
)

router = APIRouter(prefix="/api/v1", tags=["auth"])


@router.post("/auth/set-password", response_model=TokenOut)
def set_password(body: SetPasswordIn, db: Session = Depends(get_db)) -> TokenOut:
    token_hash = hash_token(body.token)
    customer = db.query(Customer).filter(Customer.setup_token_hash == token_hash).first()
    if not customer:
        raise HTTPException(status_code=400, detail="invalid or used setup link")
    if customer.setup_token_expires and customer.setup_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="setup link has expired")

    customer.password_hash = hash_password(body.password)
    customer.setup_token_hash = None
    customer.setup_token_expires = None
    db.commit()
    db.refresh(customer)
    return TokenOut(
        access_token=create_access_token(customer.id, customer.customer_id, customer.email)
    )


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    customer = db.query(Customer).filter(Customer.email == str(body.email).lower()).first()
    if (
        not customer
        or not customer.password_hash
        or not verify_password(body.password, customer.password_hash)
        or customer.status != "active"
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid email or password")
    return TokenOut(
        access_token=create_access_token(customer.id, customer.customer_id, customer.email)
    )


@router.get("/me", response_model=MeOut)
def me(owner: Customer = Depends(get_current_owner), db: Session = Depends(get_db)) -> MeOut:
    store_count = db.query(Store).filter(Store.customer_id == owner.customer_id).count()
    return MeOut(
        customer_id=owner.customer_id,
        email=owner.email,
        name=owner.name,
        seats=owner.seats,
        store_count=store_count,
    )
