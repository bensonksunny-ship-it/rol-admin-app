import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/Layout/MainLayout'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import MyWorkspace from './pages/MyWorkspace'
import Analytics from './pages/Analytics'
import Departments from './pages/Departments'
import DepartmentDetail from './pages/DepartmentDetail'
import Tasks from './pages/Tasks'
import SundayMinistry from './pages/SundayMinistry'
import SundayPlanning from './pages/SundayPlanning'
import Finance from './pages/Finance'
import Reports from './pages/Reports'
import DepartmentWorship from './pages/DepartmentWorship'
import WorshipApplicationsPage from './pages/worship/WorshipApplicationsPage'
import SundayReport from './pages/SundayReport'
import SundayProgram from './pages/SundayProgram'
import SundayCrew from './pages/SundayCrew'
import Sunday from './pages/Sunday'
import SundayReportsHistory from './pages/sunday/SundayReportsHistory'
import DepartmentHub from './pages/DepartmentHub'
import DepartmentPastorView from './pages/DepartmentPastorView'
import DepartmentPastorUpdates from './pages/DepartmentPastorUpdates'
import AdminUserManagement from './pages/AdminUserManagement'
import CellUserManagement from './pages/CellUserManagement'
import SundayMinistryPastor from './pages/SundayMinistryPastor'
import SeniorPastorHub from './pages/SeniorPastorHub'
import EntryPage from './pages/accounts/EntryPage'
import DLightMembers from './pages/DLightMembers'
import PeopleDirectory from './pages/PeopleDirectory'
import WorklistSheet from './pages/WorklistSheet'
import BoardPresentView from './pages/BoardPresentView'
import OfflineBanner from './components/OfflineBanner'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/board-present/:meetingId"
              element={
                <ProtectedRoute>
                  <BoardPresentView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<MyWorkspace />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="departments" element={<Departments />} />
              <Route path="departments/:slug" element={<DepartmentDetail />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="sunday-ministry" element={<SundayMinistry />} />
              <Route path="sunday-planning" element={<SundayPlanning />} />
              <Route path="finance" element={<Finance />} />
              <Route path="reports" element={<Reports />} />
              <Route path="admin/users" element={<AdminUserManagement />} />
              <Route path="people" element={<PeopleDirectory />} />
              <Route path="worklist" element={<WorklistSheet />} />
              <Route path="cell/users" element={<CellUserManagement />} />
              <Route path="department/worship" element={<DepartmentWorship />} />
              <Route path="department/worship/applications" element={<WorshipApplicationsPage />} />
              <Route path="department/sunday-ministry/sunday" element={<Sunday />} />
              <Route path="department/sunday-ministry/sunday-report" element={<SundayReport />} />
              <Route path="department/sunday-ministry/sunday-program" element={<SundayProgram />} />
              <Route path="department/sunday-ministry/crew" element={<SundayCrew />} />
              <Route path="department/sunday-ministry/reports" element={<SundayReportsHistory />} />
              <Route path="department/cell/cell-report" element={<Navigate to="/department/cell?tab=reports" replace />} />
              <Route path="department/cell/cell-history" element={<Navigate to="/department/cell?tab=reports" replace />} />
              <Route path="department/cell/shepherd" element={<Navigate to="/department/cell?tab=shepherdCare" replace />} />
              <Route path="department/cell/midweek" element={<Navigate to="/department/cell?tab=midweek" replace />} />
              <Route path="department/junior-c" element={<Navigate to="/department/river-kids" replace />} />
              <Route path="department/build-c" element={<Navigate to="/department/building-care" replace />} />
              <Route path="department/d-light/members" element={<DLightMembers />} />
              <Route path="department/:slug" element={<DepartmentHub />}>
                <Route path="entry/*" element={<EntryPage />} />
              </Route>
              <Route path="department/:slug/pastor" element={<DepartmentPastorView />} />
              <Route path="department/:slug/pastor/updates" element={<DepartmentPastorUpdates />} />
              <Route path="sunday-ministry-pastor" element={<SundayMinistryPastor />} />
              <Route path="senior-pastor" element={<SeniorPastorHub />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <OfflineBanner />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
