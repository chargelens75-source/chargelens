from sqlalchemy import select

from .config import settings
from .db import Base, SessionLocal, engine
from .models import Station, User
from .security import hash_password


def seed_database():
    print("Starting ChargeLens database seed...")

    # Create database tables
    Base.metadata.create_all(bind=engine)
    print("Database tables checked.")

    db = SessionLocal()

    try:
        # =====================================================
        # CREATE OWNER ACCOUNT
        # =====================================================

        owner_email = settings.owner_email.lower().strip()

        owner = db.scalar(
            select(User).where(
                User.email == owner_email
            )
        )

        if owner is None:
            owner = User(
                email=owner_email,
                password_hash=hash_password(
                    settings.owner_password
                ),
                role="owner",
                is_active=True,
            )

            db.add(owner)

            print(
                f"Owner account created: {owner_email}"
            )
        else:
            print(
                f"Owner already exists: {owner_email}"
            )

        # =====================================================
        # CHECK STATIONS
        # =====================================================

        station_count = db.query(Station).count()

        print(
            f"Stations currently in database: {station_count}"
        )

        # =====================================================
        # INSERT DEMO STATIONS
        # =====================================================

        if station_count == 0:

            stations = [
                Station(
                    name="ChargeLens Demo Station - Koramangala",
                    operator_name="Demo Operator",
                    latitude=12.9352,
                    longitude=77.6245,
                    address="Koramangala, Bengaluru",
                    connector_type="CCS2",
                    power_kw=60,
                    price_per_kwh=18,
                    confidence_score=94,
                    status="available",
                    is_active=True,
                ),

                Station(
                    name="ChargeLens Demo Station - Indiranagar",
                    operator_name="Demo Operator",
                    latitude=12.9784,
                    longitude=77.6408,
                    address="Indiranagar, Bengaluru",
                    connector_type="CCS2",
                    power_kw=120,
                    price_per_kwh=20,
                    confidence_score=91,
                    status="available",
                    is_active=True,
                ),

                Station(
                    name="ChargeLens Demo Station - Whitefield",
                    operator_name="Demo Operator",
                    latitude=12.9698,
                    longitude=77.7500,
                    address="Whitefield, Bengaluru",
                    connector_type="CCS2",
                    power_kw=60,
                    price_per_kwh=18,
                    confidence_score=78,
                    status="busy",
                    is_active=True,
                ),

                Station(
                    name="ChargeLens Demo Station - Electronic City",
                    operator_name="Demo Operator",
                    latitude=12.8452,
                    longitude=77.6602,
                    address="Electronic City, Bengaluru",
                    connector_type="CCS2",
                    power_kw=60,
                    price_per_kwh=17,
                    confidence_score=66,
                    status="unknown",
                    is_active=True,
                ),

                Station(
                    name="ChargeLens Demo Station - Yeshwanthpur",
                    operator_name="Demo Operator",
                    latitude=13.0280,
                    longitude=77.5540,
                    address="Yeshwanthpur, Bengaluru",
                    connector_type="CCS2",
                    power_kw=30,
                    price_per_kwh=16,
                    confidence_score=41,
                    status="maintenance",
                    is_active=True,
                ),
            ]

            db.add_all(stations)

            print(
                "5 demo Bengaluru stations added."
            )

        else:
            print(
                "Stations already exist. No duplicate stations added."
            )

        # =====================================================
        # SAVE EVERYTHING
        # =====================================================

        db.commit()

        # =====================================================
        # VERIFY
        # =====================================================

        final_station_count = db.query(
            Station
        ).count()

        print(
            f"Final station count: {final_station_count}"
        )

        print(
            "ChargeLens database seed completed successfully."
        )

    except Exception as error:

        db.rollback()

        print(
            "ERROR while seeding database:"
        )

        print(error)

        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed_database()