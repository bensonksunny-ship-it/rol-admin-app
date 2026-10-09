import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  subscribeApplicationsByStatus, getMemberProfile, subscribeMembershipPipelineEntries,
  getCellGroups, getCellGroupMembers,
} from '../../services/firestore'
import { hasMembershipPipeline, resolveMembershipStages, currentStage } from '../../utils/membershipPipeline'
import { findPcsCellMember } from '../../utils/pcsEngagement'
import { getMemberDisplayName } from '../../utils/displayName'
import MembershipPipelineTracker from './MembershipPipelineTracker'

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
export default function MembershipPipelineWidget({ canCaring, canPastor, by }) {
  const navigate = useNavigate()
  const [pcsEntries, setPcsEntries] = useState([])
  const [cellGroups, setCellGroups] = useState([])
  const [allCellMembers, setAllCellMembers] = useState([])
  const [apps, setApps] = useState([])
  const [profiles, setProfiles] = useState({}) // visitorId → member profile
  const [showDone, setShowDone] = useState(false)

  useEffect(() => subscribeApplicationsByStatus('membership', ['pending', 'submitted', 'info_requested', 'approved', 'rejected'], setApps, () => setApps([])), [])
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-800 flex-1">Membership Onboarding Pipeline</p>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${openCount ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{openCount} in progress</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 text-center">
          No one in the membership process. Start it from a PCS profile with “+ Initiate Membership Process”.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map(({ e, cg, application, stages }) => (
            <li key={e.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onOpenProfile(e)} className="text-sm font-semibold text-slate-800 hover:text-indigo-700 hover:underline truncate">
                  {getMemberDisplayName(e)}
                </button>
                <span className="text-xs text-slate-400 truncate">{cg ? cg.cellName : 'No cell group'}</span>
              </div>
              <MembershipPipelineTracker
                compact entry={e} stages={stages} application={application} cellLeaderName={cg?.leader || ''}
                canCaring={canCaring} canPastor={canPastor} by={by}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
