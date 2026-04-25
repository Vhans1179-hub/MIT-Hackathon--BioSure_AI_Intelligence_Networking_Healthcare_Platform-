import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FileText, Database, Activity, AlertCircle } from 'lucide-react';

const Methodology = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Methodology Documentation</h2>
        <p className="text-gray-600 mt-1">Detailed explanation of data sources, cohort definitions, and analytical approaches</p>
      </div>
      
      {/* Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <CardTitle>Overview</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-700">
            BioSure - Patient Finding & Precision Health is a SaaS analytics product that uses US syndicated claims data
            to provide stakeholders with Carvykti-specific outcomes analysis and financial simulation capabilities.
            This MVP focuses on scenario planning for outcomes-based contracting (OBC) and commercial targeting.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900">Version: MVP v0 (US-only)</p>
            <p className="text-sm text-blue-700 mt-1">Data Period: 2023-2024</p>
            <p className="text-sm text-blue-700">Last Updated: December 2024</p>
          </div>
        </CardContent>
      </Card>
      
      {/* Data Sources */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-blue-600" />
            <CardTitle>Data Sources</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Syndicated Claims Data</h4>
            <p className="text-sm text-gray-700 mb-3">
              The analysis uses de-identified US syndicated claims data from a major aggregator, including:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-4">
              <li>Medical and pharmacy claims</li>
              <li>Diagnosis codes (ICD-10)</li>
              <li>Procedure codes (CPT/HCPCS)</li>
              <li>Drug codes (NDC/HCPCS)</li>
              <li>Healthcare organization (HCO) and provider (HCP) identifiers</li>
              <li>Payer type information</li>
              <li>Allowed and paid amounts</li>
            </ul>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Data Coverage</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Geographic Scope:</p>
                <p className="font-medium">United States only</p>
              </div>
              <div>
                <p className="text-gray-600">Time Period:</p>
                <p className="font-medium">24 months (2023-2024)</p>
              </div>
              <div>
                <p className="text-gray-600">Patient Lives:</p>
                <p className="font-medium">~50M covered lives</p>
              </div>
              <div>
                <p className="text-gray-600">Carvykti Patients:</p>
                <p className="font-medium">847 identified</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Cohort Definition */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <CardTitle>Carvykti Cohort Definition</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Inclusion Criteria</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 ml-4">
              <li>
                <strong>Carvykti Administration:</strong> Identified via HCPCS Q-code for ciltacabtagene autoleucel 
                (Carvykti) infusion in medical claims
              </li>
              <li>
                <strong>Multiple Myeloma Diagnosis:</strong> ICD-10 code C90.0x within 180 days before or 30 days 
                after the Carvykti infusion date
              </li>
              <li>
                <strong>Index Date:</strong> Date of first Carvykti infusion serves as the patient's index date
              </li>
              <li>
                <strong>Continuous Enrollment:</strong> Minimum 6 months of continuous enrollment before index date 
                (for baseline characteristics)
              </li>
            </ol>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Prior Lines of Therapy</h4>
            <p className="text-sm text-gray-700 mb-2">
              Prior treatment lines are approximated using claims-based algorithms:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-4">
              <li>Identification of key MM regimens (proteasome inhibitors, immunomodulatory drugs, monoclonal antibodies)</li>
              <li>Sequential treatment patterns with ≥28 day gaps defining new lines</li>
              <li>Minimum 2 prior lines required for Carvykti eligibility (per label)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      {/* Outcomes Definitions */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <CardTitle>Outcomes Proxy Definitions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-yellow-900">Important Note:</p>
            <p className="text-sm text-yellow-700 mt-1">
              All outcomes are claims-based proxies and have inherent limitations. They are designed for 
              scenario planning and contract modeling, not regulatory-grade real-world evidence.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">1. Event-Free Survival (12-Month)</h4>
            <p className="text-sm text-gray-700 mb-2">
              A patient is considered to have an "event" if any of the following occur within 12 months of index:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-4">
              <li>Death proxy: Loss of enrollment or hospice claims</li>
              <li>New MM treatment regimen initiated</li>
              <li>HSCT or subsequent CAR-T therapy</li>
            </ul>
            <p className="text-sm text-gray-600 mt-2 italic">
              Observed rate in cohort: ~25%
            </p>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">2. Retreatment (18-Month)</h4>
            <p className="text-sm text-gray-700 mb-2">
              Retreatment is defined as receipt of:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-4">
              <li>New high-cost MM therapy (e.g., another CAR-T, bispecific antibody)</li>
              <li>Hematopoietic stem cell transplant (HSCT)</li>
              <li>Salvage chemotherapy regimen</li>
            </ul>
            <p className="text-sm text-gray-600 mt-2 italic">
              Observed rate in cohort: ~15%
            </p>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">3. Acute Toxicity (30-Day)</h4>
            <p className="text-sm text-gray-700 mb-2">
              Acute toxicity events within 30 days of index include:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-4">
              <li>ICU admission with CRS-related diagnosis codes</li>
              <li>Inpatient readmission with ICANS-related diagnosis codes</li>
              <li>Emergency department visits with severe adverse event codes</li>
            </ul>
            <p className="text-sm text-gray-600 mt-2 italic">
              Observed rate in cohort: ~12%
            </p>
          </div>
        </CardContent>
      
      </Card>
      
      {/* Ghost Patient Logic */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <CardTitle>Ghost Patient Identification</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-700">
            "Ghost patients" are defined as patients who appear eligible for Carvykti based on claims data 
            but have not received the therapy. The identification logic includes:
          </p>
          
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Eligibility Criteria</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-4">
              <li>Multiple myeloma diagnosis (ICD-10 C90.0x)</li>
              <li>Evidence of ≥2 prior lines of MM therapy</li>
              <li>No record of Carvykti or other BCMA-directed CAR-T therapy</li>
              <li>Active in claims data within the last 12 months</li>
              <li>Age 18-80 years</li>
            </ul>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Aggregation</h4>
            <p className="text-sm text-gray-700 mb-2">
              Ghost patients are aggregated by:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-4">
              <li>Healthcare organization (HCO) where they receive care</li>
              <li>Geographic region and state</li>
              <li>Payer type</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      {/* Limitations */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <CardTitle>Limitations & Assumptions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="font-semibold mr-2">•</span>
                <span><strong>Claims-Only Data:</strong> No access to EHR, lab values, or clinical notes. 
                Outcomes are proxies based on billing codes.</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">•</span>
                <span><strong>Death Ascertainment:</strong> True mortality is not directly observable in claims. 
                We use enrollment loss and hospice as proxies.</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">•</span>
                <span><strong>Incomplete Capture:</strong> Patients may receive care outside the claims network 
                or switch payers, leading to incomplete follow-up.</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">•</span>
                <span><strong>Ghost Patient Uncertainty:</strong> Eligibility is algorithmic and may include 
                patients with contraindications not visible in claims.</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">•</span>
                <span><strong>Not for Adjudication:</strong> This tool is designed for scenario planning and 
                strategic analysis, not formal contract adjudication.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      {/* Contact */}
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-gray-600">
            For questions about methodology or data sources, please contact the BioSure analytics team.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Methodology;