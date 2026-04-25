# BioSure Backend API

FastAPI backend for the BioSure application with MongoDB Atlas integration.

## Features

- FastAPI with async/await support
- MongoDB Atlas integration using Motor (async driver)
- CORS configuration for frontend
- Health check endpoint
- Environment-based configuration
- Pydantic v2 for data validation

## Prerequisites

- Python 3.9 or higher
- MongoDB Atlas account (or local MongoDB instance)

## Setup

### 1. Create Virtual Environment

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=biosure_db
CORS_ORIGINS=["http://localhost:5173","http://localhost:5137"]
```

### 4. Run

```bash
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Available at:
- API base: `http://localhost:8000/api/v1`
- Health check: `http://localhost:8000/healthz`
- OpenAPI docs: `http://localhost:8000/docs`

## Project Structure

```
backend/
├── __init__.py
├── main.py              # FastAPI application entry point
├── config.py            # Configuration management
├── database.py          # MongoDB connection handling
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variables template
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `DATABASE_NAME` | Database name | `biosure_db` |
| `CORS_ORIGINS` | Allowed CORS origins | `["http://localhost:5173","http://localhost:5137"]` |
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8000` |
| `API_V1_PREFIX` | API version prefix | `/api/v1` |
