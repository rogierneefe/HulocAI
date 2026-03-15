"""Admin authentication via Bearer token."""
import logging

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


async def require_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """
    Dependency that enforces admin token authentication.
    In development mode: skip check but log a warning.
    """
    environment = getattr(request.app.state, "environment_mode", settings.ENVIRONMENT_MODE)

    if environment == "development":
        logger.warning("Admin auth skipped — development mode")
        return

    if credentials is None or credentials.credentials != settings.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Ongeldige of ontbrekende admin token")


def require_admin_in_production(request: Request, settings_obj=None) -> None:
    """
    In production mode: block admin actions without a token.
    In sandbox/development: allow with warning.
    """
    env = getattr(request.app.state, "environment_mode", settings.ENVIRONMENT_MODE)
    if env == "production":
        raise HTTPException(
            status_code=403,
            detail="Admin toegang vereist een geldig token in productie-modus",
        )
    logger.warning("Admin check overgeslagen in %s modus", env)
