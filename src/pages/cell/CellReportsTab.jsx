import { useState } from 'react'
import CellReport from '../CellReport'
import CellHistory from '../CellHistory'

/**
 * Reports tab on the Cell page.
 * Internal toggle: Current (live report + submission) | History (past reports).
 * Defaults to Current.
 *
 * Both sub-views are rendered `embedded` so they don't draw their own tab bar.
 */
export default function CellReportsTab() {
  const [view, setView] = useState('current') // 'current' | 'history'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-2">
          Reports
        </span>
        <button
          type="button"
          onClick={() => setView('current')}
          className={`px-3 py-1.5 text-sm font-medium rounded border transition ${
            view === 'current'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-700'
          }`}
        >
          Current
        </button>
        <button
          type="button"
          onClick={() => setView('history')}
          className={`px-3 py-1.5 text-sm font-medium rounded border transition ${
            view === 'history'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-700'
          }`}
        >
          History
        </button>
      </div>

      {view === 'current' ? <CellReport embedded /> : <CellHistory embedded />}
    </div>
  )
}
