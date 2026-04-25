"""
HCO (Healthcare Organization) data models for BioSure Analytics.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from bson import ObjectId


class HCOBase(BaseModel):
    """Base HCO model with all HCO fields."""

    hco_id: str = Field(..., description="Unique HCO identifier (e.g., HCO-001)")
    name: str = Field(..., description="Healthcare organization name")
    state: str = Field(..., min_length=2, max_length=2, description="2-character state code")
    region: str = Field(..., description="Geographic region")
    treated_patients: int = Field(..., ge=0, description="Number of treated patients")
    ghost_patients: int = Field(..., ge=0, description="Number of ghost (eligible but untreated) patients")

    @field_validator("state", mode="before")
    @classmethod
    def validate_state(cls, v: str) -> str:
        """Validate state is uppercase 2-character code."""
        return v.upper()

    @field_validator("region", mode="before")
    @classmethod
    def validate_region(cls, v: str) -> str:
        """Validate region is one of the allowed values."""
        allowed_regions = ["West", "South", "Northeast", "Midwest"]
        if v not in allowed_regions:
            raise ValueError(f"region must be one of {allowed_regions}")
        return v

    @field_validator("treated_patients", "ghost_patients", mode="before")
    @classmethod
    def validate_non_negative(cls, v: int) -> int:
        """Validate patient counts are non-negative."""
        if v < 0:
            raise ValueError("Patient counts must be non-negative")
        return v

    model_config = {
        "json_schema_extra": {
            "example": {
                "hco_id": "HCO-001",
                "name": "California Medical Center",
                "state": "CA",
                "region": "West",
                "treated_patients": 25,
                "ghost_patients": 87,
            }
        }
    }


class HCOCreate(HCOBase):
    """Model for creating a new HCO."""
    pass


class HCOInDB(HCOBase):
    """HCO model as stored in database with MongoDB _id."""

    id: Optional[str] = Field(None, alias="_id", description="MongoDB document ID")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {
            ObjectId: str,
            datetime: lambda v: v.isoformat(),
        }
    }


class HCOResponse(HCOBase):
    """Model for API responses with calculated leakage_rate."""

    id: str = Field(..., alias="_id", description="MongoDB document ID")
    leakage_rate: float = Field(..., description="Percentage of eligible patients not treated")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {
        "populate_by_name": True,
        "json_encoders": {
            datetime: lambda v: v.isoformat(),
        }
    }


class HCOListResponse(BaseModel):
    """Response model for paginated HCO list."""

    hcos: list[HCOResponse]
    total: int

    model_config = {
        "json_schema_extra": {
            "example": {
                "hcos": [],
                "total": 50
            }
        }
    }


class HCOStatsResponse(BaseModel):
    """Response model for aggregated HCO statistics."""

    total_ghost: int = Field(..., description="Total ghost patients across all HCOs")
    total_treated: int = Field(..., description="Total treated patients across all HCOs")
    avg_ghost_per_hco: int = Field(..., description="Average ghost patients per HCO")
    leakage_rate: float = Field(..., description="Overall leakage rate percentage")
    hco_count: int = Field(..., description="Total number of HCOs")

    model_config = {
        "json_schema_extra": {
            "example": {
                "total_ghost": 2500,
                "total_treated": 847,
                "avg_ghost_per_hco": 50,
                "leakage_rate": 74.7,
                "hco_count": 50
            }
        }
    }
