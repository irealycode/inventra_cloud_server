"""Verify Ed25519-signed Inventra license tokens — VERIFY ONLY.

This server never issues licenses (that's `inventra-cloud-activator`). It only
checks that a token presented by a branch was signed by the activator's private
key, using the matching public key embedded below (the same 32-byte key the
desktop app and activator use).

Token format (see the activator's signing.py):
    base64url(canonical_json(payload)) + "." + base64url(ed25519_signature)
The signature is over exactly the bytes you get back by base64url-decoding the
first segment.
"""

import base64
import json
from datetime import datetime, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

# Same key as Inventra/src-tauri/src/license.rs and the activator's public_key.
PUBLIC_KEY_HEX = "363fac89690e36cdef4c7f6cd2afcac7a97c288deda4e3b5b3306e2893423cbe"
_public_key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(PUBLIC_KEY_HEX))


class LicenseError(Exception):
    """Raised when a license token is malformed, unsigned-by-us, expired, for the
    wrong app, or missing a required feature."""


def _b64url_decode(segment: str) -> bytes:
    pad = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + pad)


def verify_license_token(
    token: str,
    *,
    expected_app: str | None = "inventra",
    require_feature: str | None = None,
) -> dict:
    """Return the verified payload dict, or raise LicenseError."""
    try:
        payload_b64, sig_b64 = token.split(".")
    except ValueError as exc:
        raise LicenseError("malformed license token") from exc

    try:
        payload_bytes = _b64url_decode(payload_b64)
        signature = _b64url_decode(sig_b64)
    except Exception as exc:  # noqa: BLE001 - any decode failure is invalid
        raise LicenseError("invalid license encoding") from exc

    try:
        _public_key.verify(signature, payload_bytes)
    except InvalidSignature as exc:
        raise LicenseError("license signature verification failed") from exc

    try:
        payload = json.loads(payload_bytes)
    except json.JSONDecodeError as exc:
        raise LicenseError("invalid license payload") from exc

    app = payload.get("app")
    if expected_app and app is not None and app != expected_app:
        raise LicenseError("license is issued for a different app")

    expires_at = payload.get("expires_at")
    if expires_at:
        try:
            dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= dt:
                raise LicenseError("license has expired")
        except ValueError:
            # Unparseable expiry — treat as non-expiring rather than crash.
            pass

    features = payload.get("features") or []
    if require_feature and require_feature not in features:
        raise LicenseError(f"license does not include feature: {require_feature}")

    return payload
