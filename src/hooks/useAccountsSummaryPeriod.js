import { useCallback, useEffect, useState } from 'react'

const YEAR_KEY = 'accountsSummaryYear'
const MONTH_KEY = 'accountsSummaryMonth'
const CLOSED_AT_KEY = 'accountsSummaryClosedAt'
const RESET_AFTER_MS = 5 * 60 * 1000

function currentYear() {
  return new Date().getFullYear()
}

function currentMonthIndex() {
  return new Date().getMonth()
}

function defaultMonthFor(year) {
  return year === currentYear() ? currentMonthIndex() : null
}

function resolvePeriod() {
  const closedAt = Number(localStorage.getItem(CLOSED_AT_KEY))
  if (closedAt && Date.now() - closedAt > RESET_AFTER_MS) {
    localStorage.removeItem(YEAR_KEY)
    localStorage.removeItem(MONTH_KEY)
    localStorage.removeItem(CLOSED_AT_KEY)
    return { year: currentYear(), month: currentMonthIndex() }
  }
  const storedYear = Number(localStorage.getItem(YEAR_KEY))
  const year = storedYear || currentYear()
  const storedMonth = localStorage.getItem(MONTH_KEY)
  const month = storedMonth != null && storedMonth !== '' ? Number(storedMonth) : defaultMonthFor(year)
  return { year, month }
}

// Sticky "selected year + month" for the Accounts Summary tab: persists across
// reloads, but resets to the current year/month once the tab has been
// closed/hidden for more than 5 minutes (not a general activity timer — only
// close/background resets the clock).
export default function useAccountsSummaryPeriod() {
  const [period, setPeriodState] = useState(resolvePeriod)

  const setSelectedYear = useCallback((year) => {
    const month = defaultMonthFor(year)
    setPeriodState({ year, month })
    localStorage.setItem(YEAR_KEY, String(year))
    if (month == null) localStorage.removeItem(MONTH_KEY)
    else localStorage.setItem(MONTH_KEY, String(month))
    localStorage.removeItem(CLOSED_AT_KEY)
  }, [])

  const setSelectedMonth = useCallback((month) => {
    setPeriodState((prev) => ({ ...prev, month }))
    if (month == null) localStorage.removeItem(MONTH_KEY)
    else localStorage.setItem(MONTH_KEY, String(month))
    localStorage.removeItem(CLOSED_AT_KEY)
  }, [])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem(CLOSED_AT_KEY, String(Date.now()))
      } else {
        setPeriodState(resolvePeriod())
      }
    }
    function markClosedAt() {
      localStorage.setItem(CLOSED_AT_KEY, String(Date.now()))
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', markClosedAt)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', markClosedAt)
    }
  }, [])

  return {
    selectedYear: period.year,
    selectedMonth: period.month,
    setSelectedYear,
    setSelectedMonth,
  }
}
