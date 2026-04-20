import { useState } from 'react'
import ShepherdView from '../ShepherdView'
import MidweekMinistry from '../MidweekMinistry'

/**
 * Leader Entry tab on the Cell page.
 * Internal toggle: Shepherd Care | Mid-week. Defaults to Shepherd Care.
 */
export default function CellLeaderEntryTab() {
  const [view, setView] = useState('shepherd')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-2">
          Leader Entry
        </span>
        <button
          type="button"
          onClick={() => setView('midweek')}
          className={`px-3 py-1.5 text-sm font-medium rounded border transition ${
            view === 'midweek'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-700'
          }`}
        >
          Mid-week
        </button>
        <button
          type="button"
          onClick={() => setView('shepherd')}
          className={`px-3 py-1.5 text-sm font-medium rounded border transition ${
            view === 'shepherd'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-700'
          }`}
        >
          Shepherd Care
        </button>
      </div>

      {view === 'midweek' ? <MidweekMinistry embedded /> : <ShepherdView embedded />}
    </div>
  )
}
