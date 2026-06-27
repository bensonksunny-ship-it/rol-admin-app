import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { format, startOfMonth, subMonths } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry, canAccessWeeklyEntryOnly } from '../../utils/accountsEntryAccess'
import IncomePage from './IncomePage'
import ExpensePage from './ExpensePage'
import WeeklyEntryPage from './WeeklyEntryPage'
import BudgetPage from './BudgetPage'

const TABS = [
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
  { key: 'weekly', label: 'Weekly Entry' },
  { key: 'budget', label: 'Budget' },
]

function buildMonthList(count = 12) {
  const now = startOfMonth(new Date())
  return Array.from({ length: count }, (_, i) => subMonths(now, i))
}

const MONTHS = buildMonthList(12)

export default function EntryPage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const weeklyOnly = canAccessWeeklyEntryOnly(userProfile)
  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  const [searchParams] = useSearchParams()
  const visibleTabs = weeklyOnly ? TABS.filter(t => t.key === 'weekly') : TABS
  const initialTab = TABS.find(t => t.key === searchParams.get('tab'))?.key
  const [subPage, setSubPage] = useState(weeklyOnly ? 'weekly' : (initialTab || 'income'))
  const [activeMonth, setActiveMonth] = useState(MONTHS[0])

  if (!canAccess) return <Navigate to="/" replace />

  const showMonths = subPage !== 'weekly' && subPage !== 'budget'

  return (
    <div className="space-y-4 pb-12">

      {/* Month list */}
      {showMonths && (
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
            {MONTHS.map(m => {
              const key = format(m, 'yyyy-MM')
              const active = key === format(activeMonth, 'yyyy-MM')
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveMonth(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {format(m, 'MMM yyyy')}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sub-tab toggle */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSubPage(tab.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              subPage === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subPage === 'income' && <IncomePage controlledMonth={activeMonth} />}
      {subPage === 'expense' && <ExpensePage controlledMonth={activeMonth} />}
      {subPage === 'weekly' && <WeeklyEntryPage />}
      {subPage === 'budget' && <BudgetPage />}
    </div>
  )
}
