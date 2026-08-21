import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { format, startOfMonth, subMonths, addMonths } from 'date-fns'
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

export default function EntryPage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const weeklyOnly = canAccessWeeklyEntryOnly(userProfile)
  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  const [searchParams] = useSearchParams()
  const visibleTabs = weeklyOnly ? TABS.filter(t => t.key === 'weekly') : TABS
  const initialTab = TABS.find(t => t.key === searchParams.get('tab'))?.key
  const [subPage, setSubPage] = useState(weeklyOnly ? 'weekly' : (initialTab || 'income'))
  const yearParam = Number(searchParams.get('year'))
  const monthParamRaw = searchParams.get('month')
  const monthParam = monthParamRaw != null && monthParamRaw !== '' ? Number(monthParamRaw) : null
  const [activeMonth, setActiveMonth] = useState(() => {
    if (yearParam && monthParam != null) return startOfMonth(new Date(yearParam, monthParam, 1))
    if (yearParam) return startOfMonth(new Date(yearParam, 0, 1))
    return startOfMonth(new Date())
  })

  if (!canAccess) return <Navigate to="/" replace />

  const showMonths = subPage !== 'weekly' && subPage !== 'budget'

  return (
    <div className="space-y-4 pb-12">

      {/* Month picker */}
      {showMonths && (
        <div className="flex items-center justify-center gap-4 py-1">
          <button
            type="button"
            onClick={() => setActiveMonth(m => subMonths(m, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
            aria-label="Previous month"
          >‹</button>
          <span className="text-base font-semibold text-slate-800 w-36 text-center">
            {format(activeMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setActiveMonth(m => addMonths(m, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
            aria-label="Next month"
          >›</button>
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
