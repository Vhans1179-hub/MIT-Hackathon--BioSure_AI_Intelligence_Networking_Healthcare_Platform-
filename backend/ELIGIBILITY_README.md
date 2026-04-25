# CAR-T Eligibility Module — Integration Guide

A clinical eligibility reasoning service for BioSure AgentiX. Validates
ghost-patient candidates against full CAR-T trial protocols using OpenAI
GPT-4o with strict JSON schema enforcement and evidence citations.

## Files

```
backend/
├── routers/
│   └── eligibility.py          # FastAPI routes
├── services/
│   └── eligibility_service.py  # Async OpenAI service
└── data/
    └── eligibility/
        ├── system_prompt.md
        ├── zuma7_criteria.json
        └── cart_patients.json   # synthetic test patients (optional)
```

## Installation

```bash
# From the backend/ directory
source venv/bin/activate
pip install "openai>=1.50.0"
```

Add to `requirements.txt`:
```
openai>=1.50.0
```

## Environment

Add to your `.env` file:
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o    # optional — default is gpt-4o
```

## Wire into main.py

In `backend/main.py`, alongside your existing `app.include_router(...)` calls:

```python
from backend.routers import eligibility

app.include_router(eligibility.router, prefix="/api/v1")
```

## Verify the routes are live

Restart uvicorn and hit:
```bash
curl http://localhost:8000/api/v1/eligibility/trials
# => ["ZUMA-7"]

curl http://localhost:8000/api/v1/eligibility/criteria/ZUMA-7
# => {full criteria spec JSON...}
```

## Smoke-test the evaluator

With one patient from `cart_patients.json`:

```bash
curl -X POST http://localhost:8000/api/v1/eligibility/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "trial_id": "ZUMA-7",
    "patient_bundle": { ...patient JSON from cart_patients.json... }
  }'
```

Expected response (truncated):
```json
{
  "patient_id": "PT-001",
  "trial_id": "ZUMA-7",
  "evaluation_date": "2026-04-25",
  "final_determination": "ELIGIBLE",
  "summary_reasoning": "62M with histologically confirmed DLBCL GCB type, primary refractory to R-CHOP...",
  "criteria_results": [
    {
      "criterion_id": "INC-01",
      "result": "MET",
      "confidence": "HIGH",
      "reasoning": "Patient is 62 years old per demographics.",
      "evidence": [
        {
          "document_id": "patient_demographics",
          "quoted_text": "age: 62",
          "location": "demographics field"
        }
      ]
    },
    ...
  ],
  "flags": [],
  "alternative_trials_suggested": []
}
```

## Frontend integration

Two endpoints to call from `GhostRadar.tsx` (or a new
`EligibilityDrawer.tsx` component):

```typescript
// On row click — load eligibility for the selected ghost patient
const evaluate = async (patientBundle: PatientBundle) => {
  const res = await fetch('/api/v1/eligibility/evaluate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      trial_id: 'ZUMA-7',
      patient_bundle: patientBundle,
    }),
  });
  return res.json();
};
```

Render `criteria_results` with color coding:
- **MET** → green check
- **NOT_MET** → red X
- **INDETERMINATE** → yellow warning

For each criterion, expand to show `reasoning` + `evidence[].quoted_text`.

## Architecture notes

- **Why OpenAI here when the rest uses Gemini?** The eligibility task
  requires strict structured output for downstream rendering and audit.
  OpenAI's `response_format` with JSON Schema in strict mode guarantees
  parseable output — critical for live demos and audit trails. Gemini
  remains the right choice for PDF RAG (long context) and bid analysis.

- **Singleton pattern.** `get_eligibility_service()` returns a cached
  instance to avoid re-reading the system prompt and criteria JSON on
  every request. Same pattern used by other services in this codebase.

- **Async client.** Uses `AsyncOpenAI` to compose with the existing
  Motor + FastAPI async stack.

- **Strict schema.** `ELIGIBILITY_RESPONSE_SCHEMA` in the service file
  is the single source of truth for response shape. Update it if the
  output format changes; both backend and frontend should reference it.

## Adding a new trial

1. Drop `<trialid>_criteria.json` into `backend/data/eligibility/`
   (e.g. `cartitude4_criteria.json`).
2. Restart the server (or call `svc.list_available_trials()` to
   re-discover).
3. The new trial ID will appear in `/eligibility/trials` and can be
   passed to `/eligibility/evaluate`.

No code changes required.
