from datetime import datetime

from pydantic import (
    BaseModel, EmailStr,
    ConfigDict,
    Field,
)


# =========================================================
# AUTHENTICATION
# =========================================================

class LoginRequest(BaseModel):

    # We intentionally use str instead of EmailStr
    # because ChargeLens has an internal development
    # account such as:
    #
    # owner@chargelens.local
    #
    # Normal emails such as Gmail still work.

    email: str

    password: str


class RegisterRequest(BaseModel):

    email: str

    password: str = Field(
        min_length=8,
        max_length=128,
    )


class TokenResponse(BaseModel):

    access_token: str

    token_type: str = "bearer"

# =========================================================
# EMAIL VERIFICATION
# =========================================================

class RequestVerificationCodeRequest(BaseModel):
    email: EmailStr


class VerifyVerificationCodeRequest(BaseModel):
    email: EmailStr
    code: str


class RegisterVerifiedRequest(BaseModel):
    email: EmailStr
    password: str
    verification_token: str

# =========================================================
# STATION
# =========================================================

class StationOut(BaseModel):

    model_config = ConfigDict(
        from_attributes=True
    )

    id: int

    name: str

    operator_name: str

    latitude: float

    longitude: float

    address: str

    connector_type: str

    power_kw: float

    price_per_kwh: float

    confidence_score: float

    status: str

    is_active: bool

    last_verified_at: datetime | None = None

    created_at: datetime | None = None


# =========================================================
# ADMIN — CREATE STATION
# =========================================================

class StationCreate(BaseModel):

    name: str = Field(
        min_length=1,
        max_length=255,
    )

    operator_name: str = Field(
        min_length=1,
        max_length=255,
    )

    latitude: float

    longitude: float

    address: str = Field(
        default="",
        max_length=500,
    )

    connector_type: str = Field(
        default="CCS2",
        max_length=100,
    )

    power_kw: float = Field(
        default=60,
        ge=0,
    )

    price_per_kwh: float = Field(
        default=0,
        ge=0,
    )

    status: str = Field(
        default="unknown",
        max_length=50,
    )

    is_active: bool = True


# =========================================================
# ADMIN — UPDATE STATION
# =========================================================

class StationUpdate(BaseModel):

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    operator_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    latitude: float | None = None

    longitude: float | None = None

    address: str | None = Field(
        default=None,
        max_length=500,
    )

    connector_type: str | None = Field(
        default=None,
        max_length=100,
    )

    power_kw: float | None = Field(
        default=None,
        ge=0,
    )

    price_per_kwh: float | None = Field(
        default=None,
        ge=0,
    )

    status: str | None = Field(
        default=None,
        max_length=50,
    )

    is_active: bool | None = None


# =========================================================
# USER REPORT
# =========================================================

class ReportCreate(BaseModel):

    station_id: int

    report_type: str = Field(
        min_length=1,
        max_length=100,
    )

    comment: str | None = Field(
        default=None,
        max_length=2000,
    )

    # Current driver GPS position.
    latitude: float

    longitude: float


# =========================================================
# ADMIN DASHBOARD
# =========================================================

class AdminStats(BaseModel):

    total_stations: int

    active_stations: int

    average_confidence: float

    reports_today: int