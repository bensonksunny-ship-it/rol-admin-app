import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, X } from 'lucide-react'
import { DEPARTMENT_LIST, getDepartmentPath, getDepartmentIcon } from '../../constants/departments'

function displayDeptName(deptName) {
  if (deptName === 'Event M') return 'Event Management'
  return deptName
}

// The actual iOS-Home-Screen-style icon grid — visually unchanged from before, just
// moved inside the toggleable overlay below instead of sitting inline in the page.
function DepartmentGrid({ onNavigate }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-6 gap-y-8">
      {DEPARTMENT_LIST.map((dept) => {
        const Icon = getDepartmentIcon(dept.name)
        return (
          <button
            key={dept.slug}
            type="button"
            onClick={() => onNavigate(getDepartmentPath(dept.name))}
            className="group flex flex-col items-center gap-1.5"
          >
            <span
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-90"
              style={{
                background: 'linear-gradient(135deg, #6357c9 0%, #8b7ff0 100%)',
                boxShadow: '0 4px 14px rgba(99,87,201,0.35)',
              }}
            >
              <Icon size={26} className="text-white" strokeWidth={1.75} />
            </span>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 text-center leading-tight">
              {displayDeptName(dept.name)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// The grid's overlay chrome — same glassmorphism sheet + fade/scale-in transition and
// Escape/backdrop-click-to-close behavior as DepartmentFolderModal (the mobile dock's
// equivalent menu), kept as its own lightweight copy here since this grid is flat
// (top-level departments only) rather than DepartmentFolderModal's per-department
// sectioned subpage layout.
function DepartmentOverlay({ onClose, onNavigate }) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const requestClose = () => {
    setClosing(true)
    setTimeout(onClose, 180)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = visible && !closing

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/10 backdrop-blur-sm transition-opacity duration-200 ease-out ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Departments"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-lg p-6 rounded-3xl border border-white/40 dark:border-white/15
          bg-white/25 dark:bg-white/10 backdrop-blur-2xl shadow-2xl
          transition-all duration-200 ease-out ${
          shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <button
          type="button"
          onClick={requestClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-900/5 dark:hover:bg-white/10 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1 pt-1 scrollbar-hide">
          <DepartmentGrid onNavigate={(to) => { onNavigate(to); requestClose() }} />
        </div>
      </div>
    </div>,
    document.body
  )
}

// The Founder's "Eden Garden" dashboard department launcher. Unlike DepartmentDock
// (which only lists the signed-in user's own departments), Founder has access to
// everything, so this always lists the full DEPARTMENT_LIST.
//
// The icon grid is hidden by default — Eden Garden's body stays empty except for a
// single floating center button (DesktopDepartmentNav and DepartmentDock are both
// suppressed on this route, so this is the sole department entry point here).
// Pressing the button opens an overlay with the full grid; pressing it again,
// clicking outside the sheet, its own close button, or Escape closes it.
//
// Rendered via its own top-level portal (not inline in MyWorkspace's flex column) so
// the fixed button sits at a true viewport position, unaffected by the page's
// max-w-5xl content column or its space-y-* sibling margins.
export default function EdenGardenGrid() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Departments"
        aria-label={open ? 'Close departments menu' : 'Open departments menu'}
        aria-expanded={open}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-14 h-14 rounded-full transition-transform duration-150 hover:-translate-y-0.5 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #6357c9 0%, #8b7ff0 100%)',
          boxShadow: open
            ? '0 4px 18px rgba(99,87,201,0.55), 0 0 0 2px rgba(99,87,201,0.5)'
            : '0 8px 24px rgba(99,87,201,0.4)',
        }}
      >
        <LayoutGrid size={24} className="text-white" strokeWidth={1.75} />
      </button>

      {open && <DepartmentOverlay onClose={() => setOpen(false)} onNavigate={navigate} />}
    </>,
    document.body
  )
}
