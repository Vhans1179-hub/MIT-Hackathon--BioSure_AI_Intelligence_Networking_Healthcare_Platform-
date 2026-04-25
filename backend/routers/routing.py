"""
backend/routers/routing.py

CAR-T treatment-center routing endpoints. Given a patient (with home location
+ insurance), returns ranked treatment centers that can deliver the relevant
product, weighted by clinical match, distance, and insurance compatibility.

Routes:
    GET  /routing/countries                   list supported country codes
    GET  /routing/centers?country=US          all centers for a country (raw)
    POST /routing/recommend                   ranked recommendations for a patient

Wire into main.py with:
    from backend.routers import routing
    app.include_router(routing.router, prefix="/api/v1")
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.services.routing_service import (
    RoutingService,
    get_routing_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/routing", tags=["routing"])


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class RecommendRequest(BaseModel):
    patient_bundle: dict[str, Any] = Field(
        ...,
        description="Patient bundle including home_location with lat/lon "
                    "and insurance_type.",
    )
    country: str = Field(default="US", description="ISO-2 country code (US, IN).")
    trial_id: Optional[str] = Field(
        default=None,
        description="If provided, prefers centers participating in this trial.",
    )
    product: Optional[str] = Field(
        default="Carvykti",
        description="CAR-T product the patient needs (e.g. Carvykti, NexCAR19).",
    )
    top_n: int = Field(default=5, ge=1, le=20)
    include_out_of_network: bool = Field(default=True)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/countries", response_model=list[str])
async def list_countries(
    svc: RoutingService = Depends(get_routing_service),
) -> list[str]:
    """List ISO-2 country codes for which we have treatment-center data."""
    return svc.list_supported_countries()


@router.get("/centers")
async def list_centers(
    country: str = Query("US", description="ISO-2 country code"),
    svc: RoutingService = Depends(get_routing_service),
) -> dict[str, Any]:
    """
    Return all treatment centers for a country (no patient context, no
    ranking). Useful for plotting all centers on the map.
    """
    try:
        data = svc._load_country(country)
        return {
            "country": data["country"],
            "distance_unit": data.get("distance_unit"),
            "insurance_types": data.get("insurance_types", []),
            "centers": data["centers"],
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/recommend")
async def recommend(
    req: RecommendRequest,
    svc: RoutingService = Depends(get_routing_service),
) -> dict[str, Any]:
    """
    Return ranked treatment centers for a given patient + trial/product.
    Falls back to a `nearest_overall` field surfacing the geographically
    closest center when it doesn't make the top_n (typical for rural patients
    whose closest center is out-of-network).
    """
    try:
        return svc.recommend_centers(
            patient_bundle=req.patient_bundle,
            country=req.country,
            trial_id=req.trial_id,
            product=req.product,
            top_n=req.top_n,
            include_out_of_network=req.include_out_of_network,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Routing recommend failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Routing failed: {e}",
        )
