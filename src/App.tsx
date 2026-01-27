import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

// Pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import Projects from "./pages/app/Projects";
import ProjectConfig from "./pages/app/ProjectConfig";
import ProjectPreview from "./pages/app/ProjectPreview";
import ViewDashboard from "./pages/ViewDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/view/:token" element={<ViewDashboard />} />
              
              {/* Protected routes */}
              <Route path="/app/projects" element={
                <ProtectedRoute>
                  <Projects />
                </ProtectedRoute>
              } />
              <Route path="/app/projects/:id/config" element={
                <ProtectedRoute>
                  <ProjectConfig />
                </ProtectedRoute>
              } />
              <Route path="/app/projects/:id/preview" element={
                <ProtectedRoute>
                  <ProjectPreview />
                </ProtectedRoute>
              } />
              
              {/* Catch all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
