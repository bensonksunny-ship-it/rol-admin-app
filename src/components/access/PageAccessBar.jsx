import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { KeyRound, Clock, X, ShieldCheck, History, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  subscribeAllTempAccessGrants, listTempAccessGrantees, grantTempAccess, revokeTempAccess, getTempAccessLog,
} from '../../services/firestore'
import {
  TEMP_ACCESS_DURATIONS, DEFAULT_TEMP_ACCESS_HOURS, TEMP_ACCESS_LEVELS,
  activeGrantsFromDoc, departmentForPath, isGrantableDepartment, formatTimeLeft, formatExpiry,
} from '../../utils/tempAccess'
import { displayDeptName, getDepartmentPath } from '../../constants/departments'

// Re-render every 30s so countdowns stay honest.
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

const levelLabel = (lvl) => TEMP_ACCESS_LEVELS.find((l) => l.value === lvl)?.label || 'Full'

/**
 * Per-page time-bounded access for the SP Office secretary (utils/tempAccess.js).
 * Rendered once in MainLayout above every page:
 *  - Founder, on a department page: who holds access to this page and until when,
 *    with Give / Extend / Revoke, plus every live grant and the recent history.
 *  - The secretary, on a page lent to him: a banner with the time left; on his home
 *    pages: the list of pages currently lent to him.
 */
export default function PageAccessBar() {
  const { isFounder } = useAuth()
  return isFounder ? <FounderAccessControl /> : <GranteeAccessBanner />
}

// ─── Founder ─────────────────────────────────────────────────────────────────

function FounderAccessControl() {
  const { user, userProfile } = useAuth()
  const { pathname } = useLocation()
  const department = departmentForPath(pathname)
  const now = useNow()
  const [grantDocs, setGrantDocs] = useState([])
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => subscribeAllTempAccessGrants(setGrantDocs, (e) => setLoadError(e?.message || 'Could not load access grants')), [])

  const allActive = useMemo(() => grantDocs.flatMap((d) =>
    activeGrantsFromDoc(d, now).map((g) => ({ ...g, grantee: { uid: d.id, name: d.name || 'SP Office' } }))
  ), [grantDocs, now])

  const grantable = isGrantableDepartment(department)
  const here = allActive.filter((g) => g.department === department)
  const actor = { uid: user?.uid, name: userProfile?.name || 'Founder' }

  if (!grantable && !open) return null

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {here.map((g) => (
          <span key={g.grantee.uid} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
            <KeyRound size={13} className="shrink-0" />
            <span className="truncate max-w-[10rem]">{g.grantee.name}</span>
            <span className="font-normal text-amber-700">· {levelLabel(g.level)} · {formatTimeLeft(g.expiresAtMs, now)}</span>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
          aria-expanded={open}
        >
          <ShieldCheck size={14} className="shrink-0" />
          {here.length ? 'Manage SP Office access' : 'Give SP Office access'}
        </button>
      </div>

      {open && (
        <FounderAccessPanel
          department={grantable ? department : null}
          allActive={allActive}
          now={now}
          actor={actor}
          loadError={loadError}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function FounderAccessPanel({ department, allActive, now, actor, loadError, onClose }) {
  const [grantees, setGrantees] = useState(null)
  const [granteeUid, setGranteeUid] = useState('')
  const [hours, setHours] = useState(DEFAULT_TEMP_ACCESS_HOURS)
  const [level, setLevel] = useState('DIRECTOR')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(loadError ? { tone: 'error', text: loadError } : null)
  const [log, setLog] = useState(null)
  const panelRef = useRef(null)

  useEffect(() => {
    let alive = true
    listTempAccessGrantees()
      .then((list) => { if (!alive) return; setGrantees(list); if (list.length) setGranteeUid((u) => u || list[0].uid) })
      .catch((e) => { if (alive) { setGrantees([]); setMessage({ tone: 'error', text: e?.message || 'Could not load SP Office accounts' }) } })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const grantee = grantees?.find((g) => g.uid === granteeUid) || null
  const existing = department && grantee ? allActive.find((g) => g.department === department && g.grantee.uid === grantee.uid) : null

  const doGrant = async () => {
    if (!grantee || !department) return
    setBusy('grant'); setMessage(null)
    try {
      const until = await grantTempAccess({ grantee, department, hours, level, grantedBy: actor })
      setMessage({ tone: 'ok', text: `${grantee.name} can use ${displayDeptName(department)} until ${formatExpiry(until)}.` })
    } catch (e) {
      setMessage({ tone: 'error', text: e?.code === 'permission-denied' ? 'Not allowed — deploy the latest firestore.rules and try again.' : (e?.message || 'Could not give access') })
    } finally { setBusy('') }
  }

  const doRevoke = async (g) => {
    setBusy(`revoke:${g.grantee.uid}:${g.department}`); setMessage(null)
    try {
      await revokeTempAccess({ grantee: g.grantee, department: g.department, revokedBy: actor })
      setMessage({ tone: 'ok', text: `${g.grantee.name}'s access to ${displayDeptName(g.department)} ended.` })
    } catch (e) {
      setMessage({ tone: 'error', text: e?.message || 'Could not revoke access' })
    } finally { setBusy('') }
  }

  const loadLog = async () => {
    setLog('loading')
    try { setLog(await getTempAccessLog(30)) } catch (e) { setLog([]); setMessage({ tone: 'error', text: e?.message || 'Could not load history' }) }
  }

  return (
    <div ref={panelRef} className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">SP Office access{department ? ` · ${displayDeptName(department)}` : ''}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Lend this page to your secretary for a set time. It switches off by itself when the time runs out.</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {department && (
        <div className="mt-4 space-y-3">
          {grantees === null ? (
            <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading SP Office accounts…</p>
          ) : grantees.length === 0 ? (
            <p className="text-xs text-rose-600">No active account holds an SP Office position. Add one in User Management first.</p>
          ) : (
            <>
              {grantees.length > 1 && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Who</span>
                  <select value={granteeUid} onChange={(e) => setGranteeUid(e.target.value)}
                    className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                    {grantees.map((g) => <option key={g.uid} value={g.uid}>{g.name}</option>)}
                  </select>
                </label>
              )}

              <div>
                <span className="text-xs font-semibold text-slate-600">For how long</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {TEMP_ACCESS_DURATIONS.map((d) => (
                    <button key={d.hours} type="button" onClick={() => setHours(d.hours)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${hours === d.hours ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-300 hover:ring-indigo-400'}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-600">Access level</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {TEMP_ACCESS_LEVELS.map((l) => (
                    <button key={l.value} type="button" onClick={() => setLevel(l.value)} title={l.hint}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${level === l.value ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-300 hover:ring-indigo-400'}`}>
                      {l.label} <span className={level === l.value ? 'text-indigo-100' : 'text-slate-400'}>· {l.hint.replace('Works the page like ', '')}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={doGrant} disabled={!!busy || !grantee}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {busy === 'grant' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  {existing ? 'Update access' : 'Give access'}
                </button>
                <span className="text-xs text-slate-500">
                  Ends {formatExpiry(now + hours * 3600 * 1000)}
                  {existing && <> · now ends {formatExpiry(existing.expiresAtMs)}</>}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {message && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${message.tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Active now</h4>
        {allActive.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">No page is lent out right now.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {allActive.map((g) => {
              const key = `${g.grantee.uid}:${g.department}`
              return (
                <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-800">{displayDeptName(g.department)}</span>
                    <span className="text-slate-500"> · {g.grantee.name} · {levelLabel(g.level)}</span>
                    <span className="block text-xs text-slate-500"><Clock size={11} className="mr-1 inline" />until {formatExpiry(g.expiresAtMs)} ({formatTimeLeft(g.expiresAtMs, now)})</span>
                  </span>
                  <button type="button" onClick={() => doRevoke(g)} disabled={!!busy}
                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                    {busy === `revoke:${key}` ? 'Ending…' : 'End now'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-3">
        {log === null ? (
          <button type="button" onClick={loadLog} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
            <History size={13} /> Show history
          </button>
        ) : log === 'loading' ? (
          <p className="text-xs text-slate-400">Loading history…</p>
        ) : (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">History</h4>
            {log.length === 0 ? <p className="mt-1 text-xs text-slate-400">Nothing yet.</p> : (
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600">
                {log.map((e) => (
                  <li key={e.id}>
                    <span className="text-slate-400">{e.at?.toMillis ? formatExpiry(e.at.toMillis()) : ''}</span>{' '}
                    {e.action === 'revoke'
                      ? <>Ended <b>{e.name}</b>'s access to {displayDeptName(e.department)}</>
                      : <>Gave <b>{e.name}</b> {levelLabel(e.level)} access to {displayDeptName(e.department)} for {e.hours}h</>}
                    {e.byName ? <span className="text-slate-400"> · by {e.byName}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Secretary ───────────────────────────────────────────────────────────────

function GranteeAccessBanner() {
  const { tempAccessGrants } = useAuth()
  const { pathname } = useLocation()
  const now = useNow()
  const grants = (tempAccessGrants || []).filter((g) => g.expiresAtMs > now)
  if (!grants.length) return null

  const department = departmentForPath(pathname)
  const here = grants.find((g) => g.department === department)
  const isHome = pathname === '/' || department === 'SP Office'

  if (here) {
    const soon = here.expiresAtMs - now < 60 * 60 * 1000
    return (
      <div className={`mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3 py-2 text-xs font-medium ring-1 ring-inset ${soon ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>
        <KeyRound size={14} className="shrink-0" />
        <span>Temporary {levelLabel(here.level).toLowerCase()} access to {displayDeptName(here.department)}</span>
        <span className="font-normal">· ends {formatExpiry(here.expiresAtMs)} ({formatTimeLeft(here.expiresAtMs, now)})</span>
      </div>
    )
  }

  if (!isHome) return null
  return (
    <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-inset ring-amber-200">
      <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800"><KeyRound size={14} /> Pages lent to you</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {grants.map((g) => (
          <Link key={g.department} to={getDepartmentPath(g.department)}
            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
            {displayDeptName(g.department)} <span className="font-normal text-amber-600">· {formatTimeLeft(g.expiresAtMs, now)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
