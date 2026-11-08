import { Loader2 } from "lucide-react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppLayout } from "./components/layout/AppLayout";
import { AlertsPage } from "./features/alerts/AlertsPage";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PositionsPage } from "./features/positions/PositionsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { SourcesPage } from "./features/sources/SourcesPage";
import { TimelinePage } from "./features/timeline/TimelinePage";
import { AlertProvider } from "./lib/alerts";
import { useAuth } from "./lib/auth";
import { LiveProvider } from "./lib/live";

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-2 text-sm text-mist-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在恢复会话
        </div>
      </div>
    );
  }
  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return (
    <LiveProvider>
      <AlertProvider>
        <AppLayout />
      </AlertProvider>
    </LiveProvider>
  );
}

function LoginRoute() {
  const { status } = useAuth();
  const location = useLocation();
  // The form does not navigate on success; flipping to `authenticated` sends
  // the user onward from here, so the requested page is always honoured.
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (status === "authenticated") return <Navigate to={from} replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="positions" element={<PositionsPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
