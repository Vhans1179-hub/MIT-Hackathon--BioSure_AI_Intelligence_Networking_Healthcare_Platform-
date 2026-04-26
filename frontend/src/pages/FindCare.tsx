/**
 * FindCare.tsx
 *
 * Patient-facing self-service: a guided plain-language questionnaire that
 * builds a clinical patient bundle, calls the existing /eligibility/evaluate
 * + /routing/recommend endpoints, and displays a patient-friendly results
 * view with the verdict + nearby treatment centers.
 *
 * Standalone layout — no DashboardLayout. Mobile-first single-column.
 *
 * Submission/results wiring lands in the next commit.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MapPin, Phone, Printer, ShieldAlert, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { resolveUsZip } from '@/data/usZipLookup';
import { RoutingMap, type RankedCenter, type PatientHome } from '@/components/RoutingMap';

// ---------------------------------------------------------------------------
// Question domain
// ---------------------------------------------------------------------------

const DIAGNOSES = [
  { value: 'multiple_myeloma', label: 'Multiple Myeloma' },
  { value: 'dlbcl',            label: 'Diffuse Large B-cell Lymphoma (DLBCL)' },
  { value: 'fl',               label: 'Follicular Lymphoma' },
  { value: 'all',              label: 'Acute Lymphoblastic Leukemia (ALL)' },
  { value: 'cll',              label: 'Chronic Lymphocytic Leukemia (CLL)' },
  { value: 'other',            label: 'Other / not sure' },
];

const PRIOR_TREATMENTS = [
  { value: 'lenalidomide',     label: 'Revlimid (lenalidomide)' },
  { value: 'bortezomib',       label: 'Velcade (bortezomib)' },
  { value: 'daratumumab',      label: 'Darzalex (daratumumab)' },
  { value: 'pomalidomide',     label: 'Pomalyst (pomalidomide)' },
  { value: 'carfilzomib',      label: 'Kyprolis (carfilzomib)' },
  { value: 'isatuximab',       label: 'Sarclisa (isatuximab)' },
  { value: 'elotuzumab',       label: 'Empliciti (elotuzumab)' },
  { value: 'ixazomib',         label: 'Ninlaro (ixazomib)' },
  { value: 'dexamethasone',    label: 'Dexamethasone (steroid)' },
  { value: 'auto_sct',         label: 'Autologous stem cell transplant' },
  { value: 'allo_sct',         label: 'Allogeneic (donor) stem cell transplant' },
  { value: 'prior_cart',       label: 'A previous CAR-T therapy (Carvykti, Abecma, Kymriah, Yescarta)' },
  { value: 'unsure',           label: "I don't remember the specific drugs" },
];

const ACTIVITY_LEVELS = [
  { value: '0', label: "I'm fully active, no restrictions" },
  { value: '1', label: 'I can do light work and most daily activities' },
  { value: '2', label: "I'm up and about more than half the day but can't work" },
  { value: '3', label: 'I need help with daily tasks; I rest most of the day' },
  { value: '4', label: "I'm mostly in bed" },
];

const HEALTH_FLAGS = [
  { value: 'autoimmune',       label: 'Active autoimmune disease (lupus, RA, MS, etc.)' },
  { value: 'active_infection', label: 'Active infection currently being treated' },
  { value: 'hiv_hep',          label: 'HIV or active hepatitis B/C' },
  { value: 'recent_cancer',    label: 'A different cancer in the past 5 years' },
  { value: 'organ_transplant', label: 'Solid organ transplant' },
];

const INSURANCE_OPTIONS = [
  'Medicare',
  'Medicare Advantage',
  'Commercial',
  'Medicaid',
  'VA',
  'Other / Self-pay',
];

interface FormState {
  age: string;
  sex: 'M' | 'F' | '';
  zip: string;
  insurance: string;
  diagnosis: string;
  treatments: string[];
  refractory: 'yes' | 'no' | 'unsure' | '';
  activity: string;
  healthFlags: string[];
  noHealthFlags: boolean;
}

const INITIAL_STATE: FormState = {
  age: '',
  sex: '',
  zip: '',
  insurance: '',
  diagnosis: 'multiple_myeloma',
  treatments: [],
  refractory: '',
  activity: '',
  healthFlags: [],
  noHealthFlags: false,
};

// ---------------------------------------------------------------------------
// API response shapes (subset of what we use)
// ---------------------------------------------------------------------------

interface EligibilityResponse {
  patient_id: string;
  trial_id: string;
  evaluation_date: string;
  final_determination: 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';
  summary_reasoning: string;
  flags: string[];
  alternative_trials_suggested: string[];
}

interface RoutingResponse {
  patient_id: string;
  country: string;
  distance_unit: string;
  patient_home: PatientHome;
  centers: RankedCenter[];
  nearest_overall: RankedCenter | null;
}

// ---------------------------------------------------------------------------
// Form -> patient bundle translation
// ---------------------------------------------------------------------------

const TRIAL_ID_FOR_DIAGNOSIS: Record<string, string> = {
  multiple_myeloma: 'CARTITUDE-4',
  dlbcl: 'ZUMA-7',
  fl: 'ZUMA-7',          // closest available demo trial
  all: 'CARTITUDE-4',     // fallback for demo
  cll: 'CARTITUDE-4',
  other: 'CARTITUDE-4',
};

const PRODUCT_FOR_TRIAL: Record<string, string> = {
  'CARTITUDE-4': 'Carvykti',
  'ZUMA-7': 'Yescarta',
};

const ACTIVITY_NARRATIVE: Record<string, string> = {
  '0': "fully active with no restrictions, consistent with ECOG 0",
  '1': "able to do light work and most daily activities, consistent with ECOG 1",
  '2': "up and about more than half the day but unable to work, consistent with ECOG 2",
  '3': "needs help with daily tasks and rests most of the day, consistent with ECOG 3",
  '4': "mostly bed-bound, consistent with ECOG 4",
};

const DIAGNOSIS_LABEL: Record<string, string> = Object.fromEntries(
  DIAGNOSES.map((d) => [d.value, d.label]),
);

const TREATMENT_LABEL: Record<string, string> = Object.fromEntries(
  PRIOR_TREATMENTS.map((t) => [t.value, t.label]),
);

const HEALTH_FLAG_LABEL: Record<string, string> = Object.fromEntries(
  HEALTH_FLAGS.map((h) => [h.value, h.label]),
);

interface BuiltBundle {
  bundle: Record<string, unknown>;
  trialId: string;
  product: string;
  homeResolved: ReturnType<typeof resolveUsZip>;
}

function buildPatientBundle(form: FormState): BuiltBundle | null {
  const home = resolveUsZip(form.zip);
  if (!home) return null;

  const trialId = TRIAL_ID_FOR_DIAGNOSIS[form.diagnosis] ?? 'CARTITUDE-4';
  const product = PRODUCT_FOR_TRIAL[trialId] ?? 'Carvykti';

  // Build a clinical narrative the eligibility LLM can reason about. Plain
  // language is fine — the system prompt is instructed to map narrative facts
  // to formal criteria.
  const treatmentLabels = form.treatments
    .filter((t) => t !== 'unsure')
    .map((t) => TREATMENT_LABEL[t]);
  const treatmentSummary = treatmentLabels.length > 0
    ? `Prior treatments include: ${treatmentLabels.join(', ')}.`
    : form.treatments.includes('unsure')
      ? 'Patient does not remember the specific drugs received.'
      : 'No prior treatments reported.';

  const refractoryNarrative =
    form.refractory === 'yes' ?
      'Patient reports the cancer has come back or stopped responding to the most recent treatment, indicating refractory or relapsed disease.' :
    form.refractory === 'no' ?
      'Patient reports the most recent treatment is still working.' :
      'Patient is unsure whether their cancer is actively responding to treatment.';

  const flagsNarrative = form.noHealthFlags
    ? 'Patient denies active autoimmune disease, active infection, HIV/hepatitis, recent other malignancy, and prior solid organ transplant.'
    : `Patient reports the following health conditions: ${form.healthFlags.map((f) => HEALTH_FLAG_LABEL[f]).join('; ')}.`;

  const priorCart = form.treatments.includes('prior_cart');
  const cartNarrative = priorCart
    ? 'Patient reports having received a previous CAR-T therapy.'
    : 'Patient reports no history of prior CAR-T or BCMA-directed therapy.';

  const clinicalSummary = [
    `Patient self-report (${new Date().toISOString().slice(0, 10)}):`,
    `${form.age}-year-old ${form.sex === 'M' ? 'male' : 'female'} self-reporting a diagnosis of ${DIAGNOSIS_LABEL[form.diagnosis]}.`,
    treatmentSummary,
    refractoryNarrative,
    `Activity level: patient describes themselves as ${ACTIVITY_NARRATIVE[form.activity]}.`,
    cartNarrative,
    flagsNarrative,
    `Patient resides in ${home.city}, ${home.state} (ZIP ${home.zip}), insured through ${form.insurance}.`,
    'Note: This is a patient self-report and has not been validated against medical records or laboratory data. Lab values and imaging findings are not available.',
  ].join(' ');

  const bundle = {
    patient_id: `self-report-${Date.now()}`,
    self_reported: true,
    demographics: {
      age: Number(form.age),
      sex: form.sex,
    },
    documents: [
      {
        document_id: 'patient_self_report',
        title: 'Patient self-reported clinical summary',
        type: 'patient_intake',
        content_type: 'text/plain',
        content: clinicalSummary,
      },
    ],
    home_location: {
      city: home.city,
      state: home.state,
      country: 'US',
      lat: home.lat,
      lon: home.lon,
      zip: home.zip,
      insurance_type: form.insurance,
    },
  };

  return { bundle, trialId, product, homeResolved: home };
}

// ---------------------------------------------------------------------------
// Patient-friendly verdict copy
// ---------------------------------------------------------------------------

const VERDICT_COPY = {
  ELIGIBLE: {
    title: 'You may be a candidate for this trial',
    sub: "Based on what you've shared, your situation matches the entry requirements. The next step is talking to your oncologist to confirm.",
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-800',
    icon: '✓',
  },
  NEEDS_REVIEW: {
    title: 'You may be eligible — but a doctor needs to confirm',
    sub: "Some of your answers suggest you could be eligible, but key details need verification (such as recent lab values). Bring this report to your oncologist.",
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    icon: '?',
  },
  INELIGIBLE: {
    title: "This specific trial isn't a fit right now",
    sub: "Based on what you've shared, you don't appear to meet this trial's requirements yet. Other treatment options may exist — talk to your oncologist about what's available.",
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-800',
    icon: '—',
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ResultsState {
  trialId: string;
  product: string;
  eligibility: EligibilityResponse;
  routing: RoutingResponse | null;
  routingError: string | null;
}

export default function FindCare() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultsState | null>(null);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // Scroll the results into view when they appear.
  useEffect(() => {
    if (results && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [results]);

  const isComplete = useMemo(() => {
    return (
      form.age.trim() !== '' &&
      form.sex !== '' &&
      form.zip.trim() !== '' &&
      form.insurance !== '' &&
      form.diagnosis !== '' &&
      form.refractory !== '' &&
      form.activity !== '' &&
      (form.noHealthFlags || form.healthFlags.length > 0)
    );
  }, [form]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((s) => ({ ...s, [k]: v }));
  };

  const toggleTreatment = (val: string) => {
    setForm((s) => ({
      ...s,
      treatments: s.treatments.includes(val)
        ? s.treatments.filter((t) => t !== val)
        : [...s.treatments, val],
    }));
  };

  const toggleHealthFlag = (val: string) => {
    setForm((s) => ({
      ...s,
      healthFlags: s.healthFlags.includes(val)
        ? s.healthFlags.filter((t) => t !== val)
        : [...s.healthFlags, val],
      noHealthFlags: false,
    }));
  };

  const setNoHealthFlags = (checked: boolean) => {
    setForm((s) => ({
      ...s,
      noHealthFlags: checked,
      healthFlags: checked ? [] : s.healthFlags,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete || submitting) return;

    const built = buildPatientBundle(form);
    if (!built) {
      setError("We couldn't recognize that ZIP code. Please double-check it.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResults(null);
    setSelectedCenterId(null);

    try {
      // 1. Eligibility evaluation against the trial chosen for this diagnosis.
      const evalResp = await fetch('/api/v1/eligibility/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trial_id: built.trialId,
          patient_bundle: built.bundle,
          persist: false,
        }),
      });
      if (!evalResp.ok) {
        const detail = await evalResp.json().catch(() => ({}));
        throw new Error(`Eligibility check failed: ${detail.detail || evalResp.status}`);
      }
      const eligibility: EligibilityResponse = await evalResp.json();

      // 2. Routing recommendations — only meaningful if not flatly INELIGIBLE.
      let routing: RoutingResponse | null = null;
      let routingError: string | null = null;
      if (eligibility.final_determination !== 'INELIGIBLE') {
        try {
          const routingResp = await fetch('/api/v1/routing/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patient_bundle: built.bundle,
              country: 'US',
              trial_id: built.trialId,
              product: built.product,
              top_n: 5,
            }),
          });
          if (!routingResp.ok) {
            const detail = await routingResp.json().catch(() => ({}));
            routingError = `Could not load treatment centers: ${detail.detail || routingResp.status}`;
          } else {
            routing = await routingResp.json();
          }
        } catch (e) {
          routingError = e instanceof Error ? e.message : 'Routing failed';
        }
      }

      setResults({
        trialId: built.trialId,
        product: built.product,
        eligibility,
        routing,
        routingError,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong while analyzing your information.');
    } finally {
      setSubmitting(false);
    }
  };

  const zipPreview = useMemo(() => {
    if (form.zip.trim().length < 5) return null;
    return resolveUsZip(form.zip);
  }, [form.zip]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/40 to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-blue-600" />
            <div>
              <div className="text-base font-semibold text-gray-900">BioSure</div>
              <div className="text-xs text-gray-500">Find care for you</div>
            </div>
          </div>
          <Link
            to="/"
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Clinician view
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome + disclaimer */}
        <section className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Find treatment options for your blood cancer
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Answer a few questions about your diagnosis and treatment history.
            We'll check whether you may be a candidate for advanced cellular therapies
            (like CAR-T) and show you the closest treatment centers that could help.
          </p>
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <strong>Not medical advice.</strong> This tool gives you information
              to bring to your oncologist. It does not replace a doctor's evaluation,
              and the results are based only on what you tell us.
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1 — About you */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. About you</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age" type="number" inputMode="numeric"
                    min={18} max={120}
                    value={form.age}
                    onChange={(e) => setField('age', e.target.value)}
                    placeholder="e.g. 67"
                  />
                </div>
                <div>
                  <Label>Biological sex</Label>
                  <RadioGroup
                    value={form.sex}
                    onValueChange={(v) => setField('sex', v as 'M' | 'F')}
                    className="flex gap-3 mt-2"
                  >
                    <Label className="flex items-center gap-1.5 font-normal cursor-pointer">
                      <RadioGroupItem value="M" /> Male
                    </Label>
                    <Label className="flex items-center gap-1.5 font-normal cursor-pointer">
                      <RadioGroupItem value="F" /> Female
                    </Label>
                  </RadioGroup>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="zip">ZIP code</Label>
                  <Input
                    id="zip" inputMode="numeric" maxLength={5}
                    value={form.zip}
                    onChange={(e) => setField('zip', e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 82601"
                  />
                  {zipPreview && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      {zipPreview.city}, {zipPreview.state}
                      {zipPreview.approximate && ' (approximate)'}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="insurance">Insurance</Label>
                  <Select value={form.insurance} onValueChange={(v) => setField('insurance', v)}>
                    <SelectTrigger id="insurance">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSURANCE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2 — Your cancer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Your cancer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="diagnosis">What blood cancer were you diagnosed with?</Label>
                <Select value={form.diagnosis} onValueChange={(v) => setField('diagnosis', v)}>
                  <SelectTrigger id="diagnosis"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAGNOSES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="block mb-2">Which treatments have you received? (check all that apply)</Label>
                <div className="grid grid-cols-1 gap-1.5">
                  {PRIOR_TREATMENTS.map((t) => (
                    <Label
                      key={t.value}
                      className="flex items-center gap-2 text-sm font-normal cursor-pointer p-2 rounded hover:bg-gray-50"
                    >
                      <Checkbox
                        checked={form.treatments.includes(t.value)}
                        onCheckedChange={() => toggleTreatment(t.value)}
                      />
                      <span>{t.label}</span>
                    </Label>
                  ))}
                </div>
              </div>

              <div>
                <Label className="block mb-2">
                  Has your cancer come back, or stopped responding to your most recent treatment?
                </Label>
                <RadioGroup
                  value={form.refractory}
                  onValueChange={(v) => setField('refractory', v as FormState['refractory'])}
                  className="space-y-1.5"
                >
                  <Label className="flex items-center gap-2 font-normal cursor-pointer p-2 rounded hover:bg-gray-50">
                    <RadioGroupItem value="yes" /> Yes
                  </Label>
                  <Label className="flex items-center gap-2 font-normal cursor-pointer p-2 rounded hover:bg-gray-50">
                    <RadioGroupItem value="no" /> No, my treatment is still working
                  </Label>
                  <Label className="flex items-center gap-2 font-normal cursor-pointer p-2 rounded hover:bg-gray-50">
                    <RadioGroupItem value="unsure" /> I'm not sure
                  </Label>
                </RadioGroup>
              </div>

              <div>
                <Label className="block mb-2">How active are you on a typical day?</Label>
                <RadioGroup
                  value={form.activity}
                  onValueChange={(v) => setField('activity', v)}
                  className="space-y-1.5"
                >
                  {ACTIVITY_LEVELS.map((a) => (
                    <Label
                      key={a.value}
                      className="flex items-start gap-2 font-normal cursor-pointer p-2 rounded hover:bg-gray-50"
                    >
                      <RadioGroupItem value={a.value} className="mt-0.5" />
                      <span className="text-sm">{a.label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          {/* Section 3 — Other health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Other health conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label className="block mb-2 text-sm text-gray-700">
                Do any of these apply to you? (check all that apply)
              </Label>
              {HEALTH_FLAGS.map((h) => (
                <Label
                  key={h.value}
                  className="flex items-center gap-2 text-sm font-normal cursor-pointer p-2 rounded hover:bg-gray-50"
                >
                  <Checkbox
                    checked={form.healthFlags.includes(h.value)}
                    onCheckedChange={() => toggleHealthFlag(h.value)}
                  />
                  <span>{h.label}</span>
                </Label>
              ))}
              <Label className="flex items-center gap-2 text-sm font-normal cursor-pointer p-2 rounded hover:bg-gray-50 border-t border-gray-100 mt-2 pt-3">
                <Checkbox
                  checked={form.noHealthFlags}
                  onCheckedChange={(v) => setNoHealthFlags(Boolean(v))}
                />
                <span className="font-medium">None of the above apply</span>
              </Label>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="sticky bottom-0 bg-gradient-to-t from-white via-white to-white/80 -mx-4 px-4 py-4 border-t border-gray-200 sm:static sm:bg-transparent sm:border-0 sm:p-0">
            <Button
              type="submit"
              disabled={!isComplete || submitting}
              className="w-full h-12 text-base"
            >
              {submitting ? 'Analyzing your information…' : 'See my treatment options'}
            </Button>
            {!isComplete && (
              <p className="text-[11px] text-gray-500 text-center mt-2">
                Please answer all questions above to continue.
              </p>
            )}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <div ref={resultsRef} className="space-y-5 pt-4">
            <ResultsView
              results={results}
              selectedCenterId={selectedCenterId}
              setSelectedCenterId={setSelectedCenterId}
            />
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results view
// ---------------------------------------------------------------------------

interface ResultsViewProps {
  results: ResultsState;
  selectedCenterId: string | null;
  setSelectedCenterId: (id: string | null) => void;
}

function ResultsView({ results, selectedCenterId, setSelectedCenterId }: ResultsViewProps) {
  const { eligibility, routing, routingError, trialId } = results;
  const copy = VERDICT_COPY[eligibility.final_determination];

  return (
    <>
      {/* Verdict card */}
      <Card className="border-blue-200 shadow-sm">
        <CardHeader>
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium w-fit ${copy.badgeBg} ${copy.badgeText}`}>
            <span>{copy.icon}</span>
            <span>{eligibility.final_determination.replace('_', ' ')}</span>
            <span className="opacity-70">· {trialId}</span>
          </div>
          <CardTitle className="text-xl mt-1">{copy.title}</CardTitle>
          <p className="text-sm text-gray-600 leading-relaxed mt-1">{copy.sub}</p>
        </CardHeader>
        <CardContent>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
            Why we think this
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            {eligibility.summary_reasoning}
          </p>
          {eligibility.flags.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1">
              <div className="font-medium">Things to discuss with your doctor:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {eligibility.flags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          {eligibility.alternative_trials_suggested.length > 0 && (
            <div className="mt-3 text-xs text-gray-600">
              Other trials your doctor may consider:{' '}
              <span className="font-medium text-gray-900">
                {eligibility.alternative_trials_suggested.join(', ')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Treatment centers */}
      {routing && routing.centers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              Treatment centers near you
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Centers ranked by clinical match, distance, and your insurance.
              Tap a center to see its location.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Map: hidden on the smallest screens to save bandwidth */}
            <div className="hidden sm:block">
              <RoutingMap
                patientHome={routing.patient_home}
                centers={routing.centers}
                nearestOverall={routing.nearest_overall}
                selectedCenterId={selectedCenterId}
                onSelectCenter={setSelectedCenterId}
                height={280}
              />
            </div>

            {/* Demo punchline callout */}
            {routing.nearest_overall && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 leading-relaxed">
                <div className="font-medium mb-1">Heads-up: closer isn't always better</div>
                <span className="text-amber-800">
                  <strong>{routing.nearest_overall.name}</strong> in {routing.nearest_overall.city}, {routing.nearest_overall.state} is closest
                  ({routing.nearest_overall.distance} {routing.nearest_overall.distance_unit}),
                  but it's <strong>out-of-network</strong> for {routing.patient_home.insurance_type}.
                  The list below recommends in-network centers that should cover your insurance.
                </span>
              </div>
            )}

            <ul className="space-y-2">
              {routing.centers.map((c) => (
                <li
                  key={c.center_id}
                  onClick={() => setSelectedCenterId(c.center_id)}
                  className={`p-3 border rounded-md cursor-pointer transition-colors ${
                    selectedCenterId === c.center_id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-blue-700">#{c.rank}</span>
                    <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.city}, {c.state} · {c.distance} {c.distance_unit} · about {c.drive_hours_estimate}h drive
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
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
                      <span className="text-gray-500">~{c.current_wait_weeks} wk wait</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {routingError && (
        <Card>
          <CardContent className="p-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded">
            We couldn't load treatment centers right now. {routingError}
          </CardContent>
        </Card>
      )}

      {/* What to ask your doctor */}
      <Card className="bg-blue-50/50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            What to ask your doctor
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 leading-relaxed space-y-2">
          <p>Bring this report to your next appointment and ask:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-1">
            <li>Am I a candidate for the <strong>{trialId}</strong> trial, or for CAR-T cell therapy more generally?</li>
            <li>Which of the treatment centers shown above do you have a referral relationship with?</li>
            <li>What additional tests would I need to confirm eligibility?</li>
            <li>What are the risks, benefits, and time commitment of CAR-T therapy?</li>
            <li>If I'm not eligible for this trial, what other options should we explore?</li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.print()} variant="outline" className="gap-2">
          <Printer className="w-4 h-4" />
          Print this report
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <a href="tel:18004ASKNCI">
            <Phone className="w-4 h-4" />
            Call NCI Cancer Info (1-800-4-CANCER)
          </a>
        </Button>
      </div>

      <div className="p-3 rounded-md bg-gray-50 border border-gray-200 text-[11px] text-gray-600 leading-relaxed">
        <ShieldAlert className="w-3.5 h-3.5 inline mr-1 text-gray-500" />
        This report is informational only and was generated from your self-reported answers.
        It is not a substitute for medical advice, diagnosis, or treatment from a qualified healthcare provider.
        Always discuss treatment decisions with your oncologist.
      </div>
    </>
  );
}
