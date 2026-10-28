import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Check, ChevronRight, Copy, Minus, MonitorPlay, Music2, Pause, Play, Plus, RotateCcw, Square, User, Volume2, Wifi, WifiOff, X } from 'lucide-react'
import { subscribeMediaLive, setMediaLiveCheck, updateMediaLiveProgress, resetMediaLiveOps, setMediaLiveVerify } from '../services/firestore'
import {
  MEDIA_LIVE_PHASES, checkKey, chordLine, songPresentationText, isWorshipItem, plannedStarts, fmtClock, fmtElapsed,
  rehearsalSummary,
} from '../utils/mediaLive'
import { RehearsalSummary, VerifyRow } from '../components/media/RehearsalVerification'

const OPERATOR_KEY = 'mediaLiveOperator'
const PHASE_KEY = 'mediaLivePhase'
const FONT_KEY = 'mediaLiveFont'

function readLocal(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}

// Saturday before a Sunday counts as that Sunday's rehearsal day.
function defaultPhase() {
  return new Date().getDay() === 0 ? 'live' : 'reh'
}

function nextSundayISO() {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 0 : 7 - d.getDay()))
  return format(d, 'yyyy-MM-dd')
}

function displayDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number)
  return y ? format(new Date(y, m - 1, d), 'EEEE, d MMMM yyyy') : ''
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

/** A tick-box row: Done / Not done, with who and when. */
function CheckRow({ label, sub, check, onToggle, busy, doneLabel, notDoneLabel = 'Not done' }) {
  const done = !!check
  return (
    <button type="button" onClick={onToggle} disabled={busy}
      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition border ${done ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-500'} disabled:opacity-60`}>
      <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border-2 ${done ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-500'}`}>
        {done && <Check className="w-4 h-4" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${done ? 'text-emerald-100' : 'text-slate-100'}`}>{label}</span>
        {sub && <span className="block text-[11px] text-slate-400">{sub}</span>}
      </span>
      <span className={`text-[11px] font-semibold shrink-0 text-right ${done ? 'text-emerald-300' : 'text-slate-500'}`}>
        {done ? `${doneLabel} · ${fmtClock(check.at)}${check.by ? ` · ${check.by}` : ''}` : notDoneLabel}
      </span>
    </button>
  )
}

// Elapsed / remaining for the running item. Vertical on wide screens (beside the
// run sheet); a horizontal strip on phones. Emerald → amber in the last fifth (or
// last minute) → rose once over time.
function TimerRail({ program, start, now, next, auto, vertical }) {
  const dur = (program?.duration || 0) * 60000
  const elapsed = start ? now - start : 0
  const remaining = dur - elapsed
  const pct = dur ? Math.min(100, (elapsed / dur) * 100) : 0
  const tone = !program ? 'bg-slate-700' : remaining < 0 ? 'bg-rose-500' : dur && (remaining < 60000 || remaining < dur * 0.2) ? 'bg-amber-400' : 'bg-emerald-500'
  const left = !program ? '—' : !dur ? 'No limit' : remaining < 0 ? `+${fmtElapsed(-remaining)}` : fmtElapsed(remaining)
  const leftTone = remaining < 0 && program && dur ? 'text-rose-300' : 'text-white'
  const nextLine = auto && next && dur ? `Next: ${next.name}` : ''
  if (vertical) {
    return (
      <div className="sticky top-24 flex flex-col items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-800 py-3 px-1" title={program ? program.name : 'Nothing running'}>
        <p className="text-[10px] uppercase tracking-wider text-slate-400">Left</p>
        <p className={`text-sm font-bold tabular-nums ${leftTone}`}>{left}</p>
        <div className="relative w-3 h-[52vh] rounded-full bg-slate-800 overflow-hidden my-1">
          <div className={`absolute top-0 inset-x-0 rounded-full transition-all duration-1000 ${tone}`} style={{ height: `${dur ? pct : program ? 100 : 0}%`, opacity: dur ? 1 : 0.35 }} />
        </div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400">Elapsed</p>
        <p className="text-sm font-bold tabular-nums text-slate-200">{program ? fmtElapsed(elapsed) : '—'}</p>
        {nextLine && (
          <div className="w-full px-1 text-center text-[10px] leading-tight text-slate-500" title={nextLine}>
            <p>Next</p>
            <p className="truncate text-slate-300">{next.name}</p>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold truncate">{program ? program.name : 'Nothing running'}</span>
        <span className="tabular-nums shrink-0"><span className="text-slate-400">{program ? fmtElapsed(elapsed) : ''}{program && ' · '}</span><b className={leftTone}>{left}</b>{program && dur ? <span className="text-slate-400"> left</span> : null}</span>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${tone}`} style={{ width: `${dur ? pct : program ? 100 : 0}%`, opacity: dur ? 1 : 0.35 }} />
      </div>
      {nextLine && <p className="mt-1 text-[11px] text-slate-500 truncate">{nextLine}</p>}
    </div>
  )
}

/**
 * Public Media Control Center (/media-live/:token) — opened on the media desk
 * without a login. Content is the snapshot Media publishes from Upcoming Sunday;
 * operators tick cues and record timings, and every open desk sees them live.
 */
export default function MediaLiveControl() {
  const { token } = useParams()
  const [data, setData] = useState(undefined) // undefined = loading, null = gone
  const [phase, setPhase] = useState(() => readLocal(PHASE_KEY, '') || defaultPhase())
  const [operator, setOperator] = useState(() => readLocal(OPERATOR_KEY, ''))
  const [now, setNow] = useState(() => Date.now())
  const [online, setOnline] = useState(() => navigator.onLine)
  const [selected, setSelected] = useState(null) // programme key; null = follow the running item
  const detailRef = useRef(null)
  const [showChords, setShowChords] = useState(false)
  const [font, setFont] = useState(() => Number(readLocal(FONT_KEY, '22')) || 22)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [copied, setCopied] = useState('') // key of the song (or 'all') just copied
  // One shared player for programme audio (backing tracks / sound effects), so a
  // track keeps playing while the operator looks at other items.
  const playerRef = useRef(null)
  const [nowPlaying, setNowPlaying] = useState(null) // { progKey, progName, track }
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState('')

  useEffect(() => subscribeMediaLive(token, setData, () => setData(null)), [token])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  useEffect(() => { document.title = 'Media Control Center' }, [])

  const programs = useMemo(() => data?.programs || [], [data])
  const songs = useMemo(() => data?.songs || [], [data])
  const crew = useMemo(() => data?.crew || [], [data])
  const checks = useMemo(() => data?.checks || {}, [data])
  const progress = useMemo(() => data?.progress || {}, [data])
  const verify = useMemo(() => data?.verify || {}, [data])
  const rehSummary = useMemo(() => rehearsalSummary(programs, verify), [programs, verify])
  const rehItem = (key) => rehSummary.items.find((it) => it.program.key === key) || null
  const planned = useMemo(() => plannedStarts(programs, data?.serviceStartTime), [programs, data?.serviceStartTime])
  const phaseDef = MEDIA_LIVE_PHASES.find((p) => p.id === phase) || MEDIA_LIVE_PHASES[0]

  const allKeys = useMemo(() => [
    ...programs.flatMap((p) => p.elements.map((el) => checkKey(phase, p.key, el))),
    ...songs.map((s) => checkKey(phase, s.key)),
  ], [programs, songs, phase])
  const doneCount = allKeys.filter((k) => checks[k]).length

  const serviceKey = `${phase}__service`
  const serviceStart = progress[serviceKey]?.start
  const runningIdx = programs.findIndex((p) => progress[`${phase}__${p.key}`]?.start && !progress[`${phase}__${p.key}`]?.end)

  // Auto mode (the default): once an item with a duration has run its time, it ends
  // and the next one starts. The handover moments are computed from the start time
  // and durations, not from the clock of whichever desk notices first, so every
  // open desk writes the same values and a page reopened late catches up correctly.
  // The Manual switch is stored with the timings (progress.{phase}__mode) so all
  // desks share it; a phase reset puts it back to Auto.
  const modeKey = `${phase}__mode`
  const autoMode = !progress[modeKey]?.manual
  const autoSentRef = useRef('')
  useEffect(() => {
    if (!autoMode || runningIdx < 0) return
    const changes = {}
    let i = runningIdx
    let t = progress[`${phase}__${programs[i].key}`].start
    while (i < programs.length && programs[i].duration > 0 && now >= t + programs[i].duration * 60000) {
      t += programs[i].duration * 60000
      const k = `${phase}__${programs[i].key}`
      changes[k] = { ...changes[k], end: t }
      i += 1
      if (i < programs.length) changes[`${phase}__${programs[i].key}`] = { start: t, end: null }
    }
    if (!Object.keys(changes).length) return
    const sig = JSON.stringify(changes)
    if (autoSentRef.current === sig) return
    autoSentRef.current = sig
    updateMediaLiveProgress(token, changes).catch((e) => console.warn('Auto advance failed', e))
  }, [now, autoMode, runningIdx, programs, progress, phase, token])

  async function run(id, fn) {
    setBusy(id); setError('')
    try { await fn() } catch (e) { console.error(e); setError('Could not save. Check the connection and try again.') }
    setBusy('')
  }
  const toggle = (key) => run(key, () => setMediaLiveCheck(token, key, !checks[key], operator.trim()))
  const setVerify = (key, status, note) => run(key, () => setMediaLiveVerify(token, key, status, note, operator.trim()))

  // Called straight from a tap (not an effect) so the browser allows playback.
  function playTrack(p, track) {
    const el = playerRef.current
    if (!el || !track?.url) return
    setAudioError('')
    if (nowPlaying?.track.url !== track.url) {
      el.src = track.url
      setNowPlaying({ progKey: p.key, progName: p.name, track })
    }
    el.play().catch((e) => { console.error('audio play', e); setAudioError('Could not play this track. Check the connection, or tap play again.') })
  }
  function toggleTrack(p, track) {
    const el = playerRef.current
    if (el && nowPlaying?.track.url === track.url && !el.paused) el.pause()
    else playTrack(p, track)
  }
  function stopAudio() {
    const el = playerRef.current
    if (el) { el.pause(); el.removeAttribute('src'); el.load() }
    setNowPlaying(null); setPlaying(false); setAudioError('')
  }

  // Starting an item finishes whichever one was running, so one tap moves the service on.
  // An item with attached audio starts its first track.
  function startProgram(p) {
    if (p.audio?.length) playTrack(p, p.audio[0])
    const key = `${phase}__${p.key}`
    const prev = runningIdx >= 0 ? programs[runningIdx] : null
    run(key, () => {
      const t = Date.now()
      const changes = { [key]: { start: t, end: null } }
      if (prev && prev.key !== p.key) changes[`${phase}__${prev.key}`] = { end: t }
      if (!serviceStart) changes[serviceKey] = { start: t }
      return updateMediaLiveProgress(token, changes)
    })
  }
  const finishProgram = (p) => run(`${phase}__${p.key}`, () => updateMediaLiveProgress(token, { [`${phase}__${p.key}`]: { end: Date.now() } }))
  const clearProgram = (p) => run(`${phase}__${p.key}`, () => updateMediaLiveProgress(token, { [`${phase}__${p.key}`]: { start: null, end: null } }))

  const setManual = (manual) => run('mode', () => updateMediaLiveProgress(token, { [modeKey]: { manual: manual ? true : null } }))

  async function resetPhase() {
    await run('reset', () => resetMediaLiveOps(token, { checks, progress, verify }, `${phase}__`))
    setConfirmReset(false)
  }

  async function copySong(id, text) {
    if (await copyText(text)) {
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? '' : c)), 2000)
    }
  }

  // An item's songs: the ones Media attached to it, else every song for a worship item.
  const itemSongs = (p) => p.songs?.length
    ? songs.filter((s) => p.songs.includes(s.key))
    : (p.songsOnly || isWorshipItem(p.name) ? songs : [])

  // If no run-sheet item reads as worship, the songs get their own entry so they stay reachable.
  const songsItem = songs.length && !programs.some((p) => isWorshipItem(p.name) || p.songs?.length)
    ? { key: '__songs', name: 'Worship songs', duration: 0, elements: [], songsOnly: true }
    : null
  const items = songsItem ? [...programs, songsItem] : programs
  const selKey = selected ?? (runningIdx >= 0 ? programs[runningIdx].key : items[0]?.key)
  const selIdx = items.findIndex((p) => p.key === selKey)
  const sel = items[selIdx] || null

  const running = runningIdx >= 0 ? programs[runningIdx] : null
  const runningStart = running ? progress[`${phase}__${running.key}`]?.start : null
  const runningNext = runningIdx >= 0 ? programs[runningIdx + 1] || null : null

  // Crew attendance — one check per person per phase (rehearsal / Sunday).
  const crewKey = (c) => checkKey(phase, 'crew', c.key)
  const crewPresent = crew.filter((c) => checks[crewKey(c)]).length
  const crewGroups = []
  for (const c of crew) {
    const g = crewGroups.find((x) => x.area === c.area)
    if (g) g.members.push(c)
    else crewGroups.push({ area: c.area, members: [c] })
  }

  function select(key) {
    setSelected(key)
    // Stacked layout (phone / narrow window): bring the details into view.
    if (window.innerWidth < 1024) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  if (data === undefined) {
    return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">Loading Control Center…</div>
  }
  if (data === null) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <MonitorPlay className="w-10 h-10 mx-auto text-slate-500 mb-3" />
          <p className="font-semibold text-white">This link isn't active</p>
          <p className="text-sm text-slate-400 mt-1">Ask the Media team for the current Control Center link (Media → Upcoming Sunday).</p>
        </div>
      </div>
    )
  }

  const stale = data.sundayDate < nextSundayISO()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0"><MonitorPlay className="w-5 h-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-slate-400">Media Control Center</p>
              <p className="font-semibold truncate">{displayDate(data.sundayDate)}</p>
            </div>
          </div>
          <div className="flex rounded-xl bg-slate-800 p-1">
            {MEDIA_LIVE_PHASES.map((p) => (
              <button key={p.id} type="button" onClick={() => { setPhase(p.id); writeLocal(PHASE_KEY, p.id) }}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-semibold transition ${phase === p.id ? (p.id === 'live' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white') : 'text-slate-300 hover:text-white'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <label className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5">
              <User className="w-4 h-4 text-slate-400" />
              <input value={operator} placeholder="Your name" maxLength={40}
                onChange={(e) => { setOperator(e.target.value); writeLocal(OPERATOR_KEY, e.target.value) }}
                className="bg-transparent outline-none text-sm w-28 placeholder:text-slate-500" />
            </label>
            <span title={online ? 'Connected — changes sync live' : 'Offline — changes will sync when the connection returns'}
              className={online ? 'text-emerald-400' : 'text-amber-400'}>
              {online ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </span>
            <span className="text-2xl font-bold tabular-nums">{new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        {stale && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            This page still shows {displayDate(data.sundayDate)}. A Media team member opening <b>Media → Upcoming Sunday</b> in the app brings it up to date.
          </div>
        )}
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</div>}

        {/* Status strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">{phaseDef.label} checklist</p>
            <p className="text-xl font-bold tabular-nums">{doneCount} / {allKeys.length}</p>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${allKeys.length ? (doneCount / allKeys.length) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Planned start</p>
            <p className="text-xl font-bold">{planned[0] || '—'}</p>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">{phase === 'live' ? 'Service' : 'Rehearsal'} running</p>
            <p className="text-xl font-bold tabular-nums">{serviceStart ? fmtElapsed(now - serviceStart) : '—'}</p>
            {serviceStart && <p className="text-[11px] text-slate-400">Started {fmtClock(serviceStart)}</p>}
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Now</p>
            <p className="text-base font-bold truncate">{runningIdx >= 0 ? programs[runningIdx].name : 'Nothing running'}</p>
            <p className="text-[11px] text-slate-400">{autoMode ? 'Auto timing' : 'Manual timing'}</p>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 col-span-2 lg:col-span-1">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Crew present</p>
            <p className="text-xl font-bold tabular-nums">{crewPresent} / {crew.length}</p>
          </div>
        </div>

        {phase === 'reh' && <RehearsalSummary summary={rehSummary} signoff={data.signoff} compact />}

        <div className="lg:hidden">
          <TimerRail program={running} start={runningStart} now={now} next={runningNext} auto={autoMode} />
        </div>

        <div className="grid lg:grid-cols-[76px_minmax(0,0.85fr)_minmax(0,1.15fr)] gap-4 items-start">
          <div className="hidden lg:block">
            <TimerRail vertical program={running} start={runningStart} now={now} next={runningNext} auto={autoMode} />
          </div>

          {/* Run sheet — tap an item to open it in the main panel */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Run sheet</h2>
                <span className="flex rounded-lg bg-slate-800 p-0.5 text-[11px] font-semibold" title="Auto: each item ends when its duration is up and the next starts. Manual: use Start / Finish.">
                  {[[false, 'Auto'], [true, 'Manual']].map(([m, label]) => (
                    <button key={label} type="button" disabled={busy === 'mode'} onClick={() => m !== !autoMode && setManual(m)}
                      className={`px-2 py-0.5 rounded-md ${m === !autoMode ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>
                  ))}
                </span>
              </div>
              {confirmReset ? (
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-amber-300">Clear every {phaseDef.label} tick{phase === 'reh' ? ', checkpoint' : ''} and timing?</span>
                  <button type="button" onClick={resetPhase} disabled={busy === 'reset'} className="font-semibold text-amber-300 hover:text-amber-200">Clear</button>
                  <button type="button" onClick={() => setConfirmReset(false)} className="text-slate-400 hover:text-slate-200">Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
                  <RotateCcw className="w-3.5 h-3.5" />Reset {phaseDef.label}
                </button>
              )}
            </div>
            {items.length === 0 && <p className="text-sm text-slate-400">No programme published yet.</p>}
            {items.map((p, i) => {
              const prog = progress[`${phase}__${p.key}`] || {}
              const running = prog.start && !prog.end
              const took = prog.start ? (prog.end || now) - prog.start : 0
              const over = p.duration && took > p.duration * 60000
              const isSel = p.key === selKey
              const pSongs = itemSongs(p)
              const cueKeys = p.elements.map((el) => checkKey(phase, p.key, el))
              const cuesDone = cueKeys.filter((k) => checks[k]).length
              const rv = phase === 'reh' ? rehItem(p.key) : null
              const rvDone = rv ? rv.systems.filter((x) => x.entry).length : 0
              const rvIssue = rv ? rv.systems.some((x) => x.entry?.status === 'attention') : false
              return (
                <button key={p.key} type="button" onClick={() => select(p.key)} aria-pressed={isSel}
                  className={`w-full text-left rounded-xl border bg-slate-900 px-3 py-2.5 flex items-center gap-3 transition ${isSel ? 'border-indigo-400 ring-2 ring-indigo-500/30 bg-indigo-500/5' : running ? 'border-rose-500' : prog.end ? 'border-emerald-700/60' : 'border-slate-800 hover:border-slate-600'}`}>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${running ? 'bg-rose-600' : prog.end ? 'bg-emerald-700' : 'bg-slate-800 text-slate-300'}`}>
                    {p.songsOnly ? <Music2 className="w-4 h-4" /> : prog.end ? <Check className="w-4 h-4" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold truncate">{p.name}</span>
                      {p.audio?.length > 0 && <Volume2 className={`w-3.5 h-3.5 shrink-0 ${nowPlaying?.progKey === p.key && playing ? 'text-sky-300' : 'text-slate-500'}`} aria-label="Has audio" />}
                      {running &&<span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-600">Live</span>}
                    </span>
                    <span className="block text-[11px] text-slate-400 truncate">
                      {[
                        planned[i] && !p.songsOnly ? planned[i] : '',
                        p.duration ? `${p.duration} min` : '',
                        pSongs.length ? `${pSongs.length} song${pSongs.length === 1 ? '' : 's'}` : '',
                        cueKeys.length ? `${cuesDone}/${cueKeys.length} cues` : '',
                        rv ? `${rvDone}/${rv.systems.length} verified` : '',
                      ].filter(Boolean).join(' · ') || 'No details'}
                      {rvIssue && <span className="text-amber-300"> · needs attention</span>}
                    </span>
                  </span>
                  {prog.start && (
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${over ? 'text-amber-300' : running ? 'text-rose-200' : 'text-emerald-300'}`}>{fmtElapsed(took)}</span>
                  )}
                  <ChevronRight className={`w-4 h-4 shrink-0 ${isSel ? 'text-indigo-300' : 'text-slate-600'}`} />
                </button>
              )
            })}

            {/* Crew check-in */}
            <div className="pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Crew · {phaseDef.label}</h2>
                <span className="text-xs text-slate-400 tabular-nums">{crewPresent} / {crew.length} present</span>
              </div>
              {crew.length === 0 && <p className="text-sm text-slate-400">No crew assigned for this Sunday yet (Media → Assign).</p>}
              {crewGroups.map((g) => (
                <div key={g.area} className="rounded-xl border border-slate-800 bg-slate-900 p-2.5 space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 px-1">{g.area}</p>
                  {g.members.map((c) => {
                    const k = crewKey(c)
                    return <CheckRow key={k} label={c.name} check={checks[k]} busy={busy === k} doneLabel="Present" notDoneLabel="Not checked in" onToggle={() => toggle(k)} />
                  })}
                </div>
              ))}
            </div>
          </section>

          {/* Main panel — the selected item */}
          <section ref={detailRef} className="space-y-3 scroll-mt-24">
            {!sel ? (
              <p className="text-sm text-slate-400">Select an item from the run sheet.</p>
            ) : (() => {
              const prog = progress[`${phase}__${sel.key}`] || {}
              const running = prog.start && !prog.end
              const took = prog.start ? (prog.end || now) - prog.start : 0
              const over = sel.duration && took > sel.duration * 60000
              const pBusy = busy === `${phase}__${sel.key}`
              const selSongs = itemSongs(sel)
              const worship = sel.songsOnly || isWorshipItem(sel.name) || selSongs.length > 0
              return (
                <>
                  <div className={`rounded-xl border bg-slate-900 ${running ? 'border-rose-500' : 'border-slate-800'}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
                      <div className="min-w-[12rem] flex-1">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400">{sel.songsOnly ? 'Song schedule' : `Item ${selIdx + 1} of ${programs.length}`}</p>
                        <p className="text-xl font-bold">{sel.name}</p>
                        {!sel.songsOnly && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {[planned[selIdx] && `Planned ${planned[selIdx]}`, sel.duration ? `${sel.duration} min` : ''].filter(Boolean).join(' · ') || 'No timing set'}
                            {prog.start && <> · started {fmtClock(prog.start)}</>}
                            {prog.end && <> · ended {fmtClock(prog.end)}</>}
                          </p>
                        )}
                      </div>
                      {prog.start && (
                        <span className={`text-2xl font-bold tabular-nums ${over ? 'text-amber-300' : running ? 'text-rose-200' : 'text-emerald-300'}`}>
                          {fmtElapsed(took)}{sel.duration ? <span className="text-sm font-medium text-slate-400"> / {sel.duration}:00</span> : null}
                        </span>
                      )}
                      {!sel.songsOnly && (
                        <div className="flex items-center gap-1.5">
                          {running ? (
                            <button type="button" disabled={pBusy} onClick={() => finishProgram(sel)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-2 text-sm font-semibold disabled:opacity-60">
                              <Square className="w-3.5 h-3.5" />Finish
                            </button>
                          ) : (
                            <button type="button" disabled={pBusy} onClick={() => startProgram(sel)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-semibold disabled:opacity-60">
                              <Play className="w-3.5 h-3.5" />{prog.start ? 'Restart' : 'Start'}
                            </button>
                          )}
                          {prog.start && !running && (
                            <button type="button" disabled={pBusy} onClick={() => clearProgram(sel)} title="Clear timing"
                              className="rounded-lg p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800"><RotateCcw className="w-4 h-4" /></button>
                          )}
                        </div>
                      )}
                    </div>
                    {!sel.songsOnly && autoMode && sel.duration > 0 && prog.start && !prog.end && (
                      <p className="px-4 -mt-1 pb-3 text-xs text-emerald-300">
                        Auto: {programs[selIdx + 1] ? `moves to ${programs[selIdx + 1].name}` : 'ends'} at {fmtClock(prog.start + sel.duration * 60000)}
                      </p>
                    )}
                    {sel.audio?.length > 0 && (
                      <div className="px-4 pb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Audio</p>
                        <div className="space-y-1.5">
                          {sel.audio.map((t) => {
                            const on = nowPlaying?.track.url === t.url
                            return (
                              <button key={t.id || t.url} type="button" onClick={() => toggleTrack(sel, t)}
                                aria-label={`${on && playing ? 'Pause' : 'Play'} ${t.name}`}
                                className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${on ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${on && playing ? 'bg-sky-500 text-white' : 'bg-slate-800 text-sky-300'}`}>
                                  {on && playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </span>
                                <span className="min-w-0 flex-1 text-sm font-semibold truncate">{t.name}</span>
                                {on && <span className="text-[11px] text-sky-300 shrink-0">{playing ? 'Playing' : 'Paused'}</span>}
                              </button>
                            )
                          })}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5">Start plays the first track automatically.</p>
                      </div>
                    )}
                    {phase === 'reh' && rehItem(sel.key) && (
                      <div className="px-4 pb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Rehearsal checkpoints</p>
                        <div className="space-y-1.5">
                          {rehItem(sel.key).systems.map((x) => (
                            <VerifyRow key={x.key} label={x.label} entry={x.entry} busy={busy === x.key}
                              onSet={(status, note) => setVerify(x.key, status, note)} />
                          ))}
                        </div>
                      </div>
                    )}
                    {!sel.songsOnly && (
                      <div className="px-4 pb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Media cues</p>
                        {sel.elements.length === 0 ? (
                          <p className="text-sm text-slate-500">No media cues designed for this item.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {sel.elements.map((el) => {
                              const k = checkKey(phase, sel.key, el)
                              return <CheckRow key={k} label={el} check={checks[k]} busy={busy === k} doneLabel={phaseDef.cueDone} onToggle={() => toggle(k)} />
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {worship && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex-1">Songs &amp; lyrics</h2>
                        <button type="button" onClick={() => setShowChords((v) => !v)}
                          className={`rounded-md px-2 py-1 text-xs font-semibold border ${showChords ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-slate-700 text-slate-300'}`}>Chords</button>
                        <span className="inline-flex items-center rounded-md border border-slate-700">
                          <button type="button" aria-label="Smaller text" onClick={() => { const f = Math.max(14, font - 2); setFont(f); writeLocal(FONT_KEY, String(f)) }} className="p-1.5 text-slate-300 hover:text-white"><Minus className="w-3.5 h-3.5" /></button>
                          <button type="button" aria-label="Larger text" onClick={() => { const f = Math.min(44, font + 2); setFont(f); writeLocal(FONT_KEY, String(f)) }} className="p-1.5 text-slate-300 hover:text-white"><Plus className="w-3.5 h-3.5" /></button>
                        </span>
                        {selSongs.length > 1 && (
                          <button type="button" onClick={() => copySong('all', selSongs.map(songPresentationText).join('\n'))}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border border-slate-700 text-slate-300 hover:text-white">
                            {copied === 'all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied === 'all' ? 'Copied all' : 'Copy all songs'}
                          </button>
                        )}
                      </div>
                      {selSongs.length === 0 && <p className="text-sm text-slate-400">No songs scheduled by Worship yet.</p>}
                      {selSongs.map((song, i) => {
                        const k = checkKey(phase, song.key)
                        return (
                          <div key={song.key} className="rounded-xl border border-slate-800 bg-slate-900">
                            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800">
                              <Music2 className="w-4 h-4 text-indigo-300 shrink-0" />
                              <div className="min-w-[10rem] flex-1">
                                <p className="font-semibold">{i + 1}. {song.title}</p>
                                <p className="text-[11px] text-slate-400">{[song.singer, song.musicKey && `Key ${song.musicKey}`].filter(Boolean).join(' · ') || ' '}</p>
                              </div>
                              <button type="button" disabled={busy === k} onClick={() => toggle(k)}
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold border ${checks[k] ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                                title={checks[k] ? `${fmtClock(checks[k].at)}${checks[k].by ? ` · ${checks[k].by}` : ''}` : 'Not done'}>
                                {checks[k] && <Check className="w-3 h-3" strokeWidth={3} />}{checks[k] ? phaseDef.songDone : 'Not done'}
                              </button>
                              <button type="button" disabled={!song.sections.length} onClick={() => copySong(song.key, songPresentationText(song))}
                                title="Lyrics only — no chords or labels; a blank line between sections for slide breaks"
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${copied === song.key ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
                                {copied === song.key ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied === song.key ? 'Copied' : 'Copy for Presentation'}
                              </button>
                            </div>
                            <div className="px-4 py-4 space-y-5">
                              {song.sections.length === 0 && <p className="text-sm text-slate-400">No lyrics saved for this song in the Song Builder yet.</p>}
                              {song.sections.map((sec, si) => (
                                <div key={si}>
                                  <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-300 mb-1.5">{sec.name}</p>
                                  <div style={{ fontSize: font, lineHeight: 1.35 }}>
                                    {sec.lines.map((l, li) => (
                                      <div key={li}>
                                        {showChords && l.chords.length > 0 && (
                                          <pre className="font-mono text-amber-300 whitespace-pre m-0" style={{ fontSize: font * 0.7 }}>{chordLine(l.chords, l.lyrics)}</pre>
                                        )}
                                        {showChords
                                          ? <pre className="font-mono whitespace-pre-wrap m-0" style={{ fontSize: font * 0.7 }}>{l.lyrics || ' '}</pre>
                                          : l.lyrics.trim() ? <p className="m-0">{l.lyrics}</p> : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()}
          </section>
        </div>
      </main>

      {/* Programme audio player — stays put while the operator moves between items. */}
      <div className={nowPlaying ? 'sticky bottom-0 z-20 bg-slate-900/95 backdrop-blur border-t border-slate-800' : 'hidden'}>
        <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 min-w-0 flex-1 basis-48">
            <Volume2 className={`w-4 h-4 shrink-0 ${playing ? 'text-sky-300' : 'text-slate-500'}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{nowPlaying?.track.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{nowPlaying?.progName}</p>
            </div>
          </div>
          <audio ref={playerRef} controls preload="auto" className="h-9 flex-[2_1_16rem] min-w-0"
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
          <button type="button" onClick={stopAudio} aria-label="Stop and close player"
            className="rounded-lg p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800"><X className="w-4 h-4" /></button>
          {audioError && <p className="basis-full text-xs text-red-400">{audioError}</p>}
        </div>
      </div>
    </div>
  )
}
