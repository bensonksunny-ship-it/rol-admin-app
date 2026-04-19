import { useMemo, useState } from 'react'
import ShepherdView from '../ShepherdView'
import MidweekMinistry from '../MidweekMinistry'
import { useAuth } from '../../context/AuthContext'
import { isCellDirectorInPositions, isCellLeaderInPositions } from '../../utils/cellReportPermissions'
import { ROLES } from '../../constants/roles'

/**
 * Leader Entry tab on the Cell page.
 * Internal toggle: Mid-week | Shepherd Care.
 *
 * Default sub-view (per the agreed UX defaults):
 *  - Cell Leader → Mid-week (primary weekly workflow)
 *  - Director / Founder → Shepherd (care oversight view)
 */
export default function CellLeaderEntryTab() {
  const { userProfile } = useAuth()

  const defaultView = useMemo(() => {
    const isFounder = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER
    const isDirector = isCellDirectorInPositions(userProfile)
    const isLeader = isCellLeaderInPositions(userProfile)
    if (isLeader && !isDirector && !isFounder) return 'midweek'
    return 'midweek'
  }, [userProfile])

  const [view, setView] = useState(defaultView)

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
