from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):

    # =====================================================
    # DATABASE
    # =====================================================

    database_url: str


    # =====================================================
    # JWT AUTHENTICATION
    # =====================================================

    jwt_secret: str

    jwt_expire_minutes: int = 60


    # =====================================================
    # OWNER ACCOUNT
    # =====================================================

    owner_email: str

    owner_password: str


    # =====================================================
    # OPEN CHARGE MAP
    # =====================================================

    openchargemap_api_key: str = ""


    # =====================================================
    # CHARGELENS STATION IMPORT SETTINGS
    # =====================================================

    openchargemap_max_results: int = 100

    openchargemap_default_distance_km: float = 25

    cors_origins: str = "http://127.0.0.1:8000,http://localhost:8000"
    # =====================================================
    # EMAIL VERIFICATION
    # =====================================================

    otp_expire_minutes: int = 10

    otp_resend_seconds: int = 60


    # =====================================================
    # SMTP EMAIL
    # =====================================================

    smtp_host: str = ""

    smtp_port: int = 587

    smtp_username: str = ""

    smtp_password: str = ""

    smtp_from_email: str = ""

    smtp_from_name: str = "ChargeLens"

    smtp_use_tls: bool = True


    # =====================================================
    # PYDANTIC SETTINGS
    # =====================================================

    model_config = SettingsConfigDict(

        env_file=".env",

        env_file_encoding="utf-8",

        extra="ignore",

    )


settings = Settings()