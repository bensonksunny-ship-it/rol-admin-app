import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/Layout/MainLayout'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Departments from './pages/Departments'
import DepartmentDetail from './pages/DepartmentDetail'
import Tasks from './pages/Tasks'
import SundayMinistry from './pages/SundayMinistry'
import SundayPlanning from './pages/SundayPlanning'
import Finance from './pages/Finance'
import Reports from './pages/Reports'
import DepartmentWorship from './pages/DepartmentWorship'
import SundayReport from './pages/SundayReport'
import SundayProgram from './pages/SundayProgram'
import CellReport from './pages/CellReport'
import DepartmentHub from './pages/DepartmentHub'
import DepartmentPastorView from './pages/DepartmentPastorView'
import DepartmentPastorUpdates from './pages/DepartmentPastorUpdates'
import AdminUserManagement from './pages/AdminUserManagement'
import CellUserManagement from './pages/CellUserManagement'
import SundayMinistryPastor from './pages/SundayMinistryPastor'
import SeniorPastorHub from './pages/SeniorPastorHub'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="departments" element={<Departments />} />
              <Route path="departments/:slug" element={<DepartmentDetail />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="sunday-ministry" element={<SundayMinistry />} />
              <Route path="sunday-planning" element={<SundayPlanning />} />
              <Route path="finance" element={<Finance />} />
              <Route path="reports" element={<Reports />} />
              <Route path="admin/users" element={<AdminUserManagement />} />
              <Route path="cell/users" element={<CellUserManagement />} />
              <Route path="department/worship" element={<DepartmentWorship />} />
              <Route path="department/sunday-ministry/sunday-report" element={<SundayReport />} />
              <Route path="department/sunday-ministry/sunday-program" element={<SundayProgram />} />
              <Route path="department/cell/cell-report" element={<CellReport />} />
              <Route path="department/junior-c" element={<Navigate to="/department/river-kids" replace />} />
              <Route path="department/build-c" element={<Navigate to="/department/building-care" replace />} />
              <Route path="department/:slug" element={<DepartmentHub />} />
              <Route path="department/:slug/pastor" element={<DepartmentPastorView />} />
              <Route path="department/:slug/pastor/updates" element={<DepartmentPastorUpdates />} />
              <Route path="sunday-ministry-pastor" element={<SundayMinistryPastor />} />
              <Route path="senior-pastor" element={<SeniorPastorHub />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
