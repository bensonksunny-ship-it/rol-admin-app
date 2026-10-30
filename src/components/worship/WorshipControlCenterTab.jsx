import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Check, Copy, ExternalLink, Link2, Loader2, RefreshCw } from 'lucide-react'
import {
  ensureWorshipLiveToken,
  rotateWorshipLiveToken,
  publishWorshipLiveContent,
  subscribeWorshipLive,
  subscribeWorshipScheduleByDate,
  getWorshipSongs,
  subscribeProgramNotification,
  getSundayProgramDefault,
} from '../../services/firestore'
import { buildWorshipLiveContent, worshipLiveUrl } from '../../utils/worshipLive'
import WorshipLiveView from './WorshipLiveView'

function upcomingSunday() {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 0 : 7 - d.getDay()))
  return format(d, 'yyyy-MM-dd')
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

/**
 * Worship → Control Center. Signed-in members use it here; leaders (`canLead`) also
 * drive the live song + section. While it's open, the upcoming Sunday's songs, team
 * and programme are kept published to the team's public link (/worship-live/:token)
 * for members without a login.
 */
export default function WorshipControlCenterTab({ canLead, canManage, userProfile }) {
  const sundayDate = useMemo(() => upcomingSunday(), [])
  const by = userProfile?.email || ''
  const myName = userProfile?.name || userProfile?.displayName || ''
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [schedule, setSchedule] = useState(null)
  const [lib, setLib] = useState(null)
  const [notif, setNotif] = useState(undefined)
  const [defaults, setDefaults] = useState(null)
  const [data, setData] = useState(undefined)
  const [status, setStatus] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)

  useEffect(() => {
    ensureWorshipLiveToken(by).then(setToken).catch((e) => { console.error('ensureWorshipLiveToken', e); setError('Could not load the Control Center link.') })
  }, [by])
  useEffect(() => { getWorshipSongs().then(setLib).catch(() => setLib([])) }, [])
  useEffect(() => { getSundayProgramDefault().then(setDefaults).catch(() => setDefaults({ items: [], serviceStartTime: '' })) }, [])
  useEffect(() => subscribeWorshipScheduleByDate('Worship', sundayDate, setSchedule, () => setSchedule({ assignments: [] })), [sundayDate])
  useEffect(() => subscribeProgramNotification(sundayDate, setNotif), [sundayDate])
  useEffect(() => (token ? subscribeWorshipLive(token, setData, () => setData(null)) : undefined), [token])

  const content = useMemo(() => {
    if (!schedule || !lib || !defaults || notif === undefined) return null
    const tpl = (name) => defaults.items.find((i) => i.programName === name)
    const names = notif?.programs?.length ? notif.programs : defaults.items.map((i) => i.programName).filter(Boolean)
    const programs = names.map((name) => ({ name, duration: tpl(name)?.duration || 0, startTime: tpl(name)?.startTime || '' }))
    return buildWorshipLiveContent({ sundayDate, serviceStartTime: defaults.serviceStartTime, programs, assignments: schedule.assignments || [], lib })
  }, [schedule, lib, defaults, notif, sundayDate])

  // Debounced so a burst of schedule edits is one write.
  useEffect(() => {
    if (!token || !content) return
    const t = setTimeout(() => {
      setStatus('publishing')
      publishWorshipLiveContent(token, content, by)
        .then(() => setStatus('published'))
        .catch((e) => { console.error('publishWorshipLiveContent', e); setStatus(''); setError('Could not update the public link.') })
    }, 1200)
    return () => clearTimeout(t)
    // contentHash stands in for the whole content object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, content?.contentHash, content?.sundayDate, by])

  const url = token ? worshipLiveUrl(token) : ''

  async function rotate() {
    setError('')
    try { setToken(await rotateWorshipLiveToken(by)) } catch { setError('Could not create a new link.') }
    setConfirmRotate(false)
  }

  return (
    <div className="space-y-4">
      {/* Share link for members without a login */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><Link2 className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-800">Link for team members without a login</p>
            <p className="text-xs text-slate-500">View only: they pick who they are, check in, mark songs ready and see their own lyrics or chords. It follows the live song you set here.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly value={url || 'Preparing link…'} onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-mono text-slate-700 outline-none" />
          <button type="button" disabled={!url} onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 2000) } }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={url || undefined} target="_blank" rel="noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 ${url ? '' : 'pointer-events-none opacity-50'}`}>
            <ExternalLink className="w-3.5 h-3.5" />Open
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            {status === 'publishing' ? <><Loader2 className="w-3 h-3 animate-spin" />Updating…</> : status === 'published' ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Up to date with this Sunday's songs and team</> : 'Loading songs and team…'}
          </span>
          {canManage && (confirmRotate ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-amber-600">The old link will stop working.</span>
              <button type="button" onClick={rotate} className="font-semibold text-amber-600">Create new link</button>
              <button type="button" onClick={() => setConfirmRotate(false)}>Cancel</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmRotate(true)} className="inline-flex items-center gap-1 hover:text-slate-700"><RefreshCw className="w-3 h-3" />New link</button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="rounded-2xl bg-slate-950 p-4">
        {data === undefined && <div className="py-16 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>}
        {data === null && <p className="py-16 text-center text-sm text-slate-400">Preparing the Control Center…</p>}
        {data && <WorshipLiveView data={data} token={token} canLead={canLead} actorName={myName} defaultMeName={myName} />}
      </div>
    </div>
  )
}
