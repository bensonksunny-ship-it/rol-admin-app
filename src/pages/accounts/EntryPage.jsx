import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry, canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH } from '../../utils/accountsEntryAccess'
import TallyPage from './TallyPage'
import IncomePage from './IncomePage'
import ExpensePage from './ExpensePage'
import WeeklyEntryPage from './WeeklyEntryPage'

const TABS = [
  { path: 'tally', label: 'Tally' },
  { path: 'income', label: 'Income' },
  { path: 'expense', label: 'Expense' },
  { path: 'weekly', label: 'Weekly Entry' },
]

const RECENT_KEY = 'rol:accounts-entry:recent'
const MAX_RECENT = 5

export default function EntryPage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [recent, setRecent] = useState([])

  if (!canAccessAccountsEntry(userProfile, hasPermission, isFounder)) {
    return <Navigate to="/" replace />
  }

  const weeklyOnly = canAccessWeeklyEntryOnly(userProfile)

  const visibleTabs = weeklyOnly ? TABS.filter(t => t.path === 'weekly') : TABS

  const activePath = useMemo(() => {
    const hit = TABS.find((t) => location.pathname.endsWith(`/${t.path}`))
    return hit?.path || (weeklyOnly ? 'weekly' : 'tally')
  }, [location.pathname, weeklyOnly])

  const activeIndex = Math.max(0, visibleTabs.findIndex((t) => t.path === activePath))
  const activeLabel = visibleTabs[activeIndex]?.label || 'Weekly Entry'

  const fabLabelForActiveTab = useMemo(() => {
    if (activePath === 'tally') return 'New Tally'
    if (activePath === 'income') return 'New Income'
    if (activePath === 'expense') return 'New Expense'
    if (activePath === 'weekly') return 'New Weekly Entry'
    return `New ${activeLabel}`
  }, [activePath, activeLabel])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      setRecent(Array.isArray(parsed) ? parsed : [])
    } catch {
      setRecent([])
    }
  }, [])

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Accounts · Entry</h1>
        <p className="text-slate-500 mt-1">Fast switch between entry modes, with local memory of recent actions.</p>
      </div>

      <div className="bg-white/85 backdrop-blur rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="relative rounded-full bg-slate-100 p-1 w-full max-w-xl">
          <div
            className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm border border-slate-200 transition-all duration-300"
            style={{
              left: `calc(${(activeIndex * 100) / visibleTabs.length}% + 4px)`,
              width: `calc(${100 / visibleTabs.length}% - 8px)`,
            }}
          />
          <div className={`relative grid grid-cols-${visibleTabs.length}`}>
            {visibleTabs.map((tab) => (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(`${ACCOUNTS_ENTRY_BASE_PATH}/${tab.path}`)}
                className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-full transition ${
                  activePath === tab.path ? 'text-slate-900' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800">Recently Added</h3>
            <button
              type="button"
              onClick={() => {
                setRecent([])
                try {
                  window.localStorage.removeItem(RECENT_KEY)
                } catch {}
              }}
              className="text-xs text-slate-600 hover:text-slate-900 hover:underline"
            >
              Clear
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">No recently added items yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {recent.slice(0, MAX_RECENT).map((r, i) => (
                <li key={`${r.path}-${i}`} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700">{r.label}</span>
                  <span className="text-slate-500 text-xs">
                    {new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Routes>
        <Route index element={<Navigate to={weeklyOnly ? 'weekly' : 'tally'} replace />} />
        <Route path="tally" element={weeklyOnly ? <Navigate to="../weekly" replace /> : <TallyPage />} />
        <Route path="income" element={weeklyOnly ? <Navigate to="../weekly" replace /> : <IncomePage />} />
        <Route path="expense" element={weeklyOnly ? <Navigate to="../weekly" replace /> : <ExpensePage />} />
        <Route path="weekly" element={<WeeklyEntryPage />} />
        <Route path="*" element={<Navigate to={weeklyOnly ? 'weekly' : 'tally'} replace />} />
      </Routes>

      <div className="md:hidden fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={() => {
            const entry = { path: activePath, label: fabLabelForActiveTab, at: new Date().toISOString() }
            const next = [entry, ...recent].slice(0, MAX_RECENT)
            setRecent(next)
            try {
              window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
            } catch {}
          }}
          className="h-14 min-w-14 px-4 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center gap-2"
          aria-label={`New ${activeLabel}`}
        >
          <span className="text-2xl leading-none">+</span>
          <span className="text-sm font-medium">{activeLabel}</span>
        </button>
      </div>
    </div>
  )
}
