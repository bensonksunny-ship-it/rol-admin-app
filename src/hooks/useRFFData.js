import { useCallback, useEffect, useRef, useState } from 'react'
import { functions, httpsCallable } from '../lib/firebase'
import { listenRFFPrograms, listenRFFStudents, fetchRFFFromServer } from '../services/firestore'

// Live RFF data for RFFHub / RFFProgramPage.
//
// External (VITE_RFF_SOURCE=external): read-only data from the standalone RFF
// app's own Firebase project, fetched through the `getRFFData` Cloud Function
// (functions/index.js) — nothing in the RFF project changes. It returns
// totalStudents + studentsList ({id, name, class, age, course, city, parent,
// totalFeeOffered, totalFeePaid, feePending}), expensesList and totals; the
// RFF app has no programs, so programs stays empty.
// Re-fetched every POLL_MS while the tab is visible, plus the manual Refresh.
// The function caches server-side (10 min), so polling never hits the RFF
// app's own read quota directly; 'stale' = showing the cache after a failed read.
//
// Local (default): this project's rff_programs / rff_students, live + editable.
//
// status: 'connecting' | 'synced' | 'stale' | 'offline' | 'error'
const EXTERNAL = import.meta.env.VITE_RFF_SOURCE === 'external'
const POLL_MS = 5 * 60_000

function friendlyError(err) {
  const code = String(err?.code || '')
  if (code.includes('permission-denied')) {
    return EXTERNAL ? 'Your ROL Admin account does not have RFF access.' : 'You do not have permission to read RFF data.'
  }
  if (code.includes('unauthenticated')) return 'Sign in again to load RFF data.'
  if (code.includes('failed-precondition')) return err.message || 'The RFF app connection is not set up yet.'
  if (code.includes('unavailable') || code.includes('deadline')) return 'Could not reach the RFF app. Check your connection and try again.'
  return err?.message || 'Could not load RFF data.'
}

export default function useRFFData(enabled = true) {
  const [programs, setPrograms] = useState([])
  const [students, setStudents] = useState([])
  const [totalStudents, setTotalStudents] = useState(0)
  const [expenses, setExpenses] = useState([])
  const [financeTotals, setFinanceTotals] = useState(null)
  const [programsLoaded, setProgramsLoaded] = useState(false)
  const [studentsLoaded, setStudentsLoaded] = useState(false)
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)

  const applyExternal = useCallback((data) => {
    const list = data.studentsList || []
    setPrograms([])
    setStudents(list)
    setTotalStudents(Number.isFinite(data.totalStudents) ? data.totalStudents : list.length)
    setExpenses(data.expensesList || [])
    setFinanceTotals(data.totals || null)
    setProgramsLoaded(true)
    setStudentsLoaded(true)
    setLastSyncedAt(data.fetchedAt ? new Date(data.fetchedAt) : new Date())
    setError(data.stale ? (data.warning || 'Could not reach the RFF app.') : null)
    setStatus(data.stale ? 'stale' : 'synced')
  }, [])

  const failWith = useCallback((err) => {
    console.error('RFF data load failed:', err)
    setError(friendlyError(err))
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error')
    setProgramsLoaded(true)
    setStudentsLoaded(true)
  }, [])

  const lastFetchAt = useRef(0)
  const fetchExternal = useCallback(async (force = false) => {
    if (inFlight.current) return
    inFlight.current = true
    lastFetchAt.current = Date.now()
    try {
      const { data } = await httpsCallable(functions, 'getRFFData')({ force })
      if (data?.success === false) {
        const err = new Error(data.error || 'Could not load RFF data.')
        err.code = 'rff/connection'
        throw err
      }
      applyExternal(data)
    } catch (err) {
      failWith(err)
    } finally {
      inFlight.current = false
    }
  }, [applyExternal, failWith])

  // External: initial load + polling while the tab is visible.
  useEffect(() => {
    if (!enabled || !EXTERNAL) return undefined
    fetchExternal()
    // Returning to the tab only re-fetches once the last fetch is a poll old.
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchAt.current >= POLL_MS) fetchExternal()
    }
    const t = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [enabled, fetchExternal])

  // Local: live Firestore listeners on this project's own RFF collections.
  useEffect(() => {
    if (!enabled || EXTERNAL) return undefined
    const fromServer = { programs: false, students: false }
    const onMeta = (key, meta) => {
      fromServer[key] = !meta.fromCache
      if (fromServer.programs && fromServer.students) {
        setStatus('synced')
        if (!meta.hasPendingWrites) setLastSyncedAt(new Date())
      }
    }
    const unsubs = [
      listenRFFPrograms((rows, meta) => { setPrograms(rows); setProgramsLoaded(true); onMeta('programs', meta) }, failWith),
      listenRFFStudents((rows, meta) => { setStudents(rows); setStudentsLoaded(true); onMeta('students', meta) }, failWith),
    ]
    return () => unsubs.forEach((u) => u())
  }, [enabled, failWith])

  const refresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      if (EXTERNAL) {
        await fetchExternal(true)
      } else {
        const fresh = await fetchRFFFromServer()
        setPrograms(fresh.programs)
        setStudents(fresh.students)
        setLastSyncedAt(new Date())
        setError(null)
        setStatus('synced')
      }
    } catch (err) {
      failWith(err)
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, fetchExternal, failWith])

  return {
    programs,
    students,
    // External: the server's count. Local: the roster length.
    totalStudents: EXTERNAL ? totalStudents : students.length,
    // External only: itemwise expenses and { totalFeeOffered, totalCollected,
    // totalPending, totalExpenses } computed by getRFFData.
    expenses,
    financeTotals,
    loading: !(programsLoaded && studentsLoaded),
    status,
    error,
    lastSyncedAt,
    refreshing,
    refresh,
    source: EXTERNAL ? 'external' : 'local',
    readOnly: EXTERNAL,
  }
}
