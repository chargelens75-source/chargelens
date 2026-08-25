from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings


# ---------------------------------------------------------
# DATABASE ENGINE
# ---------------------------------------------------------

engine = create_engine(
    settings.database_url,
    connect_args={
        "check_same_thread": False
    },
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