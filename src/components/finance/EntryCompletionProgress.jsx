import { useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import useFinanceMonthLocks from '../../hooks/useFinanceMonthLocks'
import { FINANCE_LOCK_TYPES, unlockDocId } from '../../utils/financeEntryLock'

// Collapsed by default (key renamed so earlier "open" preferences don't carry over).
const OPEN_KEY = 'rol.accounts.entryProgress.expanded'
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } }
const writeOpen = (v) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch { /* storage blocked */ } }

const pct = (done, due) => (due ? Math.round((done / due) * 100) : 0)

// Bar colour by score: green when on track, amber midway, rose when behind.
const barTone = (p) => (p >= 90 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-rose-500')
const textTone = (p) => (p >= 90 ? 'text-emerald-700' : p >= 60 ? 'text-amber-700' : 'text-rose-700')

function Bar({ value }) {
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${barTone(value)}`} style={{ width: `${value}%` }} />
    </div>
  )
}

/**
 * Accounts Summary: how many months of the year have been marked "Entry completed"
 * on the Income and Expense pages (finance_month_unlocks.completed — expense docs
 * are 'yyyy-MM', income 'income_yyyy-MM'), as counts and percentages.
 *
 * A month counts as due once it has ended; the month in progress counts only if
 * it was already marked completed early, so finishing ahead never lowers the score
 * and an unfinished current month doesn't count against it. Months still ahead are
 * shown as upcoming.
 *
 * selectedKey / onSelectMonth('yyyy-MM'): the month the Summary figures below are
 * showing; tapping a month in the list switches them to it.
 */
export default function EntryCompletionProgress({ selectedKey = null, onSelectMonth = null } = {}) {
  const { unlocks, now } = useFinanceMonthLocks(true)
  const [open, setOpenState] = useState(readOpen)
  const setOpen = (v) => { setOpenState(v); writeOpen(v) }
  const thisYear = now.getFullYear()
  const [year, setYear] = useState(thisYear)
  const curKey = format(now, 'yyyy-MM')

  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const done = Object.fromEntries(FINANCE_LOCK_TYPES.map((t) => [t.key, unlocks[unlockDocId(t.key, key)]?.completed === true]))
    const state = key < curKey ? 'past' : key === curKey ? 'current' : 'future'
    return { key, label: format(new Date(year, i, 1), 'MMM'), done, state }
  })

  // Per type: completed / due, where due = ended months + any month already completed.
  const stats = FINANCE_LOCK_TYPES.map((t) => {
    const due = months.filter((m) => m.state === 'past' || m.done[t.key])
    const done = due.filter((m) => m.done[t.key]).length
    return { ...t, done, due: due.length, pending: due.length - done, pct: pct(done, due.length) }
  })
  const allDone = stats.reduce((s, t) => s + t.done, 0)
  const allDue = stats.reduce((s, t) => s + t.due, 0)
  const overall = pct(allDone, allDue)
  const pendingTotal = allDue - allDone

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* The Months Closed line is the whole collapsed view; a click opens the
          month-by-month details below it. */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center justify-between gap-2 mb-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${overall >= 90 ? 'bg-emerald-100' : overall >= 60 ? 'bg-amber-100' : 'bg-rose-100'} ${textTone(overall)}`}>
            Months Closed: {overall}%
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-slate-500 truncate">{allDone} completed · {pendingTotal} not completed</span>
            <ChevronDown size={18} aria-hidden="true" className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </span>
        </span>
        <Bar value={overall} />
      </button>

      {/* grid-rows 0fr → 1fr: smooth height animation without measuring. */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100">
            <div className="flex items-center justify-end gap-1 pt-2">
              <button type="button" onClick={() => setYear(year - 1)} aria-label="Previous year"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                <ChevronLeft size={16} />
              </button>
              <span className="w-14 text-center text-sm font-semibold text-slate-700">{year}</span>
              <button type="button" onClick={() => setYear(year + 1)} disabled={year >= thisYear} aria-label="Next year"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Month-by-month list, running down each column (Jan–Apr, May–Aug, …)
                instead of one wide row. A future month can't be picked. */}
            <ul className="columns-1 sm:columns-2 lg:columns-3 gap-2">
              {months.map((m) => {
                const selected = m.key === selectedKey
                const pickable = !!onSelectMonth && m.state !== 'future'
                return (
                  <li key={m.key} className="break-inside-avoid mb-1.5">
                    <button
                      type="button"
                      disabled={!pickable}
                      onClick={() => onSelectMonth(m.key)}
                      aria-pressed={selected}
                      className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                        selected
                          ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                          : m.state === 'current'
                            ? 'border-blue-200 bg-blue-50/40 hover:bg-blue-50'
                            : 'border-slate-200 hover:bg-slate-50'
                      } disabled:cursor-default disabled:hover:bg-transparent`}
                    >
                      <span className={`w-9 text-xs font-bold ${m.state === 'future' ? 'text-slate-300' : selected ? 'text-indigo-700' : 'text-slate-700'}`}>{m.label}</span>
                      <span className="flex-1 flex flex-wrap justify-end gap-1">
                        {FINANCE_LOCK_TYPES.map((t) => {
                          const done = m.done[t.key]
                          const status = done ? 'Done' : m.state === 'past' ? 'Pending' : m.state === 'current' ? 'Open' : '—'
                          const cls = done
                            ? 'bg-emerald-100 text-emerald-700'
                            : m.state === 'past'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-400'
                          return (
                            <span key={t.key} title={`${t.label} · ${status}`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${cls}`}>
                              {t.label[0]} · {status}
                            </span>
                          )
                        })}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />Done = entry completed</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />Pending = month ended, not completed</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300" />Open / upcoming</span>
              <span>E = Expense · I = Income{onSelectMonth ? ' · tap a month to view its figures below' : ''}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
