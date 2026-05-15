from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import jwt
import structlog
from jwt import InvalidTokenError, PyJWKClient

from app.config import get_settings

log = structlog.get_logger(__name__)


UserRole = Literal["creator", "approver_a", "approver_b"]


class AuthError(Exception):
    pass


class InvalidJWT(AuthError):
    pass


class InactiveUser(AuthError):
    pass


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str
    role: UserRole
    raw_claims: dict[str, Any]


# ────────────────────────────────────────────────────────────
# JWT decoding — supports both modern (ES256/RS256 via JWKS) and legacy (HS256)
# Supabase rolled out asymmetric JWT signing keys; new projects sign tokens
# with ES256 using a private key stored in Supabase and served via the JWKS
# endpoint at {SUPABASE_URL}/auth/v1/.well-known/jwks.json.
# ────────────────────────────────────────────────────────────

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        settings = get_settings()
        if not settings.supabase_url:
            raise AuthError("SUPABASE_URL is not configured — cannot fetch JWKS")
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        # PyJWKClient caches signing keys for 1h by default
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
        log.info("jwks_client_initialized", url=jwks_url)
    return _jwks_client


def decode_supabase_jwt(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        unverified_header = jwt.get_unverified_header(token)
    except InvalidTokenError as exc:
        log.warning("jwt_header_unreadable", error=str(exc))
        raise InvalidJWT(f"Cannot read JWT header: {exc}") from exc

    alg = unverified_header.get("alg", "HS256")
    options = {"verify_aud": True, "verify_exp": True}
    # 60 seconds clock-skew tolerance for iat / nbf / exp — avoids
    # "token not yet valid" errors when the local clock is slightly behind
    # the Supabase Auth server clock.
    leeway = 60

    try:
        if alg == "HS256":
            # Legacy shared-secret path
            if not settings.supabase_jwt_secret:
                raise AuthError(
                    "SUPABASE_JWT_SECRET is not configured (required for HS256 tokens)"
                )
            claims = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                leeway=leeway,
                options=options,
            )
        elif alg in ("ES256", "RS256"):
            # Modern asymmetric path — fetch the public key from Supabase's JWKS endpoint
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                audience="authenticated",
                leeway=leeway,
                options=options,
            )
        else:
            raise InvalidJWT(f"Unsupported JWT algorithm: {alg}")
    except InvalidTokenError as exc:
        log.warning("jwt_decode_failed", alg=alg, error=str(exc))
        raise InvalidJWT(str(exc)) from exc

    return claims


async def load_user_role(user_id: str) -> UserRole:
    """
    Load the user's app role from public.users.

    Primary path: direct DB via asyncpg pool (fast).
    Fallback: Supabase REST API with the service_role key (no DB connection needed).
    The fallback lets the app work even if DATABASE_URL has a bad password.
    """
    # Try direct DB first
    try:
        from app.db.client import fetch_one

        row = await fetch_one(
            "select role, deleted_at from public.users where id = $1",
            user_id,
        )
        if row is None:
            raise InactiveUser(f"User {user_id} not found in public.users")
        if row["deleted_at"] is not None:
            raise InactiveUser(f"User {user_id} is soft-deleted")
        return row["role"]
    except RuntimeError as exc:
        # asyncpg pool not initialized — fall back to Supabase REST
        if "pool not initialised" not in str(exc).lower():
            raise
        log.info("db_pool_unavailable_falling_back_to_rest", user_id=user_id)
        return await _load_user_role_via_rest(user_id)


async def _load_user_role_via_rest(user_id: str) -> UserRole:
    """Fallback: query public.users via Supabase REST using the service_role key (bypasses RLS)."""
    import httpx

    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise AuthError(
            "Cannot load user role: DB pool failed AND SUPABASE_SERVICE_ROLE_KEY is missing."
        )
    base = settings.supabase_url.rstrip("/")
    async with httpx.AsyncClient(timeout=8.0) as client:
        res = await client.get(
            f"{base}/rest/v1/users",
            params={"select": "role,deleted_at", "id": f"eq.{user_id}"},
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Accept": "application/json",
            },
        )
        if res.status_code >= 400:
            raise InactiveUser(
                f"Supabase REST returned {res.status_code}: {res.text[:200]}"
            )
        rows = res.json()
    if not rows:
        raise InactiveUser(f"User {user_id} not found in public.users")
    if rows[0].get("deleted_at") is not None:
        raise InactiveUser(f"User {user_id} is soft-deleted")
    return rows[0]["role"]


async def authenticate(token: str) -> AuthenticatedUser:
    claims = decode_supabase_jwt(token)
    user_id = claims.get("sub")
    email = claims.get("email", "")
    if not user_id:
        raise InvalidJWT("JWT is missing 'sub' claim")
    role = await load_user_role(user_id)
    return AuthenticatedUser(id=user_id, email=email, role=role, raw_claims=claims)
