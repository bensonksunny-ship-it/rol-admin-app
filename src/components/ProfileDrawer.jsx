import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function getInitials(profile) {
  const name = profile?.displayName || profile?.email || ''
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Slide-over profile drawer, opened from the top-right avatar — the mobile top bar's
// sole entry point back to account actions now that the hamburger drawer (which used
// to carry Sign Out) is gone. Shows the photo + basic account info; the "Account
// Overview" rows below are placeholders for future customization (preferences,
// activity, etc.) — not real sections yet.
export default function ProfileDrawer({ user, userProfile, onClose }) {
  const { signOut } = useAuth()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const displayName = userProfile?.displayName || userProfile?.email || 'User'
  const roleLabel = userProfile?.globalRole === 'FOUNDER' ? 'Senior Pastor' : (userProfile?.role || '')
  const email = userProfile?.email || user?.email || ''
  const photoURL = user?.photoURL || null
  const initials = getInitials(userProfile)

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Profile">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />

      <div className="absolute inset-y-0 left-0 w-full max-w-xs bg-white shadow-2xl flex flex-col animate-drawer-in-left">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <p className="text-sm font-bold text-slate-800">Profile</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="flex flex-col items-center text-center">
            {photoURL ? (
              <img src={photoURL} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white select-none"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)' }}
              >
                {initials}
              </div>
            )}
            <p className="mt-3 text-base font-bold text-slate-900">{displayName}</p>
            {roleLabel && <p className="text-sm text-slate-500 mt-0.5">{roleLabel}</p>}
            {email && <p className="text-xs text-slate-400 mt-1">{email}</p>}
          </div>

          <div className="mt-8 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Account Overview</p>
            {['Preferences', 'Activity', 'Security'].map((label) => (
              <div key={label} className="rounded-xl border border-dashed border-slate-200 px-4 py-3">
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">Coming soon</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex-shrink-0">
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-xl text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut size={14} strokeWidth={2} />
            Sign out
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
