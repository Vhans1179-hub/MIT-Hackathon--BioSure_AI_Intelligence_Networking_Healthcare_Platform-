"""
backend/services/eligibility_service.py

Clinical eligibility reasoning service for CAR-T trial evaluation, with
longitudinal history persistence.

Architecture:
- Gemini powers PDF RAG and bid analysis (existing services unchanged).
- OpenAI powers structured clinical reasoning with strict JSON schema.
- MongoDB persists every evaluation, enabling longitudinal patient journey
  tracking and state-transition detection.

Usage:
    from backend.services.eligibility_service import get_eligibility_service
    svc = get_eligibility_service()

    # Evaluate (also persists to history)
    result = await svc.evaluate_patient(patient_bundle, trial_id="CARTITUDE-4")

    # Retrieve longitudinal history
    history = await svc.get_patient_history("MM-005", "CARTITUDE-4")

    # Get just state transitions
    transitions = await svc.get_state_transitions("MM-005", "CARTITUDE-4")

Environment:
    OPENAI_API_KEY    required
    OPENAI_MODEL      optional, defaults to gpt-4o
    MONGODB_URI       optional, falls back to in-memory store if unset
    MONGODB_DB        optional, defaults to 'biosure'
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

SERVICE_DIR = Path(__file__).parent
KNOWLEDGE_DIR = SERVICE_DIR.parent / "data" / "eligibility"

DEFAULT_TRIAL_ID = "CARTITUDE-4"
DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
DEFAULT_TEMPERATURE = 0.1
HISTORY_COLLECTION = "eligibility_evaluations"


ELIGIBILITY_RESPONSE_SCHEMA: dict[str, Any] = {
    "name": "EligibilityEvaluation",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "patient_id", "trial_id", "evaluation_date",
            "final_determination", "summary_reasoning",
            "criteria_results", "flags", "alternative_trials_suggested",
        ],
        "properties": {
            "patient_id": {"type": "string"},
            "trial_id": {"type": "string"},
            "evaluation_date": {"type": "string"},
            "final_determination": {
                "type": "string",
                "enum": ["ELIGIBLE", "INELIGIBLE", "NEEDS_REVIEW"],
            },
            "summary_reasoning": {"type": "string"},
            "criteria_results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["criterion_id", "result", "confidence", "reasoning", "evidence"],
                    "properties": {
                        "criterion_id": {"type": "string"},
                        "result": {"type": "string", "enum": ["MET", "NOT_MET", "INDETERMINATE"]},
                        "confidence": {"type": "string", "enum": ["HIGH", "MEDIUM", "LOW"]},
                        "reasoning": {"type": "string"},
                        "evidence": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["document_id", "quoted_text", "location"],
                                "properties": {
                                    "document_id": {"type": "string"},
                                    "quoted_text": {"type": "string"},
                                    "location": {"type": "string"},
                                },
                            },
                        },
                    },
                },
            },
            "flags": {"type": "array", "items": {"type": "string"}},
            "alternative_trials_suggested": {"type": "array", "items": {"type": "string"}},
        },
    },
}


class InMemoryHistoryStore:
    """Fallback history store. Loses data on restart — use MongoDB in production."""

    def __init__(self) -> None:
        self._store: list[dict[str, Any]] = []

    async def insert(self, doc: dict[str, Any]) -> None:
        self._store.append(doc)

    async def find_by_patient(
        self, patient_id: str, trial_id: str
    ) -> list[dict[str, Any]]:
        return sorted(
            [
                d for d in self._store
                if d.get("patient_id") == patient_id and d.get("trial_id") == trial_id
            ],
            key=lambda d: d.get("snapshot_date") or d.get("persisted_at", ""),
        )


class EligibilityService:
    """
    Async clinical-eligibility evaluator with longitudinal history.

    Each call to evaluate_patient() also persists the result to the history
    store, keyed by (patient_id, trial_id). Use get_patient_history() to
    retrieve the longitudinal timeline and get_state_transitions() to retrieve
    just the events where the determination changed between evaluations.
    """

    def __init__(
        self,
        client: Optional[AsyncOpenAI] = None,
        model: str = DEFAULT_MODEL,
        temperature: float = DEFAULT_TEMPERATURE,
        knowledge_dir: Path = KNOWLEDGE_DIR,
        history_store: Any = None,
    ) -> None:
        self.client = client or AsyncOpenAI()
        self.model = model
        self.temperature = temperature
        self.knowledge_dir = knowledge_dir
        self.system_prompt = self._load_system_prompt()
        self._criteria_cache: dict[str, dict[str, Any]] = {}
        self.history = history_store if history_store is not None else self._init_history_store()

        logger.info(
            "EligibilityService initialized | model=%s | history=%s",
            self.model, type(self.history).__name__,
        )

    def _load_system_prompt(self) -> str:
        path = self.knowledge_dir / "system_prompt.md"
        if not path.exists():
            raise FileNotFoundError(f"System prompt not found at {path}")
        return path.read_text()

    def _init_history_store(self) -> Any:
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            logger.warning("MONGODB_URI not set — using in-memory history store")
            return InMemoryHistoryStore()
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(mongo_uri)
            db_name = os.getenv("MONGODB_DB", "biosure")
            collection = client[db_name][HISTORY_COLLECTION]
            return MongoHistoryStore(collection)
        except ImportError:
            logger.warning("Motor not installed — using in-memory history store")
            return InMemoryHistoryStore()

    def get_criteria(self, trial_id: str) -> dict[str, Any]:
        if trial_id in self._criteria_cache:
            return self._criteria_cache[trial_id]
        filename = trial_id.lower().replace("-", "") + "_criteria.json"
        path = self.knowledge_dir / filename
        if not path.exists():
            raise FileNotFoundError(f"Criteria for trial {trial_id} not found at {path}")
        with open(path) as f:
            criteria = json.load(f)
        self._criteria_cache[trial_id] = criteria
        return criteria

    def list_available_trials(self) -> list[str]:
        trials = []
        for p in self.knowledge_dir.glob("*_criteria.json"):
            stem = p.stem.replace("_criteria", "")
            for prefix in ("zuma", "cartitude", "transcend", "transform"):
                if stem.startswith(prefix):
                    suffix = stem[len(prefix):]
                    trials.append(f"{prefix.upper()}-{suffix}")
                    break
            else:
                trials.append(stem.upper())
        return sorted(trials)

    async def evaluate_patient(
        self,
        patient_bundle: dict[str, Any],
        trial_id: str = DEFAULT_TRIAL_ID,
        persist: bool = True,
    ) -> dict[str, Any]:
        """
        Evaluate a patient bundle. When persist=True (default), the result is
        also written to the history store and becomes available via
        get_patient_history() and get_state_transitions().
        """
        criteria = self.get_criteria(trial_id)
        user_message = self._build_user_message(patient_bundle, criteria)

        patient_id = patient_bundle.get("patient_id", "<unknown>")
        snapshot_date = patient_bundle.get("snapshot_date")

        logger.info(
            "Evaluating patient_id=%s snapshot_date=%s trial_id=%s",
            patient_id, snapshot_date, trial_id,
        )

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_schema", "json_schema": ELIGIBILITY_RESPONSE_SCHEMA},
            temperature=self.temperature,
        )

        raw = response.choices[0].message.content or "{}"
        result = json.loads(raw)
        result["evaluation_date"] = datetime.now(timezone.utc).date().isoformat()
        result.setdefault("trial_id", trial_id)
        result.setdefault("patient_id", patient_id)

        if persist:
            await self._persist_evaluation(result, patient_bundle, snapshot_date)

        logger.info(
            "Evaluation complete | patient_id=%s | result=%s",
            result["patient_id"], result["final_determination"],
        )
        return result

    async def _persist_evaluation(
        self,
        result: dict[str, Any],
        patient_bundle: dict[str, Any],
        snapshot_date: Optional[str],
    ) -> None:
        history_doc = {
            **result,
            "snapshot_date": snapshot_date or result.get("evaluation_date"),
            "persisted_at": datetime.now(timezone.utc).isoformat(),
            "bundle_summary": {
                "patient_id": patient_bundle.get("patient_id"),
                "snapshot_date": snapshot_date,
                "document_count": len(patient_bundle.get("documents", [])),
            },
        }
        try:
            await self.history.insert(history_doc)
        except Exception:
            logger.exception("Failed to persist evaluation to history")

    async def get_patient_history(
        self, patient_id: str, trial_id: str = DEFAULT_TRIAL_ID,
    ) -> list[dict[str, Any]]:
        """Return all stored evaluations for this patient/trial, oldest first."""
        return await self.history.find_by_patient(patient_id, trial_id)

    async def get_state_transitions(
        self, patient_id: str, trial_id: str = DEFAULT_TRIAL_ID,
    ) -> list[dict[str, Any]]:
        """
        Return only the events where the determination changed between
        consecutive evaluations. Each transition includes the criteria that
        drove the change.
        """
        history = await self.get_patient_history(patient_id, trial_id)
        if len(history) < 2:
            return []

        transitions: list[dict[str, Any]] = []
        for prev, curr in zip(history, history[1:]):
            prev_det = prev.get("final_determination")
            curr_det = curr.get("final_determination")
            if prev_det == curr_det:
                continue

            prev_results = {c["criterion_id"]: c for c in prev.get("criteria_results", [])}
            curr_results = {c["criterion_id"]: c for c in curr.get("criteria_results", [])}
            changed_criteria = []
            for cid, curr_c in curr_results.items():
                prev_c = prev_results.get(cid)
                if prev_c is None or prev_c.get("result") != curr_c.get("result"):
                    changed_criteria.append({
                        "criterion_id": cid,
                        "from_result": prev_c.get("result") if prev_c else None,
                        "to_result": curr_c.get("result"),
                        "reasoning": curr_c.get("reasoning"),
                        "evidence": curr_c.get("evidence", []),
                    })

            transitions.append({
                "patient_id": patient_id,
                "trial_id": trial_id,
                "from_determination": prev_det,
                "to_determination": curr_det,
                "from_snapshot_date": prev.get("snapshot_date"),
                "to_snapshot_date": curr.get("snapshot_date"),
                "changed_criteria": changed_criteria,
                "summary_reasoning": curr.get("summary_reasoning"),
            })
        return transitions

    @staticmethod
    def _build_user_message(
        patient_bundle: dict[str, Any], criteria: dict[str, Any],
    ) -> str:
        return (
            "Evaluate the following patient against the trial eligibility "
            "criteria below.\n\n"
            "# TRIAL CRITERIA SPECIFICATION\n"
            "```json\n"
            f"{json.dumps(criteria, indent=2)}\n"
            "```\n\n"
            "# PATIENT BUNDLE\n"
            "```json\n"
            f"{json.dumps(patient_bundle, indent=2)}\n"
            "```\n\n"
            "# TASK\n"
            "Apply the methodology from your system instructions. Evaluate "
            "every inclusion and exclusion criterion. Cite evidence as exact "
            "quoted spans from the patient bundle documents. Return JSON "
            "matching the required schema."
        )


class MongoHistoryStore:
    """Real MongoDB-backed history store using Motor (async)."""

    def __init__(self, collection: Any) -> None:
        self.collection = collection

    async def insert(self, doc: dict[str, Any]) -> None:
        await self.collection.insert_one(doc)

    async def find_by_patient(
        self, patient_id: str, trial_id: str,
    ) -> list[dict[str, Any]]:
        cursor = self.collection.find(
            {"patient_id": patient_id, "trial_id": trial_id}
        ).sort("snapshot_date", 1)
        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
        return results


_service_singleton: Optional[EligibilityService] = None


def get_eligibility_service() -> EligibilityService:
    global _service_singleton
    if _service_singleton is None:
        _service_singleton = EligibilityService()
    return _service_singleton
