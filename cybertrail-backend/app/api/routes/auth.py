"""
app/api/routes/auth.py
───────────────────────
Authentication endpoints: login, refresh, user CRUD.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from loguru import logger

from app.core.auth import get_current_user, require_admin, require_supervisor
from app.services.auth_service import auth_service, create_access_token, create_refresh_token, decode_token
from app.services.audit_service import audit_service
from app.models.auth import (
    LoginRequest, TokenResponse, UserCreate, UserUpdate,
    UserResponse, UserRole, UserInDB
)

router = APIRouter()


# ── Login ─────────────────────────────────────────────────
MAX_ATTEMPTS = 10      # lock after this many failures
LOCKOUT_TTL  = 15 * 60  # 15 minutes in seconds

@router.post("/login", response_model=TokenResponse, tags=["Auth"])
async def login(request: Request, data: LoginRequest):
    """
    Login with username and password.
    Brute-force protected: locked for 15 min after 10 failed attempts per IP.
    """
    from app.core.cache import cache_manager

    ip = request.client.host if request.client else "unknown"
    lock_key  = f"login:lock:{ip}"
    count_key = f"login:attempts:{ip}"

    # ── Check lockout ──────────────────────────────────
    if cache_manager._redis:
        locked = await cache_manager._redis.get(lock_key)
        if locked:
            ttl = await cache_manager._redis.ttl(lock_key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Account locked for {ttl // 60}m {ttl % 60}s. Try again later.",
            )

    user = await auth_service.authenticate(data.username, data.password)

    if not user:
        # ── Increment failure counter ──────────────────
        if cache_manager._redis:
            attempts = await cache_manager._redis.incr(count_key)
            await cache_manager._redis.expire(count_key, LOCKOUT_TTL)
            if attempts >= MAX_ATTEMPTS:
                await cache_manager._redis.setex(lock_key, LOCKOUT_TTL, "1")
                await cache_manager._redis.delete(count_key)
                logger.warning(f"IP {ip} locked out after {MAX_ATTEMPTS} failed login attempts")

        # ── Audit failed login ─────────────────────────
        await audit_service.log(
            action="login_failed",
            entity_type="user",
            entity_id=data.username,
            officer_username=data.username,
            officer_badge="unknown",
            officer_role="unknown",
            ip_address=ip,
            description=f"FAILED LOGIN attempt for username: {data.username} from {ip}",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # ── Success: clear failure counter ────────────────
    if cache_manager._redis:
        await cache_manager._redis.delete(count_key)

    access  = create_access_token(user)
    refresh = create_refresh_token(user)
    user_resp = auth_service._user_to_response(user)

    # ── Audit successful login ─────────────────────────
    await audit_service.log(
        action="login",
        entity_type="user",
        entity_id=user.id,
        officer_username=user.username,
        officer_badge=user.badge_id,
        officer_role=user.role.value,
        ip_address=ip,
        description=f"Login: {user.username} ({user.role.value}) from {ip}",
    )
    logger.info(f"Login: {user.username} ({user.role.value})")

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=user_resp,
    )


# ── Refresh token ─────────────────────────────────────────
@router.post("/refresh", response_model=TokenResponse, tags=["Auth"])
async def refresh_token(body: dict):
    """Exchange refresh token for new access token."""
    token = body.get("refresh_token", "")
    data  = decode_token(token)
    if not data or not data.username:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await auth_service.get_user_by_username(data.username)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
        user=auth_service._user_to_response(user),
    )


# ── Current user ──────────────────────────────────────────
@router.get("/me", response_model=UserResponse, tags=["Auth"])
async def get_me(current_user: UserInDB = Depends(get_current_user)):
    """Returns current logged-in user details."""
    return auth_service._user_to_response(current_user)


@router.put("/me/password", tags=["Auth"])
async def change_password(body: dict, current_user: UserInDB = Depends(get_current_user)):
    """Change your own password. Forces re-login after success."""
    from app.services.auth_service import verify_password, hash_password
    from app.core.database import db_manager

    old_pwd = body.get("old_password", "")
    new_pwd = body.get("new_password", "")

    if not verify_password(old_pwd, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(new_pwd) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    async with db_manager.session() as s:
        # Increment token_version → this token is now invalid, user must re-login
        await s.run(
            """MATCH (u:User {id: $id})
               SET u.hashed_password = $pwd,
                   u.token_version   = coalesce(u.token_version, 0) + 1,
                   u.updated_at      = datetime()""",
            id=current_user.id, pwd=hash_password(new_pwd)
        )
    return {"message": "Password changed successfully. Please log in again with your new password."}


# ── User management (Admin only) ──────────────────────────
@router.get("/users", response_model=list[UserResponse], tags=["User Management"])
async def list_users(current_user: UserInDB = Depends(require_supervisor)):
    """List all users. Supervisor and Admin only."""
    return await auth_service.get_all_users()


@router.post("/users", response_model=UserResponse, status_code=201, tags=["User Management"])
async def create_user(
    data: UserCreate,
    current_user: UserInDB = Depends(require_admin)
):
    """Create a new user. Admin only."""
    try:
        result = await auth_service.create_user(data, created_by=current_user.username)
        await audit_service.log(
            action="create", entity_type="user",
            entity_id=data.username,
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            description=f"Officer account created: {data.username} ({data.role.value})",
            after={"username": data.username, "role": data.role.value, "badge_id": data.badge_id}
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/users/{user_id}", response_model=UserResponse, tags=["User Management"])
async def get_user(user_id: str, current_user: UserInDB = Depends(require_supervisor)):
    """Get a specific user by ID. Supervisor and Admin only."""
    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return auth_service._user_to_response(user)


@router.put("/users/{user_id}", response_model=UserResponse, tags=["User Management"])
async def update_user(
    user_id: str,
    data: UserUpdate,
    current_user: UserInDB = Depends(require_admin)
):
    """Update user details. Admin only."""
    target = await auth_service.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Protect system admin — cannot change role, status, or badge ID
    if target.username == "admin":
        if data.role is not None or data.is_active is False or data.badge_id is not None:
            raise HTTPException(
                status_code=403,
                detail="System admin role, status and badge ID cannot be changed"
            )
    result = await auth_service.update_user(user_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.delete("/users/{user_id}", tags=["User Management"])
async def delete_user(
    user_id: str,
    current_user: UserInDB = Depends(require_admin)
):
    """Delete a user. Admin only. Cannot delete yourself or the system admin."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Find the user being deleted
    target = await auth_service.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Protect system admin from deletion by anyone
    if target.username == "admin":
        raise HTTPException(status_code=403, detail="System admin account cannot be deleted")
    deleted = await auth_service.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    await audit_service.log(
        action="delete", entity_type="user",
        entity_id=user_id,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        description=f"Officer account DELETED: {user_id} by {current_user.username}",
    )
    return {"message": "User deleted"}


@router.put("/users/{user_id}/reset-password", tags=["User Management"])
async def admin_reset_password(
    request: Request,
    user_id: str,
    body: dict,
    current_user: UserInDB = Depends(require_admin)
):
    """
    Admin resets any user's password.
    Also increments token_version → forces immediate logout of that user.
    """
    from app.services.auth_service import hash_password
    from app.core.database import db_manager

    new_pwd = body.get("new_password", "")
    if len(new_pwd) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    async with db_manager.session() as s:
        # Reset password AND increment token_version → invalidates all active sessions
        await s.run(
            """MATCH (u:User {id: $id})
               SET u.hashed_password  = $pwd,
                   u.token_version    = coalesce(u.token_version, 0) + 1,
                   u.updated_at       = datetime()""",
            id=user_id, pwd=hash_password(new_pwd)
        )

    # Audit log
    await audit_service.log(
        action="update", entity_type="user",
        entity_id=user_id,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Password reset for {user.username} by admin {current_user.username} — session invalidated",
    )
    return {"message": f"Password reset for {user.username}. Their active session has been invalidated."}