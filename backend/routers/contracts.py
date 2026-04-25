"""
Contract Templates and Simulation Router

Provides endpoints for:
- GET /api/v1/contracts/templates - List all contract templates
- POST /api/v1/contracts/simulate - Simulate contract rebate exposure
"""

from fastapi import APIRouter, HTTPException, status
from typing import List
from datetime import datetime
from backend.database import get_database
from backend.models.contract import (
    ContractTemplateResponse,
    SimulationRequest,
    SimulationResponse
)

router = APIRouter(prefix="/api/v1/contracts", tags=["contracts"])


@router.get("/templates", response_model=dict)
async def get_contract_templates():
    """
    Get all contract templates
    
    Returns:
        dict: Dictionary with 'templates' key containing list of all contract templates
    """
    db = await get_database()
    templates = []
    
    async for template in db.contract_templates.find({}):
        # Convert MongoDB _id to string and remove it from response
        template.pop("_id", None)
        # Convert datetime objects to ISO format strings if needed
        if "created_at" in template and isinstance(template["created_at"], datetime):
            template["created_at"] = template["created_at"].isoformat()
        if "updated_at" in template and isinstance(template["updated_at"], datetime):
            template["updated_at"] = template["updated_at"].isoformat()
        templates.append(ContractTemplateResponse(**template))
    
    return {"templates": templates}


@router.post("/simulate", response_model=SimulationResponse)
async def simulate_contract(request: SimulationRequest):
    """
    Simulate contract rebate exposure based on patient outcomes
    
    Args:
        request: SimulationRequest with template_id, rebate_percent, therapy_price, time_window
    
    Returns:
        SimulationResponse: Calculated simulation results including rebate exposure
    
    Raises:
        HTTPException: 404 if template not found
    """
    db = await get_database()
    
    # Verify template exists
    template = await db.contract_templates.find_one({"template_id": request.template_id})
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contract template '{request.template_id}' not found"
        )
    
    outcome_type = template["outcome_type"]
    
    # Map outcome type to patient field
    outcome_field_map = {
        "12-month-survival": "has_event_12_month",
        "retreatment": "has_retreatment_18_month",
        "toxicity": "has_toxicity_30_day"
    }
    
    outcome_field = outcome_field_map.get(outcome_type)
    if not outcome_field:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unknown outcome type: {outcome_type}"
        )
    
    # Get total patient count
    total_patients = await db.patients.count_documents({})
    
    if total_patients == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No patients found in database"
        )
    
    # Count patients with outcome failure (has_event = True)
    failure_count = await db.patients.count_documents({outcome_field: True})
    
    # Calculate metrics
    success_count = total_patients - failure_count
    failure_rate = round((failure_count / total_patients) * 100, 1)
    success_rate = round(100 - failure_rate, 1)
    
    # Calculate rebate amounts
    rebate_per_patient = (request.therapy_price * request.rebate_percent) / 100
    total_rebate = failure_count * rebate_per_patient
    low_rebate = total_rebate * 0.8  # -20% sensitivity
    high_rebate = total_rebate * 1.2  # +20% sensitivity
    avg_rebate_per_treated = total_rebate / total_patients
    
    return SimulationResponse(
        total_patients=total_patients,
        failure_count=failure_count,
        success_count=success_count,
        failure_rate=failure_rate,
        success_rate=success_rate,
        rebate_per_patient=rebate_per_patient,
        total_rebate=total_rebate,
        low_rebate=low_rebate,
        high_rebate=high_rebate,
        avg_rebate_per_treated=avg_rebate_per_treated
    )