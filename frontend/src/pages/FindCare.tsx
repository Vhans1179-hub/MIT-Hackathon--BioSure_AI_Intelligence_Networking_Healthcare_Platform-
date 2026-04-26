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

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { resolveUsZip } from '@/data/usZipLookup';

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
// Component
// ---------------------------------------------------------------------------

export default function FindCare() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  // Results state lands in the next commit.

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete || submitting) return;
    setSubmitting(true);
    // Submission + results wiring in the next commit.
    setTimeout(() => setSubmitting(false), 800);
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
      </main>
    </div>
  );
}
