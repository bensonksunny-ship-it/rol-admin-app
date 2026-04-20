import { useState } from 'react'
import CellReport from '../CellReport'
import CellHistory from '../CellHistory'

/**
 * Reports tab on the Cell page.
 * Defaults to latest report. "View history" link reveals past reports.
 */
export default function CellReportsTab() {
  const [view, setView] = useState('current') // 'current' | 'history'

  return (
    <div className="space-y-4">
      {view === 'current' ? (
        <>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest Report</span>
            <button
              type="button"
              onClick={() => setView('history')}
              className="text-sm text-indigo-600 hover:underline font-medium"
            >
              View history →
            </button>
          </div>
          <CellReport embedded />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report History</span>
            <button
              type="button"
              onClick={() => setView('current')}
              className="text-sm text-indigo-600 hover:underline font-medium"
            >
              ← Back to latest
            </button>
          </div>
          <CellHistory embedded />
        </>
      )}
    </div>
  )
}
