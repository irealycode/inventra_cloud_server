"""Auth dependencies for the three principals: operator (admin token), owner
(JWT), and store/branch (opaque store token)."""

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Customer, Store
from app.security import decode_access_token, hash_token

_bearer = HTTPBearer(auto_error=True)


# ---- operator ---------------------------------------------------------------
def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    if not x_admin_token or x_admin_token != settings.admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid admin token")


# ---- owner (JWT) ------------------------------------------------------------
def get_current_owner(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Customer:
    try:
        payload = decode_access_token(creds.credentials)
    except Exception as exc:  # noqa: BLE001 - any jwt error -> 401
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token") from exc

    customer = db.query(Customer).filter(Customer.id == payload.get("sub")).first()
    if not customer or customer.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="account not found")
    return customer


# ---- store / branch (opaque token) ------------------------------------------
def get_current_store(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Store:
    store = (
        db.query(Store)
        .filter(Store.store_token_hash == hash_token(creds.credentials), Store.active.is_(True))
        .first()
    )
    if not store:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid store token")
    return store
