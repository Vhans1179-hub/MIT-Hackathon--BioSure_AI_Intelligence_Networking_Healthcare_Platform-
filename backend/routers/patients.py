"""
Patient API endpoints for BioSure Analytics.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from backend.database import get_database
from backend.models.patient import (
    PatientResponse,
    PatientListResponse,
    PatientStatsResponse,
)


router = APIRouter(prefix="/api/v1/patients", tags=["patients"])


@router.get("", response_model=PatientListResponse)
async def get_patients(
    region: Optional[str] = Query(None, description="Filter by region"),
    state: Optional[str] = Query(None, description="Filter by state (2-char code)"),
    payer_type: Optional[str] = Query(None, description="Filter by payer type"),
    min_age: Optional[int] = Query(None, ge=18, le=120, description="Minimum age"),
    max_age: Optional[int] = Query(None, ge=18, le=120, description="Maximum age"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
):
    """
    Get paginated list of patients with optional filtering.
    
    Query parameters:
    - region: Filter by geographic region (West, South, Northeast, Midwest)
    - state: Filter by 2-character state code (e.g., CA, TX, FL)
    - payer_type: Filter by payer type (Commercial, Medicare Advantage, Medicaid, Other)
    - min_age: Minimum age filter (18-120)
    - max_age: Maximum age filter (18-120)
    - limit: Number of records to return (default: 100, max: 1000)
    - skip: Number of records to skip for pagination (default: 0)
    
    Returns:
    - patients: List of patient records
    - total: Total count of patients matching filters
    """
    try:
        db = await get_database()
        patients_collection = db["patients"]
        
        # Build filter query
        filter_query = {}
        
        if region:
            filter_query["region"] = region
        
        if state:
            filter_query["state"] = state.upper()
        
        if payer_type:
            filter_query["payer_type"] = payer_type
        
        if min_age is not None or max_age is not None:
            age_filter = {}
            if min_age is not None:
                age_filter["$gte"] = min_age
            if max_age is not None:
                age_filter["$lte"] = max_age
            filter_query["age"] = age_filter
        
        # Get total count
        total = await patients_collection.count_documents(filter_query)
        
        # Get paginated patients
        cursor = patients_collection.find(filter_query).skip(skip).limit(limit)
        patients_data = await cursor.to_list(length=limit)
        
        # Convert to response models
        patients = []
        for patient_data in patients_data:
            # Convert ObjectId to string for _id
            patient_data["_id"] = str(patient_data["_id"])
            patients.append(PatientResponse(**patient_data))
        
        return PatientListResponse(patients=patients, total=total)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching patients: {str(e)}")


@router.get("/stats", response_model=PatientStatsResponse)
async def get_patient_stats():
    """
    Get aggregated patient statistics.
    
    Returns comprehensive statistics including:
    - total_patients: Total count of patients
    - avg_age: Average patient age (rounded)
    - male_percent: Percentage of male patients (rounded)
    - avg_prior_lines: Average number of prior treatment lines (1 decimal)
    - payer_dist: Distribution of patients by payer type
    - region_dist: Distribution of patients by region
    - age_buckets: Distribution of patients by age ranges (50-59, 60-69, 70-79, 80+)
    """
    try:
        db = await get_database()
        patients_collection = db["patients"]
        
        # Aggregation pipeline for statistics
        pipeline = [
            {
                "$facet": {
                    # Total count and averages
                    "overview": [
                        {
                            "$group": {
                                "_id": None,
                                "total_patients": {"$sum": 1},
                                "avg_age": {"$avg": "$age"},
                                "avg_prior_lines": {"$avg": "$prior_lines"},
                                "male_count": {
                                    "$sum": {"$cond": [{"$eq": ["$sex", "M"]}, 1, 0]}
                                },
                            }
                        }
                    ],
                    # Payer distribution
                    "payer_dist": [
                        {
                            "$group": {
                                "_id": "$payer_type",
                                "count": {"$sum": 1}
                            }
                        }
                    ],
                    # Region distribution
                    "region_dist": [
                        {
                            "$group": {
                                "_id": "$region",
                                "count": {"$sum": 1}
                            }
                        }
                    ],
                    # Age buckets
                    "age_buckets": [
                        {
                            "$bucket": {
                                "groupBy": "$age",
                                "boundaries": [50, 60, 70, 80, 150],
                                "default": "other",
                                "output": {
                                    "count": {"$sum": 1}
                                }
                            }
                        }
                    ]
                }
            }
        ]
        
        result = await patients_collection.aggregate(pipeline).to_list(length=1)
        
        if not result:
            raise HTTPException(status_code=404, detail="No patient data found")
        
        data = result[0]
        
        # Extract overview stats
        overview = data["overview"][0] if data["overview"] else {}
        total_patients = overview.get("total_patients", 0)
        avg_age = round(overview.get("avg_age", 0))
        avg_prior_lines = round(overview.get("avg_prior_lines", 0), 1)
        male_count = overview.get("male_count", 0)
        male_percent = round((male_count / total_patients * 100) if total_patients > 0 else 0)
        
        # Convert payer distribution to dict
        payer_dist = {
            item["_id"]: item["count"]
            for item in data["payer_dist"]
        }
        
        # Convert region distribution to dict
        region_dist = {
            item["_id"]: item["count"]
            for item in data["region_dist"]
        }
        
        # Convert age buckets to dict with labels
        age_bucket_labels = {
            50: "50-59",
            60: "60-69",
            70: "70-79",
            80: "80+",
        }
        age_buckets = {
            age_bucket_labels.get(item["_id"], "other"): item["count"]
            for item in data["age_buckets"]
            if item["_id"] != "other"
        }
        
        return PatientStatsResponse(
            total_patients=total_patients,
            avg_age=avg_age,
            male_percent=male_percent,
            avg_prior_lines=avg_prior_lines,
            payer_dist=payer_dist,
            region_dist=region_dist,
            age_buckets=age_buckets,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating statistics: {str(e)}")