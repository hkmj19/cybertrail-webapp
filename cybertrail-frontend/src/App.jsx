// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import AuthGuard     from './components/AuthGuard'
import ErrorBoundary from './components/ErrorBoundary'
import Layout        from './components/Layout'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import Investigate   from './pages/Investigate'
import Complaints    from './pages/Complaints'
import Blacklist     from './pages/Blacklist'
import History       from './pages/History'
import Cases         from './pages/Cases'
import CaseDetail    from './pages/CaseDetail'
import CaseReport    from './pages/CaseReport'
import Users         from './pages/Users'
import Guide         from './pages/Guide'
import Backup        from './pages/Backup'
import AuditTrail    from './pages/AuditTrail'
import Profile       from './pages/Profile'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* ── Report: NO sidebar, full page for printing ── */}
      <Route path="/cases/:caseId/report" element={
        <AuthGuard>
          <CaseReport />
        </AuthGuard>
      } />

      {/* ── Protected: all behind Layout + sidebar ── */}
      <Route path="/" element={
        <AuthGuard>
          <Layout />
        </AuthGuard>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"   element={<Dashboard />} />
        <Route path="investigate" element={<ErrorBoundary><Investigate /></ErrorBoundary>} />
        <Route path="complaints"  element={<Complaints />} />
        <Route path="blacklist"   element={<Blacklist />} />
        <Route path="history"     element={<History />} />
        <Route path="cases"       element={<Cases />} />
        <Route path="cases/:caseId" element={<CaseDetail />} />
        <Route path="profile"     element={<Profile />} />
        <Route path="users"       element={
          <AuthGuard requiredRoles={['admin','supervisor']}><Users /></AuthGuard>
        } />
        <Route path="guide"  element={<Guide />} />
        <Route path="backup" element={<Backup />} />
        <Route path="audit"  element={
          <AuthGuard requiredRoles={['admin','supervisor']}><AuditTrail /></AuthGuard>
        } />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}