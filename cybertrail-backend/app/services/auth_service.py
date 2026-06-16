"""
app/services/auth_service.py
─────────────────────────────
JWT authentication, password hashing, and user CRUD via Neo4j.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from loguru import logger

from app.core.database import db_manager
from app.core.config import settings
from app.models.auth import UserCreate, UserUpdate, UserInDB, UserResponse, TokenData, UserRole

# ── Config (loaded from .env via settings) ────────────────
SECRET_KEY     = settings.JWT_SECRET_KEY
ALGORITHM      = "HS256"
ACCESS_EXPIRE  = settings.JWT_ACCESS_EXPIRE_MINUTES
REFRESH_EXPIRE = settings.JWT_REFRESH_EXPIRE_MINUTES


# ── Password helpers (direct bcrypt — no passlib) ─────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


# ── JWT helpers ───────────────────────────────────────────
def create_token(data: dict, expires_minutes: int) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_access_token(user: UserInDB) -> str:
    return create_token(
        {"sub": user.username, "uid": user.id, "role": user.role.value, "tv": user.token_version},
        ACCESS_EXPIRE
    )

def create_refresh_token(user: UserInDB) -> str:
    return create_token(
        {"sub": user.username, "uid": user.id, "type": "refresh"},
        REFRESH_EXPIRE
    )

def decode_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return TokenData(
            username=payload.get("sub"),
            user_id=payload.get("uid"),
            role=payload.get("role"),
            token_version=payload.get("tv", 0),
        )
    except JWTError:
        return None


# ── User CRUD ─────────────────────────────────────────────
class AuthService:

    async def get_user_by_username(self, username: str) -> Optional[UserInDB]:
        async with db_manager.session() as s:
            result = await s.run(
                "MATCH (u:User {username: $username}) RETURN u",
                username=username.lower()
            )
            rec = await result.single()
            if not rec:
                return None
            return self._node_to_user(rec["u"])

    async def get_user_by_id(self, user_id: str) -> Optional[UserInDB]:
        async with db_manager.session() as s:
            result = await s.run(
                "MATCH (u:User {id: $id}) RETURN u", id=user_id
            )
            rec = await result.single()
            if not rec:
                return None
            return self._node_to_user(rec["u"])

    async def get_all_users(self) -> list[UserResponse]:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (u:User)
                OPTIONAL MATCH (u)-[:CREATED]->(c:Case)
                RETURN u, count(c) AS case_count
                ORDER BY u.created_at DESC
            """)
            users = []
            async for rec in result:
                user = self._node_to_user(rec["u"])
                resp = self._user_to_response(user)
                resp.case_count = rec["case_count"]
                users.append(resp)
            return users

    async def create_user(self, data: UserCreate, created_by: Optional[str] = None) -> UserResponse:
        # Check username exists
        existing = await self.get_user_by_username(data.username)
        if existing:
            raise ValueError(f"Username '{data.username}' already exists")

        user_id = str(uuid.uuid4())
        now     = datetime.now(timezone.utc).isoformat()

        async with db_manager.session() as s:
            await s.run("""
                CREATE (u:User {
                    id:              $id,
                    username:        $username,
                    full_name:       $full_name,
                    badge_id:        $badge_id,
                    department:      $department,
                    designation:     $designation,
                    role:            $role,
                    is_active:       true,
                    email:           $email,
                    hashed_password: $hashed_password,
                    created_at:      $created_at,
                    last_login:      null,
                    created_by:      $created_by
                })
            """,
            id=user_id, username=data.username.lower(),
            full_name=data.full_name, badge_id=data.badge_id,
            department=data.department, designation=data.designation,
            role=data.role.value, email=data.email or "",
            hashed_password=hash_password(data.password),
            created_at=now, created_by=created_by or "system"
            )

        logger.info(f"User created: {data.username} role={data.role.value}")
        user = await self.get_user_by_username(data.username)
        return self._user_to_response(user)

    ROLE_HIERARCHY = {"admin": 4, "supervisor": 3, "officer": 2, "analyst": 1}

    async def update_user(self, user_id: str, data: UserUpdate) -> Optional[UserResponse]:
        # Get current user state before update
        current = await self.get_user_by_id(user_id)
        if not current:
            return None

        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            return None
        if "role" in updates:
            updates["role"] = updates["role"].value

        # ── Force logout if role downgraded or account disabled ──────
        should_invalidate = False

        if "role" in updates:
            old_level = self.ROLE_HIERARCHY.get(current.role.value, 0)
            new_level = self.ROLE_HIERARCHY.get(updates["role"], 0)
            if new_level < old_level:
                should_invalidate = True
                logger.info(f"Role downgraded for {current.username}: {current.role.value} → {updates['role']} — invalidating session")

        if updates.get("is_active") is False:
            should_invalidate = True
            logger.info(f"Account disabled for {current.username} — invalidating session")

        if should_invalidate:
            # Increment token_version — existing JWTs with old version will be rejected
            updates["token_version"] = (getattr(current, 'token_version', 0) or 0) + 1

        set_clause = ", ".join(f"u.{k} = ${k}" for k in updates)
        async with db_manager.session() as s:
            await s.run(
                f"MATCH (u:User {{id: $id}}) SET {set_clause}",
                id=user_id, **updates
            )
        user = await self.get_user_by_id(user_id)
        return self._user_to_response(user) if user else None

    async def delete_user(self, user_id: str) -> bool:
        async with db_manager.session() as s:
            result = await s.run(
                "MATCH (u:User {id: $id}) DETACH DELETE u RETURN count(u) AS deleted",
                id=user_id
            )
            rec = await result.single()
            return rec and rec["deleted"] > 0

    async def authenticate(self, username: str, password: str) -> Optional[UserInDB]:
        user = await self.get_user_by_username(username)
        if not user or not user.is_active:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        # Update last login
        async with db_manager.session() as s:
            await s.run(
                "MATCH (u:User {id: $id}) SET u.last_login = $now",
                id=user.id, now=datetime.now(timezone.utc).isoformat()
            )
        return user

    async def ensure_admin_exists(self):
        """Creates default admin if no users exist."""
        async with db_manager.session() as s:
            result = await s.run("MATCH (u:User) RETURN count(u) AS cnt")
            rec = await result.single()
            if rec and rec["cnt"] == 0:
                await self.create_user(UserCreate(
                    username="admin",
                    password="Admin@123",
                    full_name="System Administrator",
                    badge_id="ADMIN-001",
                    department="Cybercrime Division",
                    designation="Administrator",
                    role=UserRole.ADMIN,
                ), created_by="system")
                logger.info("Default admin created: admin / Admin@123")

    def _node_to_user(self, node) -> UserInDB:
        d = dict(node)
        return UserInDB(
            id=d["id"], username=d["username"], full_name=d["full_name"],
            badge_id=d["badge_id"], department=d["department"],
            designation=d["designation"], role=UserRole(d["role"]),
            is_active=bool(d.get("is_active", True)),
            email=d.get("email") or None,
            hashed_password=d["hashed_password"],
            created_at=datetime.fromisoformat(d["created_at"]),
            last_login=datetime.fromisoformat(d["last_login"]) if d.get("last_login") else None,
            created_by=d.get("created_by"),
            token_version=int(d.get("token_version", 0) or 0),
        )

    def _user_to_response(self, user: UserInDB) -> UserResponse:
        return UserResponse(
            id=user.id, username=user.username, full_name=user.full_name,
            badge_id=user.badge_id, department=user.department,
            designation=user.designation, role=user.role,
            is_active=user.is_active, email=user.email,
            created_at=user.created_at, last_login=user.last_login,
        )


auth_service = AuthService()