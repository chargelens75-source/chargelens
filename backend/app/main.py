import hmac

from jose import jwt

import math

from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Query,
    status,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .services.confidence import (
    calculate_confidence,
    get_station_reports,
)

from .integrations.openchargemap import (
    OpenChargeMapError,
    import_nearby_stations,
)
from .config import settings

from .db import (
    Base,
    engine,
    get_db,
)
from .models import (
    CommunityComment,
    CommunityPost,
    EmailVerification,
    FavoriteStation,
    Report,
    Station,
    User,
)

from .schemas import (
    AdminStats,
    LoginRequest,
    RegisterRequest,
    ReportCreate,
    StationCreate,
    StationOut,
    StationUpdate,
    TokenResponse,
    RequestVerificationCodeRequest,
    VerifyVerificationCodeRequest,
    RegisterVerifiedRequest,
)

from .security import (
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    require_owner,
    verify_password,
)

from .services.email_verification import (
    code_expiry,
    generate_verification_code,
    hash_verification_code,
    send_verification_email,
)


# =========================================================
# PATHS
# =========================================================

BASE_DIR = (
    Path(__file__)
    .resolve()
    .parents[2]
)

FRONTEND = (
    BASE_DIR / "frontend"
)


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="ChargeLens API",
    description=(
        "EV Charging Reliability "
        "Intelligence Platform"
    ),
    version="0.1.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,

allow_origins=[
    origin.strip()
    for origin in settings.cors_origins.split(",")
    if origin.strip()
],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# =========================================================
# DATABASE
# =========================================================

Base.metadata.create_all(
    bind=engine
)


# =========================================================
# REPORT LOCATION SECURITY
# =========================================================

# A driver must be within this distance
# of a station to submit a report.

REPORT_RADIUS_METERS = 500


# =========================================================
# REPORT ANTI-SPAM SETTINGS
# =========================================================

# Same user cannot report the same station
# more than once during this cooldown.

REPORT_COOLDOWN_SECONDS = 5 * 60


# Maximum number of reports that one user can
# submit for the same station in one UTC day.

SAME_STATION_DAILY_LIMIT = 3


# Maximum total reports from one user
# during one UTC day.

DAILY_REPORT_LIMIT = 20


def distance_in_meters(
    latitude_1: float,
    longitude_1: float,
    latitude_2: float,
    longitude_2: float,
) -> float:

    """
    Calculate approximate distance between
    two latitude/longitude points using
    the Haversine formula.
    """

    earth_radius = 6_371_000

    lat1 = math.radians(
        latitude_1
    )

    lat2 = math.radians(
        latitude_2
    )

    delta_lat = math.radians(
        latitude_2 - latitude_1
    )

    delta_lon = math.radians(
        longitude_2 - longitude_1
    )

    a = (
        math.sin(
            delta_lat / 2
        )
        ** 2
        +
        math.cos(lat1)
        *
        math.cos(lat2)
        *
        math.sin(
            delta_lon / 2
        )
        ** 2
    )

    c = (
        2
        *
        math.atan2(
            math.sqrt(a),
            math.sqrt(1 - a),
        )
    )

    return (
        earth_radius * c
    )


# =========================================================
# PUBLIC FRONTEND
# =========================================================

@app.get(
    "/",
    include_in_schema=False,
)
def home():

    return FileResponse(
        FRONTEND / "index.html"
    )


@app.get(
    "/admin/",
    include_in_schema=False,
)
def admin_page():

    return FileResponse(
        FRONTEND
        / "admin"
        / "index.html"
    )


# =========================================================
# FRONTEND ASSETS
# =========================================================

@app.get(
    "/assets/{filename}",
    include_in_schema=False,
)
def assets(
    filename: str,
):

    return FileResponse(
        FRONTEND
        / "assets"
        / filename
    )


@app.get(
    "/app.css",
    include_in_schema=False,
)
def css():

    return FileResponse(
        FRONTEND / "app.css"
    )


@app.get(
    "/app.js",
    include_in_schema=False,
)
def js():

    return FileResponse(
        FRONTEND / "app.js"
    )


@app.get(
    "/admin/admin.css",
    include_in_schema=False,
)
def admin_css():

    return FileResponse(
        FRONTEND
        / "admin"
        / "admin.css"
    )


@app.get(
    "/admin/admin.js",
    include_in_schema=False,
)
def admin_js():

    return FileResponse(
        FRONTEND
        / "admin"
        / "admin.js"
    )


@app.get(
    "/admin/admin-community.js",
    include_in_schema=False,
)
def admin_community_js():

    return FileResponse(
        FRONTEND
        / "admin"
        / "admin-community.js"
    )


# =========================================================
# AUTHENTICATION — REGISTER
# =========================================================

# =========================================================
# EMAIL VERIFICATION — REQUEST CODE
# =========================================================

@app.post(
    "/api/auth/request-code"
)
def request_verification_code(
    payload: RequestVerificationCodeRequest,
    db: Session = Depends(get_db),
):
    email = (
        payload.email
        .lower()
        .strip()
    )

    # -----------------------------------------------------
    # CHECK WHETHER ACCOUNT ALREADY EXISTS
    # -----------------------------------------------------

    existing_user = db.scalar(
        select(User).where(
            User.email == email
        )
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail=(
                "An account with this email "
                "already exists. Please sign in."
            ),
        )

    # -----------------------------------------------------
    # GENERATE CODE
    # -----------------------------------------------------

    code = generate_verification_code()

    code_hash = hash_verification_code(
        email,
        code,
    )

    expires_at = code_expiry()

    # -----------------------------------------------------
    # REMOVE PREVIOUS CODES
    # -----------------------------------------------------

    old_codes = db.scalars(
        select(EmailVerification).where(
            EmailVerification.email == email
        )
    ).all()

    for old_code in old_codes:
        db.delete(old_code)

    # -----------------------------------------------------
    # SAVE NEW CODE
    # -----------------------------------------------------

    verification = EmailVerification(
        email=email,
        code_hash=code_hash,
        expires_at=expires_at,
        attempts=0,
    )

    db.add(
        verification
    )

    db.commit()

    # -----------------------------------------------------
    # SEND EMAIL
    # -----------------------------------------------------

    try:

        send_verification_email(
            email,
            code,
        )

    except Exception as error:

        db.delete(
            verification
        )

        db.commit()

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to send verification email "
                "right now. Please try again."
            ),
        ) from error

    return {
        "message": (
            "Verification code sent "
            "to your email."
        )
    }


# =========================================================
# EMAIL VERIFICATION — VERIFY CODE
# =========================================================

@app.post(
    "/api/auth/verify-code"
)
def verify_verification_code(
    payload: VerifyVerificationCodeRequest,
    db: Session = Depends(get_db),
):
    email = (
        payload.email
        .lower()
        .strip()
    )

    code = (
        payload.code
        .strip()
    )

    # -----------------------------------------------------
    # VALIDATE CODE FORMAT
    # -----------------------------------------------------

    if (
        len(code) != 6
        or not code.isdigit()
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Verification code must "
                "contain 6 digits."
            ),
        )

    # -----------------------------------------------------
    # FIND LATEST VERIFICATION RECORD
    # -----------------------------------------------------

    verification = db.scalar(
        select(EmailVerification)
        .where(
            EmailVerification.email == email
        )
        .order_by(
            EmailVerification.created_at.desc()
        )
    )

    if verification is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Verification code not found. "
                "Please request a new code."
            ),
        )

    # -----------------------------------------------------
    # CURRENT UTC TIME
    # -----------------------------------------------------

    now = datetime.now(
        timezone.utc
    )

    # SQLite may return a naive datetime even though
    # the SQLAlchemy column is timezone-aware.
    expires_at = verification.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    # -----------------------------------------------------
    # EXPIRY CHECK
    # -----------------------------------------------------

    if expires_at <= now:

        db.delete(
            verification
        )

        db.commit()

        raise HTTPException(
            status_code=400,
            detail=(
                "Verification code has expired. "
                "Please request a new code."
            ),
        )

    # -----------------------------------------------------
    # ATTEMPT LIMIT
    # -----------------------------------------------------

    if verification.attempts >= 5:

        db.delete(
            verification
        )

        db.commit()

        raise HTTPException(
            status_code=429,
            detail=(
                "Too many incorrect attempts. "
                "Please request a new code."
            ),
        )

    # -----------------------------------------------------
    # HASH ENTERED CODE
    # -----------------------------------------------------

    expected_hash = hash_verification_code(
        email,
        code,
    )

    # -----------------------------------------------------
    # COMPARE CODE
    # -----------------------------------------------------

    if not hmac.compare_digest(
        verification.code_hash,
        expected_hash,
    ):

        verification.attempts += 1

        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Incorrect verification code.",
        )

    # -----------------------------------------------------
    # CREATE VERIFICATION TOKEN
    # -----------------------------------------------------

    verification_token = jwt.encode(
        {
            "type": "email_verification",
            "email": email,
            "exp": (
                datetime.now(
                    timezone.utc
                )
                + timedelta(
                    minutes=15
                )
            ),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )

    # -----------------------------------------------------
    # CODE USED SUCCESSFULLY
    # -----------------------------------------------------

    db.delete(
        verification
    )

    db.commit()

    return {
        "message":
            "Email verified successfully.",

        "verification_token":
            verification_token,
    }

# =========================================================
# REGISTER VERIFIED USER
# =========================================================

@app.post(
    "/api/auth/register-verified",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_verified_user(
    payload: RegisterVerifiedRequest,
    db: Session = Depends(get_db),
):
    email = (
        payload.email
        .lower()
        .strip()
    )

    password = payload.password

    # -----------------------------------------------------
    # PASSWORD VALIDATION
    # -----------------------------------------------------

    if len(password) < 8:

        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least "
                "8 characters long."
            ),
        )

    # -----------------------------------------------------
    # VERIFY TOKEN
    # -----------------------------------------------------

    try:

        verification_payload = jwt.decode(
            payload.verification_token,
            settings.jwt_secret,
            algorithms=["HS256"],
        )

        if (
            verification_payload.get("type")
            != "email_verification"
        ):

            raise HTTPException(
                status_code=401,
                detail=(
                    "Invalid verification token."
                ),
            )

        verified_email = (
            verification_payload.get(
                "email"
            )
        )

        if verified_email != email:

            raise HTTPException(
                status_code=401,
                detail=(
                    "Verification email does not match."
                ),
            )

    except HTTPException:
        raise

    except Exception as error:

        raise HTTPException(
            status_code=401,
            detail=(
                "Verification token is invalid "
                "or expired."
            ),
        ) from error

    # -----------------------------------------------------
    # CHECK EXISTING USER
    # -----------------------------------------------------

    existing_user = db.scalar(
        select(User).where(
            User.email == email
        )
    )

    if existing_user:

        raise HTTPException(
            status_code=409,
            detail=(
                "An account with this email "
                "already exists."
            ),
        )

    # -----------------------------------------------------
    # CREATE VERIFIED USER
    # -----------------------------------------------------

    new_user = User(
        email=email,
        password_hash=hash_password(
            password
        ),
        role="user",
        is_active=True,
    )

    db.add(
        new_user
    )

    db.commit()

    db.refresh(
        new_user
    )

    # -----------------------------------------------------
    # AUTOMATIC LOGIN
    # -----------------------------------------------------

    access_token = create_access_token(
        new_user
    )

    return TokenResponse(
        access_token=access_token
    )


@app.post(
    "/api/auth/register",
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
):

    email = (
        payload.email
        .lower()
        .strip()
    )

    password = payload.password


    if len(password) < 8:

        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least "
                "8 characters long."
            ),
        )


    existing_user = db.scalar(
        select(User).where(
            User.email == email
        )
    )


    if existing_user:

        raise HTTPException(
            status_code=409,
            detail=(
                "An account with this email "
                "already exists."
            ),
        )


    new_user = User(
        email=email,

        password_hash=
            hash_password(
                password
            ),

        role="user",

        is_active=True,
    )


    db.add(
        new_user
    )

    db.commit()

    db.refresh(
        new_user
    )


    return {

        "message":
            "Account created successfully.",

        "user": {

            "id":
                new_user.id,

            "email":
                new_user.email,

            "role":
                new_user.role,

        },

    }


# =========================================================
# AUTHENTICATION — LOGIN
# =========================================================

@app.post(
    "/api/auth/login",
    response_model=TokenResponse,
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):

    email = (
        payload.email
        .lower()
        .strip()
    )


    user = db.scalar(
        select(User).where(
            User.email == email
        )
    )


    if not user:

        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid email or password."
            ),
        )


    if not user.is_active:

        raise HTTPException(
            status_code=403,
            detail=(
                "This account is inactive."
            ),
        )


    if not verify_password(
        payload.password,
        user.password_hash,
    ):

        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid email or password."
            ),
        )


    access_token = (
        create_access_token(
            user
        )
    )


    return TokenResponse(
        access_token=access_token
    )


# =========================================================
# CURRENT USER
# =========================================================

@app.get(
    "/api/me"
)
def me(
    user: User = Depends(
        get_current_user
    ),
):

    return {

        "id":
            user.id,

        "email":
            user.email,

        "role":
            user.role,

    }

# =========================================================
# CURRENT USER — ACTIVITY
# =========================================================

@app.get("/api/me/activity")
def my_activity(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    report_count = (
        db.scalar(
            select(
                func.count(Report.id)
            ).where(
                Report.user_id == user.id
            )
        )
        or 0
    )

    saved_count = (
        db.scalar(
            select(
                func.count(FavoriteStation.id)
            ).where(
                FavoriteStation.user_id == user.id
            )
        )
        or 0
    )

    post_count = (
        db.scalar(
            select(
                func.count(CommunityPost.id)
            ).where(
                CommunityPost.user_id == user.id
            )
        )
        or 0
    )

    comment_count = (
        db.scalar(
            select(
                func.count(
                    CommunityComment.id
                )
            ).where(
                CommunityComment.user_id == user.id
            )
        )
        or 0
    )

    return {
        "reports": int(report_count),
        "saved_stations": int(saved_count),
        "community_posts": int(post_count),
        "community_comments": int(comment_count),
        "community_activity": int(
            post_count + comment_count
        ),
    }

# =========================================================
# FAVORITES — SAVE STATION
# =========================================================

@app.post(
    "/api/favorites/{station_id}"
)
def add_favorite_station(
    station_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        get_current_user
    ),
):

    # -----------------------------------------------------
    # FIND STATION
    # -----------------------------------------------------

    station = db.get(
        Station,
        station_id,
    )


    if station is None:

        raise HTTPException(
            status_code=404,
            detail="Charging station not found.",
        )


    if not station.is_active:

        raise HTTPException(
            status_code=400,
            detail="This charging station is not currently available.",
        )


    # -----------------------------------------------------
    # CHECK EXISTING FAVORITE
    # -----------------------------------------------------

    existing = db.scalar(

        select(
            FavoriteStation
        )

        .where(

            FavoriteStation.user_id
            ==
            user.id,

            FavoriteStation.station_id
            ==
            station.id,

        )

    )


    if existing:

        return {

            "message":
                "Station is already saved.",

            "saved":
                True,

            "station_id":
                station.id,

        }


    # -----------------------------------------------------
    # CREATE FAVORITE
    # -----------------------------------------------------

    favorite = FavoriteStation(

        user_id=
            user.id,

        station_id=
            station.id,

    )


    db.add(
        favorite
    )

    db.commit()

    db.refresh(
        favorite
    )


    return {

        "message":
            "Station saved successfully.",

        "saved":
            True,

        "station_id":
            station.id,

    }


# =========================================================
# FAVORITES — REMOVE STATION
# =========================================================

@app.delete(
    "/api/favorites/{station_id}"
)
def remove_favorite_station(
    station_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        get_current_user
    ),
):

    favorite = db.scalar(

        select(
            FavoriteStation
        )

        .where(

            FavoriteStation.user_id
            ==
            user.id,

            FavoriteStation.station_id
            ==
            station_id,

        )

    )


    if favorite is None:

        return {

            "message":
                "Station was not saved.",

            "saved":
                False,

            "station_id":
                station_id,

        }


    db.delete(
        favorite
    )

    db.commit()


    return {

        "message":
            "Station removed from saved stations.",

        "saved":
            False,

        "station_id":
            station_id,

    }


# =========================================================
# FAVORITES — CHECK ONE STATION
# =========================================================

@app.get(
    "/api/favorites/{station_id}/check"
)
def check_favorite_station(
    station_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        get_current_user
    ),
):

    station = db.get(
        Station,
        station_id,
    )


    if station is None:

        raise HTTPException(
            status_code=404,
            detail="Charging station not found.",
        )


    favorite = db.scalar(

        select(
            FavoriteStation
        )

        .where(

            FavoriteStation.user_id
            ==
            user.id,

            FavoriteStation.station_id
            ==
            station_id,

        )

    )


    return {

        "station_id":
            station_id,

        "saved":
            favorite is not None,

    }


# =========================================================
# FAVORITES — GET SAVED STATIONS
# =========================================================

@app.get(
    "/api/favorites"
)
def get_favorite_stations(
    db: Session = Depends(get_db),
    user: User = Depends(
        get_current_user
    ),
):

    favorites = db.scalars(

        select(
            FavoriteStation
        )

        .where(
            FavoriteStation.user_id
            ==
            user.id
        )

        .order_by(
            FavoriteStation.created_at.desc()
        )

    ).all()


    result = []


    for favorite in favorites:

        station = favorite.station


        if station is None:

            continue


        result.append({

            "id":
                station.id,

            "name":
                station.name,

            "operator_name":
                station.operator_name,

            "latitude":
                station.latitude,

            "longitude":
                station.longitude,

            "address":
                station.address,

            "connector_type":
                station.connector_type,

            "power_kw":
                station.power_kw,

            "price_per_kwh":
                station.price_per_kwh,

            "confidence_score":
                station.confidence_score,

            "status":
                station.status,

            "is_active":
                station.is_active,

            "last_verified_at":
                station.last_verified_at,

            "saved_at":
                favorite.created_at,

        })


    return result

# =========================================================
# PUBLIC STATIONS
# ACTIVE STATIONS ONLY
# =========================================================

@app.get(
    "/api/stations",
    response_model=list[StationOut],
)
def stations(
    db: Session = Depends(get_db),
):

    station_list = list(
        db.scalars(
            select(Station)
            .where(
                Station.is_active.is_(
                    True
                )
            )
            .order_by(
                Station.confidence_score.desc()
            )
        ).all()
    )


    for station in station_list:

        reports = (
            get_station_reports(
                db,
                station.id,
            )
        )


        confidence = (
            calculate_confidence(
                station,
                reports,
            )
        )


        station.confidence_score = (
            confidence["score"]
        )


    return station_list


# =========================================================
# PUBLIC — NEARBY STATIONS
# =========================================================

@app.get(
    "/api/stations/nearby",
    response_model=list[StationOut],
)
def nearby_stations(
    latitude: float = Query(
        ...,
        ge=-90,
        le=90,
    ),

    longitude: float = Query(
        ...,
        ge=-180,
        le=180,
    ),

    radius_km: float = Query(
        25,
        gt=0,
        le=50,
    ),

    max_results: int = Query(
        100,
        gt=0,
        le=500,
    ),

    db: Session = Depends(
        get_db
    ),
):

    existing_stations = list(
        db.scalars(
            select(Station)
            .where(
                Station.is_active.is_(
                    True
                )
            )
        ).all()
    )


    external_stations = []


    try:

        external_stations = (
            import_nearby_stations(
                latitude=latitude,
                longitude=longitude,
                distance_km=radius_km,
                max_results=max_results,
            )
        )

    except OpenChargeMapError as error:

        print(
            "Nearby external station lookup failed:",
            error,
        )


    for external_station in (
        external_stations
    ):

        external_latitude = (
            external_station.get(
                "latitude"
            )
        )

        external_longitude = (
            external_station.get(
                "longitude"
            )
        )


        if (
            external_latitude is None
            or external_longitude is None
        ):

            continue


        try:

            external_latitude = float(
                external_latitude
            )

            external_longitude = float(
                external_longitude
            )

        except (
            TypeError,
            ValueError,
        ):

            continue


        duplicate = False


        for existing_station in (
            existing_stations
        ):

            try:

                station_distance = (
                    distance_in_meters(
                        external_latitude,
                        external_longitude,
                        float(
                            existing_station.latitude
                        ),
                        float(
                            existing_station.longitude
                        ),
                    )
                )

            except (
                TypeError,
                ValueError,
            ):

                continue


            if station_distance <= 100:

                duplicate = True

                break


        if duplicate:

            continue


        station = Station(

            name=(
                str(
                    external_station.get(
                        "name",
                        "Unnamed charging station",
                    )
                ).strip()
            ),

            operator_name=(
                str(
                    external_station.get(
                        "operator_name",
                        "Unknown",
                    )
                ).strip()
                or
                "Unknown"
            ),

            latitude=
                external_latitude,

            longitude=
                external_longitude,

            address=(
                str(
                    external_station.get(
                        "address",
                        "",
                    )
                ).strip()
            ),

            connector_type=(
                str(
                    external_station.get(
                        "connector_type",
                        "Unknown",
                    )
                ).strip()
                or
                "Unknown"
            ),

            power_kw=max(
                0,
                float(
                    external_station.get(
                        "power_kw",
                        0,
                    )
                    or 0
                ),
            ),

            price_per_kwh=0,

            confidence_score=40,

            status=(
                str(
                    external_station.get(
                        "status",
                        "unknown",
                    )
                ).strip().lower()
                or
                "unknown"
            ),

            is_active=True,

        )


        db.add(
            station
        )

        db.flush()


        existing_stations.append(
            station
        )


    db.commit()


    all_active_stations = list(
        db.scalars(
            select(Station)
            .where(
                Station.is_active.is_(
                    True
                )
            )
        ).all()
    )


    nearby = []


    for station in (
        all_active_stations
    ):

        distance = (
            distance_in_meters(
                latitude,
                longitude,
                float(
                    station.latitude
                ),
                float(
                    station.longitude
                ),
            )
        )


        if (
            distance
            <=
            radius_km * 1000
        ):

            nearby.append(
                (
                    distance,
                    station,
                )
            )


    nearby.sort(
        key=lambda item:
            item[0]
    )


    result = []


    for _, station in nearby[
        :max_results
    ]:

        reports = (
            get_station_reports(
                db,
                station.id,
            )
        )


        confidence = (
            calculate_confidence(
                station,
                reports,
            )
        )


        station.confidence_score = (
            confidence["score"]
        )


        result.append(
            station
        )


    db.commit()


    return result


# =========================================================
# EV COMMUNITY — LIST POSTS
# =========================================================

@app.get(
    "/api/community/posts"
)
def community_posts(
    db: Session = Depends(get_db),
):
    posts = db.scalars(
        select(CommunityPost)
        .where(
            CommunityPost.is_active.is_(True)
        )
        .order_by(
            CommunityPost.created_at.desc()
        )
        .limit(100)
    ).all()

    result = []

    for post in posts:
        comment_count = (
            db.scalar(
                select(
                    func.count(
                        CommunityComment.id
                    )
                )
                .where(
                    CommunityComment.post_id
                    == post.id,
                    CommunityComment.is_active.is_(
                        True
                    ),
                )
            )
            or 0
        )


        station_data = None

        if (
            post.station
            and post.station.is_active
        ):
            station_data = {
                "id": post.station.id,
                "name": post.station.name,
                "operator_name": post.station.operator_name,
                "latitude": post.station.latitude,
                "longitude": post.station.longitude,
                "address": post.station.address,
                "connector_type": post.station.connector_type,
                "power_kw": post.station.power_kw,
                "price_per_kwh": post.station.price_per_kwh,
                "status": post.station.status,
                "confidence_score": post.station.confidence_score,
                "last_verified_at": post.station.last_verified_at,
            }

        result.append({
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "category": post.category,
            "author": {
                "id": post.user.id,
            },
            "station": station_data,
            "comment_count": int(comment_count),
            "created_at": post.created_at,
            "updated_at": post.updated_at,
        })

    return result


# =========================================================
# EV COMMUNITY — GET ONE POST
# =========================================================

@app.get(
    "/api/community/posts/{post_id}"
)
def community_post_detail(
    post_id: int,
    db: Session = Depends(get_db),
):
    post = db.get(
        CommunityPost,
        post_id,
    )

    if (
        post is None
        or not post.is_active
    ):
        raise HTTPException(
            status_code=404,
            detail="Community post not found.",
        )

    comments = db.scalars(
        select(CommunityComment)
        .where(
            CommunityComment.post_id
            == post.id,
            CommunityComment.is_active.is_(
                True
            ),
        )
        .order_by(
            CommunityComment.created_at.asc()
        )
    ).all()


    station_data = None

    if (
        post.station
        and post.station.is_active
    ):
        station_data = {
            "id": post.station.id,
            "name": post.station.name,
            "operator_name": post.station.operator_name,
            "latitude": post.station.latitude,
            "longitude": post.station.longitude,
            "address": post.station.address,
            "connector_type": post.station.connector_type,
            "power_kw": post.station.power_kw,
            "price_per_kwh": post.station.price_per_kwh,
            "status": post.station.status,
            "confidence_score": post.station.confidence_score,
            "last_verified_at": post.station.last_verified_at,
        }

    return {
        "post": {
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "category": post.category,
            "author": {
                "id": post.user.id,
            },
            "station": station_data,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
        },
        "comments": [
            {
                "id": comment.id,
                "content": comment.content,
                "author": {
                    "id": comment.user.id,
                },
                "created_at": comment.created_at,
            }
            for comment in comments
        ],
    }


# =========================================================
# EV COMMUNITY — CREATE POST
# =========================================================

@app.post(
    "/api/community/posts",
    status_code=status.HTTP_201_CREATED,
)
def create_community_post(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(
        get_current_user
    ),
):
    # Read input.
    title = str(
        payload.get(
            "title",
            ""
        )
    ).strip()
    content = str(
        payload.get(
            "content",
            ""
        )
    ).strip()
    category = str(
        payload.get(
            "category",
            "general"
        )
    ).strip().lower()

    station_id_raw = payload.get(
        "station_id"
    )

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Post title is required.",
        )

    if len(title) > 200:
        raise HTTPException(
            status_code=400,
            detail=(
                "Post title cannot exceed "
                "200 characters."
            ),
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Post content is required.",
        )

    if len(content) > 5000:
        raise HTTPException(
            status_code=400,
            detail=(
                "Post content cannot exceed "
                "5000 characters."
            ),
        )

    allowed_categories = {
        "general",
        "charging",
        "stations",
        "road_trip",
        "ev_tips",
        "help",
        "news",
    }

    if category not in allowed_categories:
        raise HTTPException(
            status_code=400,
            detail="Invalid community category.",
        )

    # Validate an optional station association.
    station = None

    if (
        station_id_raw is not None
        and station_id_raw != ""
    ):
        try:
            station_id = int(station_id_raw)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="Invalid station.",
            )

        station = db.get(
            Station,
            station_id,
        )

        if station is None:
            raise HTTPException(
                status_code=404,
                detail="Selected charging station not found.",
            )

        if not station.is_active:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The selected charging station "
                    "is currently unavailable."
                ),
            )

    cooldown_time = (
        datetime.now(
            timezone.utc
        )
        - timedelta(
            minutes=2
        )
    )

    recent_post = db.scalar(
        select(CommunityPost)
        .where(
            CommunityPost.user_id
            == user.id,
            CommunityPost.created_at
            >= cooldown_time,
        )
        .order_by(
            CommunityPost.created_at.desc()
        )
        .limit(1)
    )

    if recent_post:
        raise HTTPException(
            status_code=429,
            detail=(
                "Please wait 2 minutes "
                "before creating another post."
            ),
        )

    post = CommunityPost(
        user_id=user.id,
        station_id=(
            station.id
            if station
            else None
        ),
        title=title,
        content=content,
        category=category,
        is_active=True,
        is_verified=True,
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    return {
        "message": (
            "Community post created successfully."
        ),
        "post": {
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "category": post.category,
            "station": (
                {
                    "id": station.id,
                    "name": station.name,
                    "operator_name": station.operator_name,
                    "latitude": station.latitude,
                    "longitude": station.longitude,
                }
                if station
                else None
            ),
            "author": {
                "id": user.id,
            },
            "comment_count": 0,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
        },
    }


# =========================================================
# EV COMMUNITY — ADD COMMENT
# =========================================================

@app.post(
    "/api/community/posts/{post_id}/comments",
    status_code=status.HTTP_201_CREATED,
)
def create_community_comment(
    post_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(
        get_current_user
    ),
):
    post = db.get(
        CommunityPost,
        post_id,
    )

    if (
        post is None
        or not post.is_active
    ):
        raise HTTPException(
            status_code=404,
            detail="Community post not found.",
        )

    content = str(
        payload.get(
            "content",
            ""
        )
    ).strip()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Comment cannot be empty.",
        )

    if len(content) > 2000:
        raise HTTPException(
            status_code=400,
            detail=(
                "Comment cannot exceed "
                "2000 characters."
            ),
        )

    cooldown_time = (
        datetime.now(
            timezone.utc
        )
        - timedelta(
            seconds=30
        )
    )

    recent_comment = db.scalar(
        select(CommunityComment)
        .where(
            CommunityComment.user_id
            == user.id,
            CommunityComment.created_at
            >= cooldown_time,
        )
        .order_by(
            CommunityComment.created_at.desc()
        )
        .limit(1)
    )

    if recent_comment:
        raise HTTPException(
            status_code=429,
            detail=(
                "Please wait a few seconds "
                "before posting another comment."
            ),
        )

    comment = CommunityComment(
        post_id=post.id,
        user_id=user.id,
        content=content,
        is_active=True,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return {
        "message": (
            "Comment added successfully."
        ),
        "comment": {
            "id": comment.id,
            "post_id": comment.post_id,
            "content": comment.content,
            "created_at": comment.created_at,
        },
    }


# =========================================================
# STATION CONFIDENCE DETAILS
# =========================================================

@app.get(
    "/api/stations/{station_id}/confidence"
)
def station_confidence(
    station_id: int,
    db: Session = Depends(get_db),
):

    station = db.get(
        Station,
        station_id,
    )


    if (
        not station
        or
        not station.is_active
    ):

        raise HTTPException(
            status_code=404,
            detail="Station not found.",
        )


    reports = (
        get_station_reports(
            db,
            station.id,
        )
    )


    confidence = (
        calculate_confidence(
            station,
            reports,
        )
    )


    return {

        "station": {

            "id":
                station.id,

            "name":
                station.name,

            "operator":
                station.operator_name,

            "status":
                station.status,

            "last_verified_at":
                station.last_verified_at,

        },

        "confidence":
            confidence,

    }


# =========================================================
# STATION REPORT HISTORY
# =========================================================

@app.get(
    "/api/stations/{station_id}/reports"
)
def station_report_history(
    station_id: int,
    db: Session = Depends(get_db),
):

    station = db.get(
        Station,
        station_id,
    )


    if (
        not station
        or
        not station.is_active
    ):

        raise HTTPException(
            status_code=404,
            detail="Station not found.",
        )


    reports = (
        get_station_reports(
            db,
            station.id,
        )
    )


    return [

        {

            "id":
                report.id,

            "report_type":
                report.report_type,

            "comment":
                report.comment,

            "created_at":
                report.created_at,

        }

        for report in reports

    ]


# =========================================================
# USER REPORTS
# LOCATION VERIFIED + ANTI-SPAM
# =========================================================

@app.post(
    "/api/reports"
)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(
        get_current_user
    ),
):

    # -----------------------------------------------------
    # FIND STATION
    # -----------------------------------------------------

    station = db.get(
        Station,
        payload.station_id,
    )


    if (
        not station
        or
        not station.is_active
    ):

        raise HTTPException(
            status_code=404,
            detail="Station not found.",
        )


    # -----------------------------------------------------
    # VALIDATE GPS
    # -----------------------------------------------------

    if not (
        -90
        <= payload.latitude
        <= 90
    ):

        raise HTTPException(
            status_code=400,
            detail="Invalid latitude.",
        )


    if not (
        -180
        <= payload.longitude
        <= 180
    ):

        raise HTTPException(
            status_code=400,
            detail="Invalid longitude.",
        )


    # -----------------------------------------------------
    # CALCULATE DISTANCE
    # -----------------------------------------------------

    distance = (
        distance_in_meters(
            payload.latitude,
            payload.longitude,
            station.latitude,
            station.longitude,
        )
    )


    # -----------------------------------------------------
    # LOCATION SECURITY
    # -----------------------------------------------------

    if (
        distance
        >
        REPORT_RADIUS_METERS
    ):

        raise HTTPException(
            status_code=403,
            detail=(
                "You must be physically near "
                "this charging station to "
                "submit a report."
            ),
        )


    # -----------------------------------------------------
    # CURRENT UTC TIME
    # -----------------------------------------------------

    now = datetime.now(
        timezone.utc
    )


    # -----------------------------------------------------
    # REPORT COOLDOWN
    # -----------------------------------------------------

    cooldown_start = (
        now
        -
        timedelta(
            seconds=
                REPORT_COOLDOWN_SECONDS
        )
    )


    recent_report = db.scalar(

        select(Report)

        .where(

            Report.user_id
            ==
            user.id,

            Report.station_id
            ==
            station.id,

            Report.created_at
            >=
            cooldown_start,

        )

        .order_by(
            Report.created_at.desc()
        )

        .limit(1)

    )


    if recent_report:

        raise HTTPException(

            status_code=
                status.HTTP_429_TOO_MANY_REQUESTS,

            detail=(
                "You already reported this "
                "station recently. Please "
                "wait 5 minutes before "
                "submitting another report."
            ),

            headers={
                "Retry-After":
                    str(
                        REPORT_COOLDOWN_SECONDS
                    )
            },

        )


    # -----------------------------------------------------
    # START OF CURRENT UTC DAY
    # -----------------------------------------------------

    today_start = datetime(
        now.year,
        now.month,
        now.day,
        tzinfo=timezone.utc,
    )


    # -----------------------------------------------------
    # DAILY TOTAL REPORT LIMIT
    # -----------------------------------------------------

    daily_report_count = (
        db.scalar(

            select(
                func.count(
                    Report.id
                )
            )

            .where(

                Report.user_id
                ==
                user.id,

                Report.created_at
                >=
                today_start,

            )

        )
        or 0
    )


    if (
        daily_report_count
        >=
        DAILY_REPORT_LIMIT
    ):

        raise HTTPException(

            status_code=
                status.HTTP_429_TOO_MANY_REQUESTS,

            detail=(
                "You have reached your "
                "daily report limit. "
                "Please try again tomorrow."
            ),

        )


    # -----------------------------------------------------
    # SAME-STATION DAILY LIMIT
    # -----------------------------------------------------

    same_station_daily_count = (

        db.scalar(

            select(
                func.count(
                    Report.id
                )
            )

            .where(

                Report.user_id
                ==
                user.id,

                Report.station_id
                ==
                station.id,

                Report.created_at
                >=
                today_start,

            )

        )

        or 0

    )


    if (
        same_station_daily_count
        >=
        SAME_STATION_DAILY_LIMIT
    ):

        raise HTTPException(

            status_code=
                status.HTTP_429_TOO_MANY_REQUESTS,

            detail=(
                "You have already reported "
                "this station 3 times today."
            ),

        )


    # -----------------------------------------------------
    # CLEAN REPORT TYPE
    # -----------------------------------------------------

    report_type = (
        payload.report_type
        .lower()
        .strip()
    )


    allowed_report_types = {

        "working",

        "available",

        "busy",

        "broken",

        "maintenance",

        "payment_problem",

        "slow_charging",

    }


    if (
        report_type
        not in
        allowed_report_types
    ):

        raise HTTPException(
            status_code=400,
            detail="Invalid report type.",
        )


    # -----------------------------------------------------
    # CREATE REPORT
    # -----------------------------------------------------

    report = Report(

        station_id=
            station.id,

        user_id=
            user.id,

        report_type=
            report_type,

        comment=(

            payload.comment.strip()

            if payload.comment

            else None

        ),

    )


    db.add(
        report
    )


    # -----------------------------------------------------
    # UPDATE LAST VERIFIED
    # -----------------------------------------------------

    station.last_verified_at = (
        now
    )


    # -----------------------------------------------------
    # UPDATE CURRENT STATUS
    # -----------------------------------------------------

    if report_type in {
        "working",
        "available",
    }:

        station.status = (
            "available"
        )


    elif report_type == "busy":

        station.status = (
            "busy"
        )


    elif report_type == "broken":

        station.status = (
            "broken"
        )


    elif report_type == "maintenance":

        station.status = (
            "maintenance"
        )


    # Payment / slow charging do not
    # automatically mark a station broken.


    # -----------------------------------------------------
    # SAVE REPORT
    # -----------------------------------------------------

    db.commit()

    db.refresh(
        station
    )


    # -----------------------------------------------------
    # RECALCULATE CONFIDENCE
    # -----------------------------------------------------

    reports = (
        get_station_reports(
            db,
            station.id,
        )
    )


    confidence = (
        calculate_confidence(
            station,
            reports,
        )
    )


    station.confidence_score = (
        confidence["score"]
    )


    db.commit()

    db.refresh(
        station
    )


    # -----------------------------------------------------
    # RESPONSE
    # -----------------------------------------------------

    return {

        "message":
            "Report received successfully.",

        "station": {

            "id":
                station.id,

            "status":
                station.status,

            "confidence_score":
                station.confidence_score,

            "last_verified_at":
                station.last_verified_at,

            "distance_meters":
                round(
                    distance,
                    1,
                ),

        },

        "confidence":
            confidence,

        "report": {

            "id":
                report.id,

            "report_type":
                report.report_type,

        },

    }


# =========================================================
# ADMIN DASHBOARD — STATISTICS
# =========================================================

@app.get(
    "/api/admin/stats",
    response_model=AdminStats,
)
def admin_stats(
    db: Session = Depends(get_db),
    _: User = Depends(
        require_admin
    ),
):

    total = (
        db.scalar(
            select(func.count())
            .select_from(
                Station
            )
        )
        or 0
    )


    active = (
        db.scalar(
            select(func.count())
            .select_from(
                Station
            )
            .where(
                Station.is_active.is_(
                    True
                )
            )
        )
        or 0
    )


    avg = (
        db.scalar(
            select(
                func.avg(
                    Station.confidence_score
                )
            )
        )
        or 0
    )


    today = (
        datetime.now(
            timezone.utc
        ).date()
    )


    reports = db.scalars(
        select(Report)
    ).all()


    reports_today = sum(

        1

        for report in reports

        if (
            report.created_at.date()
            ==
            today
        )

    )


    return AdminStats(

        total_stations=
            total,

        active_stations=
            active,

        average_confidence=
            round(
                float(avg),
                1,
            ),

        reports_today=
            reports_today,

    )


# =========================================================
# ADMIN — REPORTS
# =========================================================

@app.get(
    "/api/admin/reports"
)
def admin_reports(
    db: Session = Depends(get_db),
    _: User = Depends(
        require_admin
    ),
):
    rows = db.scalars(
        select(Report)
        .order_by(
            Report.created_at.desc()
        )
        .limit(100)
    ).all()

    result = []

    for report in rows:

        station = db.get(
            Station,
            report.station_id
        )

        reporter = db.get(
            User,
            report.user_id
        )

        result.append({
            "id":
                report.id,

            "station_id":
                report.station_id,

            "station_name":
                station.name
                if station
                else "Unknown station",

            "reporter_id":
                report.user_id,

            "reporter_email":
                reporter.email
                if reporter
                else "Unknown user",

            "report_type":
                report.report_type,

            "comment":
                report.comment,

            "created_at":
                report.created_at,
        })

    return result
# =========================================================
# ADMIN — COMMUNITY POSTS
# =========================================================

@app.get(
    "/api/admin/community/posts"
)
def admin_community_posts(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    posts = db.scalars(
        select(CommunityPost)
        .order_by(
            CommunityPost.created_at.desc()
        )
        .limit(200)
    ).all()

    result = []

    for post in posts:
        comment_count = (
            db.scalar(
                select(
                    func.count(
                        CommunityComment.id
                    )
                )
                .where(
                    CommunityComment.post_id
                    == post.id
                )
            )
            or 0
        )

        result.append({
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "category": post.category,
            "is_active": post.is_active,
            "is_verified": post.is_verified,
            "created_at": post.created_at,
            "comment_count": int(comment_count),
        })

    return result


# =========================================================
# ADMIN — TOGGLE COMMUNITY POST
# =========================================================

@app.post(
    "/api/admin/community/posts/{post_id}/toggle"
)
def toggle_community_post(
    post_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    post = db.get(
        CommunityPost,
        post_id,
    )

    if post is None:
        raise HTTPException(
            status_code=404,
            detail="Community post not found.",
        )

    post.is_active = (
        not post.is_active
    )
    db.commit()
    db.refresh(post)

    return {
        "message": (
            "Community post shown."
            if post.is_active
            else "Community post hidden."
        ),
        "post": {
            "id": post.id,
            "is_active": post.is_active,
        },
    }


# =========================================================
# ADMIN — COMMUNITY COMMENTS
# =========================================================

@app.get(
    "/api/admin/community/comments"
)
def admin_community_comments(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    comments = db.scalars(
        select(CommunityComment)
        .order_by(
            CommunityComment.created_at.desc()
        )
        .limit(300)
    ).all()

    return [
        {
            "id": comment.id,
            "post_id": comment.post_id,
            "post_title": (
                comment.post.title
                if comment.post
                else "Unknown post"
            ),
            "content": comment.content,
            "is_active": comment.is_active,
            "created_at": comment.created_at,
        }
        for comment in comments
    ]


# =========================================================
# ADMIN — TOGGLE COMMUNITY COMMENT
# =========================================================

@app.post(
    "/api/admin/community/comments/{comment_id}/toggle"
)
def toggle_community_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    comment = db.get(
        CommunityComment,
        comment_id,
    )

    if comment is None:
        raise HTTPException(
            status_code=404,
            detail="Community comment not found.",
        )

    comment.is_active = (
        not comment.is_active
    )
    db.commit()
    db.refresh(comment)

    return {
        "message": (
            "Community comment shown."
            if comment.is_active
            else "Community comment hidden."
        ),
        "comment": {
            "id": comment.id,
            "is_active": comment.is_active,
        },
    }


# =========================================================
# OWNER — USER / ADMIN MANAGEMENT
# =========================================================

@app.get(
    "/api/admin/users"
)
def admin_users(
    db: Session = Depends(get_db),
    _: User = Depends(
        require_owner
    ),
):

    users = db.scalars(
        select(User)
        .order_by(
            User.created_at.desc()
        )
    ).all()


    return [

        {

            "id":
                user.id,

            "email":
                user.email,

            "role":
                user.role,

            "is_active":
                user.is_active,

            "created_at":
                user.created_at,

        }

        for user in users

    ]


# =========================================================
# OWNER — PROMOTE USER TO ADMIN
# =========================================================

@app.post(
    "/api/admin/users/{user_id}/promote"
)
def promote_user(
    user_id: int,
    db: Session = Depends(get_db),
    owner: User = Depends(
        require_owner
    ),
):

    user = db.get(
        User,
        user_id,
    )


    if user is None:

        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )


    if user.id == owner.id:

        raise HTTPException(
            status_code=400,
            detail=(
                "Owner already has "
                "full access."
            ),
        )


    if user.role == "owner":

        raise HTTPException(
            status_code=403,
            detail=(
                "Owner role cannot be changed."
            ),
        )


    user.role = "admin"

    user.is_active = True


    db.commit()

    db.refresh(
        user
    )


    return {

        "message":
            "User promoted to admin.",

        "user": {

            "id":
                user.id,

            "email":
                user.email,

            "role":
                user.role,

            "is_active":
                user.is_active,

        },

    }


# =========================================================
# OWNER — DEMOTE ADMIN TO USER
# =========================================================

@app.post(
    "/api/admin/users/{user_id}/demote"
)
def demote_user(
    user_id: int,
    db: Session = Depends(get_db),
    owner: User = Depends(
        require_owner
    ),
):

    user = db.get(
        User,
        user_id,
    )


    if user is None:

        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )


    if user.id == owner.id:

        raise HTTPException(
            status_code=400,
            detail=(
                "The owner cannot be demoted."
            ),
        )


    if user.role == "owner":

        raise HTTPException(
            status_code=403,
            detail=(
                "Owner role cannot be changed."
            ),
        )


    user.role = "user"


    db.commit()

    db.refresh(
        user
    )


    return {

        "message":
            "Admin access removed.",

        "user": {

            "id":
                user.id,

            "email":
                user.email,

            "role":
                user.role,

            "is_active":
                user.is_active,

        },

    }


# =========================================================
# OWNER — ACTIVATE / DEACTIVATE USER
# =========================================================

@app.post(
    "/api/admin/users/{user_id}/activate"
)
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    owner: User = Depends(
        require_owner
    ),
):

    user = db.get(
        User,
        user_id,
    )


    if user is None:

        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )


    if user.id == owner.id:

        raise HTTPException(
            status_code=400,
            detail=(
                "The owner account "
                "cannot be disabled."
            ),
        )


    user.is_active = (
        not user.is_active
    )


    db.commit()

    db.refresh(
        user
    )


    return {

        "message": (

            "User activated."

            if user.is_active

            else
            "User deactivated."

        ),

        "user": {

            "id":
                user.id,

            "email":
                user.email,

            "role":
                user.role,

            "is_active":
                user.is_active,

        },

    }


# =========================================================
# ADMIN — ALL STATIONS
# ACTIVE + DISABLED
# =========================================================

@app.get(
    "/api/admin/stations"
)
def admin_stations(
    db: Session = Depends(get_db),
    _: User = Depends(
        require_admin
    ),
):

    return list(

        db.scalars(

            select(
                Station
            )
            .order_by(
                Station.created_at.desc()
            )

        ).all()

    )


# =========================================================
# ADMIN — PREVIEW OPEN CHARGE MAP IMPORT
# =========================================================

@app.post(
    "/api/admin/import/openchargemap"
)
def preview_openchargemap_import(

    latitude: float = Query(
        ...,
        ge=-90,
        le=90,
    ),

    longitude: float = Query(
        ...,
        ge=-180,
        le=180,
    ),

    distance_km: float = Query(
        25,
        gt=0,
        le=100,
    ),

    max_results: int = Query(
        100,
        gt=0,
        le=1000,
    ),

    db: Session = Depends(
        get_db
    ),

    _: User = Depends(
        require_admin
    ),

):

    try:

        imported_stations = (
            import_nearby_stations(
                latitude=
                    latitude,

                longitude=
                    longitude,

                distance_km=
                    distance_km,

                max_results=
                    max_results,
            )
        )


    except OpenChargeMapError as error:

        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error


    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error


    existing_stations = list(
        db.scalars(
            select(Station)
        ).all()
    )


    new_stations = []

    duplicate_stations = []


    for external_station in (
        imported_stations
    ):

        external_name = (
            str(
                external_station.get(
                    "name",
                    ""
                )
            )
            .strip()
            .lower()
        )


        external_latitude = (
            external_station.get(
                "latitude"
            )
        )


        external_longitude = (
            external_station.get(
                "longitude"
            )
        )


        matched_station = None

        matched_distance = None


        for existing_station in (
            existing_stations
        ):

            existing_name = (
                existing_station.name
                .strip()
                .lower()
            )


            try:

                station_distance = (
                    distance_in_meters(

                        float(
                            external_latitude
                        ),

                        float(
                            external_longitude
                        ),

                        float(
                            existing_station.latitude
                        ),

                        float(
                            existing_station.longitude
                        ),

                    )
                )

            except (
                TypeError,
                ValueError,
            ):

                continue


            same_name = (
                bool(
                    external_name
                )
                and
                bool(
                    existing_name
                )
                and
                external_name
                ==
                existing_name
            )


            if (
                station_distance
                <= 50
            ):

                matched_station = (
                    existing_station
                )

                matched_distance = (
                    station_distance
                )

                break


            if (
                station_distance
                <= 100
                and
                same_name
            ):

                matched_station = (
                    existing_station
                )

                matched_distance = (
                    station_distance
                )

                break


        if matched_station:

            duplicate_stations.append({

                "external": {

                    "external_id":
                        external_station.get(
                            "external_id"
                        ),

                    "name":
                        external_station.get(
                            "name"
                        ),

                    "operator_name":
                        external_station.get(
                            "operator_name"
                        ),

                    "latitude":
                        external_station.get(
                            "latitude"
                        ),

                    "longitude":
                        external_station.get(
                            "longitude"
                        ),

                },

                "existing": {

                    "id":
                        matched_station.id,

                    "name":
                        matched_station.name,

                    "operator_name":
                        matched_station.operator_name,

                    "latitude":
                        matched_station.latitude,

                    "longitude":
                        matched_station.longitude,

                    "distance_meters":
                        round(
                            float(
                                matched_distance
                                or 0
                            ),
                            1,
                        ),

                },

            })

            continue


        new_stations.append(
            external_station
        )


    return {

        "message":
            "Open Charge Map import preview generated.",

        "search": {

            "latitude":
                latitude,

            "longitude":
                longitude,

            "distance_km":
                distance_km,

            "max_results":
                max_results,

        },

        "summary": {

            "external_results":
                len(
                    imported_stations
                ),

            "new_stations":
                len(
                    new_stations
                ),

            "duplicates":
                len(
                    duplicate_stations
                ),

        },

        "new_stations":
            new_stations,

        "duplicates":
            duplicate_stations,

    }


# =========================================================
# ADMIN — APPROVE IMPORTED STATION
# =========================================================

@app.post(
    "/api/admin/import/openchargemap/approve"
)
def approve_openchargemap_station(
    payload: dict,
    db: Session = Depends(get_db),
    _: User = Depends(
        require_admin
    ),
):

    name = str(
        payload.get(
            "name",
            ""
        )
    ).strip()


    operator_name = str(
        payload.get(
            "operator_name",
            "Unknown"
        )
    ).strip()


    address = str(
        payload.get(
            "address",
            ""
        )
    ).strip()


    connector_type = str(
        payload.get(
            "connector_type",
            "Unknown"
        )
    ).strip()


    status_value = str(
        payload.get(
            "status",
            "unknown"
        )
    ).strip().lower()


    try:

        latitude = float(
            payload.get(
                "latitude"
            )
        )

        longitude = float(
            payload.get(
                "longitude"
            )
        )

        power_kw = float(
            payload.get(
                "power_kw",
                0
            )
        )

    except (
        TypeError,
        ValueError,
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid station coordinates "
                "or power."
            ),
        )


    if not name:

        raise HTTPException(
            status_code=400,
            detail="Station name is required.",
        )


    if not (
        -90
        <= latitude
        <= 90
    ):

        raise HTTPException(
            status_code=400,
            detail="Invalid latitude.",
        )


    if not (
        -180
        <= longitude
        <= 180
    ):

        raise HTTPException(
            status_code=400,
            detail="Invalid longitude.",
        )


    if power_kw < 0:

        power_kw = 0


    existing_stations = list(
        db.scalars(
            select(Station)
        ).all()
    )


    normalized_name = (
        name
        .strip()
        .lower()
    )


    for existing in (
        existing_stations
    ):

        existing_name = (
            existing.name
            .strip()
            .lower()
        )


        try:

            station_distance = (
                distance_in_meters(
                    latitude,
                    longitude,
                    float(
                        existing.latitude
                    ),
                    float(
                        existing.longitude
                    ),
                )
            )

        except (
            TypeError,
            ValueError,
        ):

            continue


        if station_distance <= 50:

            raise HTTPException(
                status_code=409,
                detail=(
                    "A charging station already "
                    "exists within 50 meters "
                    "of this location."
                ),
            )


        if (
            station_distance <= 100
            and
            normalized_name
            ==
            existing_name
        ):

            raise HTTPException(
                status_code=409,
                detail=(
                    "A station with the same "
                    "name already exists nearby."
                ),
            )


    allowed_statuses = {

        "available",
        "busy",
        "broken",
        "maintenance",
        "unknown",

    }


    if (
        status_value
        not in
        allowed_statuses
    ):

        status_value = "unknown"


    station = Station(

        name=
            name,

        operator_name=(
            operator_name
            or
            "Unknown"
        ),

        latitude=
            latitude,

        longitude=
            longitude,

        address=
            address,

        connector_type=(
            connector_type
            or
            "Unknown"
        ),

        power_kw=
            power_kw,

        price_per_kwh=
            0,

        confidence_score=
            50,

        status=
            status_value,

        is_active=
            True,

    )


    db.add(
        station
    )

    db.commit()

    db.refresh(
        station
    )


    return {

        "message":
            "Station approved and added to ChargeLens.",

        "station": {

            "id":
                station.id,

            "name":
                station.name,

            "operator_name":
                station.operator_name,

            "latitude":
                station.latitude,

            "longitude":
                station.longitude,

            "address":
                station.address,

            "connector_type":
                station.connector_type,

            "power_kw":
                station.power_kw,

            "status":
                station.status,

            "is_active":
                station.is_active,

            "confidence_score":
                station.confidence_score,

        },

    }


# =========================================================
# ADMIN — CREATE STATION
# =========================================================

@app.post(
    "/api/admin/stations"
)
def create_station(
    payload: StationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(
        require_admin
    ),
):

    station = Station(

        name=
            payload.name.strip(),

        operator_name=
            payload.operator_name.strip(),

        latitude=
            payload.latitude,

        longitude=
            payload.longitude,

        address=
            payload.address.strip(),

        connector_type=
            payload.connector_type.strip(),

        power_kw=
            payload.power_kw,

        price_per_kwh=
            payload.price_per_kwh,

        status=(
            payload.status
            .strip()
            .lower()
        ),

        is_active=
            payload.is_active,

        confidence_score=
            50,

    )


    db.add(
        station
    )

    db.commit()

    db.refresh(
        station
    )


    return {

        "message":
            "Station created successfully.",

        "station":
            station,

    }


# =========================================================
# ADMIN — UPDATE STATION
# =========================================================

@app.patch(
    "/api/admin/stations/{station_id}"
)
def update_station(
    station_id: int,
    payload: StationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(
        require_admin
    ),
):

    station = db.get(
        Station,
        station_id,
    )


    if station is None:

        raise HTTPException(
            status_code=404,
            detail="Station not found.",
        )


    updates = payload.model_dump(
        exclude_unset=True
    )


    for field, value in (
        updates.items()
    ):

        if isinstance(
            value,
            str,
        ):

            value = value.strip()


        setattr(
            station,
            field,
            value,
        )


    db.commit()

    db.refresh(
        station
    )


    return {

        "message":
            "Station updated successfully.",

        "station":
            station,

    }


# =========================================================
# ADMIN — ACTIVATE / DEACTIVATE STATION
# =========================================================

@app.post(
    "/api/admin/stations/{station_id}/toggle"
)
def toggle_station(
    station_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(
        require_admin
    ),
):

    station = db.get(
        Station,
        station_id,
    )


    if station is None:

        raise HTTPException(
            status_code=404,
            detail="Station not found.",
        )


    station.is_active = (
        not station.is_active
    )


    db.commit()

    db.refresh(
        station
    )


    return {

        "message": (

            "Station activated."

            if station.is_active

            else
            "Station deactivated."

        ),

        "station": {

            "id":
                station.id,

            "is_active":
                station.is_active,

        },

    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get(
    "/api/health"
)
def health_check():

    return {

        "status":
            "ok",

        "service":
            "ChargeLens API",

        "version":
            "0.1.0",

    }
