"""
backend/routers/eligibility.py

CAR-T eligibility evaluation endpoints with longitudinal patient journey
tracking. Plugs into the existing /api/v1 router structure.

Routes:
    GET  /eligibility/trials                              list available trials
    GET  /eligibility/criteria/{trial_id}                 full criteria spec
    POST /eligibility/evaluate                            evaluate a patient bundle
    GET  /eligibility/history/{trial_id}/{patient_id}     longitudinal evaluation history
    GET  /eligibility/transitions/{trial_id}/{patient_id} state-change events only

Wire into main.py with:
    from backend.routers import eligibility
    app.include_router(eligibility.router, prefix="/api/v1")
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.services.eligibility_service import (
    EligibilityService,
    get_eligibility_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/eligibility", tags=["eligibility"])


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------


class EvaluateRequest(BaseModel):
    patient_bundle: dict[str, Any] = Field(
        ...,
        description="Patient bundle with demographics + documents.",
    )
    trial_id: str = Field(default="CARTITUDE-4")
    persist: bool = Field(
        default=True,
        description="When True, the evaluation is added to the patient's "
                    "longitudinal history. Set False for ad-hoc evaluations.",
    )


class EvidenceItem(BaseModel):
    document_id: str
    quoted_text: str
    location: str


class CriterionResult(BaseModel):
    criterion_id: str
    result: str
    confidence: str
    reasoning: str
    evidence: list[EvidenceItem]


class EvaluateResponse(BaseModel):
    patient_id: str
    trial_id: str
    evaluation_date: str
    final_determination: str
    summary_reasoning: str
    criteria_results: list[CriterionResult]
    flags: list[str]
    alternative_trials_suggested: list[str]


class ChangedCriterion(BaseModel):
    criterion_id: str
    from_result: Optional[str]
    to_result: str
    reasoning: str
    evidence: list[EvidenceItem]


class StateTransition(BaseModel):
    patient_id: str
    trial_id: str
    from_determination: str
    to_determination: str
    from_snapshot_date: Optional[str]
    to_snapshot_date: Optional[str]
    changed_criteria: list[ChangedCriterion]
    summary_reasoning: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/trials", response_model=list[str])
async def list_trials(
    svc: EligibilityService = Depends(get_eligibility_service),
) -> list[str]:
    """List trial IDs that have criteria specs loaded."""
    return svc.list_available_trials()


@router.get("/criteria/{trial_id}")
async def get_criteria(
    trial_id: str,
    svc: EligibilityService = Depends(get_eligibility_service),
) -> dict[str, Any]:
    """Return the full criteria spec for a given trial."""
    try:
        return svc.get_criteria(trial_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(
    req: EvaluateRequest,
    svc: EligibilityService = Depends(get_eligibility_service),
) -> EvaluateResponse:
    """Evaluate a patient bundle. By default the result is added to history."""
    try:
        result = await svc.evaluate_patient(
            req.patient_bundle, req.trial_id, persist=req.persist
        )
        return EvaluateResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.exception("Eligibility evaluation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evaluation failed: {e}",
        )


@router.get(
    "/history/{trial_id}/{patient_id}",
    response_model=list[EvaluateResponse],
)
async def get_history(
    trial_id: str,
    patient_id: str,
    svc: EligibilityService = Depends(get_eligibility_service),
) -> list[EvaluateResponse]:
    """
    Return all stored evaluations for this patient/trial, oldest first.
    Empty list if no history exists.
    """
    try:
        history = await svc.get_patient_history(patient_id, trial_id)
        return [EvaluateResponse(**h) for h in history]
    except Exception as e:
        logger.exception("Failed to retrieve patient history")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"History retrieval failed: {e}",
        )


@router.get(
    "/transitions/{trial_id}/{patient_id}",
    response_model=list[StateTransition],
)
async def get_transitions(
    trial_id: str,
    patient_id: str,
    svc: EligibilityService = Depends(get_eligibility_service),
) -> list[StateTransition]:
    """
    Return only the events where determination changed between consecutive
    evaluations. Each transition includes the criteria that drove the change.
    Empty list if fewer than 2 evaluations exist or no changes occurred.
    """
    try:
        transitions = await svc.get_state_transitions(patient_id, trial_id)
        return [StateTransition(**t) for t in transitions]
    except Exception as e:
        logger.exception("Failed to compute state transitions")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transitions computation failed: {e}",
        )
