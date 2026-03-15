"""SQLite database setup and access via aiosqlite."""
import logging
from pathlib import Path

import aiosqlite

from backend.config import settings

logger = logging.getLogger(__name__)

_db_path: str = settings.DB_PATH


async def init_db() -> None:
    """Create all tables if they do not exist."""
    Path(_db_path).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(_db_path) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS terms_acceptance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_identifier TEXT NOT NULL,
                terms_version TEXT NOT NULL,
                accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS onboarding_completion (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_identifier TEXT NOT NULL,
                onboarding_version TEXT NOT NULL,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_identifier TEXT,
                action TEXT NOT NULL,
                model_used TEXT,
                quality_mode TEXT,
                input_length INTEGER,
                output_length INTEGER,
                processing_time_ms INTEGER,
                success BOOLEAN DEFAULT TRUE,
                error_message TEXT
            );

            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await db.commit()
    logger.info("Database initialised at %s", _db_path)


async def get_db() -> aiosqlite.Connection:
    """Open and return an aiosqlite connection (caller must close)."""
    return await aiosqlite.connect(_db_path)


async def log_audit(
    action: str,
    user_identifier: str | None = None,
    model_used: str | None = None,
    quality_mode: str | None = None,
    input_length: int | None = None,
    output_length: int | None = None,
    processing_time_ms: int | None = None,
    success: bool = True,
    error_message: str | None = None,
) -> None:
    """Insert a row into audit_log. Content is never stored."""
    try:
        async with aiosqlite.connect(_db_path) as db:
            await db.execute(
                """INSERT INTO audit_log
                   (user_identifier, action, model_used, quality_mode,
                    input_length, output_length, processing_time_ms,
                    success, error_message)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_identifier,
                    action,
                    model_used,
                    quality_mode,
                    input_length,
                    output_length,
                    processing_time_ms,
                    success,
                    error_message,
                ),
            )
            await db.commit()
    except Exception as exc:
        logger.warning("Audit log write failed: %s", exc)
