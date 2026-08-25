from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from .db import Base


# =========================================================
# USER
# =========================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(30),
        default="user",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    reports = relationship(
        "Report",
        back_populates="user",
    )

    community_posts = relationship(
        "CommunityPost",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    community_comments = relationship(
        "CommunityComment",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    favorites = relationship(
        "FavoriteStation",
        back_populates="user",
        cascade="all, delete-orphan",
    )


# =========================================================
# STATION
# =========================================================

class Station(Base):
    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    operator_name: Mapped[str] = mapped_column(
        String(255),
        default="Unknown",
        nullable=False,
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    address: Mapped[str] = mapped_column(
        String(500),
        default="",
        nullable=False,
    )

    connector_type: Mapped[str] = mapped_column(
        String(100),
        default="CCS2",
        nullable=False,
    )

    power_kw: Mapped[float] = mapped_column(
        Float,
        default=60,
        nullable=False,
    )

    price_per_kwh: Mapped[float] = mapped_column(
        Float,
        default=0,
        nullable=False,
    )

    confidence_score: Mapped[float] = mapped_column(
        Float,
        default=50,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="unknown",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    last_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    reports = relationship(
        "Report",
        back_populates="station",
    )

    community_posts = relationship(
        "CommunityPost",
        back_populates="station",
    )

    favorites = relationship(
        "FavoriteStation",
        back_populates="station",
        cascade="all, delete-orphan",
    )


# =========================================================
# USER REPORT
# =========================================================

class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    station_id: Mapped[int] = mapped_column(
        ForeignKey("stations.id"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    report_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    comment: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    station = relationship(
        "Station",
        back_populates="reports",
    )

    user = relationship(
        "User",
        back_populates="reports",
    )


# =========================================================
# FAVORITE / SAVED STATION
# =========================================================

class FavoriteStation(Base):
    __tablename__ = "favorite_stations"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "station_id",
            name="uq_favorite_user_station",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    station_id: Mapped[int] = mapped_column(
        ForeignKey("stations.id"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="favorites",
    )

    station = relationship(
        "Station",
        back_populates="favorites",
    )


# =========================================================
# COMMUNITY POST
# =========================================================

class CommunityPost(Base):
    __tablename__ = "community_posts"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    station_id: Mapped[int | None] = mapped_column(
        ForeignKey("stations.id"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    category: Mapped[str] = mapped_column(
        String(50),
        default="general",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    is_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="community_posts",
    )

    station = relationship(
        "Station",
        back_populates="community_posts",
    )

    comments = relationship(
        "CommunityComment",
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="CommunityComment.created_at.asc()",
    )


# =========================================================
# COMMUNITY COMMENT
# =========================================================

class CommunityComment(Base):
    __tablename__ = "community_comments"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    post_id: Mapped[int] = mapped_column(
        ForeignKey(
            "community_posts.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    post = relationship(
        "CommunityPost",
        back_populates="comments",
    )

    user = relationship(
        "User",
        back_populates="community_comments",
    )

    # ---------------------------------------------------------
# EMAIL VERIFICATION CODE
# ---------------------------------------------------------

class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        index=True,
        nullable=False,
    )

    code_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )