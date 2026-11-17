import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import { RequireAuth } from '@/auth/RequireAuth';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/ui';
import LoginPage from '@/pages/LoginPage';

const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
const ProcessLibraryPage = lazy(() => import('@/pages/library/ProcessLibraryPage'));
const KpiLibraryPage = lazy(() => import('@/pages/kpis/KpiLibraryPage'));
const KpiAlignmentPage = lazy(() => import('@/pages/kpis/KpiAlignmentPage'));
const KpiCascadePage = lazy(() => import('@/pages/kpis/KpiCascadePage'));
const ImpactPage = lazy(() => import('@/pages/ImpactPage'));
const GovernancePage = lazy(() => import('@/pages/governance/GovernancePage'));
const AuditPage = lazy(() => import('@/pages/AuditPage'));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route
            path="*"
            element={
              <Suspense fallback={<Spinner />}>
                <Routes>
                  <Route index element={<OverviewPage />} />
                  <Route path="library" element={<ProcessLibraryPage />} />
                  <Route path="library/:code" element={<ProcessLibraryPage />} />
                  <Route path="kpis" element={<KpiLibraryPage />} />
                  <Route path="kpis/alignment" element={<KpiAlignmentPage />} />
                  <Route path="kpis/cascade" element={<KpiCascadePage />} />
                  <Route path="impact" element={<ImpactPage />} />
                  <Route path="governance" element={<GovernancePage />} />
                  <Route path="approvals" element={<GovernancePage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="*" element={<div className="empty">Page not found.</div>} />
                </Routes>
              </Suspense>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
