import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// ReactQueryDevtools intentionally excluded from production build
import { I18nProvider } from '@/hooks/useI18n';
import { ToastProvider } from '@/hooks/useToast';
import { AuthProvider } from '@/hooks/useAuth';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PreferenceSync } from '@/components/PreferenceSync';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DemoRegisterPage } from '@/pages/DemoRegisterPage';
import { LandingPage } from '@/pages/LandingPage';
import { AccountPage } from '@/pages/AccountPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PositionsPage } from '@/pages/PositionsPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { FinancePage } from '@/pages/FinancePage';
import { ChartsPage } from '@/pages/ChartsPage';
import { AnalyzerPage } from '@/pages/AnalyzerPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * Main application React entry component.
 * Registers context providers (QueryClientProvider, ErrorBoundary, I18nProvider, ToastProvider, AuthProvider, PreferenceSync),
 * configures page routes mapping, and enables React Query Devtools context.
 *
 * @returns Root application layout element with routing
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <I18nProvider>
          <ToastProvider>
            <HashRouter>
              <AuthProvider>
                <PreferenceSync>
                <Routes>
                  <Route path="/" element={<Navigate to="/landing" replace />} />
                  <Route path="/landing" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/demo-register" element={<DemoRegisterPage />} />

                  <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                  <Route path="/positions" element={<ProtectedRoute><PositionsPage /></ProtectedRoute>} />
                  <Route path="/charts" element={<ProtectedRoute><ChartsPage /></ProtectedRoute>} />
                  <Route path="/analyzer" element={<ProtectedRoute><AnalyzerPage /></ProtectedRoute>} />
                  <Route path="/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
                  <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
                  <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

                  <Route path="*" element={<PlaceholderPage title="Not Found" />} />
                </Routes>
                </PreferenceSync>
              </AuthProvider>
            </HashRouter>
          </ToastProvider>
        </I18nProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
