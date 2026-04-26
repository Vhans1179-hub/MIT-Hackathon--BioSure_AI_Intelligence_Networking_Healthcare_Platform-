import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Users, AlertTriangle, FileText, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();

  const navItems: NavItem[] = [
    { path: '/', label: 'Cohort Overview', icon: Users },
    { path: '/simulator', label: 'Contract Simulator', icon: Activity },
    { path: '/ghost-radar', label: 'Ghost Patient Radar', icon: AlertTriangle },
    { path: '/methodology', label: 'Methodology', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">BioSure</h1>
              <p className="text-sm text-gray-600">Patient Finding & Precision Health</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">US Market Analysis</p>
                <p className="text-xs text-gray-500">Data through Q4 2024</p>
              </div>
              <Link
                to="/find-care"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors"
              >
                <Stethoscope className="w-3.5 h-3.5" />
                For patients
              </Link>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="px-6 border-t border-gray-200">
          <div className="flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="px-6 py-6">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
