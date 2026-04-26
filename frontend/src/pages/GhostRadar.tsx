import { useState, useMemo, useEffect } from 'react';
import { getApiUrl, API_ENDPOINTS } from '@/config/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download, Search, AlertTriangle, Building2, MapPin, Loader2, Users, CheckCircle2, TrendingUp, Sparkles } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { EligibilityDrawer } from '@/components/EligibilityDrawer';

interface HCO {
  _id: string;
  hco_id: string;
  name: string;
  state: string;
  region: string;
  treated_patients: number;
  ghost_patients: number;
  leakage_rate: number;
}

interface HCOStats {
  total_ghost: number;
  total_treated: number;
  avg_ghost_per_hco: number;
  leakage_rate: number;
  hco_count: number;
}

interface Patient {
  _id: string;
  patient_id: string;
  age: number;
  sex: string;
  payer_type: string;
  prior_lines: number;
  treating_hco_id: string;
  treating_hco_name: string;
}

const ELIGIBILITY_TRIAL_ID = 'CARTITUDE-4';

// Headline demo entry points — bypass the HCO drill-through and open the
// EligibilityDrawer directly for engineered cases that map to specific stories.
const FEATURED_CASES = [
  {
    patient_id: 'MM-001',
    title: 'Textbook eligible candidate',
    description: 'Single evaluation, clean ELIGIBLE verdict with full evidence-cited reasoning across all CARTITUDE-4 criteria.',
    location: 'Trenton, NJ',
    insurance: 'Medicare Advantage',
    verdict: 'ELIGIBLE',
    icon: CheckCircle2,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    badgeColor: 'bg-green-100 text-green-800',
    cta: 'Open Current tab',
  },
  {
    patient_id: 'MM-005',
    title: 'Longitudinal patient journey',
    description: '3 evaluations across 6 months as the patient progressed: INELIGIBLE → NEEDS_REVIEW. Click the Timeline tab.',
    location: 'Pittsburgh, PA',
    insurance: 'Medicare',
    verdict: 'NEEDS_REVIEW',
    icon: TrendingUp,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    badgeColor: 'bg-yellow-100 text-yellow-800',
    cta: 'Open Timeline tab',
  },
  {
    patient_id: 'MM-014',
    title: 'Rural routing challenge',
    description: 'ELIGIBLE patient in Wyoming where the closest CAR-T center is out-of-network for Medicaid. Click the Routing tab.',
    location: 'Casper, WY',
    insurance: 'Medicaid',
    verdict: 'ELIGIBLE',
    icon: MapPin,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    badgeColor: 'bg-green-100 text-green-800',
    cta: 'Open Routing tab',
  },
];

const GhostRadar = () => {
  const [hcos, setHcos] = useState<HCO[]>([]);
  const [stats, setStats] = useState<HCOStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');

  // Drill-through: HCO row click -> patient list dialog -> patient row click -> EligibilityDrawer
  const [drilledHco, setDrilledHco] = useState<HCO | null>(null);
  const [drilledPatients, setDrilledPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [openPatientId, setOpenPatientId] = useState<string | null>(null);
  
  // Fetch HCO data from backend
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Build query parameters
        const params = new URLSearchParams({
          sort_by: 'ghost_patients',
          limit: '100',
        });
        
        if (regionFilter !== 'all') {
          params.append('region', regionFilter);
        }
        
        if (stateFilter !== 'all') {
          params.append('state', stateFilter);
        }
        
        // Fetch HCOs and stats in parallel
        const [hcosResponse, statsResponse] = await Promise.all([
          fetch(`${getApiUrl(API_ENDPOINTS.hcos.list)}?${params.toString()}`),
          fetch(getApiUrl(API_ENDPOINTS.hcos.stats))
        ]);
        
        if (!hcosResponse.ok || !statsResponse.ok) {
          throw new Error('Failed to fetch HCO data');
        }
        
        const hcosData = await hcosResponse.json();
        const statsData = await statsResponse.json();
        
        setHcos(hcosData.hcos || []);
        setStats(statsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching HCO data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [regionFilter, stateFilter]);

  // Fetch patients for the drilled-into HCO
  useEffect(() => {
    if (!drilledHco) {
      setDrilledPatients([]);
      return;
    }

    const fetchPatients = async () => {
      setLoadingPatients(true);
      try {
        const params = new URLSearchParams({
          treating_hco_id: drilledHco.hco_id,
          limit: '100',
        });
        const res = await fetch(`${getApiUrl(API_ENDPOINTS.patients.list)}?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch patients');
        const data = await res.json();
        setDrilledPatients(data.patients || []);
      } catch (err) {
        console.error('Error fetching patients for HCO:', err);
        setDrilledPatients([]);
      } finally {
        setLoadingPatients(false);
      }
    };

    fetchPatients();
  }, [drilledHco]);

  // Filter HCOs by search term (client-side)
  const filteredHCOs = useMemo(() => {
    if (!searchTerm) return hcos;
    
    const lowerSearch = searchTerm.toLowerCase();
    return hcos.filter(hco => 
      hco.name.toLowerCase().includes(lowerSearch) ||
      hco.state.toLowerCase().includes(lowerSearch)
    );
  }, [hcos, searchTerm]);
  
  // Get unique regions and states for filters
  const regions = ['all', 'West', 'South', 'Northeast', 'Midwest'];
  const states = ['all', 'CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI'];
  
  const handleExport = () => {
    const csvContent = [
      ['HCO Name', 'State', 'Region', 'Ghost Patients', 'Treated Patients', 'Leakage Rate'].join(','),
      ...filteredHCOs.map(hco => [
        hco.name,
        hco.state,
        hco.region,
        hco.ghost_patients,
        hco.treated_patients,
        `${hco.leakage_rate.toFixed(1)}%`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghost-patient-radar-${Date.now()}.csv`;
    a.click();
  };
  
  const getPriorityBadge = (ghostCount: number) => {
    if (ghostCount >= 100) return <Badge variant="destructive">High Priority</Badge>;
    if (ghostCount >= 50) return <Badge className="bg-orange-500">Medium Priority</Badge>;
    return <Badge variant="secondary">Low Priority</Badge>;
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Ghost Patient Radar</h2>
          <p className="text-gray-600 mt-1">Identify likely Carvykti-eligible but untreated patients by HCO and region</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Card>
          <CardContent className="p-6 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading HCO data...</span>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Ghost Patient Radar</h2>
          <p className="text-gray-600 mt-1">Identify likely Carvykti-eligible but untreated patients by HCO and region</p>
        </div>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center text-red-600">
              <AlertTriangle className="w-6 h-6 mr-2" />
              <div>
                <p className="font-semibold">Error loading data</p>
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Ghost Patient Radar</h2>
        <p className="text-gray-600 mt-1">Identify likely Carvykti-eligible but untreated patients by HCO and region</p>
      </div>
      
      {/* Featured Eligibility Cases — quick-launch demo entry points */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Featured Eligibility Cases
          </CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            One-click demos. Each case opens the eligibility drawer with a different story.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURED_CASES.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.patient_id}
                  onClick={() => setOpenPatientId(c.patient_id)}
                  className="text-left p-4 rounded-lg border border-gray-200 bg-white hover:border-blue-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 ${c.iconBg} rounded-md flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${c.iconColor}`} />
                    </div>
                    <span className="text-xs font-mono font-medium text-gray-500">{c.patient_id}</span>
                  </div>
                  <div className="font-semibold text-sm text-gray-900 mb-1">{c.title}</div>
                  <p className="text-xs text-gray-600 mb-3 leading-relaxed">{c.description}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-0.5 rounded font-medium ${c.badgeColor}`}>
                      {c.verdict}
                    </span>
                    <span className="text-gray-500">{c.location}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-blue-600 font-medium">→ {c.cta}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Ghost Patients</p>
                <p className="text-3xl font-bold text-orange-600 mt-2">
                  {stats?.total_ghost.toLocaleString() || 0}
                </p>
                <p className="text-sm text-gray-500 mt-1">Eligible but untreated</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Leakage Rate</p>
                <p className="text-3xl font-bold text-red-600 mt-2">
                  {stats?.leakage_rate.toFixed(1) || 0}%
                </p>
                <p className="text-sm text-gray-500 mt-1">Of eligible patients</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">HCOs with Leakage</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats?.hco_count || 0}
                </p>
                <p className="text-sm text-gray-500 mt-1">Treatment centers</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Ghost per HCO</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats?.avg_ghost_per_hco || 0}
                </p>
                <p className="text-sm text-gray-500 mt-1">Patients per center</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search HCO or state..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
              <SelectContent>
                {regions.map(region => (
                  <SelectItem key={region} value={region}>
                    {region === 'all' ? 'All Regions' : region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                {states.map(state => (
                  <SelectItem key={state} value={state}>
                    {state === 'all' ? 'All States' : state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button onClick={handleExport} variant="outline" disabled={filteredHCOs.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* HCO Table */}
      <Card>
        <CardHeader>
          <CardTitle>HCO Rankings ({filteredHCOs.length} centers)</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Click an HCO row to drill into its treated patients and evaluate trial eligibility.
          </p>
        </CardHeader>
        <CardContent>
          {filteredHCOs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No HCOs found matching your filters.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>HCO Name</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Ghost Patients</TableHead>
                    <TableHead className="text-right">Treated Patients</TableHead>
                    <TableHead className="text-right">Leakage Rate</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHCOs.slice(0, 20).map((hco, index) => (
                    <TableRow
                      key={hco._id}
                      onClick={() => setDrilledHco(hco)}
                      className="cursor-pointer hover:bg-blue-50 transition-colors"
                    >
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-medium">{hco.name}</TableCell>
                      <TableCell>{hco.state}</TableCell>
                      <TableCell>{hco.region}</TableCell>
                      <TableCell className="text-right font-bold text-orange-600">
                        {hco.ghost_patients}
                      </TableCell>
                      <TableCell className="text-right">{hco.treated_patients}</TableCell>
                      <TableCell className="text-right">{hco.leakage_rate.toFixed(1)}%</TableCell>
                      <TableCell>{getPriorityBadge(hco.ghost_patients)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredHCOs.length > 20 && (
                <div className="mt-4 text-center text-sm text-gray-500">
                  Showing top 20 of {filteredHCOs.length} HCOs. Export CSV for full list.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Drill-through dialog: list of patients treated at the selected HCO */}
      <Dialog open={drilledHco !== null} onOpenChange={(open) => !open && setDrilledHco(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Patients at {drilledHco?.name}
            </DialogTitle>
            <DialogDescription>
              {drilledHco?.state} · {drilledHco?.region} · {drilledHco?.treated_patients} treated ·{' '}
              <span className="text-orange-600 font-medium">{drilledHco?.ghost_patients} ghost (untapped)</span>
              <br />
              Click a patient row to evaluate eligibility for {ELIGIBILITY_TRIAL_ID}.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1">
            {loadingPatients ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-600">Loading patients...</span>
              </div>
            ) : drilledPatients.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No patients found for this HCO.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient ID</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead>Sex</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead className="text-right">Prior Lines</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drilledPatients.map((p) => (
                    <TableRow
                      key={p._id}
                      onClick={() => {
                        setOpenPatientId(p.patient_id);
                        setDrilledHco(null);
                      }}
                      className="cursor-pointer hover:bg-blue-50 transition-colors"
                    >
                      <TableCell className="font-mono font-medium">{p.patient_id}</TableCell>
                      <TableCell className="text-right">{p.age}</TableCell>
                      <TableCell>{p.sex}</TableCell>
                      <TableCell>{p.payer_type}</TableCell>
                      <TableCell className="text-right">{p.prior_lines}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Eligibility evaluation drawer */}
      <EligibilityDrawer
        patientId={openPatientId}
        trialId={ELIGIBILITY_TRIAL_ID}
        open={openPatientId !== null}
        onClose={() => setOpenPatientId(null)}
      />
    </div>
  );
};

export default GhostRadar;