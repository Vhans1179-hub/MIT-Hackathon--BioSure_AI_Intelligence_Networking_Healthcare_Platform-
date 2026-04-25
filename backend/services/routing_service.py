"""
backend/services/routing_service.py

Patient-to-treatment-center routing for CAR-T eligibility cases.

Given a patient (with home_location + insurance) and an optional eligibility
verdict / trial_id, returns CAR-T-certified treatment centers ranked by a
composite score combining:

    1. Clinical match  — does the center deliver the required product / run
                         the trial the patient is being evaluated against?
                         Hard filter: a center that can't deliver care is
                         excluded from results.
    2. Distance         — Haversine distance from patient home to center.
                         Closer is better (normalized 1.0 at 0 km, 0.0 at the
                         max distance among candidates).
    3. Insurance match  — does the center accept the patient's insurance?
                         Binary 1.0 / 0.0; weighted but not a hard filter so
                         out-of-network centers still appear (greyed out in
                         the UI) for transparency.

Country-aware: loads US and India centers from separate JSON files and
exposes them via a `country` parameter. Same scoring works for both because
the data schemas are identical (only insurance vocabularies differ).

Usage:
    from backend.services.routing_service import get_routing_service
    svc = get_routing_service()
    ranked = svc.recommend_centers(
        patient_bundle=bundle,
        country="US",
        trial_id="CARTITUDE-4",
        product="Carvykti",
        top_n=5,
    )
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

SERVICE_DIR = Path(__file__).parent
ROUTING_DIR = SERVICE_DIR.parent / "data" / "routing"

WEIGHT_DISTANCE = 0.35
WEIGHT_INSURANCE = 0.25
WEIGHT_CLINICAL = 0.40

EARTH_RADIUS_KM = 6371.0
KM_PER_MILE = 1.609344


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in kilometres."""
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def estimate_drive_hours(distance_km: float) -> float:
    """Back-of-envelope drive time: assume ~80 km/h average + 30% road overhead."""
    return (distance_km * 1.30) / 80.0


class RoutingService:
    """Loads country-scoped center datasets and ranks them per patient."""

    def __init__(self) -> None:
        self._centers_by_country: dict[str, dict[str, Any]] = {}

    def _load_country(self, country: str) -> dict[str, Any]:
        country = country.upper()
        if country in self._centers_by_country:
            return self._centers_by_country[country]

        path = ROUTING_DIR / f"treatment_centers_{country.lower()}.json"
        if not path.exists():
            raise FileNotFoundError(f"No treatment-center data for country '{country}' (looked at {path})")
        with path.open() as f:
            data = json.load(f)
        self._centers_by_country[country] = data
        logger.info("Loaded %d treatment centers for country=%s", len(data["centers"]), country)
        return data

    def list_supported_countries(self) -> list[str]:
        """Return ISO-2 country codes for which we have centers data."""
        codes = []
        for f in ROUTING_DIR.glob("treatment_centers_*.json"):
            stem = f.stem.rsplit("_", 1)[1].upper()
            codes.append(stem)
        return sorted(codes)

    def recommend_centers(
        self,
        patient_bundle: dict[str, Any],
        country: str = "US",
        trial_id: Optional[str] = None,
        product: Optional[str] = "Carvykti",
        top_n: int = 5,
        include_out_of_network: bool = True,
    ) -> dict[str, Any]:
        """
        Rank treatment centers for a patient.

        Args:
            patient_bundle: full eligibility patient bundle (must have
                home_location with lat/lon and insurance_type).
            country: ISO-2 country code (e.g. "US" or "IN").
            trial_id: optional trial protocol; if provided, prefers centers
                that are participating sites for that trial.
            product: optional CAR-T product (e.g. "Carvykti", "NexCAR19").
                If provided, only centers certified for the product are
                considered clinically matched. Default "Carvykti".
            top_n: number of centers to return.
            include_out_of_network: when True, centers that don't accept the
                patient's insurance are still returned (with insurance_score
                = 0). Useful for showing the gap. When False, they're filtered.

        Returns:
            Dict with patient context, ranked centers list, and country meta.
        """
        country = country.upper()
        country_data = self._load_country(country)
        centers = country_data["centers"]
        distance_unit = country_data.get("distance_unit", "km")

        home = patient_bundle.get("home_location") or {}
        if not home.get("lat") or not home.get("lon"):
            raise ValueError(
                f"Patient {patient_bundle.get('patient_id', '?')} has no usable "
                "home_location (lat/lon required). Cannot route."
            )
        plat, plon = float(home["lat"]), float(home["lon"])
        patient_insurance = home.get("insurance_type", "")

        scored: list[dict[str, Any]] = []
        for c in centers:
            distance_km = haversine_km(plat, plon, float(c["lat"]), float(c["lon"]))

            # Clinical match: must be certified for the product. If a trial_id
            # is given, prefer (but don't require) participating sites.
            certified = product in c.get("products_certified", []) if product else True
            on_trial = trial_id in c.get("trial_sites", []) if trial_id else False
            if not certified:
                # Hard filter — center can't deliver this product.
                continue
            clinical_score = 1.0 if on_trial else (0.85 if certified else 0.0)

            # Insurance match.
            insurance_match = patient_insurance in c.get("insurance_accepted", [])
            if not insurance_match and not include_out_of_network:
                continue
            insurance_score = 1.0 if insurance_match else 0.0

            scored.append({
                "center": c,
                "distance_km": distance_km,
                "clinical_score": clinical_score,
                "insurance_score": insurance_score,
                "in_network": insurance_match,
                "on_trial": on_trial,
            })

        if not scored:
            return {
                "patient_id": patient_bundle.get("patient_id"),
                "country": country,
                "distance_unit": distance_unit,
                "patient_home": home,
                "trial_id": trial_id,
                "product": product,
                "centers": [],
                "note": "No centers found that can deliver this product in the requested country.",
            }

        # Normalize distance: 1.0 at the closest, 0.0 at the farthest among
        # candidates. Avoids the score being dominated by absolute distance
        # when the patient is rural.
        max_dist = max(s["distance_km"] for s in scored) or 1.0
        min_dist = min(s["distance_km"] for s in scored)
        span = max(max_dist - min_dist, 1e-6)
        for s in scored:
            s["distance_score"] = 1.0 - (s["distance_km"] - min_dist) / span

        # Composite score.
        for s in scored:
            s["composite_score"] = round(
                WEIGHT_CLINICAL * s["clinical_score"]
                + WEIGHT_DISTANCE * s["distance_score"]
                + WEIGHT_INSURANCE * s["insurance_score"],
                4,
            )

        # Find the geographically nearest center (regardless of score) so the
        # demo can highlight the gap when the closest is out-of-network.
        nearest = min(scored, key=lambda s: s["distance_km"])

        scored.sort(key=lambda s: s["composite_score"], reverse=True)

        def _to_display(s: dict[str, Any], rank: int) -> dict[str, Any]:
            c = s["center"]
            distance_display = (
                round(s["distance_km"] / KM_PER_MILE, 1) if distance_unit == "miles"
                else round(s["distance_km"], 1)
            )
            return {
                "rank": rank,
                "center_id": c["center_id"],
                "name": c["name"],
                "city": c["city"],
                "state": c["state"],
                "country": c["country"],
                "lat": c["lat"],
                "lon": c["lon"],
                "products_certified": c["products_certified"],
                "insurance_accepted": c["insurance_accepted"],
                "trial_sites": c.get("trial_sites", []),
                "capacity_per_month": c.get("capacity_per_month"),
                "current_wait_weeks": c.get("current_wait_weeks"),
                "distance": distance_display,
                "distance_unit": distance_unit,
                "drive_hours_estimate": round(estimate_drive_hours(s["distance_km"]), 1),
                "in_network": s["in_network"],
                "on_trial": s["on_trial"],
                "scores": {
                    "clinical": round(s["clinical_score"], 3),
                    "distance": round(s["distance_score"], 3),
                    "insurance": round(s["insurance_score"], 3),
                    "composite": s["composite_score"],
                },
            }

        top = scored[:top_n]
        ranked = [_to_display(s, rank=i + 1) for i, s in enumerate(top)]

        # If the absolute-nearest center didn't make top_n, surface it
        # separately so the UI can render "closest geographically, but our
        # recommendation differs because of payer / clinical fit."
        nearest_alt = None
        if nearest["center"]["center_id"] not in {c["center_id"] for c in ranked}:
            nearest_alt = _to_display(nearest, rank=0)
            nearest_alt["note"] = (
                "Geographically closest, but ranked lower due to insurance "
                "or trial-site mismatch."
            )

        return {
            "patient_id": patient_bundle.get("patient_id"),
            "country": country,
            "distance_unit": distance_unit,
            "patient_home": home,
            "trial_id": trial_id,
            "product": product,
            "weights": {
                "clinical": WEIGHT_CLINICAL,
                "distance": WEIGHT_DISTANCE,
                "insurance": WEIGHT_INSURANCE,
            },
            "centers": ranked,
            "nearest_overall": nearest_alt,
        }


_singleton: Optional[RoutingService] = None


def get_routing_service() -> RoutingService:
    """FastAPI Depends factory — singleton-style."""
    global _singleton
    if _singleton is None:
        _singleton = RoutingService()
    return _singleton
