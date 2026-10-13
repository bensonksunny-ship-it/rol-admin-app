import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

// Icon-only back button for page headers. Goes back through router history so the
// user lands on whatever tab/route they came from (Applications, My Workspace,
// People Directory, …). React Router stamps `idx` on history.state; idx 0 means
// this page was opened directly (bookmark, new tab, refresh-on-first-page), so
// there is nothing in-app to go back to — fall back to `fallback` instead of
// navigating off-site.
export default function BackButton({ fallback = '/', label = 'Go back', className = '' }) {
  const navigate = useNavigate()

  const handleClick = () => {
    const idx = window.history.state?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${className}`}
    >
      <ArrowLeft size={20} strokeWidth={2.25} aria-hidden="true" />
    </button>
  )
}
