import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, MonitorPlay, RefreshCw } from 'lucide-react'
import {
  ensureMediaLiveToken,
  rotateMediaLiveToken,
  publishMediaLiveContent,
  subscribeWorshipScheduleByDate,
  getWorshipSongs,
  getMediaScheduleByDate,
} from '../../services/firestore'
import { sortByWorshipRole } from '../../utils/worshipRoleOrder'
import { buildMediaLiveContent, mediaLiveUrl, songSections } from '../../utils/mediaLive'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/**
 * Media → Upcoming Sunday: the team's permanent public Control Center link
 * (/media-live/:token, no login) for the media desk. While a Media member has this
 * page open, the upcoming Sunday's programme, Media's cues and Worship's songs are
 * kept published to it — a new Sunday starts the desk's checklist fresh.
 */
export default function MediaLiveLinkCard({ sundayDate, serviceStartTime, programs, canManage, by }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [schedule, setSchedule] = useState(null)
  const [lib, setLib] = useState(null)
  const [crew, setCrew] = useState(null)
  const [status, setStatus] = useState('') // '' | 'publishing' | 'published'
  const [publishedAt, setPublishedAt] = useState(null)
  const [copied, setCopied] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [rotating, setRotating] = useState(false)

  useEffect(() => {
    ensureMediaLiveToken(by).then(setToken).catch((e) => { console.error('MediaLiveLinkCard', e); setError('Could not load the public link.') })
  }, [by])
  useEffect(() => { getWorshipSongs().then(setLib).catch(() => setLib([])) }, [])
  // Media's crew for this Sunday (Assign tab), for the desk's attendance check-in.
  useEffect(() => {
    getMediaScheduleByDate(sundayDate)
      .then((sch) => setCrew((sch.assignments || [])
        .filter((a) => String(a.memberName || '').trim())
        .map((a) => ({ area: a.role || 'Crew', name: a.memberName.trim() }))))
      .catch(() => setCrew([]))
  }, [sundayDate])
  useEffect(() => subscribeWorshipScheduleByDate('Worship', sundayDate, setSchedule,
    () => setSchedule({ assignments: [] })), [sundayDate])

  const songs = useMemo(() => {
    if (!schedule || !lib) return null
    const out = []
    for (const a of sortByWorshipRole(schedule.assignments || [])) {
      if (!a.songId && !a.songName) continue
      const k = a.songId || `name:${a.songName}`
      if (out.some((s) => s.k === k)) continue
      const d = lib.find((s) => (a.songId && s.id === a.songId) || (!a.songId && s.title && s.title.trim() === String(a.songName || '').trim())) || null
      out.push({ k, title: a.songName || d?.title || '(untitled)', musicKey: a.key || d?.key || '', singer: a.memberName || '', sections: songSections(d) })
    }
    return out
  }, [schedule, lib])

  const content = useMemo(() => (songs && crew ? buildMediaLiveContent({ sundayDate, serviceStartTime, programs, songs, crew }) : null),
    [sundayDate, serviceStartTime, programs, songs, crew])

  // Debounced so a burst of live schedule updates is one write.
  useEffect(() => {
    if (!token || !content) return
    const t = setTimeout(() => {
      setStatus('publishing')
      publishMediaLiveContent(token, content, by)
        .then(() => { setStatus('published'); setPublishedAt(new Date()) })
        .catch((e) => { console.error('publishMediaLiveContent', e); setStatus(''); setError('Could not update the public page.') })
    }, 1200)
    return () => clearTimeout(t)
    // contentHash stands in for the whole content object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, content?.contentHash, content?.sundayDate, by])

  const url = token ? mediaLiveUrl(token) : ''

  async function rotate() {
    setRotating(true); setError('')
    try { setToken(await rotateMediaLiveToken(by)) } catch { setError('Could not create a new link.') }
    setRotating(false); setConfirmRotate(false)
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 text-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
          <MonitorPlay className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Media Control Center</p>
          <p className="text-xs text-slate-400">Public link for the media desk: lyrics, run sheet, crew check-in, rehearsal and live checklists. No login.</p>
        </div>
      </div>
      <div className="px-4 pb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly value={url || 'Preparing link…'} onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-mono text-slate-200 outline-none" />
          <button type="button" disabled={!url} onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 2000) } }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-semibold disabled:opacity-50">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={url || undefined} target="_blank" rel="noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs font-semibold ${url ? '' : 'pointer-events-none opacity-50'}`}>
            <ExternalLink className="w-3.5 h-3.5" />Open
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            {status === 'publishing'
              ? <><Loader2 className="w-3 h-3 animate-spin" />Updating the public page…</>
              : status === 'published'
                ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Up to date{publishedAt ? ` · ${publishedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</>
                : 'Loading songs and programme…'}
          </span>
          {canManage && (confirmRotate ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-amber-300">The old link will stop working.</span>
              <button type="button" disabled={rotating} onClick={rotate} className="font-semibold text-amber-300 hover:text-amber-200">{rotating ? 'Creating…' : 'Create new link'}</button>
              <button type="button" onClick={() => setConfirmRotate(false)} className="hover:text-slate-200">Cancel</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmRotate(true)} className="inline-flex items-center gap-1 hover:text-slate-200">
              <RefreshCw className="w-3 h-3" />New link
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
