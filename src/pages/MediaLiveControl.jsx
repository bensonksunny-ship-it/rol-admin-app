import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Check, ChevronRight, Copy, Crosshair, Minus, MonitorPlay, Music2, Pause, Play, Plus, RotateCcw, Square, User, UserRound, Volume2, Wifi, WifiOff, X } from 'lucide-react'
import { subscribeMediaLive, setMediaLiveCheck, updateMediaLiveProgress, resetMediaLiveOps, setMediaLiveVerifyMany } from '../services/firestore'
import {
  MEDIA_LIVE_PHASES, checkKey, chordLine, songPresentationText, isWorshipItem, plannedStarts, fmtClock, fmtElapsed,
  rehearsalSummary, MEDIA_STATIONS, resolveStation, stationCues, crewInStation, scheduleWindows, dateAtMinutes,
} from '../utils/mediaLive'
import { RehearsalSummary } from '../components/media/RehearsalVerification'

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

/**
 * Whole-programme timer, hands-free: fills from the scheduled start to the end of
 * the last item (or from the master screen's Start now / Start rehearsal tap).
 * Items set to run alongside others don't add time. Ticks mark each planned
 * handover. Vertical beside the run sheet on wide screens; a strip on phones.
 */
function TimerRail({ start, end, windows, programs, now, running, next, vertical }) {
  const total = start && end ? end - start : 0
  const started = !!start && now >= start
  const finished = !!end && now >= end
  const elapsed = started ? Math.min(now, end || now) - start : 0
  const remaining = total - elapsed
  const pct = total ? Math.min(100, (elapsed / total) * 100) : 0
  const ticks = total
    ? windows.flatMap((w, i) => (w && !programs[i].parallel && w.end < end ? [{ key: programs[i].key, at: ((w.end - start) / total) * 100 }] : []))
    : []
  const tone = !started ? 'bg-slate-700' : finished ? 'bg-emerald-600' : remaining < Math.max(60000, total * 0.1) ? 'bg-amber-400' : 'bg-emerald-500'
  const left = !start ? 'Not set' : !total ? 'No timings' : finished ? 'Done' : !started ? fmtElapsed(total) : fmtElapsed(remaining)
  const endsAt = end ? fmtClock(end) : ''
  const nowLine = running ? running.name : finished ? 'Finished' : !start ? 'Not started' : !started ? `Starts ${fmtClock(start)}` : 'Between items'
  const nextName = next ? next.name : ''
  if (vertical) {
    return (
      <div className="sticky top-24 flex flex-col items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-800 py-3 px-1"
        title={`Whole programme · ${total ? `${Math.round(total / 60000)} min planned` : 'no timings'} · runs by the schedule`}>
        <p className="text-[10px] uppercase tracking-wider text-slate-400">Left</p>
        <p className="text-sm font-bold tabular-nums text-white">{left}</p>
        <div className="relative w-3 h-[52vh] rounded-full bg-slate-800 overflow-hidden my-1">
          <div className={`absolute top-0 inset-x-0 rounded-full transition-all duration-1000 ${tone}`} style={{ height: `${pct}%` }} />
          {ticks.map((t) => <span key={t.key} className="absolute inset-x-0 h-px bg-slate-950/80" style={{ top: `${t.at}%` }} />)}
        </div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400">Elapsed</p>
        <p className="text-sm font-bold tabular-nums text-slate-200">{started ? fmtElapsed(elapsed) : '—'}</p>
        {endsAt && (
          <div className="w-full px-1 text-center text-[10px] leading-tight text-slate-500">
            <p>Ends</p>
            <p className="text-slate-300 tabular-nums">{endsAt}</p>
          </div>
        )}
        {nextName && (
          <div className="w-full px-1 text-center text-[10px] leading-tight text-slate-500" title={`Next: ${nextName}`}>
            <p>Next</p>
            <p className="truncate text-slate-300">{nextName}</p>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate"><span className="text-slate-400">Programme · </span><span className="font-semibold">{nowLine}</span></span>
        <span className="tabular-nums shrink-0">
          <span className="text-slate-400">{started ? `${fmtElapsed(elapsed)} · ` : ''}</span><b className="text-white">{left}</b>
          {total && started && !finished ? <span className="text-slate-400"> left</span> : null}
        </span>
      </div>
      <div className="relative mt-2 h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${tone}`} style={{ width: `${pct}%` }} />
        {ticks.map((t) => <span key={t.key} className="absolute inset-y-0 w-px bg-slate-950/80" style={{ left: `${t.at}%` }} />)}
      </div>
      {(endsAt || nextName) && (
        <p className="mt-1 text-[11px] text-slate-500 truncate">{[endsAt && `Ends ${endsAt}`, nextName && `Next: ${nextName}`].filter(Boolean).join(' · ')}</p>
      )}
    </div>
  )
}

/**
 * Public Media Control Center (/media-live/:token) — opened on the media desk
 * without a login. Content is the snapshot Media publishes from Upcoming Sunday;
 * operators tick cues and record timings, and every open desk sees them live.
 */
export default function MediaLiveControl() {
  const { token, station: stationId } = useParams()
  const navigate = useNavigate()
  // Station sub-link (/media-live/:token/:station): only that station's cues, no timer
  // controls. No station = the master screen. Every screen reads the same live doc.
  // Stations are Media's Sub-Departments, published with the content.
  const [data, setData] = useState(undefined) // undefined = loading, null = gone
  const stationList = data?.stations?.length ? data.stations : MEDIA_STATIONS
  const station = useMemo(() => resolveStation(stationId, data?.stations), [stationId, data?.stations])
  const isMaster = !station
  const showAudio = isMaster || !!station?.audio
  const showLyrics = isMaster || !!station?.lyrics
  const autoAudioKey = `mediaLiveAutoAudio:${station?.id || 'master'}`
  // Per screen: play an item's first track when it goes live. On by default only at
  // the Sound station, so two screens don't play the same track at once.
  const [autoAudioPrefs, setAutoAudioPrefs] = useState({}) // this session's toggles, by station
  const autoAudio = autoAudioPrefs[autoAudioKey] ?? readLocal(autoAudioKey, station?.audio ? '1' : '0') === '1'
  const setAutoAudio = (on) => { setAutoAudioPrefs((p) => ({ ...p, [autoAudioKey]: on })); writeLocal(autoAudioKey, on ? '1' : '0') }
  const [phase, setPhase] = useState(() => readLocal(PHASE_KEY, '') || defaultPhase())
  const [operator, setOperator] = useState(() => readLocal(OPERATOR_KEY, ''))
  const [now, setNow] = useState(() => Date.now())
  const [online, setOnline] = useState(() => navigator.onLine)
  const [selected, setSelected] = useState(null) // programme key; null = follow the running item
  const detailRef = useRef(null)
  const [showChords, setShowChords] = useState(false)
  const [openSongs, setOpenSongs] = useState(() => new Set()) // song keys with lyrics expanded; collapsed by default
  const toggleSong = (key) => setOpenSongs((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
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
  useEffect(() => { document.title = station ? `${station.label} · Media Control Center` : 'Media Control Center' }, [station])

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

  // This screen's checklist: a station counts only its own cues (songs at Projection).
  const allKeys = useMemo(() => [
    ...programs.flatMap((p) => stationCues(p.elements, station).map((el) => checkKey(phase, p.key, el))),
    ...(isMaster || station?.lyrics ? songs.map((s) => checkKey(phase, s.key)) : []),
  ], [programs, songs, phase, station, isMaster])
  const doneCount = allKeys.filter((k) => checks[k]).length

  // Hands-free clock: nothing is started or stopped per item. Every item's window
  // comes from the published schedule (service start time + default durations, as
  // on Upcoming Sunday), and every screen computes the same live item from it.
  // Sunday Live runs from the planned start on the Sunday itself; the master screen
  // can shift the whole clock with "Start now" if the service starts late. A
  // rehearsal has no fixed time, so it runs from one "Start rehearsal" tap. The
  // shift is stored at progress.{phase}__service, so Reset clears it.
  const serviceKey = `${phase}__service`
  const sched = useMemo(() => scheduleWindows(programs, data?.serviceStartTime), [programs, data?.serviceStartTime])
  const clockOverride = progress[serviceKey]?.start || null
  const scheduledStart = phase === 'live' && sched.hasClock && data?.sundayDate ? dateAtMinutes(data.sundayDate, sched.firstMin) : null
  const clockStart = clockOverride || scheduledStart
  // Saturday Rehearsal is timed only up to the Invocation prayer (inclusive); later
  // items (Sermon, Benediction…) get no window, so they stay out of the rail, the
  // end time and the live item. Sunday Live times the whole run sheet.
  const rehKeys = useMemo(() => new Set(rehSummary.items.map((it) => it.program.key)), [rehSummary])
  const inTiming = (p) => phase !== 'reh' || !p || rehKeys.has(p.key)
  const windows = useMemo(() => sched.items.map((w, i) => (w && clockStart && (phase !== 'reh' || rehKeys.has(programs[i]?.key))
    ? { start: clockStart + (w.startMin - sched.firstMin) * 60000, end: clockStart + (w.endMin - sched.firstMin) * 60000 }
    : null)), [sched, clockStart, phase, rehKeys, programs])
  // 'live' | 'done' | 'next' (not yet) | '' (no window)
  const itemState = (i) => {
    const w = windows[i]
    if (!w) return ''
    return now >= w.end ? 'done' : now >= w.start ? 'live' : 'next'
  }
  const runningIdx = programs.findIndex((p, i) => !p.parallel && itemState(i) === 'live')
  const serviceEnd = windows.reduce((m, w, i) => (w && !programs[i].parallel ? Math.max(m, w.end) : m), 0) || null
  // start: 'now' (read when the write runs) or null to go back to the schedule.
  const setClock = (start) => run('clock', () => updateMediaLiveProgress(token, { [serviceKey]: { start: start === 'now' ? Date.now() : start } }))

  async function run(id, fn) {
    setBusy(id); setError('')
    try { await fn() } catch (e) { console.error(e); setError('Could not save. Check the connection and try again.') }
    setBusy('')
  }
  const toggle = (key) => run(key, () => setMediaLiveCheck(token, key, !checks[key], operator.trim()))
  // One tap: every unchecked checkpoint shown for the item → All Good. Anything
  // already flagged (Needs Attention / Fixed) is left as it is.
  const markAllGood = (programKey, systems) => {
    const keys = systems.filter((x) => !x.entry).map((x) => x.key)
    return run(`allgood__${programKey}`, () => setMediaLiveVerifyMany(token, keys, 'good', operator.trim()))
  }

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

  // When the live item changes (the schedule clock moving on), a screen with
  // auto-play on plays that item's first track. The first item seen on opening the
  // page is skipped, so reopening mid-service doesn't replay audio. Browsers allow
  // this once the operator has tapped the page; otherwise the bar asks for a tap.
  const runningKey = runningIdx >= 0 ? programs[runningIdx].key : ''
  const lastRunningRef = useRef(null)
  useEffect(() => {
    if (data === undefined) return
    const prev = lastRunningRef.current
    lastRunningRef.current = runningKey
    if (prev === null || prev === runningKey || !runningKey || !autoAudio) return
    const p = programs.find((x) => x.key === runningKey)
    const track = p?.audio?.[0]
    const el = playerRef.current
    if (!track?.url || !el || el.src === track.url) return
    el.src = track.url
    el.play()
      .then(() => { setNowPlaying({ progKey: p.key, progName: p.name, track }); setAudioError('') })
      .catch(() => { setNowPlaying({ progKey: p.key, progName: p.name, track }); setAudioError('Auto-play was blocked by the browser. Tap play to start the track.') })
  }, [data, runningKey, autoAudio, programs])

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
  const runningNext = runningIdx >= 0 && programs[runningIdx + 1] && inTiming(programs[runningIdx + 1]) ? programs[runningIdx + 1] : null

  // Crew attendance — one check per person per phase (rehearsal / Sunday).
  // A station lists its own crew (by roster area), or everyone if no area matches.
  const crewKey = (c) => checkKey(phase, 'crew', c.key)
  const ownCrew = crew.filter((c) => crewInStation(c.area, station))
  const shownCrew = ownCrew.length ? ownCrew : crew
  const crewPresent = shownCrew.filter((c) => checks[crewKey(c)]).length
  const crewGroups = []
  for (const c of shownCrew) {
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
              <p className="text-[11px] uppercase tracking-widest text-slate-400">Media Control Center{station ? <span className="text-emerald-300"> · {station.label}</span> : ''}</p>
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
          <label className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5" title="Each station sees only its own cues; every screen follows the same run sheet and timer">
            <Crosshair className="w-4 h-4 text-slate-400" />
            <span className="sr-only">Station</span>
            <select value={station?.id || ''} onChange={(e) => navigate(e.target.value ? `/media-live/${token}/${e.target.value}` : `/media-live/${token}`)}
              className="bg-transparent outline-none text-sm font-semibold [&>option]:bg-slate-900">
              <option value="">Master (all)</option>
              {stationList.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              {station && !stationList.some((s) => s.id === station.id) && <option value={station.id}>{station.label}</option>}
            </select>
          </label>
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
            <p className="text-xl font-bold tabular-nums">{clockStart && now >= clockStart ? fmtElapsed(Math.min(now, serviceEnd || now) - clockStart) : '—'}</p>
            {clockStart && <p className="text-[11px] text-slate-400">{now >= clockStart ? 'Started' : 'Starts'} {fmtClock(clockStart)}{clockOverride && phase === 'live' ? ' (shifted)' : ''}</p>}
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Now</p>
            <p className="text-base font-bold truncate">
              {runningIdx >= 0 ? programs[runningIdx].name : !clockStart ? 'Not started' : now < clockStart ? 'Waiting to start' : 'Finished'}
            </p>
            <p className="text-[11px] text-slate-400">Runs by the schedule</p>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 col-span-2 lg:col-span-1">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Crew present</p>
            <p className="text-xl font-bold tabular-nums">{crewPresent} / {shownCrew.length}</p>
          </div>
        </div>

        {phase === 'reh' && <RehearsalSummary summary={rehSummary} signoff={data.signoff} compact />}

        <div className="lg:hidden">
          <TimerRail start={clockStart} end={serviceEnd} windows={windows} programs={programs} now={now} running={running} next={runningNext} />
        </div>

        <div className="grid lg:grid-cols-[76px_minmax(0,0.85fr)_minmax(0,1.15fr)] gap-4 items-start">
          <div className="hidden lg:block">
            <TimerRail vertical start={clockStart} end={serviceEnd} windows={windows} programs={programs} now={now} running={running} next={runningNext} />
          </div>

          {/* Run sheet — tap an item to open it in the main panel */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Run sheet</h2>
                {/* The only clock control: shift the whole schedule (master screen). */}
                {isMaster ? (
                  phase === 'reh' && !clockOverride ? (
                    <button type="button" disabled={busy === 'clock'} onClick={() => setClock('now')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 text-xs font-semibold disabled:opacity-60">
                      <Play className="w-3.5 h-3.5" />Start rehearsal
                    </button>
                  ) : (
                    <span className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500">{clockOverride ? `Started ${fmtClock(clockOverride)}` : sched.hasClock ? 'On schedule' : 'No start time set'}</span>
                      {phase === 'live' && !clockOverride && (
                        <button type="button" disabled={busy === 'clock'} onClick={() => setClock('now')} title="Service started late or early? Run the schedule from now."
                          className="font-semibold text-emerald-300 hover:text-emerald-200">Start now</button>
                      )}
                      {clockOverride && (
                        <button type="button" disabled={busy === 'clock'} onClick={() => setClock(null)}
                          className="font-semibold text-slate-300 hover:text-white">{phase === 'live' ? 'Back to schedule' : 'Stop'}</button>
                      )}
                    </span>
                  )
                ) : (
                  <span className="text-[11px] text-slate-500">Follows the schedule</span>
                )}
              </div>
              <span className="flex items-center gap-3">
              {/* Tapping an item pins it here; Follow live goes back to tracking the live item. */}
              {selected !== null && (
                <button type="button" onClick={() => setSelected(null)}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-600/20 border border-rose-500/40 px-2 py-0.5 text-xs font-semibold text-rose-200 hover:bg-rose-600/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />Follow live
                </button>
              )}
              {!isMaster ? null : confirmReset ? (
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-amber-300">Clear every {phaseDef.label} tick{phase === 'reh' ? ', checkpoint' : ''} and clock shift?</span>
                  <button type="button" onClick={resetPhase} disabled={busy === 'reset'} className="font-semibold text-amber-300 hover:text-amber-200">Clear</button>
                  <button type="button" onClick={() => setConfirmReset(false)} className="text-slate-400 hover:text-slate-200">Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
                  <RotateCcw className="w-3.5 h-3.5" />Reset {phaseDef.label}
                </button>
              )}
              </span>
            </div>
            {items.length === 0 && <p className="text-sm text-slate-400">No programme published yet.</p>}
            {items.map((p, i) => {
              const st = p.songsOnly ? '' : itemState(i)
              const running = st === 'live'
              const ended = st === 'done'
              const w = windows[i]
              const isSel = p.key === selKey
              const pSongs = itemSongs(p)
              const cueKeys = stationCues(p.elements, station).map((el) => checkKey(phase, p.key, el))
              const cuesDone = cueKeys.filter((k) => checks[k]).length
              const rv = phase === 'reh' ? rehItem(p.key) : null
              const rvDone = rv ? rv.systems.filter((x) => x.entry).length : 0
              const rvIssue = rv ? rv.systems.some((x) => x.entry?.status === 'attention') : false
              const untimed = !p.songsOnly && !inTiming(p) // after the Invocation, on the rehearsal view
              return (
                <button key={p.key} type="button" onClick={() => select(p.key)} aria-pressed={isSel}
                  className={`w-full text-left rounded-xl border bg-slate-900 px-3 py-2.5 flex items-center gap-3 transition ${untimed && !isSel ? 'opacity-45' : ''} ${isSel ? 'border-indigo-400 ring-2 ring-indigo-500/30 bg-indigo-500/5' : running ? 'border-rose-500' : ended ? 'border-emerald-700/60' : 'border-slate-800 hover:border-slate-600'}`}>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${running ? 'bg-rose-600' : ended ? 'bg-emerald-700' : 'bg-slate-800 text-slate-300'}`}>
                    {p.songsOnly ? <Music2 className="w-4 h-4" /> : ended ? <Check className="w-4 h-4" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold truncate">{p.name}</span>
                      {showAudio && p.audio?.length > 0 && <Volume2 className={`w-3.5 h-3.5 shrink-0 ${nowPlaying?.progKey === p.key && playing ? 'text-sky-300' : 'text-slate-500'}`} aria-label="Has audio" />}
                      {running &&<span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-600">Live</span>}
                    </span>
                    <span className="block text-[11px] text-slate-400 truncate">
                      {[
                        untimed ? 'Not in rehearsal timing' : '',
                        planned[i] && !p.songsOnly && !untimed ? planned[i] : '',
                        p.duration ? `${p.duration} min` : '',
                        pSongs.length ? `${pSongs.length} song${pSongs.length === 1 ? '' : 's'}` : '',
                        cueKeys.length ? `${cuesDone}/${cueKeys.length} cues` : '',
                        rv ? `${rvDone}/${rv.systems.length} verified` : '',
                      ].filter(Boolean).join(' · ') || 'No details'}
                      {rvIssue && <span className="text-amber-300"> · needs attention</span>}
                    </span>
                    {p.person && (
                      <span className={`flex items-center gap-1 text-[11px] text-indigo-200 ${p.leads?.length > 1 ? '' : 'truncate'}`}>
                        <UserRound className="w-3 h-3 shrink-0" />{p.person}{p.personRole ? <span className="text-slate-500"> · {p.personRole}</span> : null}
                      </span>
                    )}
                  </span>
                  {running && w.end > w.start && (
                    <span className="text-sm font-bold tabular-nums shrink-0 text-rose-200" title="Time left in this item">{fmtElapsed(w.end - now)}</span>
                  )}
                  <ChevronRight className={`w-4 h-4 shrink-0 ${isSel ? 'text-indigo-300' : 'text-slate-600'}`} />
                </button>
              )
            })}

            {/* Crew check-in */}
            <div className="pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Crew · {phaseDef.label}</h2>
                <span className="text-xs text-slate-400 tabular-nums">{crewPresent} / {shownCrew.length} present</span>
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
              const st = sel.songsOnly ? '' : itemState(selIdx)
              const running = st === 'live'
              const w = windows[selIdx]
              const selSongs = itemSongs(sel)
              const worship = sel.songsOnly || isWorshipItem(sel.name) || selSongs.length > 0
              return (
                <>
                  <div className={`rounded-xl border bg-slate-900 ${running ? 'border-rose-500' : 'border-slate-800'}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
                      <div className="min-w-[12rem] flex-1">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400">{sel.songsOnly ? 'Song schedule' : `Item ${selIdx + 1} of ${programs.length}`}</p>
                        <p className="text-xl font-bold">{sel.name}</p>
                        {sel.leads?.length > 0 ? (
                          // Worship co-leads, each with the songs they lead.
                          <div className="mt-1 space-y-0.5">
                            {sel.personRole && <p className="text-[11px] uppercase tracking-wider text-slate-400">{sel.personRole}</p>}
                            {sel.leads.map((l) => (
                              <p key={l.name} className="flex items-start gap-1.5 text-sm text-indigo-200">
                                <UserRound className="w-4 h-4 shrink-0 mt-0.5" />
                                <span><b className="font-semibold">{l.name}</b>{l.songs.length > 0 && <span className="text-slate-400"> · {l.songs.join(', ')}</span>}</span>
                              </p>
                            ))}
                          </div>
                        ) : sel.person && (
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-indigo-200">
                            <UserRound className="w-4 h-4 shrink-0" /><b className="font-semibold">{sel.person}</b>{sel.personRole ? <span className="text-slate-400">· {sel.personRole}</span> : null}
                          </p>
                        )}
                        {!sel.songsOnly && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {!inTiming(sel) ? 'After the Invocation — not timed in rehearsal' : [w ? `${fmtClock(w.start)}${w.end > w.start ? ` – ${fmtClock(w.end)}` : ''}` : planned[selIdx] && `Planned ${planned[selIdx]}`, sel.duration ? `${sel.duration} min` : ''].filter(Boolean).join(' · ') || 'No timing set'}
                          </p>
                        )}
                      </div>
                      {/* Read-only: the schedule moves items on by itself. */}
                      {st === 'live' && w.end > w.start && (
                        <span className="text-right">
                          <span className="block text-2xl font-bold tabular-nums text-rose-200">{fmtElapsed(w.end - now)}</span>
                          <span className="block text-[11px] text-slate-400">left · {programs[selIdx + 1] && inTiming(programs[selIdx + 1]) ? `then ${programs[selIdx + 1].name}` : phase === 'reh' && programs[selIdx + 1] ? 'end of rehearsal' : 'last item'}</span>
                        </span>
                      )}
                      {st === 'next' && (
                        <span className="text-right">
                          <span className="block text-lg font-bold tabular-nums text-slate-200">in {fmtElapsed(w.start - now)}</span>
                          <span className="block text-[11px] text-slate-400">starts {fmtClock(w.start)}</span>
                        </span>
                      )}
                      {st === 'done' && <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-300"><Check className="w-4 h-4" />Done</span>}
                    </div>
                    {showAudio && sel.audio?.length > 0 && (
                      <div className="px-4 pb-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Audio</p>
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer" title="Play an item's first track when it goes live (on this screen only)">
                            <input type="checkbox" checked={autoAudio} onChange={(e) => setAutoAudio(e.target.checked)} className="accent-sky-500" />
                            Auto-play on this screen
                          </label>
                        </div>
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
                        <p className="text-[11px] text-slate-500 mt-1.5">
                          {autoAudio ? 'The first track plays here when this item goes live.' : 'Tap a track to play it. Auto-play is off on this screen.'}
                        </p>
                      </div>
                    )}
                    {phase === 'reh' && rehItem(sel.key) && (() => {
                      const systems = rehItem(sel.key).systems.filter((x) => isMaster || station.systems.includes(x.id))
                      const pending = systems.filter((x) => !x.entry).length
                      const flagged = systems.filter((x) => x.entry && x.entry.status !== 'good').length
                      const allBusy = busy === `allgood__${sel.key}`
                      return (
                        <div className="px-4 pb-3">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex-1">Rehearsal checkpoints</p>
                            {pending > 0 ? (
                              <button type="button" disabled={allBusy} onClick={() => markAllGood(sel.key, systems)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
                                <Check className="w-4 h-4" strokeWidth={3} />{allBusy ? 'Marking…' : `Mark all good${pending < systems.length ? ` (${pending} left)` : ''}`}
                              </button>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${flagged ? 'text-amber-300' : 'text-emerald-300'}`}>
                                <Check className="w-3.5 h-3.5" strokeWidth={3} />{flagged ? `All checked · ${flagged} flagged` : 'All good'}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                    {!sel.songsOnly && stationCues(sel.elements, station).length > 0 && (
                      <div className="px-4 pb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{station ? `${station.label} cues` : 'Media cues'}</p>
                        {(
                          <div className="space-y-1.5">
                            {stationCues(sel.elements, station).map((el) => {
                              const k = checkKey(phase, sel.key, el)
                              return <CheckRow key={k} label={el} sub={sel.cueOps?.[el] ? `Operator: ${sel.cueOps[el]}` : undefined} check={checks[k]} busy={busy === k} doneLabel={phaseDef.cueDone} onToggle={() => toggle(k)} />
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sound: the item's songs as a set list (singer + key), no lyrics. */}
                  {worship && !showLyrics && station?.songList && selSongs.length > 0 && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Songs</p>
                      <ol className="space-y-1.5">
                        {selSongs.map((song, i) => (
                          <li key={song.key} className="flex items-center gap-3">
                            <span className="w-6 text-sm font-bold text-slate-500 tabular-nums">{i + 1}.</span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold truncate">{song.title}</span>
                              {song.singer && <span className="block text-[11px] text-slate-400 truncate">{song.singer}</span>}
                            </span>
                            {song.musicKey && <span className="rounded-md bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-sm font-bold text-amber-300">{song.musicKey}</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {worship && showLyrics && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex-1">
                          Songs &amp; lyrics
                          {sel.leads?.length > 0 && <span className="normal-case tracking-normal font-normal text-slate-400"> · led by {sel.leads.map((l) => l.name).join(', ')}</span>}
                        </h2>
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
                        const open = openSongs.has(song.key)
                        return (
                          <div key={song.key} className="rounded-xl border border-slate-800 bg-slate-900">
                            <div className={`flex flex-wrap items-center gap-2 px-4 py-3 ${open ? 'border-b border-slate-800' : ''}`}>
                              <button type="button" onClick={() => toggleSong(song.key)} aria-expanded={open}
                                title={open ? 'Hide lyrics' : 'Show lyrics'}
                                className="flex items-center gap-2 min-w-[10rem] flex-1 text-left group">
                                <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 group-hover:text-white transition-transform ${open ? 'rotate-90' : ''}`} />
                                <Music2 className="w-4 h-4 text-indigo-300 shrink-0" />
                                <span className="min-w-0">
                                  <span className="block font-semibold">{i + 1}. {song.title}</span>
                                  <span className="block text-[11px] text-slate-400">{[song.singer, song.musicKey && `Key ${song.musicKey}`, song.sections.length && `${song.sections.length} sections`].filter(Boolean).join(' · ') || ' '}</span>
                                </span>
                              </button>
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
                            {open && <div className="px-4 py-4 space-y-5">
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
                            </div>}
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
