"""
HCO API endpoints for BioSure Analytics.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from backend.database import get_database
from backend.models.hco import (
    HCOResponse,
    HCOListResponse,
    HCOStatsResponse,
)


router = APIRouter(prefix="/api/v1/hcos", tags=["hcos"])


@router.get("", response_model=HCOListResponse)
async def get_hcos(
    region: Optional[str] = Query(None, description="Filter by region"),
    state: Optional[str] = Query(None, description="Filter by state (2-char code)"),
    min_ghost_patients: Optional[int] = Query(None, ge=0, description="Minimum ghost patients"),
    sort_by: str = Query("ghost_patients", description="Sort field (ghost_patients, leakage_rate, name)"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
):
    """
    Get paginated list of HCOs with optional filtering and sorting.
    
    Query parameters:
    - region: Filter by geographic region (West, South, Northeast, Midwest)
    - state: Filter by 2-character state code (e.g., CA, TX, FL)
    - min_ghost_patients: Minimum number of ghost patients
    - sort_by: Sort field (ghost_patients, leakage_rate, name) - default: ghost_patients
    - limit: Number of records to return (default: 100, max: 1000)
    - skip: Number of records to skip for pagination (default: 0)
    
    Returns:
    - hcos: List of HCO records with calculated leakage_rate
    - total: Total count of HCOs matching filters
    """
    try:
        db = await get_database()
        hcos_collection = db["hcos"]
        
        # Build filter query
        filter_query = {}
        
        if region:
            filter_query["region"] = region
        
        if state:
            filter_query["state"] = state.upper()
        
        if min_ghost_patients is not None:
            filter_query["ghost_patients"] = {"$gte": min_ghost_patients}
        
        # Get total count
        total = await hcos_collection.count_documents(filter_query)
        
        # Determine sort order
        sort_field = "ghost_patients"
        sort_order = -1  # Descending by default
        
        if sort_by == "leakage_rate":
            # For leakage_rate, we need to calculate it in aggregation
            # Use aggregation pipeline to add calculated field and sort
            pipeline = [
                {"$match": filter_query},
                {
                    "$addFields": {
                        "leakage_rate": {
                            "$multiply": [
                                {
                                    "$divide": [
                                        "$ghost_patients",
                                        {"$add": ["$ghost_patients", "$treated_patients"]}
                                    ]
                                },
                                100
                            ]
                        }
                    }
                },
                {"$sort": {"leakage_rate": -1}},
                {"$skip": skip},
                {"$limit": limit}
            ]
            
            hcos_data = await hcos_collection.aggregate(pipeline).to_list(length=limit)
        elif sort_by == "name":
            sort_field = "name"
            sort_order = 1  # Ascending for name
            cursor = hcos_collection.find(filter_query).sort(sort_field, sort_order).skip(skip).limit(limit)
            hcos_data = await cursor.to_list(length=limit)
        else:
            # Default: sort by ghost_patients descending
            cursor = hcos_collection.find(filter_query).sort("ghost_patients", -1).skip(skip).limit(limit)
            hcos_data = await cursor.to_list(length=limit)
        
        # Convert to response models with calculated leakage_rate
        hcos = []
        for hco_data in hcos_data:
            # Convert ObjectId to string for _id
            hco_data["_id"] = str(hco_data["_id"])
            
            # Calculate leakage_rate if not already present
            if "leakage_rate" not in hco_data:
                total_patients = hco_data["ghost_patients"] + hco_data["treated_patients"]
                hco_data["leakage_rate"] = (hco_data["ghost_patients"] / total_patients * 100) if total_patients > 0 else 0.0
            
            hcos.append(HCOResponse(**hco_data))
        
        return HCOListResponse(hcos=hcos, total=total)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching HCOs: {str(e)}")


@router.get("/stats", response_model=HCOStatsResponse)
async def get_hco_stats():
    """
    Get aggregated HCO statistics.
    
    Returns comprehensive statistics including:
    - total_ghost: Total ghost patients across all HCOs
    - total_treated: Total treated patients across all HCOs
    - avg_ghost_per_hco: Average ghost patients per HCO (rounded)
    - leakage_rate: Overall leakage rate percentage (1 decimal)
    - hco_count: Total number of HCOs
    """
    try:
        db = await get_database()
        hcos_collection = db["hcos"]
        
        # Aggregation pipeline for statistics
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_ghost": {"$sum": "$ghost_patients"},
                    "total_treated": {"$sum": "$treated_patients"},
                    "hco_count": {"$sum": 1},
                }
            }
        ]
        
        result = await hcos_collection.aggregate(pipeline).to_list(length=1)
        
        if not result:
            raise HTTPException(status_code=404, detail="No HCO data found")
        
        data = result[0]
        
        # Extract stats
        total_ghost = data.get("total_ghost", 0)
        total_treated = data.get("total_treated", 0)
        hco_count = data.get("hco_count", 0)
        
        # Calculate derived metrics
        avg_ghost_per_hco = round(total_ghost / hco_count) if hco_count > 0 else 0
        total_patients = total_ghost + total_treated
        leakage_rate = round((total_ghost / total_patients * 100), 1) if total_patients > 0 else 0.0
        
        return HCOStatsResponse(
            total_ghost=total_ghost,
            total_treated=total_treated,
            avg_ghost_per_hco=avg_ghost_per_hco,
            leakage_rate=leakage_rate,
            hco_count=hco_count,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating HCO statistics: {str(e)}")