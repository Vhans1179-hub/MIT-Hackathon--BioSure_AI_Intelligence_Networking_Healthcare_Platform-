/**
 * EligibilityDrawer.tsx
 *
 * Slide-in drawer that displays CAR-T eligibility evaluation results for a
 * single ghost-radar patient, with two tabs:
 *
 *   - Current: per-criterion outcome of the most recent evaluation
 *   - Timeline: longitudinal history of evaluations, with state transitions
 *               highlighted (the moment a patient became ELIGIBLE, etc.)
 *
 * Drop into: frontend/src/components/EligibilityDrawer.tsx
 *
 * Wiring (in GhostRadar.tsx):
 *
 *   import { EligibilityDrawer } from '@/components/EligibilityDrawer';
 *
 *   const [openPatientId, setOpenPatientId] = useState<string | null>(null);
 *
 *   <tr onClick={() => setOpenPatientId(patient.patient_id)}>...</tr>
 *
 *   <EligibilityDrawer
 *     patientId={openPatientId}
 *     trialId="CARTITUDE-4"
 *     open={openPatientId !== null}
 *     onClose={() => setOpenPatientId(null)}
 *   />
 *
 * Mock mode is ON by default. Toggle USE_MOCK = false once the backend is wired.
 */

import { useEffect, useState } from 'react';
import { RoutingMap, type RankedCenter, type PatientHome } from '@/components/RoutingMap';

// ---------------------------------------------------------------------------
// Types — match the OpenAI response schema in eligibility_service.py
// ---------------------------------------------------------------------------

type CriterionStatus = 'MET' | 'NOT_MET' | 'INDETERMINATE';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
type FinalDetermination = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';

interface Evidence {
  document_id: string;
  quoted_text: string;
  location: string;
}

interface CriterionResult {
  criterion_id: string;
  result: CriterionStatus;
  confidence: Confidence;
  reasoning: string;
  evidence: Evidence[];
}

interface EligibilityResponse {
  patient_id: string;
  trial_id: string;
  evaluation_date: string;
  snapshot_date?: string;
  snapshot_label?: string;
  final_determination: FinalDetermination;
  summary_reasoning: string;
  criteria_results: CriterionResult[];
  flags: string[];
  alternative_trials_suggested: string[];
}

interface ChangedCriterion {
  criterion_id: string;
  from_result: CriterionStatus | null;
  to_result: CriterionStatus;
  reasoning: string;
  evidence: Evidence[];
}

interface StateTransition {
  patient_id: string;
  trial_id: string;
  from_determination: FinalDetermination;
  to_determination: FinalDetermination;
  from_snapshot_date: string;
  to_snapshot_date: string;
  changed_criteria: ChangedCriterion[];
  summary_reasoning: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const USE_MOCK = false; // /api/v1/eligibility/* is live; switch to true for offline UI work

// MM-001: clean ELIGIBLE, single evaluation
const MOCK_CURRENT_DEFAULT: EligibilityResponse = {
  patient_id: 'MM-001',
  trial_id: 'CARTITUDE-4',
  evaluation_date: '2026-04-25',
  final_determination: 'ELIGIBLE',
  summary_reasoning:
    '64F with IgG kappa multiple myeloma, 2 prior lines including RVd→autoSCT→lenalidomide maintenance and DRd. Lenalidomide-refractory with progression on maintenance and on DRd. ECOG 1, organ function adequate, no exclusionary findings.',
  criteria_results: [
    { criterion_id: 'INC-01', result: 'MET', confidence: 'HIGH', reasoning: 'Patient is 64 years old.', evidence: [{ document_id: 'patient_demographics', quoted_text: 'age: 64', location: 'demographics' }] },
    { criterion_id: 'INC-03', result: 'MET', confidence: 'HIGH', reasoning: '2 prior lines per IMWG: RVd+auto+maint = 1, DRd = 2.', evidence: [{ document_id: 'treatment_history_2026-02-04', quoted_text: 'LINE 1 (5/2022 - 5/2024): VRd induction x4 → autoSCT (Mel-200) 11/15/22 → lenalidomide maintenance through 5/2024', location: 'Treatment summary' }] },
    { criterion_id: 'INC-05', result: 'MET', confidence: 'HIGH', reasoning: 'Progression on len maintenance 5/2024 and on DRd through 11/2025.', evidence: [{ document_id: 'oncology_progress_note_2026-02-04', quoted_text: 'PD on len maintenance 5/2024', location: 'Treatment history' }] },
    { criterion_id: 'EXC-01', result: 'MET', confidence: 'HIGH', reasoning: 'No prior BCMA-directed therapy.', evidence: [{ document_id: 'treatment_history_2026-02-04', quoted_text: 'PRIOR BCMA TX: NONE', location: 'Treatment summary' }] },
    { criterion_id: 'EXC-02', result: 'MET', confidence: 'HIGH', reasoning: 'Prior autoSCT 11/2022, no alloSCT.', evidence: [{ document_id: 'treatment_history_2026-02-04', quoted_text: 'PRIOR SCT: AUTOLOGOUS (1) — Mel-200 conditioning 11/15/22. NO ALLOGENEIC.', location: 'Transplant history' }] },
  ],
  flags: [],
  alternative_trials_suggested: [],
};

// MM-005-Journey: three timepoints showing INELIGIBLE → NEEDS_REVIEW → ELIGIBLE
const MOCK_HISTORY_MM005: EligibilityResponse[] = [
  {
    patient_id: 'MM-005',
    trial_id: 'CARTITUDE-4',
    evaluation_date: '2026-02-15',
    snapshot_date: '2026-02-15',
    snapshot_label: 'Initial evaluation',
    final_determination: 'INELIGIBLE',
    summary_reasoning:
      '73M with IgG kappa MM, 2 prior lines (VCD, KCd). Patient is lenalidomide-naive — never received an IMiD due to renal concerns. Fails CARTITUDE-4 requirement for lenalidomide-refractoriness. Renal function also below threshold (CrCl 31).',
    criteria_results: [
      { criterion_id: 'INC-05', result: 'NOT_MET', confidence: 'HIGH', reasoning: 'Patient has never received lenalidomide. Cannot be lenalidomide-refractory.', evidence: [{ document_id: 'oncology_progress_note_2026-02-10', quoted_text: 'LENALIDOMIDE STATUS: NEVER EXPOSED. Pt has CKD3 (Cr baseline 1.5) and was managed without IMiDs at community oncologist\'s preference.', location: 'Treatment history' }] },
      { criterion_id: 'INC-10', result: 'NOT_MET', confidence: 'HIGH', reasoning: 'CrCl 31 mL/min — below the 40 mL/min threshold.', evidence: [{ document_id: 'oncology_progress_note_2026-02-10', quoted_text: 'Cr 1.7 (slight bump from baseline 1.5), CrCl ~31', location: 'Labs 2/8/26' }] },
    ],
    flags: ['Patient is len-naive — discuss introducing lenalidomide at next line to potentially open CAR-T eligibility.'],
    alternative_trials_suggested: [],
  },
  {
    patient_id: 'MM-005',
    trial_id: 'CARTITUDE-4',
    evaluation_date: '2026-05-10',
    snapshot_date: '2026-05-10',
    snapshot_label: 'Mid-line re-evaluation',
    final_determination: 'NEEDS_REVIEW',
    summary_reasoning:
      'Patient started DRd in late February — now exposed to lenalidomide. Currently RESPONDING (PR by C2, M-spike 2.4 → 1.6). Cannot establish lenalidomide-refractoriness while patient is responding. Re-evaluate at progression.',
    criteria_results: [
      { criterion_id: 'INC-05', result: 'INDETERMINATE', confidence: 'MEDIUM', reasoning: 'Lenalidomide exposure now present, but patient is responding (early PR). Refractoriness cannot be established until progression on len.', evidence: [{ document_id: 'oncology_progress_note_2026-05-08', quoted_text: 'Response to date: M-spike trending DOWN (was 2.4 g/dL pre-tx, now 1.6 g/dL at C2). EARLY PARTIAL RESPONSE.', location: 'A/P 5/8/26' }] },
      { criterion_id: 'INC-10', result: 'NOT_MET', confidence: 'HIGH', reasoning: 'CrCl ~30 — still below threshold.', evidence: [{ document_id: 'oncology_progress_note_2026-05-08', quoted_text: 'Cr 1.7 CrCl ~30', location: 'Labs 5/6/26' }] },
    ],
    flags: ['Re-evaluate at next progression event or when CrCl improves.'],
    alternative_trials_suggested: [],
  },
  {
    patient_id: 'MM-005',
    trial_id: 'CARTITUDE-4',
    evaluation_date: '2026-08-22',
    snapshot_date: '2026-08-22',
    snapshot_label: 'Eligibility crossover',
    final_determination: 'ELIGIBLE',
    summary_reasoning:
      'Patient progressed on DRd while on lenalidomide (last dose 8/14/2026). Establishes lenalidomide-refractoriness per IMWG. Renal function improved to borderline (CrCl 36). Now meets all CARTITUDE-4 inclusion criteria. Eligible for CAR-T referral.',
    criteria_results: [
      { criterion_id: 'INC-05', result: 'MET', confidence: 'HIGH', reasoning: 'Progressed on DRd while taking lenalidomide. PD on drug = refractory per IMWG.', evidence: [{ document_id: 'oncology_progress_note_2026-08-20', quoted_text: 'PROGRESSED ON DRd while taking lenalidomide. Last lenalidomide dose 8/14/2026. ESTABLISHES LENALIDOMIDE-REFRACTORY STATUS.', location: 'A/P 8/20/26' }] },
      { criterion_id: 'INC-10', result: 'INDETERMINATE', confidence: 'LOW', reasoning: 'CrCl improved to 36, still borderline against the 40 threshold. Measured CrCl pending.', evidence: [{ document_id: 'oncology_progress_note_2026-08-20', quoted_text: 'CrCl now ~36 — STILL below CARTITUDE-4 threshold of 40 by Cockcroft-Gault. Will calculate via measured CrCl (24h urine collection ordered) to confirm.', location: 'Labs 8/18/26' }] },
    ],
    flags: ['Confirm renal function with measured CrCl before referral.'],
    alternative_trials_suggested: [],
  },
];

const MOCK_TRANSITIONS_MM005: StateTransition[] = [
  {
    patient_id: 'MM-005',
    trial_id: 'CARTITUDE-4',
    from_determination: 'INELIGIBLE',
    to_determination: 'NEEDS_REVIEW',
    from_snapshot_date: '2026-02-15',
    to_snapshot_date: '2026-05-10',
    summary_reasoning: 'Patient started DRd — now exposed to lenalidomide. Cannot yet establish refractoriness.',
    changed_criteria: [
      { criterion_id: 'INC-05', from_result: 'NOT_MET', to_result: 'INDETERMINATE', reasoning: 'Lenalidomide exposure now present, but patient responding.', evidence: [] },
    ],
  },
  {
    patient_id: 'MM-005',
    trial_id: 'CARTITUDE-4',
    from_determination: 'NEEDS_REVIEW',
    to_determination: 'ELIGIBLE',
    from_snapshot_date: '2026-05-10',
    to_snapshot_date: '2026-08-22',
    summary_reasoning: 'Patient progressed on DRd. Lenalidomide-refractoriness established. Now meets CARTITUDE-4 criteria.',
    changed_criteria: [
      { criterion_id: 'INC-05', from_result: 'INDETERMINATE', to_result: 'MET', reasoning: 'PD on DRd while on lenalidomide.', evidence: [{ document_id: 'oncology_progress_note_2026-08-20', quoted_text: 'PROGRESSED ON DRd while taking lenalidomide. ESTABLISHES LENALIDOMIDE-REFRACTORY STATUS.', location: 'A/P 8/20/26' }] },
      { criterion_id: 'INC-10', from_result: 'NOT_MET', to_result: 'INDETERMINATE', reasoning: 'Renal function improved to borderline.', evidence: [] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Status visual helpers
// ---------------------------------------------------------------------------

const determinationStyle: Record<FinalDetermination, string> = {
  ELIGIBLE: 'bg-green-50 text-green-800 ring-1 ring-green-200',
  INELIGIBLE: 'bg-red-50 text-red-800 ring-1 ring-red-200',
  NEEDS_REVIEW: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
};

const determinationDot: Record<FinalDetermination, string> = {
  ELIGIBLE: 'bg-green-500',
  INELIGIBLE: 'bg-red-500',
  NEEDS_REVIEW: 'bg-amber-500',
};

const determinationLabel: Record<FinalDetermination, string> = {
  ELIGIBLE: 'Eligible',
  INELIGIBLE: 'Ineligible',
  NEEDS_REVIEW: 'Needs review',
};

function CriterionIcon({ result }: { result: CriterionStatus }) {
  if (result === 'MET') return <div className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">✓</div>;
  if (result === 'NOT_MET') return <div className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">✕</div>;
  return <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">!</div>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface EligibilityDrawerProps {
  patientId: string | null;
  trialId: string;
  open: boolean;
  onClose: () => void;
  patientBundle?: Record<string, unknown>;
}

type TabKey = 'current' | 'timeline' | 'routing';

interface RoutingResult {
  patient_id: string;
  country: string;
  distance_unit: string;
  patient_home: PatientHome;
  centers: RankedCenter[];
  nearest_overall: RankedCenter | null;
}

export function EligibilityDrawer({
  patientId, trialId, open, onClose, patientBundle,
}: EligibilityDrawerProps) {
  const [tab, setTab] = useState<TabKey>('current');
  const [current, setCurrent] = useState<EligibilityResponse | null>(null);
  const [history, setHistory] = useState<EligibilityResponse[]>([]);
  const [transitions, setTransitions] = useState<StateTransition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Routing tab state
  const [routingCountry, setRoutingCountry] = useState<'US' | 'IN'>('US');
  const [routingResult, setRoutingResult] = useState<RoutingResult | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);

  // Close on Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  // Load on open
  useEffect(() => {
    if (!open || !patientId) return;
    setCurrent(null);
    setHistory([]);
    setTransitions([]);
    setError(null);
    setExpanded(new Set());
    setTab('current');

    if (USE_MOCK) {
      setLoading(true);
      const t = setTimeout(() => {
        if (patientId === 'MM-005') {
          // longitudinal demo case
          setHistory(MOCK_HISTORY_MM005);
          setTransitions(MOCK_TRANSITIONS_MM005);
          setCurrent(MOCK_HISTORY_MM005[MOCK_HISTORY_MM005.length - 1]);
        } else {
          // single-snapshot patient
          const r = { ...MOCK_CURRENT_DEFAULT, patient_id: patientId, trial_id: trialId };
          setCurrent(r);
          setHistory([r]);
          setTransitions([]);
        }
        setLoading(false);
      }, 500);
      return () => clearTimeout(t);
    }

    // Real backend mode — fetch current + history + transitions in parallel.
    setLoading(true);
    Promise.all([
      fetch('/api/v1/eligibility/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trial_id: trialId,
          patient_bundle: patientBundle ?? { patient_id: patientId },
        }),
      }).then(r => r.ok ? r.json() : Promise.reject(new Error(`Evaluate ${r.status}`))),
      fetch(`/api/v1/eligibility/history/${trialId}/${patientId}`)
        .then(r => r.ok ? r.json() : []),
      fetch(`/api/v1/eligibility/transitions/${trialId}/${patientId}`)
        .then(r => r.ok ? r.json() : []),
    ])
      .then(([c, h, t]) => {
        setCurrent(c);
        setHistory(h);
        setTransitions(t);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [open, patientId, trialId, patientBundle]);

  // Fetch routing recommendations when the Routing tab is opened (and on
  // country switch). Skips fetch in mock mode.
  useEffect(() => {
    if (tab !== 'routing' || !patientId) return;
    if (USE_MOCK) {
      setRoutingResult(null);
      setRoutingError('Routing requires the live backend (USE_MOCK is on).');
      return;
    }
    setRoutingLoading(true);
    setRoutingError(null);
    setSelectedCenterId(null);
    fetch('/api/v1/routing/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: patientId,
        country: routingCountry,
        trial_id: trialId,
        product: 'Carvykti',
        top_n: 5,
      }),
    })
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.detail || `Routing ${r.status}`))))
      .then((data: RoutingResult) => {
        setRoutingResult(data);
        setRoutingLoading(false);
      })
      .catch((e: Error) => {
        setRoutingError(e.message);
        setRoutingLoading(false);
      });
  }, [tab, patientId, trialId, routingCountry]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const inclusionResults = current?.criteria_results.filter(c => c.criterion_id.startsWith('INC-')) ?? [];
  const exclusionResults = current?.criteria_results.filter(c => c.criterion_id.startsWith('EXC-')) ?? [];
  const inclusionMet = inclusionResults.filter(c => c.result === 'MET').length;
  const exclusionTriggered = exclusionResults.filter(c => c.result === 'NOT_MET').length;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-200">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">
                Patient · {patientId ?? '—'}
              </div>
              <h2 className="text-base font-medium text-gray-900">{trialId} evaluation</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1" aria-label="Close drawer">×</button>
          </div>

          {current && (
            <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium ${determinationStyle[current.final_determination]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${determinationDot[current.final_determination]}`} />
              {determinationLabel[current.final_determination]}
            </div>
          )}

          {/* Tabs */}
          {history.length > 0 && (
            <div className="flex gap-1 mt-4 -mb-3 border-b-0">
              <TabButton active={tab === 'current'} onClick={() => setTab('current')}>
                Current
              </TabButton>
              <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')}>
                Timeline
                {history.length > 1 && (
                  <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    {history.length}
                  </span>
                )}
              </TabButton>
              {current && current.final_determination !== 'INELIGIBLE' && (
                <TabButton active={tab === 'routing'} onClick={() => setTab('routing')}>
                  Routing
                </TabButton>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-8 text-center text-sm text-gray-500">Evaluating against {trialId} criteria…</div>}
          {error && <div className="m-5 p-4 bg-red-50 text-red-800 text-sm rounded-md">{error}</div>}

          {current && !loading && !error && tab === 'current' && (
            <CurrentTab
              data={current}
              inclusionResults={inclusionResults}
              exclusionResults={exclusionResults}
              inclusionMet={inclusionMet}
              exclusionTriggered={exclusionTriggered}
              expanded={expanded}
              toggleExpand={toggleExpand}
            />
          )}

          {current && !loading && !error && tab === 'timeline' && (
            <TimelineTab history={history} transitions={transitions} />
          )}

          {current && !loading && !error && tab === 'routing' && (
            <RoutingTab
              country={routingCountry}
              setCountry={setRoutingCountry}
              loading={routingLoading}
              error={routingError}
              result={routingResult}
              selectedCenterId={selectedCenterId}
              setSelectedCenterId={setSelectedCenterId}
            />
          )}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Routing tab
// ---------------------------------------------------------------------------

interface RoutingTabProps {
  country: 'US' | 'IN';
  setCountry: (c: 'US' | 'IN') => void;
  loading: boolean;
  error: string | null;
  result: RoutingResult | null;
  selectedCenterId: string | null;
  setSelectedCenterId: (id: string | null) => void;
}

function RoutingTab({
  country, setCountry, loading, error, result, selectedCenterId, setSelectedCenterId,
}: RoutingTabProps) {
  return (
    <div className="px-5 py-4 space-y-4">
      {/* Country switcher */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">
          Treatment center routing
        </div>
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => setCountry('US')}
            className={`px-3 py-1 ${country === 'US' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            🇺🇸 US
          </button>
          <button
            onClick={() => setCountry('IN')}
            className={`px-3 py-1 border-l border-gray-200 ${country === 'IN' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            🇮🇳 India
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-8 text-center text-sm text-gray-500">Routing to nearest in-network centers…</div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md">
          {error}
        </div>
      )}

      {result && !loading && !error && (
        <>
          {/* Patient context bar */}
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-xs text-gray-700">
            <span className="font-medium">{result.patient_id}</span>
            {' · '}
            home: {result.patient_home.city}, {result.patient_home.state}
            {result.patient_home.insurance_type && (
              <>{' · '}<span className="text-gray-600">{result.patient_home.insurance_type}</span></>
            )}
          </div>

          {/* Map */}
          <RoutingMap
            patientHome={result.patient_home}
            centers={result.centers}
            nearestOverall={result.nearest_overall}
            selectedCenterId={selectedCenterId}
            onSelectCenter={(id) => setSelectedCenterId(id)}
            height={300}
          />

          {/* Demo punchline callout — when nearest_overall exists */}
          {result.nearest_overall && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 leading-relaxed">
              <div className="font-medium mb-1">⚠ Closest center is not the recommended one</div>
              <span className="text-amber-800">
                <strong>{result.nearest_overall.name}</strong> in {result.nearest_overall.city}, {result.nearest_overall.state}
                {' '}is the geographically closest option ({result.nearest_overall.distance} {result.nearest_overall.distance_unit}),
                but it's <strong>out-of-network</strong> for this patient. The recommendation below routes to the closest in-network alternative.
              </span>
            </div>
          )}

          {/* Ranked centers list */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
              Recommended centers ({result.centers.length})
            </div>
            <ul className="space-y-2">
              {result.centers.map((c) => (
                <li
                  key={c.center_id}
                  onClick={() => setSelectedCenterId(c.center_id)}
                  className={`p-3 border rounded-md cursor-pointer transition-colors ${
                    selectedCenterId === c.center_id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-blue-700">#{c.rank}</span>
                        <span className="text-sm font-medium text-gray-900 truncate">{c.name}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {c.city}, {c.state} · {c.distance} {c.distance_unit} · ~{c.drive_hours_estimate}h drive
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                        {c.in_network ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                            ✓ In-network
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                            ✗ Out-of-network
                          </span>
                        )}
                        {c.on_trial && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                            Trial site
                          </span>
                        )}
                        {c.current_wait_weeks !== undefined && (
                          <span className="text-gray-500">~{c.current_wait_weeks}wk wait</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-400">score</div>
                      <div className="text-sm font-semibold text-gray-700">{c.scores.composite.toFixed(2)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-[10px] text-gray-400 px-1 pt-1">
            Score = 0.40 × clinical match + 0.35 × distance + 0.25 × insurance compatibility.
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Current tab
// ---------------------------------------------------------------------------

interface CurrentTabProps {
  data: EligibilityResponse;
  inclusionResults: CriterionResult[];
  exclusionResults: CriterionResult[];
  inclusionMet: number;
  exclusionTriggered: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
}

function CurrentTab(p: CurrentTabProps) {
  return (
    <>
      <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 text-sm leading-relaxed text-gray-700">
        {p.data.summary_reasoning}
      </div>

      <div className="px-5 pt-4 pb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
        <span>Inclusion criteria</span>
        <span>{p.inclusionMet} of {p.inclusionResults.length} met</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {p.inclusionResults.map(c => <CriterionRow key={c.criterion_id} criterion={c} expanded={p.expanded.has(c.criterion_id)} onToggle={() => p.toggleExpand(c.criterion_id)} />)}
      </ul>

      <div className="px-5 pt-4 pb-1 mt-2 border-t border-gray-200 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
        <span>Exclusion criteria</span>
        <span>{p.exclusionTriggered} of {p.exclusionResults.length} triggered</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {p.exclusionResults.map(c => <CriterionRow key={c.criterion_id} criterion={c} expanded={p.expanded.has(c.criterion_id)} onToggle={() => p.toggleExpand(c.criterion_id)} />)}
      </ul>

      {p.data.flags.length > 0 && (
        <div className="mx-5 my-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="text-[11px] uppercase tracking-wide text-amber-800 mb-1.5">Clinical flags</div>
          <ul className="text-sm text-amber-900 space-y-1 list-disc list-inside">
            {p.data.flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {p.data.alternative_trials_suggested.length > 0 && (
        <div className="mx-5 my-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="text-[11px] uppercase tracking-wide text-blue-800 mb-1.5">Alternative trials suggested</div>
          <div className="flex flex-wrap gap-1.5">
            {p.data.alternative_trials_suggested.map(t => <span key={t} className="inline-block px-2 py-0.5 rounded bg-white border border-blue-200 text-xs font-medium text-blue-900">{t}</span>)}
          </div>
        </div>
      )}

      <div className="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-100">
        Evaluated {p.data.evaluation_date} · trial {p.data.trial_id}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Timeline tab
// ---------------------------------------------------------------------------

interface TimelineTabProps {
  history: EligibilityResponse[];
  transitions: StateTransition[];
}

function TimelineTab({ history, transitions }: TimelineTabProps) {
  if (history.length === 0) {
    return <div className="p-8 text-center text-sm text-gray-500">No history yet.</div>;
  }
  if (history.length === 1) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        <div className="font-medium text-gray-700 mb-1">Single evaluation</div>
        Patient has been evaluated once. Re-evaluations and state changes will appear here over time.
        <div className="mt-3 text-[11px] text-gray-400">Snapshot: {history[0].snapshot_date ?? history[0].evaluation_date}</div>
      </div>
    );
  }

  // Build a transition lookup by to_snapshot_date
  const transitionByDate = new Map<string, StateTransition>();
  transitions.forEach(t => transitionByDate.set(t.to_snapshot_date, t));

  return (
    <div className="px-5 py-4">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Patient journey</div>
        <p className="text-sm text-gray-600 leading-relaxed">
          {history.length} evaluations over time. {transitions.length > 0 && (
            <span>{transitions.length} state {transitions.length === 1 ? 'change' : 'changes'} detected.</span>
          )}
        </p>
      </div>

      <ol className="relative border-l border-gray-200 ml-2 space-y-6 pb-2">
        {history.map((h, i) => {
          const transition = h.snapshot_date ? transitionByDate.get(h.snapshot_date) : undefined;
          const isLatest = i === history.length - 1;
          return (
            <li key={i} className="ml-6">
              {/* Timeline dot */}
              <span className={`absolute -left-[7px] flex items-center justify-center w-3.5 h-3.5 rounded-full ring-4 ring-white ${determinationDot[h.final_determination]}`}></span>

              {/* Date and label */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {h.snapshot_date ?? h.evaluation_date}
                </span>
                {h.snapshot_label && (
                  <span className="text-xs text-gray-500">· {h.snapshot_label}</span>
                )}
                {isLatest && (
                  <span className="text-[10px] uppercase tracking-wide bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Latest</span>
                )}
              </div>

              {/* Verdict badge */}
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium mb-2 ${determinationStyle[h.final_determination]}`}>
                <span className={`w-1 h-1 rounded-full ${determinationDot[h.final_determination]}`} />
                {determinationLabel[h.final_determination]}
              </div>

              {/* Summary */}
              <p className="text-xs text-gray-600 leading-relaxed mb-2">{h.summary_reasoning}</p>

              {/* Transition callout */}
              {transition && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-blue-800 mb-1.5">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block">
                      <path d="M2 6h7M6 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    State change
                    <span className="text-blue-700 font-normal normal-case tracking-normal">
                      {determinationLabel[transition.from_determination]} → {determinationLabel[transition.to_determination]}
                    </span>
                  </div>
                  <div className="text-xs text-blue-900 leading-relaxed mb-2">
                    {transition.summary_reasoning}
                  </div>
                  {transition.changed_criteria.length > 0 && (
                    <div className="space-y-1.5 mt-2 pt-2 border-t border-blue-200">
                      <div className="text-[10px] uppercase tracking-wide text-blue-700">What changed</div>
                      {transition.changed_criteria.map((c, k) => (
                        <div key={k} className="text-xs text-blue-900">
                          <span className="font-medium">{c.criterion_id}</span>:{' '}
                          <span className="text-blue-700">{c.from_result ?? '—'} → {c.to_result}</span>
                          <div className="text-blue-800 mt-0.5">{c.reasoning}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single criterion row (used in Current tab)
// ---------------------------------------------------------------------------

interface CriterionRowProps {
  criterion: CriterionResult;
  expanded: boolean;
  onToggle: () => void;
}

function CriterionRow({ criterion, expanded, onToggle }: CriterionRowProps) {
  const hasEvidence = criterion.evidence.length > 0;
  return (
    <li>
      <button onClick={onToggle} className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors flex gap-3 items-start">
        <CriterionIcon result={criterion.result} />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between gap-2 items-baseline">
            <span className="text-sm font-medium text-gray-900">{criterion.criterion_id}</span>
            <span className="text-[11px] text-gray-400 flex-shrink-0">
              {criterion.confidence === 'HIGH' ? 'High' : criterion.confidence === 'MEDIUM' ? 'Medium' : 'Low'} confidence
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{criterion.reasoning}</p>
          {expanded && hasEvidence && (
            <div className="mt-2 space-y-2">
              {criterion.evidence.map((ev, i) => (
                <div key={i} className="p-2.5 bg-gray-50 border-l-2 border-gray-300 rounded-md">
                  <div className="text-[11px] text-gray-500 mb-1">{ev.document_id}{ev.location ? ` · ${ev.location}` : ''}</div>
                  <div className="text-xs text-gray-800 italic leading-relaxed">"{ev.quoted_text}"</div>
                </div>
              ))}
            </div>
          )}
          {hasEvidence && (
            <div className="text-[11px] text-blue-600 mt-1.5">
              {expanded ? 'Hide evidence' : `Show ${criterion.evidence.length} evidence`}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

export default EligibilityDrawer;
