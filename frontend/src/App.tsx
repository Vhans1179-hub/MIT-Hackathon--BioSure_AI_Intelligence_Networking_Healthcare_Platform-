import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "./components/layout/DashboardLayout";
import CohortOverview from "./pages/CohortOverview";
import ContractSimulator from "./pages/ContractSimulator";
import GhostRadar from "./pages/GhostRadar";
import Methodology from "./pages/Methodology";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <DashboardLayout>
              <CohortOverview />
            </DashboardLayout>
          } />
          <Route path="/simulator" element={
            <DashboardLayout>
              <ContractSimulator />
            </DashboardLayout>
          } />
          <Route path="/ghost-radar" element={
            <DashboardLayout>
              <GhostRadar />
            </DashboardLayout>
          } />
          <Route path="/methodology" element={
            <DashboardLayout>
              <Methodology />
            </DashboardLayout>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
