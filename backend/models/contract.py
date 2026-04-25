"""
Contract Template and Simulation Models

Defines Pydantic models for contract templates and simulation requests/responses.
"""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator


class ContractTemplateBase(BaseModel):
    """Base model for contract templates"""
    template_id: str = Field(..., description="Unique template identifier")
    name: str = Field(..., description="Template name")
    description: str = Field(..., description="Template description")
    outcome_type: Literal["12-month-survival", "retreatment", "toxicity"] = Field(
        ..., description="Type of outcome measured"
    )
    default_time_window: int = Field(..., description="Default time window in months", gt=0)
    default_rebate_percent: int = Field(..., description="Default rebate percentage", ge=0, le=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ContractTemplateInDB(ContractTemplateBase):
    """Contract template model with MongoDB _id field"""
    id: str = Field(..., alias="_id", description="MongoDB document ID")

    class Config:
        populate_by_name = True


class ContractTemplateResponse(ContractTemplateBase):
    """Contract template model for API responses"""
    pass


class SimulationRequest(BaseModel):
    """Request model for contract simulation"""
    template_id: str = Field(..., description="Template ID to simulate")
    rebate_percent: int = Field(..., description="Rebate percentage", ge=0, le=100)
    therapy_price: int = Field(..., description="Therapy price in dollars", gt=0)
    time_window: int = Field(..., description="Time window in months", gt=0)

    @field_validator('rebate_percent')
    @classmethod
    def validate_rebate_percent(cls, v: int) -> int:
        """Validate rebate percentage is between 0 and 100"""
        if not 0 <= v <= 100:
            raise ValueError('rebate_percent must be between 0 and 100')
        return v

    @field_validator('therapy_price')
    @classmethod
    def validate_therapy_price(cls, v: int) -> int:
        """Validate therapy price is positive"""
        if v <= 0:
            raise ValueError('therapy_price must be greater than 0')
        return v

    @field_validator('time_window')
    @classmethod
    def validate_time_window(cls, v: int) -> int:
        """Validate time window is positive"""
        if v <= 0:
            raise ValueError('time_window must be greater than 0')
        return v


class SimulationResponse(BaseModel):
    """Response model for contract simulation results"""
    total_patients: int = Field(..., description="Total number of patients in cohort")
    failure_count: int = Field(..., description="Number of patients with outcome failure")
    success_count: int = Field(..., description="Number of patients with outcome success")
    failure_rate: float = Field(..., description="Failure rate as percentage (1 decimal)")
    success_rate: float = Field(..., description="Success rate as percentage (1 decimal)")
    rebate_per_patient: float = Field(..., description="Rebate amount per failed patient")
    total_rebate: float = Field(..., description="Total rebate exposure")
    low_rebate: float = Field(..., description="Low sensitivity estimate (-20%)")
    high_rebate: float = Field(..., description="High sensitivity estimate (+20%)")
    avg_rebate_per_treated: float = Field(..., description="Average rebate per treated patient")