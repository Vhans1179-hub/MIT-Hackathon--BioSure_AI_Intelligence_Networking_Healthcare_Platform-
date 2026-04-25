import { useState, useEffect, useMemo } from 'react';
import StatCard from '@/components/cohort/StatCard';
import { Users, Activity, MapPin, CreditCard, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getApiUrl, API_ENDPOINTS } from '@/config/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface PatientStats {
  total_patients: number;
  avg_age: number;
  male_percent: number;
  avg_prior_lines: number;
  payer_dist: Record<string, number>;
  region_dist: Record<string, number>;
  age_buckets: Record<string, number>;
}

const CohortOverview = () => {
  const [stats, setStats] = useState<PatientStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(getApiUrl(API_ENDPOINTS.patients.stats));
        
        if (!response.ok) {
          throw new Error(`Failed to fetch patient statistics: ${response.statusText}`);
        }
        
        const data: PatientStats = await response.json();
        setStats(data);
      } catch (err) {
        console.error('Error fetching patient stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load patient data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
  }, []);
  
  const payerChartData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.payer_dist).map(([name, value]) => ({
      name,
      value,
      percent: Math.round((value / stats.total_patients) * 100)
    }));
  }, [stats]);
  
  const regionChartData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.region_dist).map(([name, value]) => ({
      name,
      value
    }));
  }, [stats]);
  
  const ageChartData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.age_buckets).map(([name, value]) => ({
      name,
      value
    }));
  }, [stats]);
  
  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
  
  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading patient data...</p>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error || !stats) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cohort Overview</h2>
          <p className="text-gray-600 mt-1">Carvykti-treated patient cohort from US syndicated claims</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error || 'Failed to load patient data. Please try again later.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Cohort Overview</h2>
        <p className="text-gray-600 mt-1">Carvykti-treated patient cohort from US syndicated claims</p>
      </div>
      
      {/* Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Patients"
          value={stats.total_patients.toLocaleString()}
          subtitle="Carvykti-treated cohort"
          icon={Users}
        />
        <StatCard
          title="Average Age"
          value={`${stats.avg_age} years`}
          subtitle={`${stats.male_percent}% Male`}
          icon={Activity}
        />
        <StatCard
          title="Avg Prior Lines"
          value={stats.avg_prior_lines.toFixed(1)}
          subtitle="Lines of therapy"
          icon={CreditCard}
        />
        <StatCard
          title="Geographic Spread"
          value={Object.keys(stats.region_dist).length}
          subtitle="US regions covered"
          icon={MapPin}
        />
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payer Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Payer Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={payerChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${percent}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {payerChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Regional Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Regional Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={regionChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Age Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Age Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ageChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Summary Table */}
        <Card>
          <CardHeader>
            <CardTitle>Cohort Characteristics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm font-medium text-gray-600">Total Patients</span>
                <span className="text-sm font-bold text-gray-900">{stats.total_patients}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm font-medium text-gray-600">Male / Female</span>
                <span className="text-sm font-bold text-gray-900">{stats.male_percent}% / {100 - stats.male_percent}%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm font-medium text-gray-600">Average Age</span>
                <span className="text-sm font-bold text-gray-900">{stats.avg_age} years</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm font-medium text-gray-600">Avg Prior Lines</span>
                <span className="text-sm font-bold text-gray-900">{stats.avg_prior_lines.toFixed(1)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm font-medium text-gray-600">Data Period</span>
                <span className="text-sm font-bold text-gray-900">2023-2024</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CohortOverview;