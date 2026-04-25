from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports to work from both root and backend directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import settings
from backend.database import database

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up BioSure Backend API...")
    try:
        await database.connect_db()
        logger.info("Database connection established")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        logger.warning("API will start but database operations may fail")

    yield

    logger.info("Shutting down BioSure Backend API...")
    await database.close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def health_check():
    db_connected = await database.ping_db()
    return {
        "status": "ok",
        "database": "connected" if db_connected else "disconnected",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get(settings.api_v1_prefix + "/")
async def root():
    return {
        "message": "Welcome to BioSure Backend API",
        "version": settings.app_version,
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    import os

    port = int(os.getenv("PORT", settings.port))
    host = os.getenv("HOST", settings.host)

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True
    )
