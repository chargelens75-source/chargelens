import hashlib
import hmac
import secrets

from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from smtplib import SMTP

from ..config import settings


def generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_verification_code(
    email: str,
    code: str,
) -> str:

    value = (
        f"{email.lower().strip()}:{code}"
    ).encode("utf-8")

    return hmac.new(
        settings.jwt_secret.encode("utf-8"),
        value,
        hashlib.sha256,
    ).hexdigest()


def code_expiry() -> datetime:
    return (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=settings.otp_expire_minutes
        )
    )


def send_verification_email(
    email: str,
    code: str,
) -> None:

    if not all(
        [
            settings.smtp_host,
            settings.smtp_username,
            settings.smtp_password,
            settings.smtp_from_email,
        ]
    ):
        raise RuntimeError(
            "Email SMTP is not configured."
        )

    message = EmailMessage()

    message["Subject"] = (
        "Your ChargeLens verification code"
    )

    message["From"] = (
        f"{settings.smtp_from_name} "
        f"<{settings.smtp_from_email}>"
    )

    message["To"] = email

    message.set_content(
        f"""
Hello,

Your ChargeLens verification code is:

{code}

This code expires in "
{settings.otp_expire_minutes} minutes.

If you did not request this code,
you can safely ignore this email.

ChargeLens
Know before you charge.
""".strip()
    )

    with SMTP(
        settings.smtp_host,
        settings.smtp_port,
        timeout=20,
    ) as smtp:

        if settings.smtp_use_tls:
            smtp.starttls()

        smtp.login(
            settings.smtp_username,
            settings.smtp_password,
        )

        smtp.send_message(message)