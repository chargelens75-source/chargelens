from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings


# ---------------------------------------------------------
# DATABASE URL
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parents[2]


def build_database_url(database_url: str):
    url = make_url(database_url)

    if (
        url.drivername.startswith("sqlite")
        and url.database
        and url.database != ":memory:"
        and not Path(url.database).is_absolute()
    ):
        database_path = (BASE_DIR / url.database).resolve()
        database_path.parent.mkdir(parents=True, exist_ok=True)
        return url.set(database=str(database_path))

    return url


DATABASE_URL = build_database_url(settings.database_url)


# ---------------------------------------------------------
# DATABASE ENGINE
# ---------------------------------------------------------

connect_args = (
    {"check_same_thread": False}
    if DATABASE_URL.drivername.startswith("sqlite")
    else {}
)

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
)


# ---------------------------------------------------------
# BASE CLASS
# ---------------------------------------------------------

Base = declarative_base()


# ---------------------------------------------------------
# DATABASE SESSION
# ---------------------------------------------------------

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ---------------------------------------------------------
# DATABASE DEPENDENCY
# ---------------------------------------------------------

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
