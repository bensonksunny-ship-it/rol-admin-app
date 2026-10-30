import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Crosshair, ListMusic, Minus, Music2, Plus, Radio, RotateCcw, UserRound, Users, Wifi, WifiOff, X } from 'lucide-react'
import { setWorshipLiveCheck, setWorshipLiveNow, resetWorshipLiveChecks } from '../../services/firestore'
import { chordLine, scheduleWindows, dateAtMinutes, plannedStarts, fmtClock, fmtElapsed } from '../../utils/mediaLive'
import {
  WORSHIP_LIVE_PHASES, WORSHIP_VIEW_ROLES, viewRoleById, sectionPart, songIsTagged, INTENSITY,
  transposeChord, transposeKey, prefersFlats, checkInKey, readyKey,
} from '../../utils/worshipLive'

const LS = { phase: 'worshipLive:phase', me: 'worshipLive:me', role: 'worshipLive:role', font: 'worshipLive:font', chords: 'worshipLive:chords' }
function readLocal(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function writeLocal(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* private window */ }
}

// Saturday before a Sunday counts as that Sunday's rehearsal day.
const defaultPhase = () => (new Date().getDay() === 0 ? 'live' : 'reh')

function displayDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number)
  return y ? format(new Date(y, m - 1, d), 'EEEE, d MMMM yyyy') : ''
}

const LEVEL_TONE = ['', 'bg-sky-500/20 text-sky-200', 'bg-amber-500/20 text-amber-200', 'bg-rose-500/25 text-rose-200']

/** "Who are you?" — this Sunday's team, or just a role. Personal: stored on this device only. */
function WhoPicker({ team, meKey, roleId, onPick, onClose }) {
  return (
    <div className="rounded-2xl border border-indigo-500/40 bg-slate-900 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-semibold">Who are you?</p>
          <p className="text-xs text-slate-400">Your screen shows your part: lyrics for singers, chords for musicians. Saved on this device only.</p>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-4 h-4" /></button>}
      </div>
      {team.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Serving this Sunday</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {team.map((m) => (
              <button key={m.key} type="button" onClick={() => onPick(m.key, m.view)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left ${meKey === m.key ? 'border-indigo-400 bg-indigo-500/15' : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'}`}>
                <UserRound className="w-4 h-4 text-indigo-300 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{m.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{m.role}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{team.length ? 'Not on the list? Pick your part' : 'Pick your part'}</p>
        <div className="flex flex-wrap gap-1.5">
          {WORSHIP_VIEW_ROLES.map((r) => (
            <button key={r.id} type="button" onClick={() => onPick(null, r.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!meKey && roleId === r.id ? 'border-indigo-400 bg-indigo-500/15 text-indigo-100' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The Worship Control Center screen — the public link page and the in-app tab both
 * render this. Everyone picks who they are (or just a part) and gets their view:
 * singers big lyrics, musicians chords + their tagged parts. Viewers can check in,
 * mark songs ready (rehearsal), and change their own display; leaders (`canLead`)
 * also move the song + section every screen follows, and reset check-ins.
 */
export default function WorshipLiveView({ data, token, canLead = false, actorName = '', defaultMeName = '', headerExtra = null }) {
  const [phase, setPhaseState] = useState(() => readLocal(LS.phase, '') || defaultPhase())
  const [meKeyPref, setMeKeyPref] = useState(() => readLocal(LS.me, ''))
  const [roleId, setRoleId] = useState(() => readLocal(LS.role, ''))
  const [picker, setPicker] = useState(false)
  const [font, setFont] = useState(() => Number(readLocal(LS.font, '22')) || 22)
  const [chordsPref, setChordsPref] = useState(() => readLocal(LS.chords, '')) // '' = by role, '1' / '0'
  const [selSong, setSelSong] = useState(null)
  const [follow, setFollow] = useState(true)
  const [transpose, setTranspose] = useState({}) // songKey → semitones (this screen only)
  const [showProgram, setShowProgram] = useState(false)
  const [showTeam, setShowTeam] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [online, setOnline] = useState(() => navigator.onLine)
  const sectionRefs = useRef({})

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  const songs = useMemo(() => data?.songs || [], [data])
  const team = useMemo(() => data?.team || [], [data])
  const programs = useMemo(() => data?.programs || [], [data])
  const checks = data?.checks || {}
  const live = data?.now || null

  // Me: the saved pick if it's on this Sunday's team, else the signed-in user's own row.
  const me = team.find((m) => m.key === meKeyPref)
    || (defaultMeName ? team.find((m) => m.name.trim().toLowerCase() === defaultMeName.trim().toLowerCase()) : null)
    || null
  const role = viewRoleById(roleId) || (me ? viewRoleById(me.view) : null)
  const showChords = chordsPref ? chordsPref === '1' : role?.kind !== 'vocal'
  const showPicker = picker || !role

  function setPhase(id) { setPhaseState(id); writeLocal(LS.phase, id); setConfirmReset(false) }
  function pick(memberKey, view) {
    setMeKeyPref(memberKey || ''); writeLocal(LS.me, memberKey || null)
    setRoleId(view); writeLocal(LS.role, view)
    setChordsPref(''); writeLocal(LS.chords, null)
    setPicker(false)
  }
  function changeFont(d) { const f = Math.min(44, Math.max(14, font + d)); setFont(f); writeLocal(LS.font, String(f)) }
  function toggleChords() { const v = showChords ? '0' : '1'; setChordsPref(v); writeLocal(LS.chords, v) }

  async function run(id, fn) {
    setBusy(id); setError('')
    try { await fn() } catch (e) { console.error(e); setError('Could not save. Check the connection and try again.') }
    setBusy('')
  }
  const toggleCheck = (key, by) => run(key, () => setWorshipLiveCheck(token, key, !checks[key], by))
  const goLive = (songKey, section) => { setFollow(true); return run('now', () => setWorshipLiveNow(token, { songKey, section }, actorName)) }

  // Which song is on screen: the leader's live song while following, else the one tapped.
  const liveSong = live ? songs.find((s) => s.key === live.songKey) : null
  const curKey = (follow && liveSong ? liveSong.key : selSong) || songs[0]?.key
  const song = songs.find((s) => s.key === curKey) || null
  const songIdx = songs.findIndex((s) => s.key === curKey)

  // Follow the leader: bring the live section into view when it changes.
  useEffect(() => {
    if (!follow || !live) return
    sectionRefs.current[`${live.songKey}__${live.section}`]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [follow, live?.songKey, live?.section, live?.at]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leader: step through sections, crossing into the next / previous song.
  function step(dir) {
    if (!songs.length) return
    let si = live ? songs.findIndex((s) => s.key === live.songKey) : -1
    let sec = live ? live.section : -1
    if (si < 0) { si = Math.max(0, songIdx); sec = dir > 0 ? -1 : 0 }
    sec += dir
    while (si >= 0 && si < songs.length) {
      const n = songs[si].sections.length || 1
      if (sec >= 0 && sec < n) return goLive(songs[si].key, sec)
      si += dir
      if (si < 0 || si >= songs.length) return undefined
      sec = dir > 0 ? 0 : (songs[si].sections.length || 1) - 1
    }
    return undefined
  }

  // Programme timing (Sunday Live): the shared run sheet from Sunday Ministry.
  const sched = useMemo(() => scheduleWindows(programs, data?.serviceStartTime), [programs, data?.serviceStartTime])
  const planned = useMemo(() => plannedStarts(programs, data?.serviceStartTime), [programs, data?.serviceStartTime])
  const clockStart = phase === 'live' && sched.hasClock && data?.sundayDate ? dateAtMinutes(data.sundayDate, sched.firstMin) : null
  const windows = sched.items.map((w) => (w && clockStart ? { start: clockStart + (w.startMin - sched.firstMin) * 60000, end: clockStart + (w.endMin - sched.firstMin) * 60000 } : null))
  const progIdx = windows.findIndex((w) => w && now >= w.start && now < w.end)
  const nextWorshipIdx = programs.findIndex((p, i) => p.worship && windows[i] && windows[i].start > now)

  const inKey = me ? checkInKey(phase, me.key) : ''
  const checkedIn = team.filter((m) => checks[checkInKey(phase, m.key)]).length
  const teamGroups = []
  for (const m of team) {
    const g = teamGroups.find((x) => x.role === m.role.replace(/ \d+$/, ''))
    if (g) g.members.push(m)
    else teamGroups.push({ role: m.role.replace(/ \d+$/, ''), members: [m] })
  }

  if (!data) return null
  const tagged = song ? songIsTagged(song) : false
  const semis = song ? (song.shift || 0) + (transpose[song.key] || 0) : 0
  const key = song ? transposeKey(song.musicKey, transpose[song.key] || 0) : ''
  const flats = prefersFlats(key)
  const readyCount = song ? team.filter((m) => checks[readyKey(phase, m.key, song.key)]).length : 0

  return (
    <div className={`text-slate-100 ${canLead && songs.length ? 'pb-20' : ''}`}>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-300 flex items-center justify-center shrink-0"><ListMusic className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-widest text-slate-400">Worship Control Center</p>
          <p className="font-semibold truncate">{displayDate(data.sundayDate)}</p>
        </div>
        <div className="flex rounded-xl bg-slate-800 p-1 w-full sm:w-auto order-last sm:order-none">
          {WORSHIP_LIVE_PHASES.map((p) => (
            <button key={p.id} type="button" onClick={() => setPhase(p.id)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold ${phase === p.id ? (p.id === 'live' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white') : 'text-slate-300 hover:text-white'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <span className={`inline-flex items-center gap-1 text-xs ${online ? 'text-emerald-300' : 'text-amber-300'}`}>
          {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}{online ? 'Live' : 'Offline'}
        </span>
        {headerExtra}
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 text-sm text-red-200">{error}</p>}

      {/* Me + check-in */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {role && (
          <button type="button" onClick={() => setPicker((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-slate-800 border border-slate-700 pl-2 pr-3 py-1.5 text-sm hover:border-slate-500">
            <UserRound className="w-4 h-4 text-indigo-300" />
            <span className="font-semibold">{me ? me.name : 'Me'}</span>
            <span className="text-slate-400">· {role.label}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
        {me && (
          <button type="button" disabled={busy === inKey} onClick={() => toggleCheck(inKey, me.name)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold border ${checks[inKey] ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-500'} disabled:opacity-60`}>
            <Check className="w-4 h-4" strokeWidth={3} />{checks[inKey] ? `Checked in · ${fmtClock(checks[inKey].at)}` : "I'm here"}
          </button>
        )}
        <button type="button" onClick={() => setShowTeam((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500">
          <Users className="w-4 h-4" />Team {checkedIn}/{team.length} here
        </button>
        <button type="button" onClick={() => setShowProgram((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500">
          <Radio className="w-4 h-4" />
          {phase === 'live' && progIdx >= 0 ? <>Service: <b className="text-white">{programs[progIdx].name}</b></> : 'Programme'}
          {phase === 'live' && nextWorshipIdx >= 0 && <span className="text-violet-200">· {programs[nextWorshipIdx].name} in {fmtElapsed(windows[nextWorshipIdx].start - now)}</span>}
        </button>
      </div>

      {showPicker && (
        <div className="mt-3">
          <WhoPicker team={team} meKey={me?.key || ''} roleId={roleId} onPick={pick} onClose={role ? () => setPicker(false) : null} />
        </div>
      )}

      {/* Team check-in */}
      {showTeam && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{WORSHIP_LIVE_PHASES.find((p) => p.id === phase)?.label} · check-in</p>
            {canLead && (confirmReset ? (
              <span className="flex items-center gap-3 text-xs">
                <span className="text-amber-300">Clear check-ins and ready marks?</span>
                <button type="button" disabled={busy === 'reset'} onClick={() => run('reset', () => resetWorshipLiveChecks(token, checks, phase)).then(() => setConfirmReset(false))} className="font-semibold text-amber-300">Clear</button>
                <button type="button" onClick={() => setConfirmReset(false)} className="text-slate-400">Cancel</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"><RotateCcw className="w-3.5 h-3.5" />Reset</button>
            ))}
          </div>
          {team.length === 0 && <p className="text-sm text-slate-400">No one assigned for this Sunday yet (Worship → Assign).</p>}
          {teamGroups.map((g) => (
            <div key={g.role}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 mb-1">{g.role}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.members.map((m) => {
                  const k = checkInKey(phase, m.key)
                  const can = canLead || m.key === me?.key
                  return (
                    <button key={m.key} type="button" disabled={!can || busy === k} onClick={() => toggleCheck(k, canLead ? actorName : m.name)}
                      title={checks[k] ? `Checked in ${fmtClock(checks[k].at)}` : 'Not checked in'}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${checks[k] ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400'} ${can ? 'hover:border-slate-500' : 'cursor-default'}`}>
                      {checks[k] && <Check className="w-3 h-3" strokeWidth={3} />}{m.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Programme */}
      {showProgram && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="text-sm font-semibold mb-2">Service programme</p>
          {programs.length === 0 && <p className="text-sm text-slate-400">Sunday Ministry hasn't sent the programme yet.</p>}
          <ol className="space-y-1">
            {programs.map((p, i) => {
              const w = windows[i]
              const isNow = i === progIdx
              const done = w && now >= w.end
              return (
                <li key={p.key} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${isNow ? 'bg-rose-500/15 border border-rose-500/40' : p.worship ? 'bg-violet-500/10' : ''} ${done ? 'opacity-50' : ''}`}>
                  <span className="w-5 text-right text-xs text-slate-500 tabular-nums">{i + 1}</span>
                  <span className={`flex-1 min-w-0 truncate ${p.worship ? 'font-semibold text-violet-100' : ''}`}>{p.name}</span>
                  {isNow && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-600">Now</span>}
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{planned[i] || (p.duration ? `${p.duration} min` : '')}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* Now live */}
      {live && liveSong && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
          <span className="text-sm min-w-0 flex-1 truncate">
            <b>Now:</b> {liveSong.title}{liveSong.sections[live.section] ? ` — ${liveSong.sections[live.section].name}` : ''}
          </span>
          {!follow ? (
            <button type="button" onClick={() => { setFollow(true); setSelSong(null) }} className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold"><Crosshair className="w-3.5 h-3.5" />Follow</button>
          ) : <span className="text-[11px] text-rose-200">Following</span>}
        </div>
      )}

      {/* Song chips */}
      {songs.length > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {songs.map((s, i) => (
            <button key={s.key} type="button" onClick={() => { setSelSong(s.key); setFollow(live?.songKey === s.key) }}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold ${s.key === curKey ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>
              {live?.songKey === s.key && <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5 align-middle" />}
              {i + 1}. {s.title}
            </button>
          ))}
        </div>
      )}
      {songs.length === 0 && <p className="mt-6 text-center text-sm text-slate-400">No songs scheduled for this Sunday yet.</p>}

      {/* Song */}
      {song && role && (
        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Music2 className="w-5 h-5 text-indigo-300 shrink-0" />
            <div className="min-w-[10rem] flex-1">
              <p className="text-lg font-bold leading-tight">{song.title}</p>
              <p className="text-xs text-slate-400">{[key && `Key ${key}`, song.tempo && `${song.tempo} BPM`, song.leaders.length && `${song.leadRole}: ${song.leaders.join(', ')}`].filter(Boolean).join(' · ')}</p>
            </div>
            {/* Personal display controls (this screen only) */}
            {role.kind !== 'vocal' || showChords ? (
              <span className="inline-flex items-center rounded-lg border border-slate-700" title="Transpose (this screen only)">
                <button type="button" aria-label="Transpose down" onClick={() => setTranspose((t) => ({ ...t, [song.key]: (t[song.key] || 0) - 1 }))} className="p-1.5 text-slate-300 hover:text-white"><Minus className="w-3.5 h-3.5" /></button>
                <span className="px-1 text-xs font-semibold tabular-nums">{transpose[song.key] ? (transpose[song.key] > 0 ? `+${transpose[song.key]}` : transpose[song.key]) : 'Key'}</span>
                <button type="button" aria-label="Transpose up" onClick={() => setTranspose((t) => ({ ...t, [song.key]: (t[song.key] || 0) + 1 }))} className="p-1.5 text-slate-300 hover:text-white"><Plus className="w-3.5 h-3.5" /></button>
              </span>
            ) : null}
            <button type="button" onClick={toggleChords}
              className={`rounded-lg px-2 py-1.5 text-xs font-semibold border ${showChords ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-slate-700 text-slate-300'}`}>Chords</button>
            <span className="inline-flex items-center rounded-lg border border-slate-700">
              <button type="button" aria-label="Smaller text" onClick={() => changeFont(-2)} className="p-1.5 text-slate-300 hover:text-white"><Minus className="w-3.5 h-3.5" /></button>
              <span className="text-xs text-slate-400">Aa</span>
              <button type="button" aria-label="Larger text" onClick={() => changeFont(2)} className="p-1.5 text-slate-300 hover:text-white"><Plus className="w-3.5 h-3.5" /></button>
            </span>
          </div>

          {/* Rehearsal readiness */}
          {phase === 'reh' && (me || canLead) && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950/40">
              {me && (() => {
                const k = readyKey(phase, me.key, song.key)
                return (
                  <button type="button" disabled={busy === k} onClick={() => toggleCheck(k, me.name)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold border ${checks[k] ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'border-slate-600 text-slate-200 hover:border-slate-400'} disabled:opacity-60`}>
                    <Check className="w-4 h-4" strokeWidth={3} />{checks[k] ? 'My part is ready' : 'Mark my part ready'}
                  </button>
                )
              })()}
              <span className="text-xs text-slate-400" title={team.filter((m) => !checks[readyKey(phase, m.key, song.key)]).map((m) => m.name).join(', ') || 'Everyone ready'}>
                {readyCount}/{team.length} ready
                {canLead && readyCount < team.length && team.length > 0 && (
                  <span className="text-slate-500"> · waiting: {team.filter((m) => !checks[readyKey(phase, m.key, song.key)]).map((m) => m.name).join(', ')}</span>
                )}
              </span>
            </div>
          )}

          <div className="px-4 py-4 space-y-4">
            {song.sections.length === 0 && <p className="text-sm text-slate-400">No lyrics or chords saved for this song in the Song Builder yet.</p>}
            {song.sections.map((sec, si) => {
              const part = sectionPart(sec, role)
              const dim = tagged && role.inst && !part.mine
              const isLive = live?.songKey === song.key && live.section === si
              return (
                <div key={si} ref={(el) => { sectionRefs.current[`${song.key}__${si}`] = el }}
                  className={`rounded-xl border px-3 py-2.5 transition ${isLive ? 'border-rose-500 bg-rose-500/5' : 'border-transparent'} ${dim ? 'opacity-40' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">{sec.name}</p>
                    {sec.lead && <span className="text-[10px] rounded bg-slate-800 text-slate-300 px-1.5 py-0.5">Lead: {sec.lead}</span>}
                    {tagged && role.inst && part.mine && (
                      <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${part.level ? LEVEL_TONE[part.level] : 'bg-emerald-500/20 text-emerald-200'}`}>
                        {part.lead ? 'You lead' : 'Your part'}{part.level ? ` · ${INTENSITY[part.level]}` : ''}
                      </span>
                    )}
                    {dim && <span className="text-[10px] text-slate-400">Not your part</span>}
                    {isLive && <span className="text-[10px] font-bold uppercase rounded bg-rose-600 px-1.5 py-0.5">Live</span>}
                    {canLead && !isLive && (
                      <button type="button" disabled={busy === 'now'} onClick={() => goLive(song.key, si)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md border border-rose-500/50 px-2 py-0.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/15">
                        <Radio className="w-3 h-3" />Go live
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: showChords ? font * 0.75 : font, lineHeight: 1.35 }}>
                    {sec.lines.map((l, li) => {
                      const lvl = role.inst ? Math.max(0, ...role.inst.map((k) => l.parts?.[k] || 0)) : 0
                      const chords = l.chords.map((c) => ({ ...c, chord: transposeChord(c.chord, semis, flats) }))
                      if (!showChords && !l.lyrics.trim()) return null
                      return (
                        <div key={li} className={`relative ${lvl ? 'pl-3' : ''}`}>
                          {lvl > 0 && <span className={`absolute left-0 top-1 bottom-1 w-1 rounded-full ${lvl === 3 ? 'bg-rose-400' : lvl === 2 ? 'bg-amber-400' : 'bg-sky-400'}`} title={`Your part · ${INTENSITY[lvl]}`} />}
                          {showChords && chords.length > 0 && (
                            <pre className="font-mono font-bold text-amber-300 whitespace-pre m-0 overflow-x-auto">{chordLine(chords, l.lyrics)}</pre>
                          )}
                          {showChords
                            ? <pre className="font-mono whitespace-pre-wrap m-0">{l.lyrics || ' '}</pre>
                            : <p className="m-0">{l.lyrics}</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {songIdx >= 0 && songs.length > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 text-sm">
              <button type="button" disabled={songIdx === 0} onClick={() => { setSelSong(songs[songIdx - 1].key); setFollow(false) }} className="inline-flex items-center gap-1 text-slate-300 hover:text-white disabled:opacity-30"><ChevronLeft className="w-4 h-4" />Previous song</button>
              <button type="button" disabled={songIdx === songs.length - 1} onClick={() => { setSelSong(songs[songIdx + 1].key); setFollow(false) }} className="inline-flex items-center gap-1 text-slate-300 hover:text-white disabled:opacity-30">Next song<ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}

      {/* Leader control bar */}
      {canLead && songs.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur border-t border-slate-800">
          <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 hidden sm:inline">Leader</span>
            <button type="button" disabled={busy === 'now'} onClick={() => step(-1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:border-slate-500 disabled:opacity-50"><ChevronLeft className="w-4 h-4" />Back</button>
            <span className="flex-1 min-w-0 text-center text-sm truncate">
              {liveSong ? <><b>{liveSong.title}</b>{liveSong.sections[live.section] ? ` — ${liveSong.sections[live.section].name}` : ''}</> : <span className="text-slate-400">Nothing live — tap Next or “Go live” on a section</span>}
            </span>
            {live && <button type="button" disabled={busy === 'now'} onClick={() => run('now', () => setWorshipLiveNow(token, null, actorName))} className="rounded-lg px-2 py-2 text-xs text-slate-400 hover:text-white">Clear</button>}
            <button type="button" disabled={busy === 'now'} onClick={() => step(1)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-2 text-sm font-semibold disabled:opacity-50">Next<ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}
