"""Branch registration + heartbeat, and the owner's store list.

Registration is the one branch endpoint that isn't authed by a store token —
the proof is the signed multi_store license itself."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_owner, get_current_store
from app.models import SYNC_MODELS, Customer, IngestCursor, Store
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

    # Re-registration dedupe: a branch that disconnects and reconnects presents
    # the same license, so the same `machine_fp`. Reuse that device's existing
    # store row instead of minting a new one — otherwise the store appears twice
    # in HQ and its synced history gets split across two store_ids.
    machine_fp = payload.get("machine_fp")
    existing = None
    if machine_fp:
        existing = (
            db.query(Store)
            .filter(Store.customer_id == customer_id, Store.machine_fp == machine_fp)
            .first()
        )

    # Seat limit counts active stores. Reusing an already-active row is free;
    # only a genuinely new (or reactivated) store consumes a seat.
    active_used = (
        db.query(Store).filter(Store.customer_id == customer_id, Store.active.is_(True)).count()
    )
    reusing_active = existing is not None and existing.active
    if not reusing_active and active_used >= customer.seats:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"store limit reached ({active_used}/{customer.seats})",
        )

    token = new_opaque_token()
    if existing is not None:
        existing.name = body.store_name.strip() or existing.name
        existing.store_token_hash = hash_token(token)
        existing.license_key_id = payload.get("key_id")
        existing.active = True
        existing.last_seen_at = datetime.utcnow()
        store = existing
    else:
        store = Store(
            customer_pk=customer.id,
            customer_id=customer_id,
            store_id=uuid.uuid4(),
            name=body.store_name.strip() or "Store",
            store_token_hash=hash_token(token),
            license_key_id=payload.get("key_id"),
            machine_fp=machine_fp,
            last_seen_at=datetime.utcnow(),
        )
        db.add(store)
    db.commit()
    db.refresh(store)
    return StoreRegisterOut(store_id=str(store.store_id), store_token=token)


@router.delete("/stores/{store_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_store(
    store_id: str,
    owner: Customer = Depends(get_current_owner),
    db: Session = Depends(get_db),
) -> Response:
    """Owner removes one of their stores from HQ. Deletes the store and all of
    its synced read-model data, and frees the seat. The branch can re-register
    later (it will get a fresh store)."""
    try:
        sid = uuid.UUID(store_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="store not found")

    store = (
        db.query(Store)
        .filter(Store.store_id == sid, Store.customer_id == owner.customer_id)
        .first()
    )
    if not store:
        raise HTTPException(status_code=404, detail="store not found")

    # Wipe the synced read-model rows for this store, then the cursors, then
    # the store itself. (The synced tables aren't FK-linked to stores, so we
    # clean them explicitly to avoid orphaned reporting data.)
    for model in SYNC_MODELS.values():
        db.query(model).filter(model.store_id == sid).delete(synchronize_session=False)
    db.query(IngestCursor).filter(IngestCursor.store_id == sid).delete(synchronize_session=False)
    db.delete(store)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
