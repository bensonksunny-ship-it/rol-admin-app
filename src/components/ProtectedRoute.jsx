import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, permission }) {
  const { user, userProfile, loading, hasPermission } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-600">
          <p>Your account is not yet set up.</p>
          <p className="text-sm mt-2">Contact an administrator to assign your role.</p>
        </div>
      </div>
    )
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />
  }

  return children
}
