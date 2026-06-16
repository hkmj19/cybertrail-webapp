"""
app/core/auth.py
─────────────────
FastAPI dependency functions for JWT authentication.
Use as: current_user = Depends(get_current_user)
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.services.auth_service import auth_service, decode_token
from app.models.auth import UserInDB, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
) -> UserInDB:
    """Validates JWT and returns current user. Raises 401 if invalid."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated - please login",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = decode_token(credentials.credentials)
    if not token_data or not token_data.username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token - please login again",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await auth_service.get_user_by_username(token_data.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # ── Account disabled → force logout ─────────────────
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account has been disabled - contact your administrator",
        )

    # ── Token version mismatch → role was downgraded or account disabled ──
    if token_data.token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalidated - your access level was changed, please login again",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_roles(*roles: UserRole):
    """Returns a dependency that enforces role-based access."""
    async def checker(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied - requires role: {[r.value for r in roles]}",
            )
        return current_user
    return checker


# ── Convenience role deps ─────────────────────────────────
require_admin      = require_roles(UserRole.ADMIN)
require_supervisor = require_roles(UserRole.ADMIN, UserRole.SUPERVISOR)
require_officer    = require_roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OFFICER)
# analyst = read-only, handled per-route