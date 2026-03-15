"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.config import settings
from backend.database import init_db
from backend.middleware.security import SecurityHeadersMiddleware
from backend.routers import admin, chat, health, summarize, transcribe, translate
from backend.services.environment import detect_environment
from backend.services.model_manager import load_models_config
from backend.services.ollama_client import ollama_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup → yield → shutdown."""
    # Detect environment
    env_mode = detect_environment()
    app.state.environment_mode = env_mode
    logger.info("Environment mode: %s", env_mode)

    # Initialise database
    await init_db()

    # Load model manifest
    load_models_config()

    # Check Ollama connection
    if await ollama_client.check_connection():
        logger.info("Ollama connected at %s", settings.OLLAMA_URL)
    else:
        logger.warning("Ollama NOT reachable at %s", settings.OLLAMA_URL)

    # Ensure upload directory exists
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

    yield
    logger.info("Shutting down AI Toolkit")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    profile = settings.get_profile()

    app = FastAPI(
        title="AI Toolkit",
        version="1.0.0",
        description="Lokale AI-taalverwerkingstool voor zakelijke medewerkers",
        docs_url="/api/docs" if profile.get("debug") else None,
        redoc_url="/api/redoc" if profile.get("debug") else None,
        lifespan=lifespan,
    )

    # Rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # CORS
    cors_origins = profile.get("cors_origins", ["http://localhost:8080"])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routers
    app.include_router(health.router, prefix="/api")
    app.include_router(summarize.router, prefix="/api")
    app.include_router(translate.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(transcribe.router, prefix="/api")
    app.include_router(admin.router, prefix="/api/admin")

    # Serve frontend as static files
    frontend_path = Path("frontend")
    if frontend_path.exists():
        app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

    return app


app = create_app()
