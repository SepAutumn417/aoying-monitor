import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/layout/AppLayout";
import { AlertsPage } from "./features/alerts/AlertsPage";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PositionsPage } from "./features/positions/PositionsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { SourcesPage } from "./features/sources/SourcesPage";
import { TimelinePage } from "./features/timeline/TimelinePage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
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
