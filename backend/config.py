from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from pathlib import Path


class Settings(BaseSettings):
    """Application settings using Pydantic v2 BaseSettings."""

    # Application
    app_name: str = "BioSure Backend API"
    app_version: str = "1.0.0"
    api_v1_prefix: str = "/api/v1"

    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    database_name: str = "biosure_db"

    # CORS
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:5137"]

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )


# Global settings instance
settings = Settings()
