"""Password hashing (owner accounts) + JWT issuing/verification + opaque
store-token hashing. No license signing happens here — see signing.py for
verify-only license handling."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings

_JWT_ALG = "HS256"


# ---- owner passwords ---------------------------------------------------------
# Use the `bcrypt` library directly. (passlib 1.7.x is incompatible with bcrypt
# 5.x — its backend probe trips bcrypt's hard 72-byte limit and fails to init.)
# bcrypt only considers the first 72 bytes, so we truncate explicitly.
def hash_password(plain: str) -> str:
    pw = plain.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


# ---- owner JWTs --------------------------------------------------------------
def create_access_token(customer_pk: str, customer_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(customer_pk),
        "cid": customer_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_JWT_ALG)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[_JWT_ALG])


# ---- opaque tokens (store tokens, set-password tokens) -----------------------
def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 hex digest. We persist only the hash of store/setup tokens, never
    the plaintext, so a DB leak can't be replayed."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
