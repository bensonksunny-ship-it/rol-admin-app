import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import {
  subscribeApplicationsByStatus, getMemberProfile, subscribeMembershipPipelineEntries,
  getCellGroups, getCellGroupMembers,
} from '../../services/firestore'
import { hasMembershipPipeline, resolveMembershipStages, currentStage } from '../../utils/membershipPipeline'
import { findPcsCellMember } from '../../utils/pcsEngagement'
import { getMemberDisplayName } from '../../utils/displayName'
import MembershipPipelineTracker from './MembershipPipelineTracker'
import ApplicationMasterDocumentModal from './ApplicationMasterDocumentModal'
import { scheduleSummary, scheduleWhere } from '../../utils/meetingSchedule'
import { RIBBON_BAR } from '../../constants/ribbon'

/** The one status worth surfacing on a collapsed row (most urgent first), or null. */
function priorityBadge(entry, application, cur) {
  const mp = entry.membershipPipeline || {}
  if (application?.status === 'revision_requested') return { label: 'Returned for revisions', cls: 'bg-orange-100 text-orange-800 border-orange-200' }
  if (application?.status === 'declaration_requested') return { label: 'Declaration requested', cls: 'bg-orange-100 text-orange-800 border-orange-200' }
  if (cur?.key === 'verification' && application?.status === 'submitted' && application.revisionResponse?.submittedAt) return { label: 'Revisions resubmitted', cls: 'bg-sky-100 text-sky-800 border-sky-200' }
  if (cur?.key === 'cellLeaderApproval' && mp.cellLeaderRequest?.status === 'Requested') return { label: 'Cell Leader Approval Requested', cls: 'bg-sky-100 text-sky-800 border-sky-200' }
  if (cur?.key === 'membershipInterview' && mp.interview?.status === 'Declined') return { label: 'Interview Declined', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (cur?.key === 'membershipInterview' && mp.interview?.status === 'Requested') return { label: 'Interview Requested', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
  if (cur?.key === 'membershipInterview' && mp.interview?.status === 'Accepted') return { label: 'Interview Accepted', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  return null
}

const fmtDateTime = (v) => {
  const d = v ? new Date(v) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}
const TONES = {
  green: 'bg-emerald-600 text-white',
  amber: 'bg-amber-50 text-amber-900 border border-amber-200',
  sky: 'bg-sky-600 text-white',
  orange: 'bg-orange-50 text-orange-900 border border-orange-300',
}

/** Card for the current stage (accordion level 1): { tone, title, detail }. */
function stageSummaryCard(entry, application, cur) {
  const mp = entry.membershipPipeline || {}
  if (!cur) return { tone: 'green', title: '✔ All 8 stages complete', detail: entry.membershipNumber ? `Membership No. ${entry.membershipNumber}` : '' }
  const where = (sch) => [scheduleSummary(sch), scheduleWhere(sch)].filter(Boolean).join(' · ')
  if (application?.status === 'revision_requested') return { tone: 'orange', title: 'Returned to the applicant for revisions', detail: 'Waiting for them to resubmit.' }
  if (application?.status === 'declaration_requested') return { tone: 'orange', title: 'Baptism self-declaration requested', detail: 'Waiting for the applicant to sign.' }
  if (cur.key === 'cellLeaderApproval') {
    const req = mp.cellLeaderRequest
    const call = mp.cellLeaderVerification?.scheduledCall
    if (call?.at) return { tone: 'sky', title: `📞 ${req?.cellLeaderName || 'Cell leader'} scheduled the call`, detail: where(call) }
    if (req?.status === 'Requested') return { tone: 'sky', title: `Sent to ${req.cellLeaderName || 'the cell leader'}`, detail: 'Waiting for them to accept and schedule the call.' }
  }
  if (cur.key === 'membershipInterview') {
    const iv = mp.interview || {}
    const sch = mp.deaconInterview?.scheduledInterview
    if (iv.status === 'Accepted') return { tone: 'green', title: `✔ ${iv.deaconName || 'The deacon'} accepted the interview`, detail: sch?.at ? where(sch) : fmtDateTime(iv.scheduledAt) }
    if (iv.status === 'Requested') return { tone: 'amber', title: `Waiting for ${iv.deaconName || 'the deacon'} to accept`, detail: fmtDateTime(iv.scheduledAt) }
    if (iv.status === 'Declined') return { tone: 'orange', title: `${iv.deaconName || 'The deacon'} declined`, detail: iv.responseNote ? `"${iv.responseNote}"` : 'Assign another deacon.' }
    if (iv.status === 'Follow-up Required') return { tone: 'orange', title: 'Interview needs a follow-up', detail: iv.deaconRemarks || '' }
  }
  return { tone: 'amber', title: `Stage ${cur.n}: ${cur.label}`, detail: cur.detail || '' }
}

// Row click cycles: one line → current-stage card → full tracker → one line.
const NEXT_LEVEL = { collapsed: 'summary', summary: 'full', full: 'collapsed' }

// Whole-widget open state (level 0 ribbon ↔ level 1 list) — a per-viewer
// convenience, so browser storage is fine; unavailable storage just means collapsed.
const SECTION_KEY = 'rol.membershipPipeline.open'
const readSectionOpen = () => { try { return localStorage.getItem(SECTION_KEY) === '1' } catch { return false } }
const writeSectionOpen = (v) => { try { localStorage.setItem(SECTION_KEY, v ? '1' : '0') } catch { /* storage blocked */ } }

const isBaptised = (p) => String(p?.baptised || '').toLowerCase() === 'yes' || !!(p?.baptismDate || p?.baptismChurch || p?.baptismPlace)

/**
 * "Membership Onboarding Pipeline" on My Workspace (Caring staff, Founder, Senior
 * Pastor; Cell Directors read-only): everyone with a membership pipeline (started
 * from their PCS profile), each with the 8-stage progress line, "Stage N of 8: …
 * Pending" and the one-click action for their current stage.
 *
 * Self-contained and live: the candidates come from one shared onSnapshot feed
 * (subscribeMembershipPipelineEntries), so a stage advanced on a PCS profile or
 * on someone else's workspace appears here at once. Stages 1–3 are read live:
 * cell roster, baptism on their profile, membership application submitted.
 */
export default function MembershipPipelineWidget({ canCaring, canPastor, canFirstLady = false, by }) {
  const navigate = useNavigate()
  const [pcsEntries, setPcsEntries] = useState([])
  const [cellGroups, setCellGroups] = useState([])
  const [allCellMembers, setAllCellMembers] = useState([])
  const [apps, setApps] = useState([])
  const [profiles, setProfiles] = useState({}) // visitorId → member profile
  const [showDone, setShowDone] = useState(false)
  // Each row: 'collapsed' | 'summary' | 'full' (see NEXT_LEVEL); absent = collapsed.
  const [expansion, setExpansion] = useState({})
  const [masterDocId, setMasterDocId] = useState(null) // PCS id whose Full Application Record is open
  // Level 0: the whole widget as one blue ribbon; level 1: the candidate list;
  // level 2: a row's own summary → full tracker (levelOf / toggleRow below).
  const [sectionOpen, setSectionOpenState] = useState(readSectionOpen)
  const setSectionOpen = (v) => { setSectionOpenState(v); writeSectionOpen(v) }
  const levelOf = (id) => expansion[id] || 'collapsed'
  const setLevel = (id, level) => setExpansion((prev) => ({ ...prev, [id]: level }))
  const toggleRow = (id) => setLevel(id, NEXT_LEVEL[levelOf(id)])

  useEffect(() => subscribeApplicationsByStatus('membership', ['pending', 'submitted', 'info_requested', 'declaration_requested', 'revision_requested', 'approved', 'rejected'], setApps, () => setApps([])), [])
  useEffect(() => subscribeMembershipPipelineEntries(setPcsEntries, () => setPcsEntries([])), [])
  // Cell rosters for stage 1 (and the cell leader's name for stage 5).
  useEffect(() => {
    let cancelled = false
    getCellGroups('Cell').then((groups) => {
      if (cancelled) return
      setCellGroups(groups)
      return Promise.all(groups.map((g) => getCellGroupMembers(g.id).then((ms) => ms.map((m) => ({ ...m, cellId: g.id }))).catch(() => [])))
        .then((lists) => { if (!cancelled) setAllCellMembers(lists.flat()) })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const onOpenProfile = (e) => navigate(`/department/caring?tab=pcs&pcsSearch=${encodeURIComponent(e.name || '')}`)

  const candidates = useMemo(
    () => pcsEntries.filter((e) => hasMembershipPipeline(e) && (showDone || e.membershipPipeline.status !== 'completed')),
    [pcsEntries, showDone]
  )

  // Baptism lives on the member profile — fetch it only for candidates.
  const visitorKey = candidates.map((e) => e.visitorId).filter(Boolean).sort().join(',')
  useEffect(() => {
    const missing = candidates.map((e) => e.visitorId).filter((v) => v && !(v in profiles))
    if (!missing.length) return
    let cancelled = false
    Promise.all(missing.map((v) => getMemberProfile(v).catch(() => null))).then((list) => {
      if (cancelled) return
      setProfiles((prev) => ({ ...prev, ...Object.fromEntries(missing.map((v, i) => [v, list[i] || {}])) }))
    })
    return () => { cancelled = true }
  }, [visitorKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const latestApp = (entryId) => apps.filter((a) => a.pcsEntryId === entryId)
    .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))[0] || null

  const rows = candidates.map((e) => {
    const cm = findPcsCellMember(e, allCellMembers)
    const cg = cm ? cellGroups.find((g) => g.id === cm.cellId) : null
    const application = latestApp(e.id)
    const stages = resolveMembershipStages(e, { hasCell: !!cg, baptised: isBaptised(profiles[e.visitorId]), application })
    return { e, cg, application, stages, cur: currentStage(stages) }
  }).sort((a, b) => (a.cur?.n ?? 9) - (b.cur?.n ?? 9) || a.e.name.localeCompare(b.e.name))

  const openCount = pcsEntries.filter((e) => hasMembershipPipeline(e) && e.membershipPipeline.status !== 'completed').length

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${sectionOpen ? 'bg-white border-slate-200' : 'border-transparent'}`}>
      {/* Ribbon header — the whole widget when collapsed (level 0), the list's
          header when open. Same single-line ribbon shape as Upcoming Worship. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={sectionOpen}
        onClick={() => setSectionOpen(!sectionOpen)}
        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSectionOpen(!sectionOpen) } }}
        className={`${RIBBON_BAR} cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80`}
      >
        <span className="flex-1 min-w-0 text-sm font-bold truncate">Membership Onboarding Pipeline</span>
        <span className="flex-shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white">{openCount} in progress</span>
        {sectionOpen && (
          <label className="hidden sm:flex flex-shrink-0 items-center gap-1.5 text-xs text-white/90 cursor-pointer" onClick={(ev) => ev.stopPropagation()}>
            <input type="checkbox" checked={showDone} onChange={(ev) => setShowDone(ev.target.checked)} className="accent-white" /> Show completed
          </label>
        )}
        <ChevronDown size={18} aria-hidden="true" className={`flex-shrink-0 transition-transform duration-200 ${sectionOpen ? 'rotate-180' : ''}`} />
      </div>
      {/* Phones: the "Show completed" toggle sits under the ribbon. */}
      {sectionOpen && (
        <label className="sm:hidden flex items-center gap-1.5 px-4 pt-3 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={(ev) => setShowDone(ev.target.checked)} /> Show completed
        </label>
      )}
      {!sectionOpen ? null : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 text-center">
          No one in the membership process. Start it from a PCS profile with “+ Initiate Membership Process”.
        </p>
      ) : (
        <ul className="px-3 py-1">
          {rows.map(({ e, cg, application, stages, cur }) => {
            const level = levelOf(e.id)
            const open = level !== 'collapsed'
            const card = open ? stageSummaryCard(e, application, cur) : null
            const badge = priorityBadge(e, application, cur)
            return (
              <li key={e.id}
                className="bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl px-4 py-3 shadow-sm hover:shadow transition-all cursor-pointer my-2"
                onClick={() => toggleRow(e.id)}>
                {/* Collapsed summary: name + cell · mini progress + stage · priority badge · chevron */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 sm:w-[34%] flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm truncate">{getMemberDisplayName(e)}</span>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-normal truncate">{cg ? cg.cellName : 'No cell group'}</span>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex items-center gap-0.5 flex-shrink-0" aria-hidden="true">
                        {stages.map((s) => (
                          <span key={s.key} className={`w-1.5 h-1.5 rounded-full ${s.done ? 'bg-emerald-500' : cur?.key === s.key ? 'bg-amber-400 ring-2 ring-amber-100' : 'bg-slate-200'}`} />
                        ))}
                      </span>
                      <span className={`text-xs truncate ${cur ? 'text-slate-600' : 'text-emerald-700 font-semibold'}`}>
                        {cur ? `Stage ${cur.n} of 8 • ${cur.label} Pending` : 'All 8 stages complete'}
                      </span>
                    </div>
                    {badge && <span className={`self-start sm:self-auto text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.cls}`}>{badge.label}</span>}
                  </div>
                  <button type="button" aria-expanded={open}
                    aria-label={`${level === 'collapsed' ? 'Show summary for' : level === 'summary' ? 'Show full details for' : 'Collapse'} ${getMemberDisplayName(e)}`}
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100">
                    <ChevronDown size={18} className={`transition-transform duration-200 ${level === 'full' ? 'rotate-180' : level === 'summary' ? '-rotate-90' : ''}`} />
                  </button>
                </div>
                {/* Level 1: the current stage's card (a click on it moves to level 2). */}
                {card && (
                  <div className={`mt-3 rounded-xl px-4 py-3 flex items-center gap-3 min-w-0 rol-accordion-slide-open ${TONES[card.tone]}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold break-words">{card.title}</p>
                      {card.detail && <p className="text-xs opacity-90 break-words mt-0.5">{card.detail}</p>}
                    </div>
                    {level === 'summary' && <span className="flex-shrink-0 text-xs font-semibold underline underline-offset-2 opacity-90 whitespace-nowrap">Full details ▾</span>}
                  </div>
                )}
                {/* Level 2: full tracker. Clicks inside (incl. its portal modals,
                    which bubble through React) don't change the level. */}
                {level === 'full' && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-4 rol-accordion-slide-open cursor-default" onClick={(ev) => ev.stopPropagation()}>
                    <MembershipPipelineTracker
                      entry={e} stages={stages} application={application} cellLeaderName={cg?.leader || ''}
                      canCaring={canCaring} canPastor={canPastor} canFirstLady={canFirstLady} by={by}
                    />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <button type="button" onClick={() => setMasterDocId(e.id)} className="text-xs font-semibold text-indigo-700 hover:underline">
                        📄 Full Application Record →
                      </button>
                      <button type="button" onClick={() => onOpenProfile(e)} className="text-xs font-semibold text-indigo-700 hover:underline">
                        Open PCS profile →
                      </button>
                      <button type="button" onClick={() => setLevel(e.id, 'summary')} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-800">
                        Show less ▴
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {(() => {
        // Live: rebuilt from the onSnapshot feed, so stage add-ons appear while it is open.
        const r = masterDocId && rows.find((x) => x.e.id === masterDocId)
        return r ? <ApplicationMasterDocumentModal entry={r.e} application={r.application} cellName={r.cg?.cellName || ''} onClose={() => setMasterDocId(null)} /> : null
      })()}
    </div>
  )
}
