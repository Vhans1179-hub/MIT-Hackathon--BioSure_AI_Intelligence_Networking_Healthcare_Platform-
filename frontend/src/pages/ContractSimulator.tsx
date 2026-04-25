import { useState, useEffect } from 'react';
import { API_ENDPOINTS, getApiUrl, DEFAULT_FETCH_OPTIONS } from '@/config/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Download, TrendingDown, TrendingUp, DollarSign, AlertCircle, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

interface ContractTemplate {
  template_id: string;
  name: string;
  description: string;
  outcome_type: string;
  default_time_window: number;
  default_rebate_percent: number;
}

interface SimulationResults {
  total_patients: number;
  failure_count: number;
  success_count: number;
  failure_rate: number;
  success_rate: number;
  rebate_per_patient: number;
  total_rebate: number;
  low_rebate: number;
  high_rebate: number;
  avg_rebate_per_treated: number;
}

const ContractSimulator = () => {
  const { toast } = useToast();
  
  // State for templates and loading
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  
  // State for simulation parameters
  const [rebatePercent, setRebatePercent] = useState(50);
  const [therapyPrice, setTherapyPrice] = useState(465000);
  const [timeWindow, setTimeWindow] = useState(12);
  
  // State for simulation results
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  
  // Fetch contract templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch(
          getApiUrl(API_ENDPOINTS.contracts.templates),
          DEFAULT_FETCH_OPTIONS
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch contract templates');
        }
        
        const data = await response.json();
        setTemplates(data.templates);
        
        // Set first template as default
        if (data.templates.length > 0) {
          const firstTemplate = data.templates[0];
          setSelectedTemplate(firstTemplate);
          setRebatePercent(firstTemplate.default_rebate_percent);
          setTimeWindow(firstTemplate.default_time_window);
        }
      } catch (error) {
        console.error('Error fetching templates:', error);
        toast({
          title: 'Error',
          description: 'Failed to load contract templates. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoadingTemplates(false);
      }
    };
    
    fetchTemplates();
  }, [toast]);
  
  // Run simulation when parameters change
  useEffect(() => {
    if (!selectedTemplate) return;
    
    const runSimulation = async () => {
      setLoadingSimulation(true);
      
      try {
        const response = await fetch(
          getApiUrl(API_ENDPOINTS.contracts.simulate),
          {
            ...DEFAULT_FETCH_OPTIONS,
            method: 'POST',
            body: JSON.stringify({
              template_id: selectedTemplate.template_id,
              rebate_percent: rebatePercent,
              therapy_price: therapyPrice,
              time_window: timeWindow,
            }),
          }
        );
        
        if (!response.ok) {
          throw new Error('Failed to run simulation');
        }
        
        const data = await response.json();
        setResults(data);
      } catch (error) {
        console.error('Error running simulation:', error);
        toast({
          title: 'Error',
          description: 'Failed to run simulation. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoadingSimulation(false);
      }
    };
    
    runSimulation();
  }, [selectedTemplate, rebatePercent, therapyPrice, timeWindow, toast]);
  
  const handleExport = () => {
    if (!selectedTemplate || !results) return;
    
    const data = {
      template: selectedTemplate.name,
      parameters: {
        rebatePercent,
        therapyPrice,
        timeWindow
      },
      results
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-simulation-${Date.now()}.json`;
    a.click();
  };
  
  if (loadingTemplates) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }
  
  if (!selectedTemplate || !results) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-500">No contract templates available</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Outcomes & Contract Simulator</h2>
        <p className="text-gray-600 mt-1">Model outcomes-based contract scenarios and estimate rebate exposure</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Contract Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Template Selection */}
            <div className="space-y-2">
              <Label>Contract Template</Label>
              <Select
                value={selectedTemplate.template_id}
                onValueChange={(value) => {
                  const template = templates.find(t => t.template_id === value);
                  if (template) {
                    setSelectedTemplate(template);
                    setTimeWindow(template.default_time_window);
                    setRebatePercent(template.default_rebate_percent);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.template_id} value={template.template_id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">{selectedTemplate.description}</p>
            </div>
            
            <Separator />
            
            {/* Rebate Percentage */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Rebate Percentage</Label>
                <span className="text-sm font-medium">{rebatePercent}%</span>
              </div>
              <Slider
                value={[rebatePercent]}
                onValueChange={(value) => setRebatePercent(value[0])}
                min={10}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
            
            {/* Therapy Price */}
            <div className="space-y-2">
              <Label>Therapy Price per Patient</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <Input
                  type="number"
                  value={therapyPrice}
                  onChange={(e) => setTherapyPrice(Number(e.target.value))}
                  className="pl-7"
                />
              </div>
            </div>
            
            {/* Time Window */}
            <div className="space-y-2">
              <Label>Time Window (months)</Label>
              <Input
                type="number"
                value={timeWindow}
                onChange={(e) => setTimeWindow(Number(e.target.value))}
                min={1}
                max={36}
              />
            </div>
            
            <Button onClick={handleExport} className="w-full" variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Results
            </Button>
          </CardContent>
        </Card>
        
        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {loadingSimulation ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Outcome Failure Rate</p>
                        <p className="text-3xl font-bold text-red-600 mt-2">{results.failure_rate}%</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {results.failure_count} of {results.total_patients} patients
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                        <TrendingDown className="w-6 h-6 text-red-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Success Rate</p>
                        <p className="text-3xl font-bold text-green-600 mt-2">{results.success_rate}%</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {results.success_count} patients
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Expected Total Rebate</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">
                          ${(results.total_rebate / 1000000).toFixed(1)}M
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          ${results.rebate_per_patient.toLocaleString()} per failure
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Avg Rebate per Treated</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">
                          ${Math.round(results.avg_rebate_per_treated).toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Across all {results.total_patients} patients
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-purple-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Sensitivity Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle>Sensitivity Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Low Scenario</p>
                        <p className="text-xs text-gray-600">-20% failure rate</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-700">
                          ${(results.low_rebate / 1000000).toFixed(1)}M
                        </p>
                        <p className="text-xs text-gray-600">Total rebate</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Base Scenario</p>
                        <p className="text-xs text-gray-600">Current parameters</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-700">
                          ${(results.total_rebate / 1000000).toFixed(1)}M
                        </p>
                        <p className="text-xs text-gray-600">Total rebate</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">High Scenario</p>
                        <p className="text-xs text-gray-600">+20% failure rate</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-700">
                          ${(results.high_rebate / 1000000).toFixed(1)}M
                        </p>
                        <p className="text-xs text-gray-600">Total rebate</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Contract Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Contract Type:</span>
                      <span className="font-medium">{selectedTemplate.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Time Window:</span>
                      <span className="font-medium">{timeWindow} months</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Rebate %:</span>
                      <span className="font-medium">{rebatePercent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Therapy Price:</span>
                      <span className="font-medium">${therapyPrice.toLocaleString()}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-gray-600">Patients Triggering Rebate:</span>
                      <span className="font-medium">{results.failure_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Expected Rebate Range:</span>
                      <span className="font-medium">
                        ${(results.low_rebate / 1000000).toFixed(1)}M - ${(results.high_rebate / 1000000).toFixed(1)}M
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContractSimulator;