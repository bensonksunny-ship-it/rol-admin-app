import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// Rotating palette for the grid tiles — subpages aren't separate "apps" with their
// own brand color, so each tile's color comes from its position rather than a fixed
// per-subpage mapping. Keeps the grid visually varied like a real iOS folder.
const TILE_COLORS = [
  'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
  'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
]

// Centered "iOS App Folder" modal — replaces a small anchored popover/bottom-sheet
// with a true centered, frosted-glass folder matching Apple's Home Screen folder UI.
// Shared by the desktop DepartmentDock and mobile BottomTabBar so there's one folder
// look across the app regardless of screen size. Light-styled only (no dark-mode
// variant): the dock this replaces never threaded the app's day/night toggle either,
// and Tailwind's `dark:` variant isn't wired to that toggle (it's class-based via a
// manual .dark selector, not the default media-query strategy) — adding a real dark
// mode here would need separate plumbing beyond this visual redesign's scope.
export default function DepartmentFolderModal({ label, subpages, onClose, onNavigate }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="animate-folder-zoom-in rounded-3xl w-full max-w-sm p-6"
        style={{
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <h2 className="text-center text-lg font-bold text-slate-900 mb-5 truncate">{label}</h2>

        <div className="grid grid-cols-3 gap-x-3 gap-y-5">
          {subpages.map((sp, i) => {
            const Icon = sp.Icon
            return (
              <button
                key={sp.key}
                type="button"
                onClick={() => onNavigate(sp.to)}
                className="group flex flex-col items-center gap-1.5"
              >
                <span
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-95"
                  style={{
                    background: TILE_COLORS[i % TILE_COLORS.length],
                    boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                  }}
                >
                  {Icon && <Icon size={22} className="text-white" strokeWidth={1.75} />}
                </span>
                <span className="text-[11px] font-medium text-slate-700 text-center leading-tight line-clamp-2">
                  {sp.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
