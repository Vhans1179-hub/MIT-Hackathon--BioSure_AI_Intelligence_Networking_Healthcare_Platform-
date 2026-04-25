"""
Patient data models for BioSure Analytics.
"""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from bson import ObjectId


class PatientBase(BaseModel):
    """Base patient model with all patient fields."""
    
    patient_id: str = Field(..., description="Unique patient identifier (e.g., PT-000001)")
    age: int = Field(..., ge=18, le=120, description="Patient age (18-120)")
    sex: str = Field(..., description="Patient sex (M or F)")
    state: str = Field(..., min_length=2, max_length=2, description="2-character state code")
    region: str = Field(..., description="Geographic region")
    payer_type: str = Field(..., description="Insurance payer type")
    index_date: date = Field(..., description="Index date for patient")
    treating_hco_id: str = Field(..., description="Healthcare organization ID (e.g., HCO-001)")
    treating_hco_name: str = Field(..., description="Healthcare organization name")
    prior_lines: int = Field(..., ge=2, le=10, description="Number of prior treatment lines (2-10)")
    has_event_12_month: bool = Field(..., description="Had event within 12 months")
    has_retreatment_18_month: bool = Field(..., description="Had retreatment within 18 months")
    has_toxicity_30_day: bool = Field(..., description="Had toxicity within 30 days")
    
    @field_validator("sex")
    @classmethod
    def validate_sex(cls, v: str) -> str:
        """Validate sex is M or F."""
        if v not in ["M", "F"]:
            raise ValueError("sex must be 'M' or 'F'")
        return v
    
    @field_validator("region")
    @classmethod
    def validate_region(cls, v: str) -> str:
        """Validate region is one of the allowed values."""
        allowed_regions = ["West", "South", "Northeast", "Midwest"]
        if v not in allowed_regions:
            raise ValueError(f"region must be one of {allowed_regions}")
        return v
    
    @field_validator("payer_type")
    @classmethod
    def validate_payer_type(cls, v: str) -> str:
        """Validate payer_type is one of the allowed values."""
        allowed_payers = ["Commercial", "Medicare Advantage", "Medicaid", "Other"]
        if v not in allowed_payers:
            raise ValueError(f"payer_type must be one of {allowed_payers}")
        return v
    
    @field_validator("state")
    @classmethod
    def validate_state(cls, v: str) -> str:
        """Validate state is uppercase 2-character code."""
        return v.upper()
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "patient_id": "PT-000001",
                "age": 65,
                "sex": "M",
                "state": "CA",
                "region": "West",
                "payer_type": "Medicare Advantage",
                "index_date": "2023-06-15",
                "treating_hco_id": "HCO-001",
                "treating_hco_name": "City Medical Center",
                "prior_lines": 3,
                "has_event_12_month": False,
                "has_retreatment_18_month": False,
                "has_toxicity_30_day": True,
            }
        }
    }


class PatientCreate(PatientBase):
    """Model for creating a new patient."""
    pass


class PatientInDB(PatientBase):
    """Patient model as stored in database with MongoDB _id."""
    
    id: Optional[str] = Field(None, alias="_id", description="MongoDB document ID")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")
    
    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {
            ObjectId: str,
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat(),
        }
    }


class PatientResponse(PatientBase):
    """Model for API responses."""
    
    id: str = Field(..., alias="_id", description="MongoDB document ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    
    model_config = {
        "populate_by_name": True,
        "json_encoders": {
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat(),
        }
    }


class PatientListResponse(BaseModel):
    """Response model for paginated patient list."""
    
    patients: list[PatientResponse]
    total: int
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "patients": [],
                "total": 847
            }
        }
    }


class PatientStatsResponse(BaseModel):
    """Response model for patient statistics."""
    
    total_patients: int
    avg_age: int
    male_percent: int
    avg_prior_lines: float
    payer_dist: dict[str, int]
    region_dist: dict[str, int]
    age_buckets: dict[str, int]
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "total_patients": 847,
                "avg_age": 67,
                "male_percent": 60,
                "avg_prior_lines": 3.2,
                "payer_dist": {
                    "Commercial": 200,
                    "Medicare Advantage": 400,
                    "Medicaid": 150,
                    "Other": 97
                },
                "region_dist": {
                    "West": 250,
                    "South": 300,
                    "Northeast": 200,
                    "Midwest": 97
                },
                "age_buckets": {
                    "50-59": 150,
                    "60-69": 350,
                    "70-79": 300,
                    "80+": 47
                }
            }
        }
    }