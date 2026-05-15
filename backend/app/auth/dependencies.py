from __future__ import annotations

from typing import Annotated, Callable

import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.supabase_client import (
    AuthenticatedUser,
    InactiveUser,
    InvalidJWT,
    UserRole,
    authenticate,
)

log = structlog.get_logger(__name__)

_bearer = HTTPBearer(auto_error=False, description="Supabase JWT")


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return await authenticate(credentials.credentials)
    except InvalidJWT as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except InactiveUser as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


def require_role(role: UserRole) -> Callable[..., AuthenticatedUser]:
    async def _enforce(user: CurrentUser) -> AuthenticatedUser:
        if user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role '{role}', got '{user.role}'",
            )
        return user

    _enforce.__name__ = f"require_role_{role}"
    return _enforce


def require_any_role(*roles: UserRole) -> Callable[..., AuthenticatedUser]:
    role_set = set(roles)

    async def _enforce(user: CurrentUser) -> AuthenticatedUser:
        if user.role not in role_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of {sorted(role_set)}, got '{user.role}'",
            )
        return user

    _enforce.__name__ = "require_any_role_" + "_".join(sorted(role_set))
    return _enforce


CreatorOnly = Annotated[AuthenticatedUser, Depends(require_role("creator"))]
ApproverAOnly = Annotated[AuthenticatedUser, Depends(require_role("approver_a"))]
ApproverBOnly = Annotated[AuthenticatedUser, Depends(require_role("approver_b"))]
AnyApprover = Annotated[AuthenticatedUser, Depends(require_any_role("approver_a", "approver_b"))]
AnyAuthenticated = Annotated[
    AuthenticatedUser,
    Depends(require_any_role("creator", "approver_a", "approver_b")),
]
