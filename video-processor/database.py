"""
Database connection and initialization for Arena Play SQLite database.
Uses BASE_DIR environment variable for predictable paths.
"""

import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from models import Base

# Base directory from environment or current file location
BASE_DIR = Path(os.environ.get('ARENA_BASE_DIR', os.path.dirname(__file__)))

# Database file path - uses BASE_DIR for predictability
DATABASE_PATH = str(BASE_DIR / 'arena_play.db')
DATABASE_URL = f'sqlite:///{DATABASE_PATH}'

# Create engine with check_same_thread=False for Flask compatibility
engine = create_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL debugging
    connect_args={'check_same_thread': False}
)

# Create session factory
session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)


def init_db():
    """Initialize the database by creating all tables."""
    Base.metadata.create_all(engine)
    print(f"Database initialized at: {DATABASE_PATH}")


def get_session():
    """Get a new database session."""
    return Session()


def close_session(session):
    """Close a database session."""
    session.close()


from contextlib import contextmanager

@contextmanager
def get_db_session():
    """Context manager for database sessions with automatic cleanup."""
    session = Session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_db():
    """Drop all tables and recreate them. WARNING: This deletes all data!"""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print("Database reset complete.")


def get_database_path() -> str:
    """Get the absolute path to the database file."""
    return os.path.abspath(DATABASE_PATH)


def get_base_dir() -> str:
    """Get the absolute path to the base directory."""
    return str(BASE_DIR.absolute())


if __name__ == '__main__':
    # Initialize database when run directly
    init_db()
    print("Database tables created successfully!")
    print(f"Base directory: {get_base_dir()}")
    print(f"Database path: {get_database_path()}")
