import { useState, useMemo, useEffect } from 'react';
import { getApiUrl, API_ENDPOINTS } from '@/config/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download, Search, AlertTriangle, Building2, MapPin, Loader2 } from 'lucide-react';
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

const GhostRadar = () => {
  const [hcos, setHcos] = useState<HCO[]>([]);
  const [stats, setStats] = useState<HCOStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  
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
                    <TableRow key={hco._id}>
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
    </div>
  );
};

export default GhostRadar;