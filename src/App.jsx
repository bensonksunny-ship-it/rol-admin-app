import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/Layout/MainLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Departments from './pages/Departments'
import DepartmentDetail from './pages/DepartmentDetail'
import Tasks from './pages/Tasks'
import SundayMinistry from './pages/SundayMinistry'
import SundayPlanning from './pages/SundayPlanning'
import Finance from './pages/Finance'
import Reports from './pages/Reports'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
