"""
Contract Service Layer

Provides reusable data access methods for contract templates and simulations.
"""

from typing import List, Dict, Any, Optional
from backend.database import get_database
from backend.models.contract import ContractTemplateResponse, SimulationRequest, SimulationResponse
from datetime import datetime


class ContractService:
    """Service for accessing contract template and simulation data"""
    
    @staticmethod
    async def get_all_templates() -> List[Dict[str, Any]]:
        """
        Get all contract templates
        
        Returns:
            List of contract template dictionaries
        """
        db = await get_database()
        templates = []
        
        async for template in db.contract_templates.find({}):
            # Convert MongoDB _id to string and remove it
            template.pop("_id", None)
            # Convert datetime objects to ISO format strings
            if "created_at" in template and isinstance(template["created_at"], datetime):
                template["created_at"] = template["created_at"].isoformat()
            if "updated_at" in template and isinstance(template["updated_at"], datetime):
                template["updated_at"] = template["updated_at"].isoformat()
            templates.append(template)
        
        return templates
    
    @staticmethod
    async def get_template_by_id(template_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific contract template by ID
        
        Args:
            template_id: The template identifier
            
        Returns:
            Template dictionary or None if not found
        """
        db = await get_database()
        template = await db.contract_templates.find_one({"template_id": template_id})
        
        if template:
            template.pop("_id", None)
            if "created_at" in template and isinstance(template["created_at"], datetime):
                template["created_at"] = template["created_at"].isoformat()
            if "updated_at" in template and isinstance(template["updated_at"], datetime):
                template["updated_at"] = template["updated_at"].isoformat()
        
        return template
    
    @staticmethod
    async def simulate_contract(
        template_id: str,
        rebate_percent: int,
        therapy_price: int,
        time_window: int
    ) -> Optional[Dict[str, Any]]:
        """
        Simulate contract rebate exposure
        
        Args:
            template_id: Template ID to simulate
            rebate_percent: Rebate percentage (0-100)
            therapy_price: Therapy price in dollars
            time_window: Time window in months
            
        Returns:
            Simulation results dictionary or None if template not found
        """
        db = await get_database()
        
        # Verify template exists
        template = await db.contract_templates.find_one({"template_id": template_id})
        if not template:
            return None
        
        outcome_type = template["outcome_type"]
        
        # Map outcome type to patient field
        outcome_field_map = {
            "12-month-survival": "has_event_12_month",
            "retreatment": "has_retreatment_18_month",
            "toxicity": "has_toxicity_30_day"
        }
        
        outcome_field = outcome_field_map.get(outcome_type)
        if not outcome_field:
            return None
        
        # Get total patient count
        total_patients = await db.patients.count_documents({})
        if total_patients == 0:
            return None
        
        # Count patients with outcome failure
        failure_count = await db.patients.count_documents({outcome_field: True})
        
        # Calculate metrics
        success_count = total_patients - failure_count
        failure_rate = round((failure_count / total_patients) * 100, 1)
        success_rate = round(100 - failure_rate, 1)
        
        # Calculate rebate amounts
        rebate_per_patient = (therapy_price * rebate_percent) / 100
        total_rebate = failure_count * rebate_per_patient
        low_rebate = total_rebate * 0.8  # -20% sensitivity
        high_rebate = total_rebate * 1.2  # +20% sensitivity
        avg_rebate_per_treated = total_rebate / total_patients
        
        return {
            "template_id": template_id,
            "template_name": template["name"],
            "outcome_type": outcome_type,
            "total_patients": total_patients,
            "failure_count": failure_count,
            "success_count": success_count,
            "failure_rate": failure_rate,
            "success_rate": success_rate,
            "rebate_per_patient": rebate_per_patient,
            "total_rebate": total_rebate,
            "low_rebate": low_rebate,
            "high_rebate": high_rebate,
            "avg_rebate_per_treated": avg_rebate_per_treated
        }
    
    @staticmethod
    async def get_template_summary() -> Dict[str, Any]:
        """
        Get summary statistics for all contract templates
        
        Returns:
            Dictionary with template counts and types
        """
        db = await get_database()
        
        total_templates = await db.contract_templates.count_documents({})
        
        # Count by outcome type
        outcome_types = {}
        async for template in db.contract_templates.find({}):
            outcome_type = template.get("outcome_type", "unknown")
            outcome_types[outcome_type] = outcome_types.get(outcome_type, 0) + 1
        
        return {
            "total_templates": total_templates,
            "outcome_types": outcome_types
        }