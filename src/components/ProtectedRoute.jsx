import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SplashScreen from './SplashScreen'

// Plain-language reason for a failed users/{uid} read (Firestore error codes).
function describeProfileError(code) {
  if (code === 'unavailable') return 'Could not reach the server — check this device\'s internet connection.'
  if (code === 'permission-denied') return 'The server refused to load this profile.'
  return `Profile could not be loaded (${code}).`
}

export default function ProtectedRoute({ children, permission }) {
  const { user, userProfile, loading, profileError, hasPermission, signOut } = useAuth()
  const location = useLocation()
  // Keeps the splash mounted for its brief 100%-hold after `loading` clears —
  // see SplashScreen's onFinished — instead of vanishing the instant loading
  // flips false, which would skip past the completed ring entirely.
  const [splashDone, setSplashDone] = useState(false)

  if (loading || !splashDone) {
    return <SplashScreen ready={!loading} onFinished={() => setSplashDone(true)} />
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!userProfile) {
    // Shows exactly which login / Firebase project this device is using, since the
    // usual cause on a "new device" is a different account or .env than the old one.
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm text-center text-slate-600">
          {profileError ? (
            <p className="font-medium text-slate-800">{describeProfileError(profileError)}</p>
          ) : (
            <>
              <p className="font-medium text-slate-800">Your account is not yet set up.</p>
              <p className="text-sm mt-2">Contact an administrator to assign your role.</p>
            </>
          )}
          <dl className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs space-y-1">
            <div className="flex gap-2"><dt className="text-slate-400 w-16 shrink-0">Signed in</dt><dd className="font-medium text-slate-700 break-all">{user.email || '—'}</dd></div>
            <div className="flex gap-2"><dt className="text-slate-400 w-16 shrink-0">User ID</dt><dd className="font-mono text-slate-700 break-all">{user.uid}</dd></div>
            <div className="flex gap-2"><dt className="text-slate-400 w-16 shrink-0">Project</dt><dd className="font-mono text-slate-700 break-all">{import.meta.env.VITE_FIREBASE_PROJECT_ID || '—'}</dd></div>
          </dl>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
              Retry
            </button>
            <button type="button" onClick={() => signOut()}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />
  }

  return children
}
