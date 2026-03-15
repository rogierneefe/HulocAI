"""Application configuration via pydantic-settings."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_NUM_PARALLEL: int = 1
    OLLAMA_MAX_LOADED_MODELS: int = 1
    WHISPER_URL: str = "http://localhost:8178"
    ADMIN_TOKEN: str = "wijzig-dit-naar-een-sterk-token"
    ENVIRONMENT_MODE: str = "development"  # sandbox | production | development
    DB_PATH: str = "data/app.db"
    UPLOAD_DIR: str = "data/uploads"
    TERMS_VERSION: str = "v1"
    ONBOARDING_VERSION: str = "v1"
    MAX_UPLOAD_SIZE_MB: int = 50
    RATE_LIMIT_PER_MINUTE: int = 30
    RAM_HEADROOM_GB: float = 2.0

    # Backend selection
    LLM_BACKEND: str = "ollama"          # "ollama" | "lmstudio"
    LMSTUDIO_URL: str = "http://localhost:1234"
    WHISPER_BACKEND: str = "whisper_cpp"  # "whisper_cpp" | "local"
    MLX_WHISPER_MODEL: str = "mlx-community/whisper-large-v3-turbo"

    # OTAP environment profiles
    ENVIRONMENT_PROFILES: dict = {
        "development": {
            "debug": True,
            "rate_limiting": False,
            "admin_token_required": False,
            "cors_origins": ["*"],
            "log_level": "DEBUG",
        },
        "sandbox": {
            "debug": True,
            "rate_limiting": False,
            "admin_token_required": False,
            "cors_origins": ["*"],
            "log_level": "INFO",
            "show_sandbox_banner": True,
        },
        "production": {
            "debug": False,
            "rate_limiting": True,
            "admin_token_required": True,
            "cors_origins": ["http://localhost:8080"],
            "log_level": "WARNING",
        },
    }

    def get_profile(self) -> dict:
        """Return the active environment profile."""
        return self.ENVIRONMENT_PROFILES.get(
            self.ENVIRONMENT_MODE,
            self.ENVIRONMENT_PROFILES["production"],
        )


settings = Settings()
