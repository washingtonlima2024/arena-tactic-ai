"""
Database connection and initialization for Arena Play SQLite database.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from models import Base

# Database file path
DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'arena_play.db')
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


def reset_db():
    """Drop all tables and recreate them. WARNING: This deletes all data!"""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print("Database reset complete.")


if __name__ == '__main__':
    # Initialize database when run directly
    init_db()
    print("Database tables created successfully!")
