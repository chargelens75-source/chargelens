from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User


# =========================================================
# SECURITY CONFIGURATION
# =========================================================

ALGORITHM = "HS256"

password_hash = PasswordHash.recommended()

bearer_scheme = HTTPBearer(
    auto_error=False
)


# =========================================================
# PASSWORD HASHING
# =========================================================

def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    password: str,
    hashed_password: str,
) -> bool:
    return password_hash.verify(
        password,
        hashed_password,
    )


# =========================================================
# CREATE JWT ACCESS TOKEN
# =========================================================

def create_access_token(user: User) -> str:
    expire = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=settings.jwt_expire_minutes
        )
    )

    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "exp": expire,
    }

    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=ALGORITHM,
    )


# =========================================================
# GET CURRENT USER
# =========================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
    db: Session = Depends(get_db),
) -> User:

    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    try:

        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[ALGORITHM],
        )

        user_id_raw = payload.get("sub")

        if user_id_raw is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token",
            )

        user_id = int(user_id_raw)

    except HTTPException:
        raise

    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token",
        )

    user = db.scalar(
        select(User).where(
            User.id == user_id
        )
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="User account is inactive",
        )

    return user

# =========================================================
# ADMIN / OWNER ACCESS
# =========================================================

def require_admin(
    user: User = Depends(get_current_user),
) -> User:

    if user.role not in {
        "owner",
        "admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )

    return user


# =========================================================
# OWNER-ONLY ACCESS
# =========================================================

def require_owner(
    user: User = Depends(get_current_user),
) -> User:

    if user.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Owner access required",
        )

    return user