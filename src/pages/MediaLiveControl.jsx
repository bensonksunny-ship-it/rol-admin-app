import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Check, Copy, Minus, MonitorPlay, Music2, Play, Plus, RotateCcw, Square, User, Wifi, WifiOff } from 'lucide-react'
import { subscribeMediaLive, setMediaLiveCheck, updateMediaLiveProgress, resetMediaLiveOps } from '../services/firestore'
import {
  MEDIA_LIVE_PHASES, checkKey, chordLine, songPlainText, plannedStarts, fmtClock, fmtElapsed,
} from '../utils/mediaLive'

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
function CheckRow({ label, sub, check, onToggle, busy, doneLabel }) {
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
        {done ? `${doneLabel} · ${fmtClock(check.at)}${check.by ? ` · ${check.by}` : ''}` : 'Not done'}
      </span>
    </button>
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
  const [songIdx, setSongIdx] = useState(0)
  const [showChords, setShowChords] = useState(false)
  const [font, setFont] = useState(() => Number(readLocal(FONT_KEY, '22')) || 22)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [copied, setCopied] = useState(false)

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
  const checks = data?.checks || {}
  const progress = data?.progress || {}
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

  async function run(id, fn) {
    setBusy(id); setError('')
    try { await fn() } catch (e) { console.error(e); setError('Could not save. Check the connection and try again.') }
    setBusy('')
  }
  const toggle = (key) => run(key, () => setMediaLiveCheck(token, key, !checks[key], operator.trim()))

  // Starting an item finishes whichever one was running, so one tap moves the service on.
  function startProgram(p) {
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

  async function resetPhase() {
    await run('reset', () => resetMediaLiveOps(token, { checks, progress }, `${phase}__`))
    setConfirmReset(false)
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
  const song = songs[Math.min(songIdx, songs.length - 1)] || null

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
          {/* Run sheet */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Run sheet</h2>
              {confirmReset ? (
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-amber-300">Clear every {phaseDef.label} tick and timing?</span>
                  <button type="button" onClick={resetPhase} disabled={busy === 'reset'} className="font-semibold text-amber-300 hover:text-amber-200">Clear</button>
                  <button type="button" onClick={() => setConfirmReset(false)} className="text-slate-400 hover:text-slate-200">Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
                  <RotateCcw className="w-3.5 h-3.5" />Reset {phaseDef.label}
                </button>
              )}
            </div>
            {programs.length === 0 && <p className="text-sm text-slate-400">No programme published yet.</p>}
            {programs.map((p, i) => {
              const prog = progress[`${phase}__${p.key}`] || {}
              const running = prog.start && !prog.end
              const took = prog.start ? (prog.end || now) - prog.start : 0
              const over = p.duration && took > p.duration * 60000
              const pBusy = busy === `${phase}__${p.key}`
              return (
                <div key={p.key} className={`rounded-xl border bg-slate-900 overflow-hidden ${running ? 'border-rose-500 ring-2 ring-rose-500/30' : prog.end ? 'border-emerald-700/60' : 'border-slate-800'}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${running ? 'bg-rose-600' : prog.end ? 'bg-emerald-700' : 'bg-slate-800 text-slate-300'}`}>
                      {prog.end ? <Check className="w-4 h-4" /> : i + 1}
                    </span>
                    <div className="min-w-[10rem] flex-1">
                      <p className="font-semibold truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {[planned[i], p.duration ? `${p.duration} min` : ''].filter(Boolean).join(' · ') || 'No timing set'}
                        {prog.start && <> · started {fmtClock(prog.start)}</>}
                        {prog.end && <> · ended {fmtClock(prog.end)}</>}
                      </p>
                    </div>
                    {prog.start && (
                      <span className={`text-sm font-bold tabular-nums ${over ? 'text-amber-300' : running ? 'text-rose-200' : 'text-emerald-300'}`}
                        title={p.duration ? `Planned ${p.duration} min` : undefined}>
                        {fmtElapsed(took)}{p.duration ? <span className="text-[11px] font-medium text-slate-400"> / {p.duration}:00</span> : null}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {running ? (
                        <button type="button" disabled={pBusy} onClick={() => finishProgram(p)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-500 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60">
                          <Square className="w-3 h-3" />Finish
                        </button>
                      ) : (
                        <button type="button" disabled={pBusy} onClick={() => startProgram(p)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-700 hover:bg-slate-600 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60">
                          <Play className="w-3 h-3" />{prog.start ? 'Restart' : 'Start'}
                        </button>
                      )}
                      {prog.start && !running && (
                        <button type="button" disabled={pBusy} onClick={() => clearProgram(p)} title="Clear timing"
                          className="rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800"><RotateCcw className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                  {p.elements.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {p.elements.map((el) => {
                        const k = checkKey(phase, p.key, el)
                        return <CheckRow key={k} label={el} check={checks[k]} busy={busy === k} doneLabel={phaseDef.cueDone} onToggle={() => toggle(k)} />
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </section>

          {/* Songs + lyrics */}
          <section className="space-y-3 lg:sticky lg:top-20">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Song schedule</h2>
            {songs.length === 0 ? (
              <p className="text-sm text-slate-400">No songs scheduled by Worship yet.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {songs.map((s, i) => {
                    const k = checkKey(phase, s.key)
                    return (
                      <div key={s.key} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${i === songIdx ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-900'}`}>
                        <button type="button" onClick={() => setSongIdx(i)} className="flex-1 min-w-0 flex items-center gap-2 text-left px-1">
                          <Music2 className="w-4 h-4 text-indigo-300 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold truncate">{i + 1}. {s.title}</span>
                            <span className="block text-[11px] text-slate-400 truncate">{[s.singer, s.musicKey && `Key ${s.musicKey}`].filter(Boolean).join(' · ') || ' '}</span>
                          </span>
                        </button>
                        <button type="button" disabled={busy === k} onClick={() => toggle(k)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border shrink-0 ${checks[k] ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                          title={checks[k] ? `${fmtClock(checks[k].at)}${checks[k].by ? ` · ${checks[k].by}` : ''}` : 'Not done'}>
                          {checks[k] && <Check className="w-3 h-3" strokeWidth={3} />}{checks[k] ? phaseDef.songDone : 'Not done'}
                        </button>
                      </div>
                    )
                  })}
                </div>

                {song && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900">
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-800">
                      <p className="font-semibold flex-1 min-w-0 truncate">{song.title}{song.musicKey ? <span className="text-slate-400 font-normal"> · Key {song.musicKey}</span> : null}</p>
                      <button type="button" onClick={() => setShowChords((v) => !v)}
                        className={`rounded-md px-2 py-1 text-xs font-semibold border ${showChords ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-slate-700 text-slate-300'}`}>Chords</button>
                      <span className="inline-flex items-center rounded-md border border-slate-700">
                        <button type="button" aria-label="Smaller text" onClick={() => { const f = Math.max(14, font - 2); setFont(f); writeLocal(FONT_KEY, String(f)) }} className="p-1.5 text-slate-300 hover:text-white"><Minus className="w-3.5 h-3.5" /></button>
                        <button type="button" aria-label="Larger text" onClick={() => { const f = Math.min(44, font + 2); setFont(f); writeLocal(FONT_KEY, String(f)) }} className="p-1.5 text-slate-300 hover:text-white"><Plus className="w-3.5 h-3.5" /></button>
                      </span>
                      <button type="button" onClick={async () => { if (await copyText(songPlainText(song))) { setCopied(true); setTimeout(() => setCopied(false), 2000) } }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border border-slate-700 text-slate-300 hover:text-white">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy lyrics'}
                      </button>
                    </div>
                    <div className="px-4 py-4 max-h-[70vh] overflow-y-auto space-y-5">
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
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
