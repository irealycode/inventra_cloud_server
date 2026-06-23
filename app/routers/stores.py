"""Branch registration + heartbeat, and the owner's store list.

Registration is the one branch endpoint that isn't authed by a store token —
the proof is the signed multi_store license itself."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_owner, get_current_store
from app.models import Customer, Store
from app.schemas import StoreOut, StoreRegisterIn, StoreRegisterOut
from app.security import hash_token, new_opaque_token
from app.signing import LicenseError, verify_license_token

router = APIRouter(prefix="/api/v1", tags=["stores"])


@router.post("/stores/register", response_model=StoreRegisterOut)
def register_store(body: StoreRegisterIn, db: Session = Depends(get_db)) -> StoreRegisterOut:
    try:
        payload = verify_license_token(
            body.license_token,
            expected_app=settings.license_app,
            require_feature=settings.multi_store_feature,
        )
    except LicenseError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    customer_id = payload.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="license has no customer_id")

    customer = db.query(Customer).filter(Customer.customer_id == customer_id).first()
    if not customer:
        # Owner account not provisioned yet. The operator must create it first
        # (POST /admin/customers) so there's an email to sign in with.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="no owner account for this license yet — contact support to enable multi-store",
        )

    used = db.query(Store).filter(Store.customer_id == customer_id, Store.active.is_(True)).count()
    if used >= customer.seats:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"store limit reached ({used}/{customer.seats})",
        )

    token = new_opaque_token()
    store = Store(
        customer_pk=customer.id,
        customer_id=customer_id,
        store_id=uuid.uuid4(),
        name=body.store_name.strip() or "Store",
        store_token_hash=hash_token(token),
        license_key_id=payload.get("key_id"),
        machine_fp=payload.get("machine_fp"),
        last_seen_at=datetime.utcnow(),
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    return StoreRegisterOut(store_id=str(store.store_id), store_token=token)


@router.post("/stores/heartbeat")
def heartbeat(store: Store = Depends(get_current_store), db: Session = Depends(get_db)) -> dict:
    store.last_seen_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/stores", response_model=list[StoreOut])
def my_stores(owner: Customer = Depends(get_current_owner), db: Session = Depends(get_db)) -> list[StoreOut]:
    stores = (
        db.query(Store)
        .filter(Store.customer_id == owner.customer_id)
        .order_by(Store.created_at.asc())
        .all()
    )
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
