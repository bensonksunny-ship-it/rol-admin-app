import { Fragment, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { dedupeProfiles } from '../../utils/pcsDedupe'
import {
  findPcsCellMember,
  normalizeEngagementType,
  isCellOnly,
  computeCellHealth,
  isSundayOnly,
  countConsecutiveCellAbsences,
  CELL_HEALTH_REPORT_COUNT,
  REMOVAL_ABSENCE_THRESHOLD,
  CELL_HEALTH_BADGE_CLS,
  engagementLabel,
  ENGAGEMENT_TYPES,
} from '../../utils/pcsEngagement'
import { deaconStatusOf, deaconSummary, canManageDeacons, logDeaconGuard } from '../../utils/deaconOffice'
import {
  getPerson,
  getDelightVisitorById,
  getMemberProfileWithContext,
  requestPCSDiscard,
  approvePCSDiscard,
  setPCSDeaconOffice,
  deactivatePCSEntry,
  createPCSRemovalNotice,
  dismissInactiveCellAlert,
  createTask,
  startMembershipPipeline,
  sendPCSFillInvitation,
  uploadMemberPhoto,
  updatePerson,
  addPerson,
  updatePCSEntry,
  updateDelightVisitor,
  updateCellMembersByVisitorId,
  updatePCSEntriesByVisitorId,
  updateDeptTeamMembersByVisitorId,
  updateWorshipTeamMembersByVisitorId,
  upsertMemberProfile,
  getMemberProfile,
  setParentLinkOnChild,
  addPCSEntry,
  getInactivePCSEntries,
  getMergedPCSEntries,
  unmergePCSEntry,
  getPCSEntries,
  updateTask,
  dismissPCSAddNotification,
  completePCSAddNotification,
  markPCSAddNotificationForwarded,
  addPCSFollowUp,
  getDelightVisitors,
} from '../../services/firestore'
import { logAction } from '../../utils/auditLog'
import { format } from 'date-fns'
import { isProfileAwayOn, isCurrentlyAway, awaySummary, awayReturnHistoryLabel, AWAY_BADGE_CLS } from '../../utils/awayStatus'
import { isRelocated, churchTillDate, RELOCATED_BADGE_CLS } from '../../utils/relocation'
import { getMemberDisplayName } from '../../utils/displayName'
import { formatShortDate, formatDisplayDate, calculateTenure, formatTimestampFull, isoToDMY } from '../../utils/date'
import DateInput from '../DateInput'
import SubmittedApplicationViewer from './SubmittedApplicationViewer'
import AppreciationSummaryModal from './AppreciationSummaryModal'
import DedicationApplicationModal from './DedicationApplicationModal'
import { canRevealSurpriseNames } from '../../constants/dedicationForm'
import { buildFamilyPrefill, childDisplayName, childAgeText } from '../../utils/familyDetails'
import { createPortal } from 'react-dom'
import MembershipApplicationModal from './MembershipApplicationModal'
import BaptismApplicationModal from './BaptismApplicationModal'
import MarriageApplicationModal from './MarriageApplicationModal'
import { Pencil, Download, CheckCircle2, Trash2, ChevronLeft } from 'lucide-react'
import { downloadPastoralClosureLetter } from '../../utils/pastoralClosureLetter'
import DeaconOfficeCard from './DeaconOfficeCard'
import { baptismCertificateEligibility, parentsLine, baptismRegNo, downloadBaptismCertificates, printBaptismCertificates } from '../../utils/baptismCertificate'
import BaptismEntryProgress from './BaptismEntryProgress'
import { hasMembershipPipeline, resolveMembershipStages } from '../../utils/membershipPipeline'
import MembershipPipelineTracker from './MembershipPipelineTracker'
import { MEMBERSHIP_DECISIONS } from '../../constants/membershipForm'
import { openMembershipCertificate } from '../../utils/openMembershipCertificate'
import { membershipCertificateData } from '../../utils/membershipCertificate'
import { openMembershipIdCard } from '../../utils/openMembershipIdCard'
import { APPLICATION_TYPE_KEYS, applicationStatus, APPLICATION_TYPES } from '../../utils/pastoralApplications'
import PcsAwayControl from './PcsAwayControl'
import ReferrerCombobox from './ReferrerCombobox'
import { rkClassGroupLabel } from '../../constants/riverKids'
import PcsDuplicatesModal from './PcsDuplicatesModal'
import { deriveIsFirstChurch, withIsFirstChurch, withMaritalStatus } from '../../utils/pcsForm'
import { VISITOR_START_YEAR } from '../../constants/visitors'

// PCS main view — search + filter chips. Chips are grouped ('cell' | 'status' | 'year')
// so selecting multiple within a group is OR'd (any match) while different groups are
// AND'd together (must satisfy every active group).
const PCS_FILTER_CHIPS = [
  { key: 'cell:jordan',      label: 'Jordan',        group: 'cell',   value: 'jordan' },
  { key: 'cell:bethany',     label: 'Bethany',       group: 'cell',   value: 'bethany' },
  { key: 'cell:olive',       label: 'Olive',         group: 'cell',   value: 'olive' },
  { key: 'status:notmember', label: 'Not a member',  group: 'status', value: 'notmember' },
  { key: 'status:leader',    label: 'Leader',        group: 'status', value: 'leader' },
  { key: 'status:deacon',    label: 'Deacons',       group: 'status', value: 'deacon' },
  { key: 'year:2026',        label: '2026',          group: 'year',   value: 2026 },
]

/**
 * Caring department's PCS tab (moved out of DepartmentHub). Data shared with the rest of
 * the hub (PCS entries, the expanded profile, cell groups, D-Light visitor modal…) is still
 * owned by DepartmentHub and passed in; state used only by this screen lives here.
 */
export default function PcsTab({
  allCellMembers,
  canEdit,
  cellGroups,
  cellReferralTasks,
  closePcsProfile,
  delightVisitors,
  isFounder,
  isSeniorPastor,
  isSeniorPastorName,
  loadingPCS,
  onPipelineChanged,
  pcsAddNotifications,
  pcsCaringEvents,
  pcsCellReferralTasks,
  pcsCellReportsByCellId,
  pcsEditingId,
  pcsEntries,
  pcsEntryApps,
  pcsExpandedContext,
  pcsExpandedForm,
  pcsExpandedId,
  pcsExpandedLoading,
  pcsExpandedProfile,
  pcsExpandedVisitor,
  pcsFormDirty,
  pcsFormerForRec,
  pcsInviteStatus,
  pcsIsMobile,
  pcsMembershipApp,
  pcsPhotoFile,
  pcsPhotoPreview,
  pcsProfileClickInsideRef,
  pcsSavedRef,
  pcsSearchQuery,
  pcsShowFormer,
  rkChildrenForPCS,
  SENIOR_PASTOR_FULL_TITLE,
  SENIOR_PASTOR_TITLE,
  setCellReferralTasks,
  setDelightVisitorForm,
  setDelightVisitorModalOpen,
  setEditingDelightVisitorId,
  setPcsAddNotifications,
  setPcsEditingId,
  setPcsEntries,
  setPcsExpandedContext,
  setPcsExpandedForm,
  setPcsExpandedId,
  setPcsExpandedLoading,
  setPcsExpandedProfile,
  setPcsExpandedVisitor,
  setPcsFormDirty,
  setPcsInviteStatus,
  setPcsPhotoFile,
  setPcsPhotoPreview,
  setPcsSearchQuery,
  setPcsShowFormer,
  sundayAttendanceWeeks,
  user,
  userProfile,
}) {
  const [pcsPickerOpen, setPcsPickerOpen] = useState(false)
  const [cellReferralOpen, setCellReferralOpen] = useState(false)
  const [removedFromCellOpen, setRemovedFromCellOpen] = useState(false)
  const [pcsExpandedSaving, setPcsExpandedSaving] = useState(false)
  const [pcsNotifiedIds, setPcsNotifiedIds] = useState(new Set())
  const [pcsNotifyingId, setPcsNotifyingId] = useState(null)
  const [pcsToast, setPcsToast] = useState(null)
  const [pcsActiveFilters, setPcsActiveFilters] = useState(() => new Set())
  const [pcsChildSearchOpenId, setPcsChildSearchOpenId] = useState(null)
  const [pcsSpouseFocused, setPcsSpouseFocused] = useState(false)
  // "Recommended for Removal" review list (10 consecutive Sunday AND cell absences, per Engagement Type)
  const [pcsRemovalView, setPcsRemovalView] = useState(false)
  const [pcsRemovalAction, setPcsRemovalAction] = useState(null) // { id, kind: 'away' | 'followup' }
  const [pcsFollowUpText, setPcsFollowUpText] = useState('')
  const [pcsFollowUpSaving, setPcsFollowUpSaving] = useState(false)
  // Discard Profile (wrong / duplicate record) — Founder-approved, see requestPCSDiscard
  const [pcsDiscardTarget, setPcsDiscardTarget] = useState(null)
  const [pcsDiscardReason, setPcsDiscardReason] = useState('')
  const [pcsDiscardSaving, setPcsDiscardSaving] = useState(false)
  const [pcsInactiveEntries, setPcsInactiveEntries] = useState([])
  const [pcsLoadingFormer, setPcsLoadingFormer] = useState(false)
  // Former → "Merged" list: profiles a duplicate merge archived, with Undo (Founder)
  const [pcsMergedEntries, setPcsMergedEntries] = useState([])
  const [pcsUnmergingId, setPcsUnmergingId] = useState(null)
  const [pcsUnmergeMsg, setPcsUnmergeMsg] = useState('')
  const [pcsInvitingId, setPcsInvitingId] = useState(null)
  const [pcsMenuOpenId, setPcsMenuOpenId] = useState(null)
  const [pcsPipelineStarting, setPcsPipelineStarting] = useState(false)
  const [cellReferralAdding, setCellReferralAdding] = useState(new Set())
  const [cellReferralRemoving, setCellReferralRemoving] = useState(new Set())
  const [pcsAddOpen, setPcsAddOpen] = useState(false)
  const [pcsAddAdding, setPcsAddAdding] = useState(new Set())
  const [pcsAddDismissing, setPcsAddDismissing] = useState(new Set())
  const [pcsAddForwarding, setPcsAddForwarding] = useState(new Set())
  // "Recommended to Add" — people not in PCS who attended 2+ gatherings recently.
  const [pcsRecOpen, setPcsRecOpen] = useState(false)
  const [pcsRecBusy, setPcsRecBusy] = useState(new Set())        // rec keys being added
  const [pcsBaptismOpenFor, setPcsBaptismOpenFor] = useState(null)
  const [pcsMembershipOpenFor, setPcsMembershipOpenFor] = useState(null) // PCS entry id whose Membership Application modal is open
  const [pcsDedicationOpenFor, setPcsDedicationOpenFor] = useState(null) // PCS entry id whose Baby Dedication Application modal is open
  const [pcsMarriageOpenFor, setPcsMarriageOpenFor] = useState(null) // PCS entry id whose Marriage Application modal is open
  const [pcsClosureLetterBusy, setPcsClosureLetterBusy] = useState(false)
  const [pcsCertBusy, setPcsCertBusy] = useState(false)
  const [pcsAppViewing, setPcsAppViewing] = useState(null) // { type, app }
  const [pcsDupesSnapshot, setPcsDupesSnapshot] = useState(null) // duplicate groups shown in the merge modal
  const [pcsAppreciationOpenFor, setPcsAppreciationOpenFor] = useState(null) // PCS entry id whose Appreciation Summary is open  // PCS entry id whose Baptism Application modal is open

  // One card per person: duplicate entries (same visitor, or same name + phone /
  // email) collapse onto the most complete one — see utils/pcsDedupe.js.
  const { list: pcsVisibleEntries, hiddenByMaster: pcsHiddenDupes } = dedupeProfiles(pcsEntries)
  const pcsDuplicateGroups = [...pcsHiddenDupes.entries()].map(([masterId, dupes]) => ({ master: pcsEntries.find(e => e.id === masterId), dupes }))
  const pcsYears = [...new Set(pcsVisibleEntries.map(e => e.year).filter(Boolean))].sort((a, b) => b - a)
  const noYearEntries = pcsVisibleEntries.filter(e => !e.year)
  const grouped = [
    ...pcsYears.map(yr => ({ year: yr, entries: pcsVisibleEntries.filter(e => e.year === yr) })),
    ...(noYearEntries.length ? [{ year: null, entries: noYearEntries }] : []),
  ]

  // ── Search + filter chips — matches name (search) and every active filter
  // group (cell / status / year), OR'd within a group, AND'd across groups.
  // The person's active cell group — the single lookup shared by the list card,
  // the Cell filter chips and the profile's "Cell Group" line (visitorId first,
  // then phone; see findPcsCellMember). Cell membership lives on the cell
  // roster, not on the PCS doc, so there is no stored field to fall out of sync.
  const getEntryCellGroup = (entry) => {
    const cm = findPcsCellMember(entry, allCellMembers)
    return cm ? (cellGroups.find(g => g.id === cm.cellId) || { id: cm.cellId, cellName: '' }) : null
  }
  const getEntryCellName = (entry) => (getEntryCellGroup(entry)?.cellName || '').trim().toLowerCase()
  const activePcsChips = PCS_FILTER_CHIPS.filter(c => pcsActiveFilters.has(c.key))
  const pcsChipsByGroup = activePcsChips.reduce((acc, c) => {
    (acc[c.group] ||= []).push(c)
    return acc
  }, {})
  const pcsSearchTrimmed = pcsSearchQuery.trim().toLowerCase()
  const matchesPcsFilters = (entry) => {
    if (pcsSearchTrimmed && !(entry.name || '').toLowerCase().includes(pcsSearchTrimmed) && !(entry.displayName || '').toLowerCase().includes(pcsSearchTrimmed)) return false
    return Object.values(pcsChipsByGroup).every((chips) =>
      chips.some((c) => {
        if (c.group === 'cell') return getEntryCellName(entry).includes(c.value)
        if (c.group === 'status') {
          if (c.value === 'notmember') return !entry.membershipNumber
          if (c.value === 'leader') return !!entry.leadershipPosition
          if (c.value === 'deacon') return deaconStatusOf(entry.deaconOffice) === 'Active'
        }
        if (c.group === 'year') return entry.year === c.value
        return false
      })
    )
  }
  const pcsIsFiltering = pcsSearchTrimmed !== '' || activePcsChips.length > 0
  const filteredGrouped = grouped
    .map((g) => ({ ...g, entries: g.entries.filter(matchesPcsFilters) }))
    .filter((g) => !pcsIsFiltering || g.entries.length > 0)

  const handleChipClick = (entry) => {
    if (pcsExpandedId === entry.id) {
      closePcsProfile()
      return
    }
    setPcsExpandedId(entry.id)
    setPcsEditingId(null)
    setPcsExpandedVisitor(null); setPcsExpandedProfile(null); setPcsExpandedContext(null)
    setPcsPhotoFile(null); setPcsPhotoPreview(null)
    // Auto-link: any River Kids child whose father/mother name matches this person
    // becomes a pre-populated child entry, so the Caring Director doesn't have to
    // re-enter kids that are already registered in River Kids.
    const autoKids = rkChildrenForPCS
      .filter(k => {
        const norm = (entry.name || '').trim().toLowerCase()
        return norm && ((k.fatherName || '').trim().toLowerCase() === norm || (k.motherName || '').trim().toLowerCase() === norm)
      })
      .map(k => ({ id: `rk_${k.id}`, name: k.name, inRiverKids: 'yes', riverKidsChildId: k.id }))
    setPcsExpandedForm({
      personId: entry.personId || '',
      name: entry.name || '', displayName: entry.displayName || '', howKnownRefId: entry.howKnownRefId || '', phone: entry.phone || '', attendedDate: entry.attendedDate || '',
      membershipNumber: entry.membershipNumber || '', leadershipPosition: entry.leadershipPosition || '',
      year: entry.year || '', email: entry.email || '', dob: entry.dob || '', nativity: entry.nativity || '',
      currentPlace: entry.currentPlace || '', serviceAttended: entry.serviceAttended || '', howKnown: entry.howKnown || '',
      ministries: entry.ministries || [],
      engagementType: normalizeEngagementType(entry.engagementType),
      baptised: '', baptismDate: '', baptismPlace: '', baptismChurch: '', baptismChurchIsOther: false,
      gender: '', fatherName: '', motherName: '',
      maritalStatus: '', marriageDate: '', spouseName: '', spouseVisitorId: '',
      hasKids: autoKids.length ? 'yes' : '', children: autoKids,
      isFirstChurch: '', previousChurchName: '', previousChurchPlace: '',
      membershipStatus: '', membershipDocs: [], permanentAddress: '', photoUrl: '',
    })
    // Load full personal data from people collection if linked
    if (entry.personId) {
      setPcsExpandedLoading(true)
      getPerson(entry.personId).then(person => {
        if (person) {
          setPcsExpandedForm(f => ({
            ...f,
            name: person.name || f.name,
            phone: person.phone || f.phone,
            email: person.email || f.email,
            dob: person.dob || f.dob,
            nativity: person.nativity || f.nativity,
            currentPlace: person.currentPlace || f.currentPlace,
            serviceAttended: person.serviceAttended || f.serviceAttended,
            howKnown: person.howKnown || f.howKnown,
            attendedDate: person.firstVisitDate || f.attendedDate,
            membershipNumber: person.membershipNumber || f.membershipNumber,
            leadershipPosition: person.leadershipPosition || f.leadershipPosition,
            ministries: person.ministries?.length ? person.ministries : f.ministries,
            baptised: person.baptised || f.baptised,
            baptismDate: person.baptismDate || f.baptismDate,
            baptismPlace: person.baptismPlace || f.baptismPlace,
            baptismChurch: person.baptismChurch || f.baptismChurch,
            baptismChurchIsOther: !!person.baptismChurch && person.baptismChurch !== 'River Of Life Christian Church',
            maritalStatus: person.maritalStatus || f.maritalStatus,
            marriageDate: person.marriageDate || f.marriageDate,
            spouseName: person.spouseName || f.spouseName,
            membershipStatus: person.membershipStatus || f.membershipStatus,
            permanentAddress: person.permanentAddress || f.permanentAddress,
            photoUrl: person.photoUrl || f.photoUrl,
          }))
        }
        setPcsExpandedLoading(false)
      }).catch(() => setPcsExpandedLoading(false))
    }
    if (entry.visitorId) {
      setPcsExpandedLoading(true)
      Promise.all([
        getDelightVisitorById(entry.visitorId),
        getMemberProfileWithContext(entry.visitorId, entry.phone, entry.personId, entry.name),
      ]).then(([v, ctx]) => {
        if (v) {
          setPcsExpandedVisitor(v)
          setPcsExpandedForm(f => ({ ...f, email: v.email || '', dob: v.dob || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '', serviceAttended: v.serviceAttended || '', howKnown: v.howKnown || '' }))
        }
        if (ctx) {
          setPcsExpandedProfile(ctx.profile)
          setPcsExpandedContext(ctx)
          const p = ctx.profile || {}
          const savedChildren = Array.isArray(p.children) ? p.children : []
          const savedLinkedIds = new Set(savedChildren.filter(c => c.riverKidsChildId).map(c => c.riverKidsChildId))
          const mergedChildren = [...savedChildren, ...autoKids.filter(k => !savedLinkedIds.has(k.riverKidsChildId))]
          setPcsExpandedForm(f => ({
            ...f,
            // Cell-Leader-filled contact/personal fields (via profile-fill invitation)
            // land in member_profiles — prefer them over the visitor record if present.
            phone: p.phone || f.phone,
            email: p.email || f.email,
            dob: p.dob || f.dob,
            nativity: p.nativity || f.nativity,
            currentPlace: p.currentPlace || f.currentPlace,
            baptised: p.baptised || '',
            baptismDate: p.baptismDate || '', baptismPlace: p.baptismPlace || '',
            baptismChurch: p.baptismChurch || '',
            baptismBatch: p.baptismBatch || '', baptismSerialNo: p.baptismSerialNo || '',
            baptismChurchIsOther: !!p.baptismChurch && p.baptismChurch !== 'River Of Life Christian Church',
            gender: p.gender || '',
            fatherName: p.fatherName || '', motherName: p.motherName || '',
            maritalStatus: p.maritalStatus || '',
            marriageDate: p.marriageDate || '', spouseName: p.spouseName || '', spouseVisitorId: p.spouseVisitorId || '',
            hasKids: p.hasKids || (mergedChildren.length ? 'yes' : ''),
            children: mergedChildren,
            isFirstChurch: deriveIsFirstChurch(p),
            previousChurchName: p.previousChurchName || '',
            previousChurchPlace: p.previousChurchPlace || '',
            membershipStatus: p.membershipStatus || '',
            membershipDocs: p.membershipDocs || [],
            permanentAddress: p.permanentAddress || '',
            photoUrl: p.photoUrl || '',
          }))
          if (p.photoUrl) setPcsPhotoPreview(p.photoUrl)
        }
      }).catch(() => {}).finally(() => setPcsExpandedLoading(false))
    }
  }

  // Discard Profile — for a wrong record (duplicate / entered by mistake), not for
  // someone who stopped attending (that is Remove from PCS). Non-Founders file a
  // request and the profile is locked as "Under Review of the Pastoral Office";
  // the Founder's own discard is filed and approved in one go (same audit trail).
  const handleSubmitDiscard = async () => {
    const entry = pcsDiscardTarget
    if (!entry || !pcsDiscardReason.trim()) return
    setPcsDiscardSaving(true)
    const requestedBy = userProfile?.displayName || userProfile?.email || ''
    try {
      const approvalId = await requestPCSDiscard(entry, { reason: pcsDiscardReason, requestedBy, requestedByUid: user?.uid || '' })
      // System activity log (audit_logs) — best-effort; logAction never throws.
      logAction({
        action: isFounder ? 'PCS_PROFILE_DISCARDED' : 'PCS_DISCARD_REQUESTED',
        user,
        targetId: entry.id,
        targetType: 'PCS_ENTRY',
        department: 'Caring',
        details: {
          name: entry.name || '',
          visitorId: entry.visitorId || '',
          reason: pcsDiscardReason.trim(),
          approvalId,
          hadUnsavedEdits: pcsEditingId === entry.id && !!pcsFormDirty,
        },
      })
      if (isFounder) {
        await approvePCSDiscard({ id: approvalId, memberId: entry.id }, requestedBy)
        setPcsEntries(prev => prev.filter(e => e.id !== entry.id))
        if (pcsExpandedId === entry.id) closePcsProfile()
      } else {
        setPcsEntries(prev => prev.map(e => e.id === entry.id ? {
          ...e, status: 'pending_discard', discardApprovalId: approvalId,
          discardRequestedBy: requestedBy, discardRequestedAt: new Date(), discardReason: pcsDiscardReason.trim(),
        } : e))
      }
      setPcsEditingId(null)
      setPcsFormDirty(false)
      setPcsDiscardTarget(null)
      setPcsDiscardReason('')
    } catch (err) {
      console.error('Discard request failed:', err)
      alert('Could not send the discard request. Please try again.')
    } finally {
      setPcsDiscardSaving(false)
    }
  }

  // ⋮ menu → Mark as Deacon (appointed today) / End Deacon Office (ends today).
  // Founder / Senior Pastor only — firestore.rules guard deaconOffice the same way.
  // Dates can be adjusted afterwards in the profile's Deacon Office Management.
  const quickSetDeacon = async (entry) => {
    setPcsMenuOpenId(null)
    const active = deaconStatusOf(entry.deaconOffice) === 'Active'
    if (!window.confirm(active ? `End ${entry.name}'s Deacon Office as of today?` : `Mark ${entry.name} as a Deacon (appointed today)?`)) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const by = userProfile?.displayName || userProfile?.email || ''
    const next = active
      ? { ...entry.deaconOffice, isDeacon: true, status: 'Former', endDate: today, updatedBy: by, updatedAt: new Date().toISOString() }
      : { isDeacon: true, status: 'Active', appointedDate: today, endDate: '', appointedBy: by, updatedBy: by, updatedAt: new Date().toISOString() }
    try {
      await setPCSDeaconOffice(entry.id, next)
      setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, deaconOffice: next } : e))
      setPcsToast(active ? `${entry.name}'s Deacon Office ended` : `${entry.name} marked as Deacon`)
      setTimeout(() => setPcsToast(null), 2500)
    } catch (err) {
      alert(err?.code === 'permission-denied'
        ? 'Not allowed. Only the Founder or the Senior Pastor can change the Deacon Office.'
        : 'Could not save. Please try again.')
    }
  }

  const handleRemoveFromPCS = async (entry) => {
    if (entry.status === 'pending_discard') { alert(`${entry.name}'s profile is under review of the Pastoral Office for discard.`); return }
    if (!window.confirm(`Remove ${entry.name} from PCS?`)) return
    try {
      await deactivatePCSEntry(entry.id, userProfile?.email || '')
      // Tell their Cell Leader (bell + "Removed from PCS" roster tag). Best-effort:
      // the PCS removal itself already succeeded, so a failure here only warns.
      const cm = findPcsCellMember(entry, allCellMembers)
      if (cm?.cellId) {
        createPCSRemovalNotice({
          pcsEntryId: entry.id,
          visitorId: entry.visitorId || cm.visitorId || '',
          personName: entry.name,
          phone: entry.phone || cm.phone || '',
          cellId: cm.cellId,
          cellName: cellGroups.find(g => g.id === cm.cellId)?.cellName || '',
          cellMemberId: cm.id,
          removedBy: userProfile?.displayName || userProfile?.email || '',
        }).catch(err => {
          console.error('createPCSRemovalNotice failed:', err)
          alert(`${entry.name} was removed from PCS, but their Cell Leader could not be notified.`)
        })
      }
      setPcsEntries(prev => prev.filter(e => e.id !== entry.id))
      setPcsInactiveEntries(prev => [{ ...entry, status: 'inactive', removedAt: new Date(), removedBy: userProfile?.email || '' }, ...prev])
      if (pcsExpandedId === entry.id) setPcsExpandedId(null)
    } catch { alert('Failed to remove. Please try again.') }
    setPcsMenuOpenId(null)
  }

  // "Set as Senior Pastor" was removed from the card ⋮ menu (2026-10) — the
  // assignSeniorPastor service (services/firestore.js) is kept for a future,
  // less exposed entry point.

  const handleDismissInactiveCellAlert = async (entry) => {
    try {
      await dismissInactiveCellAlert(entry.id)
      setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, inactiveCellAlertDismissed: true } : e))
    } catch { alert('Failed to dismiss. Please try again.') }
  }

  // Consecutive Sundays absent, counting back from the most recent report —
  // stops at the first week the PCS entry shows up present, checked by real
  // visitorId first (reliable — matches an actual check-in linked to this
  // person's record) and by name second (fallback, for weeks that were
  // never explicitly linked to a profile). Weeks with no filed report are
  // skipped rather than counted as absent.
  // `sinceISO` (optional) stops the count at Sundays before that date — e.g.
  // before the person first visited, when they couldn't have been absent.
  // Every name and ID one PCS entry can appear under on a Sunday sheet. The
  // sheet's cell lists hold the cell ROSTER name (e.g. "Priya"), which often
  // differs from the PCS name ("Priya Thomas") — matching the PCS name alone
  // made a cell member who came every week look absent every week.
  const sundayKeysFor = (entry) => {
    const cm = findPcsCellMember(entry, allCellMembers)
    const names = [...new Set([entry?.name, cm?.name]
      .map(n => String(n || '').trim().toLowerCase()).filter(Boolean))]
    const ids = [entry?.visitorId, cm?.visitorId].filter(Boolean).map(v => `v:${v}`)
    return { names, ids }
  }
  const presentOnWeek = (keys, wk) =>
    keys.ids.some(k => wk.ids?.has(k)) || keys.names.some(n => wk.names.has(n))

  const getConsecutiveAbsentSundays = (entry, sinceISO = '') => {
    const keys = sundayKeysFor(entry)
    if ((!keys.names.length && !keys.ids.length) || sundayAttendanceWeeks.length === 0) return 0
    let count = 0
    for (const wk of sundayAttendanceWeeks) {
      if (sinceISO && wk.date && wk.date < sinceISO) break
      if (presentOnWeek(keys, wk)) break
      // Away that Sunday (marked on the sheet, or inside a PCS Away period) —
      // the week is skipped: the streak freezes rather than grows or resets.
      if (keys.names.some(n => wk.awayNames?.has(n)) || isProfileAwayOn(entry, wk.date)) continue
      count++
    }
    return count
  }

  // Sunday-absence warnings only apply to people expected on Sundays — Cell Only
  // members are judged by getCellHealth instead.
  const getSundayAbsentWeeks = (entry) => isCellOnly(entry) ? 0 : getConsecutiveAbsentSundays(entry)

  // Cell Health for a Cell Only member, matched against their cell's recent
  // reports by both their PCS name and their cell-roster name.
  const getCellHealth = (entry) => {
    const cm = findPcsCellMember(entry, allCellMembers)
    const names = [entry?.name, cm?.name].map(n => String(n || '').trim().toLowerCase()).filter(Boolean)
    return computeCellHealth({ hasCell: !!cm, reports: cm ? pcsCellReportsByCellId.get(cm.cellId) : null, names, isAwayOn: (d) => isProfileAwayOn(entry, d) })
  }

  // "Recommended for Removal" — strict per-track rule by Engagement Type:
  //  - Sunday Only:   10+ consecutive missed Sundays
  //  - Cell Only:     10+ consecutive missed cell meetings
  //  - Sunday & Cell: BOTH 10+ missed Sundays AND 10+ missed cell meetings, so
  //    someone still active in one stream is never flagged. A Sunday & Cell
  //    person with no cell roster row has no cell track to judge, so only
  //    Sundays count for them (otherwise they could never be flagged).
  // Never flags someone currently Away or the Senior Pastor. Away weeks are
  // skipped by both counters, and weeks before they first visited / joined the
  // cell don't count.
  const isoDay = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : ''
  // Both removal counters for one person — shared by the removal check and the
  // profile's "Sunday Absences: X | Cell Absences: Y" diagnostic line.
  //  sunday / cell: { count } when that track applies to them, else null.
  //  cellNote: why the cell count is missing ('loading' | 'noCell'), if it is.
  const getAbsenceCounts = (entry) => {
    const sunday = isCellOnly(entry) ? null : { count: getConsecutiveAbsentSundays(entry, isoDay(entry.attendedDate)) }
    if (isSundayOnly(entry)) return { sunday, cell: null, cellNote: '' }
    const cm = findPcsCellMember(entry, allCellMembers)
    if (!cm) return { sunday, cell: null, cellNote: 'noCell' }
    const reports = pcsCellReportsByCellId.get(cm.cellId)
    if (!reports) return { sunday, cell: null, cellNote: 'loading' }
    const names = [entry.name, cm.name].map(n => String(n || '').trim().toLowerCase()).filter(Boolean)
    const count = countConsecutiveCellAbsences({
      reports, names, sinceISO: isoDay(cm.since), isAwayOn: (d) => isProfileAwayOn(entry, d),
      truncated: reports.length >= CELL_HEALTH_REPORT_COUNT,
    })
    return { sunday, cell: { count }, cellNote: '' }
  }

  const getRemovalReasons = (entry) => {
    if (entry.departed || isCurrentlyAway(entry) || isRelocated(entry) || isSeniorPastorName(entry.name) || entry.status === 'pending_discard') return []
    const { sunday, cell, cellNote } = getAbsenceCounts(entry)
    // Cell reports still loading — can't judge the cell track yet, so don't flag.
    if (cellNote === 'loading') return []
    // A person with no cell roster row has no cell track, so only Sundays count
    // for them; Cell Only with no cell has nothing to judge.
    const tracks = [
      sunday && { met: sunday.count >= REMOVAL_ABSENCE_THRESHOLD, reason: { kind: 'sunday', count: sunday.count, label: `${sunday.count} Consecutive Sunday Absences` } },
      cell && { met: cell.count >= REMOVAL_ABSENCE_THRESHOLD, reason: { kind: 'cell', count: cell.count, label: `${cell.count} Consecutive Cell Absences` } },
    ].filter(Boolean)
    if (!tracks.length || !tracks.every(t => t.met)) return []
    return tracks.map(t => t.reason)
  }

  // "Sunday Absences: 13 | Cell Absences: 4" — plus why it is or isn't flagged.
  const AbsenceDiagnostics = ({ entry }) => {
    const { sunday, cell, cellNote } = getAbsenceCounts(entry)
    const flagged = getRemovalReasons(entry).length > 0
    const blocker = isCurrentlyAway(entry) ? 'Away'
      : isRelocated(entry) ? 'Relocated'
      : entry.status === 'pending_discard' ? 'Discard under review'
      : isSeniorPastorName(entry.name) ? 'Senior Pastor'
      : null
    const cellText = cell ? cell.count : cellNote === 'loading' ? 'loading…' : cellNote === 'noCell' ? 'no cell group' : 'not counted (Sunday Only)'
    return (
      <p className="text-[11px] text-slate-500 tabular-nums">
        Sunday Absences: <span className="font-semibold text-slate-700">{sunday ? sunday.count : 'not counted (Cell Only)'}</span>
        {' | '}Cell Absences: <span className="font-semibold text-slate-700">{cellText}</span>
        {' · '}
        {flagged
          ? <span className="font-semibold text-red-600">Recommended for removal</span>
          : <span>Not flagged{blocker ? ` (${blocker})` : ` (needs ${REMOVAL_ABSENCE_THRESHOLD}+ on every counted track)`}</span>}
      </p>
    )
  }
  // Suggested Away start date — the day after the person's most recent attendance,
  // whichever is later of their last Sunday present (last 20 Sundays, by visitorId or
  // name) and their last cell meeting present (their cell's last 12 reports).
  // null when neither has a record, so the Away form falls back to today.
  const suggestAwayStart = (entry) => {
    const sundayKeys = sundayKeysFor(entry)
    const lastSunday = sundayAttendanceWeeks.find(wk => presentOnWeek(sundayKeys, wk))?.date || ''
    const cm = findPcsCellMember(entry, allCellMembers)
    const names = [entry?.name, cm?.name].map(n => String(n || '').trim().toLowerCase()).filter(Boolean)
    const lastCell = ((cm && pcsCellReportsByCellId.get(cm.cellId)) || [])
      .find(r => names.some(n => r.attendeeNames?.has(n)))?.reportDate || ''
    const attendedOn = isoDay(lastSunday > lastCell ? lastSunday : lastCell)
    if (!attendedOn) return null
    const source = lastSunday && lastSunday === lastCell ? 'Sunday Service & Cell' : lastSunday > lastCell ? 'Sunday Service' : 'Cell'
    const [y, m, d] = attendedOn.split('-').map(Number)
    const next = new Date(y, m - 1, d + 1)
    const date = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
    return { date, attendedOn, source }
  }

  const removalCandidates = pcsEntries
    .map(entry => ({ entry, reasons: getRemovalReasons(entry) }))
    .filter(c => c.reasons.length > 0)
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name))

  const Chip = ({ entry }) => {
    const hasMember = !!entry.membershipNumber
    const hasLeadership = !!entry.leadershipPosition
    const isExpanded = pcsExpandedId === entry.id
    // Same visitorId-or-phone match as the profile's Cell Group line — matching by
    // visitorId alone showed "Not a member" for people linked to their cell by phone.
    const entryCell = getEntryCellGroup(entry)
    const isInCell = !!entryCell
    const menuOpen = pcsMenuOpenId === entry.id
    const isPastor = isSeniorPastorName(entry.name)
    const absentWeeks = getSundayAbsentWeeks(entry)
    // Away (travel/vacation) suppresses the red absence warnings entirely.
    // Relocated people are offboarded — same warning suppression as Away.
    // Promoted to Glory (Caring Events burial record) — no absence warnings either.
    const isAway = isCurrentlyAway(entry) || isRelocated(entry) || !!entry.departed
    const isLongAbsent = !isAway && absentWeeks >= 4
    const cellHealth = isCellOnly(entry) ? getCellHealth(entry) : null
    const cellFlag = !isAway && cellHealth && (cellHealth.tier === 'inactive' || cellHealth.tier === 'irregular') ? cellHealth : null
    return (
      <div id={`pcs-entry-${entry.id}`} className="relative w-full h-full">
        {menuOpen && (
          <div className="fixed inset-0 z-10" onClick={() => setPcsMenuOpenId(null)} />
        )}
        {/* Fixed-height card so every tile in the grid lines up identically
            regardless of name length or which badges/subtitle apply — avatar,
            name/badges, subtitle, and the ⋮ menu each sit in a fixed relative
            slot instead of the card growing/shrinking around its content. */}
        <div
          className={`w-full h-[72px] flex items-center gap-2 rounded-2xl px-3 py-2 border overflow-hidden transition-all cursor-pointer
                      ${isPastor
                        ? isExpanded
                          ? 'bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-700 border-amber-400 shadow-lg ring-2 ring-amber-300 ring-offset-1'
                          : 'bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border-amber-400 shadow-sm ring-1 ring-amber-300 ring-offset-1 hover:from-amber-100 hover:to-amber-100'
                        : isExpanded
                          ? 'bg-indigo-600 border-indigo-600 shadow-md'
                          : hasMember
                            ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                            : 'bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300'}`}
          onClick={() => handleChipClick(entry)}
        >
          <div className="relative flex-shrink-0">
            <div className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center
                        ${isPastor ? 'bg-gradient-to-br from-amber-500 to-yellow-600' : isExpanded ? 'bg-white/25' : hasMember ? 'bg-amber-500' : 'bg-blue-500'}`}>
              {getMemberDisplayName(entry).charAt(0).toUpperCase()}
            </div>
            {isPastor && (
              <span className="absolute -top-1.5 -left-1.5 text-amber-500" title={SENIOR_PASTOR_FULL_TITLE}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 18h20l-2-9-5 4-3-8-3 8-5-4-2 9z"/>
                </svg>
              </span>
            )}
            {isInCell && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" title="In a cell group" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {/* Name keeps a minimum width; badges that don't fit are clipped inside
                the card (full list in the profile) instead of spilling past its edge. */}
            <div className="flex items-center gap-1.5 overflow-hidden">
              <p className={`min-w-[4.5rem] text-sm font-semibold leading-tight truncate ${isPastor ? isExpanded ? 'text-white' : 'text-amber-900' : isExpanded ? 'text-white' : hasMember ? 'text-amber-900' : 'text-blue-900'}`}>
                {getMemberDisplayName(entry)}
              </p>
              {isPastor && (
                <span
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-amber-200' : 'bg-amber-500 text-white'}`}
                  title={SENIOR_PASTOR_FULL_TITLE}
                >
                  {SENIOR_PASTOR_TITLE}
                </span>
              )}
              {hasLeadership && (
                <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                  {entry.leadershipPosition}
                </span>
              )}
              {deaconStatusOf(entry.deaconOffice) === 'Active' && (
                <span title={deaconSummary(entry.deaconOffice)}
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                  Deacon
                </span>
              )}
              {entry.departed && (
                <span
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}
                  title={`Promoted to Glory${entry.departedDate ? ` · ${formatShortDate(entry.departedDate)}` : ''}`}
                >
                  ✝ Promoted to Glory
                </span>
              )}
              {entry.status === 'pending_discard' && (
                <span
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-amber-100' : 'bg-amber-100 text-amber-800'}`}
                  title="Discard requested — under review of the Pastoral Office"
                >
                  Under Review
                </span>
              )}
              {isRelocated(entry) ? (
                <span
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-violet-100' : 'bg-violet-100 text-violet-700'}`}
                  title={`Moved out${entry.relocatedDestination ? ` to ${entry.relocatedDestination}` : ''}`}
                >
                  🏠 Relocated
                </span>
              ) : isAway && (
                <span
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-sky-100' : 'bg-sky-100 text-sky-700'}`}
                  title={awaySummary(entry, formatDisplayDate)}
                >
                  ✈ Away
                </span>
              )}
              {isLongAbsent && (
                <span
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-red-100' : 'bg-red-100 text-red-700'}`}
                  title={`Absent for ${absentWeeks} consecutive Sundays`}
                >
                  ⚠️ {absentWeeks}w
                </span>
              )}
              {cellFlag && (
                <span
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${isExpanded ? 'bg-white/20 text-white' : cellFlag.tier === 'inactive' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}
                  title={`${cellFlag.label} — ${cellFlag.count} of ${cellFlag.meetings} cell meetings in the past 4 weeks`}
                >
                  ⚠️ Cell
                </span>
              )}
            </div>
            {hasMember
              ? <p className={`text-xs font-medium leading-tight truncate ${isExpanded ? 'text-indigo-200' : isPastor ? 'text-amber-700' : 'text-amber-600'}`}>#{entry.membershipNumber}</p>
              : isInCell
                ? <p className={`text-xs font-medium leading-tight truncate ${isExpanded ? 'text-indigo-200' : 'text-emerald-600'}`}>{entryCell?.cellName || 'Cell member'}</p>
                : <p className={`text-xs leading-tight truncate ${isExpanded ? 'text-indigo-300' : 'text-blue-400'}`}>Not a member</p>
            }
            {String(entry.displayName || '').trim() && (
              <p className={`text-[10px] leading-tight truncate ${isExpanded ? 'text-white/60' : 'text-slate-400'}`} title={entry.name}>Legal: {entry.name}</p>
            )}
          </div>
          {/* Three-dots menu button — pinned to a fixed slot at the card's
              trailing edge regardless of name/badge length above. */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setPcsMenuOpenId(menuOpen ? null : entry.id) }}
            className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                        isExpanded ? 'text-white/70 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200/70'
                      }`}
            title="More options"
          >
            <svg width="14" height="14" viewBox="0 0 4 16" fill="currentColor">
              <circle cx="2" cy="2" r="1.5"/>
              <circle cx="2" cy="8" r="1.5"/>
              <circle cx="2" cy="14" r="1.5"/>
            </svg>
          </button>
        </div>
        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[160px]">
            {canManageDeacons(isFounder, userProfile, user) && entry.status !== 'pending_discard' && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); quickSetDeacon(entry) }}
                className="w-full text-left px-4 py-2.5 text-sm text-indigo-700 hover:bg-indigo-50 font-medium flex items-center gap-2"
              >
                <span aria-hidden>✝</span>
                {deaconStatusOf(entry.deaconOffice) === 'Active' ? 'End Deacon Office' : 'Mark as Deacon'}
              </button>
            )}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); handleRemoveFromPCS(entry) }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Remove from PCS
            </button>
          </div>
        )}
      </div>
    )
  }

  // Inline expanded profile panel
  const PCSInlineProfile = ({ entry }) => {
    // A profile awaiting a Discard decision is read-only until the Founder decides.
    const isPendingDiscard = entry.status === 'pending_discard'
    const isEditing = pcsEditingId === entry.id && !isPendingDiscard
    // Recomputed here (matches the collapsed-chip's own `isPastor` above) — this
    // is a separate closure over the same `entry`, not a shared scope, so it
    // isn't visible via the outer map's local unless computed again.
    const isPastor = isSeniorPastorName(entry.name)
    const f = pcsExpandedForm
    // Baptism already on record — answered Yes, or any baptism detail filled in
    // (older profiles can have a date/church without the Yes/No answer). Gates the
    // Baptism Application button and modal: never offered to someone baptised.
    const DEDICATION_MARRIED_ONLY_MSG = 'Baby Dedication application is available for married members.'
    const baptismRecorded = String(f.baptised || '').toLowerCase() === 'yes'
      || !!(f.baptismDate || f.baptismChurch || f.baptismPlace)
    // Water baptism is a prerequisite for membership: a *new* membership
    // application can only be started once baptism is recorded. Anyone who
    // already has an application or a membership status keeps access to it.
    const membershipBlocked = !baptismRecorded && !pcsMembershipApp && !f.membershipStatus
    // Baby Dedication is for married members only — the trigger and the modal both use this.
    const canApplyDedication = f.maritalStatus === 'Married'
    const membershipBlockedMsg = `Cannot generate Membership Application. ${getMemberDisplayName(f) || entry.name} must have a recorded baptism in PCS before applying for membership.`
    const MembershipPrereqNotice = ({ compact = false }) => (
      <div className={`rounded-xl border border-amber-300 bg-amber-50 ${compact ? 'px-3 py-2' : 'px-3 py-2.5'}`}>
        <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">Prerequisite Pending</span>
        <p className="text-xs text-amber-900 mt-1.5 leading-snug">Water Baptism is required before applying for official Church Membership. Complete Baptism Application first.</p>
        {!compact && (
          <button type="button" {...appTriggerGuard} onClick={() => openApplication(setPcsBaptismOpenFor)} className="mt-2 text-xs font-bold text-violet-700 hover:underline">
            Open Baptism Application →
          </button>
        )}
      </div>
    )
    const setF = setPcsExpandedForm
    const inp = 'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors'
    const fld = (label, key, type = 'text', placeholder = '') => (
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <DateInput type={type} placeholder={placeholder} value={f[key] || ''} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))} className={inp} />
      </div>
    )
    const ctx = pcsExpandedContext
    const deptTeams = ctx?.deptTeams || []
    const worshipTeams = ctx?.worshipTeams || []
    const secCoreRoles = ctx?.secCoreRoles || []

    // Church duration
    const joinDate = entry.attendedDate ? new Date(entry.attendedDate) : null
    const churchDuration = (() => {
      if (!joinDate) return null
      // Relocated: tenure ends on the official "Part of Church Till Date".
      const till = isRelocated(entry) ? churchTillDate(entry) : ''
      const now = till ? new Date(till) : new Date()
      const totalMonths = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth())
      const y = Math.floor(totalMonths / 12), m = totalMonths % 12
      return [y > 0 ? `${y} yr${y > 1 ? 's' : ''}` : '', m > 0 ? `${m} mo` : ''].filter(Boolean).join(' ') || 'Less than a month'
    })()

    // Auto-detected ministry entries (read-only, from system records).
    // `ended` — 'completed' (marked Former, or a Director Board term that has
    // ended) or 'inactive' (switched to Inactive on the team roster); `to` is
    // then the end date: formerDate if stamped, else the record's last update
    // (same fallback as getMemberTenureEnd), so the tenure stops growing.
    const todayIso = format(new Date(), 'yyyy-MM-dd')
    // End date resolution: the stamped "moved to Former" date (`formerDate` on
    // department rosters, `formerSince` on Worship), else the last rehearsal
    // they attended (`lastWorshipActivityDate`, resolved in
    // getMemberProfileWithContext), else the record's last update.
    const teamEnd = (t) => {
      if (t.formerDate) return String(t.formerDate).slice(0, 10)
      if (t.formerSince) return String(t.formerSince).slice(0, 10)
      if (t.lastWorshipActivityDate) return String(t.lastWorshipActivityDate).slice(0, 10)
      const u = typeof t.updatedAt?.toDate === 'function' ? t.updatedAt.toDate() : t.updatedAt
      return u instanceof Date && !isNaN(u.getTime()) ? format(u, 'yyyy-MM-dd') : ''
    }
    const teamEnded = (t) => (t.isFormer || t.status === 'former') ? 'completed' : t.status === 'inactive' ? 'inactive' : null
    // Relocated: every role still open (or merely Inactive) reads as Completed,
    // ending on their last attendance date — an earlier explicit end is kept.
    // Mirrors what completeMinistryRolesForRelocation writes, so the profile is
    // right even before this context reloads (or where the write was refused).
    const relocEnd = isRelocated(entry) ? String(entry.relocatedLastDate || '').slice(0, 10) : ''
    const closeForRelocation = (row) => {
      if (!relocEnd || row.ended === 'completed') return row
      const to = row.to && String(row.to).slice(0, 10) < relocEnd ? String(row.to).slice(0, 10) : relocEnd
      return { ...row, ended: 'completed', to, endedReason: 'relocated' }
    }
    const autoMinistry = [
      ...deptTeams.map(t => { const ended = teamEnded(t); return { id: `dept-${t.id}`, ministry: t.department, role: t.rolePosition || t.role || '', from: t.memberSince || t.since || '', to: ended ? teamEnd(t) : '', ended, endedReason: t.formerReason || '', isAuto: true } }),
      ...worshipTeams.map(t => { const ended = teamEnded(t); return { id: `wor-${t.id}`, ministry: 'Worship', role: (t.positions || [])[0] || t.rolePosition || '', from: t.memberSince || t.since || t.createdAt || '', to: ended ? teamEnd(t) : '', ended, endedReason: t.formerReason || '', isAuto: true } }),
      ...secCoreRoles.map(m => ({ id: `sc-${m.personId || m.name}`, ministry: 'Director Board', role: m.type ? m.type.charAt(0).toUpperCase() + m.type.slice(1) : '', from: m.from || '', to: m.to || '', ended: m.to && String(m.to).slice(0, 10) < todayIso ? 'completed' : null, isAuto: true })),
    ].map(closeForRelocation)
    // Active roles first, then ended ones, most recently ended first.
    const sortMinistry = (rows) => [...rows].sort((a, b) =>
      (!!a.ended - !!b.ended) || String(b.to || '').localeCompare(String(a.to || '')))

    // One Ministry & Leadership row. Active: "Joined: <date>" + green
    // "Active · <tenure so far>". Ended: "<start> – <end>" + Completed/Inactive
    // badge + "Served <tenure>".
    const MinistryRow = ({ r, size = 'sm' }) => {
      const start = formatShortDate(r.from)
      const end = formatShortDate(r.to)
      const tenure = r.from ? calculateTenure(r.from, r.ended ? (r.to || null) : null) : ''
      return (
        <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${r.ended ? 'bg-slate-50 border-slate-200' : 'bg-emerald-50/60 border-emerald-100'}`}>
          <div className="min-w-0">
            <p className={`${size === 'lg' ? 'text-sm font-semibold' : 'text-xs font-bold'} leading-tight ${r.ended ? 'text-slate-600' : 'text-slate-800'}`}>
              {r.ministry}{r.role ? <span className="font-normal text-slate-500"> · {r.role}</span> : ''}
            </p>
            {r.ended
              ? (start || end) && <p className="text-[10px] text-slate-400 mt-0.5">{start || 'Start not recorded'} – {end || 'end not recorded'}</p>
              : start && <p className="text-[10px] text-slate-400 mt-0.5">Joined: {start}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-1 flex-shrink-0">
            {r.ended ? (
              <>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${r.ended === 'inactive' ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-slate-600 bg-slate-100 border-slate-200'}`}>
                  {r.ended === 'inactive' ? 'Inactive' : 'Completed'}
                </span>
                {tenure && r.to && <span className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-full whitespace-nowrap">Served {tenure}</span>}
              </>
            ) : (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                Active{tenure ? ` · ${tenure}` : ''}
              </span>
            )}
          </div>
        </div>
      )
    }

    // Membership docs
    const membershipDocs = f.membershipDocs || []
    const addDocRow = () => setF(p => ({ ...p, membershipDocs: [...(p.membershipDocs || []), { id: Date.now().toString(), type: '', number: '' }] }))
    const updateDocRow = (id, field, val) => setF(p => ({ ...p, membershipDocs: (p.membershipDocs || []).map(r => r.id === id ? { ...r, [field]: val } : r) }))
    const removeDocRow = (id) => setF(p => ({ ...p, membershipDocs: (p.membershipDocs || []).filter(r => r.id !== id) }))

    // Children rows (Personal Data section)
    const children = f.children || []
    // childType: 'minor' (River Kids / Sunday School) | 'adult' (adult son/daughter,
    // optionally linked to their own PCS entry via linkedChildMemberId). Rows saved
    // before childType existed have none and are treated as minors.
    const addChildRow = () => setF(p => ({ ...p, children: [...(p.children || []), { id: Date.now().toString(), childType: 'minor', name: '', inRiverKids: '', riverKidsChildId: '', linkedChildMemberId: '' }] }))
    // Editing a child's name here drops any legal-name parts from an application
    // (utils/familyDetails childDisplayName prefers them) so the new name shows.
    const updateChildRow = (id, patch) => setF(p => ({ ...p, children: (p.children || []).map(c => c.id === id
      ? { ...c, ...patch, ...('name' in patch ? { firstName: '', middleName: '', lastName: '' } : {}) }
      : c) }))
    const removeChildRow = (id) => setF(p => ({ ...p, children: (p.children || []).filter(c => c.id !== id) }))

    const sectionHead = (label, color = 'text-slate-600') => (
      <p className={`text-sm font-bold tracking-tight ${color}`}>{label}</p>
    )

    // ── Fill-percentage helpers ──────────────────────────────────────
    const countFilled = (keys) => keys.filter(k => {
      const v = f[k]; return v !== '' && v !== null && v !== undefined && v !== false
    }).length

    const s1Keys = ['name','phone','email','dob','nativity','currentPlace','serviceAttended','howKnown','attendedDate']
    const s1Fill = countFilled(s1Keys) / s1Keys.length

    const s2Checks = [autoMinistry.length > 0]
    const s2Fill = s2Checks.filter(Boolean).length / s2Checks.length

    const sPersonalBaseKeys = f.maritalStatus === 'Single' ? ['maritalStatus'] : ['maritalStatus', 'hasKids']
    const sPersonalMarriageKeys = f.maritalStatus === 'Married' ? ['marriageDate','spouseName'] : []
    const sPersonalAllKeys = [...sPersonalBaseKeys, ...sPersonalMarriageKeys]
    const sPersonalFill = countFilled(sPersonalAllKeys) / sPersonalAllKeys.length

    const s3BaseKeys = ['baptised']
    const s3BaptismKeys = f.baptised === 'yes' ? ['baptismDate','baptismPlace','baptismChurch'] : []
    const s3AllKeys = [...s3BaseKeys, ...s3BaptismKeys]
    const s3Fill = countFilled(s3AllKeys) / s3AllKeys.length

    const s4Checks = f.membershipStatus ? [!!f.membershipNumber, !!f.permanentAddress, membershipDocs.length > 0] : []
    const s4Fill = s4Checks.length > 0 ? s4Checks.filter(Boolean).length / s4Checks.length : 0

    // Overall = average of Visitor Data, Personal Data, and Spiritual Data
    const overallFill = (s1Fill + sPersonalFill + s3Fill) / 3

    // Colour scale: 0=slate, 1-49=red, 50-99=amber, 100=emerald
    const dotCls = (p) => p === 0 ? 'bg-slate-300' : p < 0.5 ? 'bg-red-400' : p < 1 ? 'bg-amber-400' : 'bg-emerald-500'
    const barCls = (p) => p === 0 ? 'bg-slate-200' : p < 0.5 ? 'bg-red-400' : p < 1 ? 'bg-amber-400' : 'bg-emerald-500'
    const pctCls = (p) => p === 0 ? 'text-slate-400' : p < 0.5 ? 'text-red-500' : p < 1 ? 'text-amber-500' : 'text-emerald-600'
    const pctStr = (p) => `${Math.round(p * 100)}%`

    const SecHeader = ({ label, fill, labelColor, headerBg, extra }) => (
      <div className={`-mx-4 -mt-3 mb-4 px-4 py-3 flex items-center gap-3 ${headerBg}`}>
        <span className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${dotCls(fill)}`} />
        <p className={`text-sm font-bold tracking-tight ${labelColor}`}>{label}</p>
        {extra}
      </div>
    )

    // Cell group lookup (hoisted so PDF button can use it)
    const _normalPhone = (entry.phone || '').replace(/\s+/g, '')
    const _cellMember = allCellMembers.find(m =>
      m.status !== 'inactive' && (
        (entry.visitorId && m.visitorId && m.visitorId === entry.visitorId) ||
        (_normalPhone && m.phone && m.phone.replace(/\s+/g, '') === _normalPhone)
      )
    )
    const _cg = _cellMember ? cellGroups.find(g => g.id === _cellMember.cellId) : null

    // "Notify Cell Director to assign a cell" — a pending Cell-department task
    // (pcsReferral). The task itself is the persisted status: matched by personId,
    // then visitorId, then phone, so "sent" survives a reload. Shared by the
    // read-only profile (Church Journey) and the edit form's Cell Group block.
    const _refPhone = (entry.phone || '').replace(/\s+/g, '')
    const cellReferral = pcsCellReferralTasks.find(t =>
      (entry.personId && t.memberId && t.memberId === entry.personId) ||
      (entry.visitorId && t.pcsPersonVisitorId && t.pcsPersonVisitorId === entry.visitorId) ||
      (_refPhone && t.memberPhone && t.memberPhone.replace(/\s+/g, '') === _refPhone)
    )
    const cellReferralSent = pcsNotifiedIds.has(entry.id) || !!cellReferral
    const cellReferralSending = pcsNotifyingId === entry.id
    const cellReferralAt = (() => {
      const v = cellReferral?.createdAt
      const d = typeof v?.toDate === 'function' ? v.toDate() : v ? new Date(v) : null
      return d && !isNaN(d.getTime()) ? d : null
    })()
    // Church applications (Membership, Baptism, Baby Dedication) require an active
    // cell group — the same roster lookup as the "Cell Group" line (_cg). The
    // Senior Pastor is exempt (no cell assignment, as elsewhere). Gates every
    // application button and modal; the QR pages also lock without a cell (the
    // application records the cell it was created under in prefill.cellGroupId).
    const hasActiveCellGroup = !!_cg || isSeniorPastorName(entry.name)
    const openApplication = (setter) => { if (hasActiveCellGroup) setter(entry.id) }
    const appTriggerGuard = hasActiveCellGroup ? {} : {
      disabled: true, 'aria-disabled': true,
      title: 'Assign a Cell Group first (Church Journey)',
      style: { opacity: 0.45, cursor: 'not-allowed' },
    }
    // `flush` — a full-width strip directly under the card's navy header (profile
    // view), instead of a separate rounded box (edit form).
    const CellPrereqBanner = ({ flush = false } = {}) => (hasActiveCellGroup || !canEdit || isPendingDiscard || entry.departed) ? null : (
      <div role="alert" className={flush
        ? 'px-5 @xl:px-8 py-3 bg-amber-50 border-b border-amber-200 text-amber-900'
        : 'rounded-xl border border-amber-400 bg-amber-50 px-3.5 py-3 text-amber-900'}>
        <p className="text-xs leading-relaxed">
          <span className="font-extrabold tracking-wide">PREREQUISITE REQUIRED:</span>{' '}
          Active Cell Group membership is required before applying for Church Applications (Membership, Baptism, Marriage, or Baby Dedication). Please assign a Cell Group under Church Journey first.
        </p>
        <div className="mt-2">
          {cellReferralSent
            ? <span className="inline-flex text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">✓ Notification sent to Cell Director</span>
            : <button type="button" disabled={cellReferralSending} onClick={sendCellReferral}
                className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-md font-medium transition-colors disabled:opacity-50">
                {cellReferralSending ? 'Sending…' : '+ Notify Cell Director / Assign Cell'}
              </button>}
        </div>
      </div>
    )
    const sendCellReferral = async () => {
      if (cellReferral) { setPcsNotifiedIds(prev => new Set([...prev, entry.id])); return }
      setPcsNotifyingId(entry.id)
      try {
        await createTask({
          taskTitle: `Add ${entry.name} to a cell group`,
          department: 'Cell',
          assignedPerson: '',
          priority: 'Medium',
          deadline: '',
          status: 'Pending',
          notes: `Referred from PCS by ${userProfile?.name || userProfile?.email || 'Caring Director'}. ${entry.name} is under personal care but has no cell group.${entry.phone ? ` Phone: ${entry.phone}` : ''}`,
          createdBy: userProfile?.email || '',
          pcsReferral: true,
          memberId: entry.personId || entry.id,
          memberName: entry.name,
          memberPhone: entry.phone || '',
          // Legacy field names CellDirectorCockpit.jsx's pcsReferrals mapping already reads.
          pcsPersonName: entry.name,
          pcsPersonPhone: entry.phone || '',
          pcsPersonVisitorId: entry.visitorId || '',
          // Identity + action-kind pair the To-Do List dedupes on (ToDoListCard.jsx)
          // so re-sending this referral never shows as a second row.
          personId: entry.personId || entry.visitorId || entry.id,
          taskType: 'addToCellGroup',
          // This is a placement decision, not a specific leader's action — only the
          // Cell Director should see it, never every Cell Leader in the department
          // (ToDoListCard.jsx filters on this against getDepartmentRole()).
          visibleToRole: 'DIRECTOR',
        })
        setPcsNotifiedIds(prev => new Set([...prev, entry.id]))
        setPcsToast(`Notification sent to Cell Director to assign ${entry.name}`)
        setTimeout(() => setPcsToast(null), 3500)
      } catch { alert('Failed to send notification') }
      setPcsNotifyingId(null)
    }

    // ── Stamp view (read-only A4 document) ──────────────────
    // Laid out on the same A4 grid as downloadProfileAsPDF (794px = 210mm,
    // navy band, identity + personal on the left, church journey / notes /
    // history on the right) so the printed sheet mirrors what's on screen.
    // Two columns kick in from the card's own width (container query), not
    // the viewport, since the centre pane is narrower than the window.
    if (!isEditing) {
      const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null
      const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== ''

      // Label over value with a hairline divider — same shape as the PDF's field().
      // Core fields always render ("—" when empty); optional ones only when filled.
      const row = (label, value, { optional = false, wide = false } = {}) => {
        if (optional && !hasVal(value)) return null
        return (
          <div className={`min-w-0 py-1.5 border-b border-slate-100 ${wide ? 'col-span-2' : ''}`}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            {hasVal(value)
              ? <p className="text-[13px] font-medium text-slate-800 leading-snug break-words">{value}</p>
              : <p className="text-[13px] text-slate-300 leading-snug">—</p>}
          </div>
        )
      }
      const Section = ({ title, color, badge, grid = true, children }) => (
        <section className="mb-5">
          <div className="flex items-center justify-between gap-2 pb-1 mb-1.5 border-b-[1.5px]" style={{ borderColor: color }}>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em]" style={{ color }}>{title}</p>
            {badge}
          </div>
          {grid ? <div className="grid grid-cols-2 gap-x-4">{children}</div> : children}
        </section>
      )

      const absentWeeks = getSundayAbsentWeeks(entry)
      const cellHealth = isCellOnly(entry) ? getCellHealth(entry) : null
      const profileNotes = (pcsExpandedProfile?.notes || pcsExpandedVisitor?.notes || '').trim()
      const kids = f.hasKids === 'yes' ? (f.children || []).filter(c => c.name) : []
      const minorKids = kids.filter(c => c.childType !== 'adult')
      const adultKids = kids.filter(c => c.childType === 'adult')
      // Reverse side of adult-child links: parents who linked this person.
      const familyParents = (pcsExpandedProfile?.parents || []).filter(p => p?.name)
      // Family row — a linked person (still in PCS) is a button that opens their profile.
      const familyLinks = (label, people) => people.length === 0 ? null : (
        <div className="min-w-0 py-1.5 border-b border-slate-100 col-span-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {people.map(p => {
              const target = p.pcsId && pcsEntries.find(e => e.id === p.pcsId)
              return target ? (
                <button key={p.key} type="button" onClick={() => handleChipClick(target)}
                  className="text-[12px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-0.5 hover:bg-teal-100 transition-colors">
                  {p.name} ↗
                </button>
              ) : (
                <span key={p.key} className="text-[12px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5">{p.name}</span>
              )
            })}
          </div>
        </div>
      )

      // Ministry list — manual entries win over auto-detected ones of the same name
      // (identical to what the PDF has always printed).
      const manualMinistry = (entry.ministries || []).map(r => closeForRelocation({
        ...r, isAuto: false,
        ended: r.ended || (r.to && String(r.to).slice(0, 10) < todayIso ? 'completed' : null),
      }))
      const manualNames = new Set(manualMinistry.map(r => r.ministry?.toLowerCase()))
      const ministryAll = sortMinistry([...manualMinistry, ...autoMinistry.filter(a => !manualNames.has(a.ministry?.toLowerCase()))])

      // History — assembled from existing records (PCS entry, visitor record,
      // Sunday attendance); there is no separate activity-log collection.
      const historyItems = [
        f.attendedDate && { when: fmtD(f.attendedDate), what: `First visited${f.serviceAttended ? ` · ${f.serviceAttended}` : ''}` },
        entry.addedAt && { when: fmtD(entry.addedAt), what: `Added to PCS${entry.addedBy ? ` by ${entry.addedBy}` : ''}` },
        _cg && { when: null, what: `In cell group · ${_cg.cellName || 'Unnamed Cell'}` },
        f.baptised === 'yes' && f.baptismDate && { when: fmtD(f.baptismDate), what: `Baptised${f.baptismChurch ? ` · ${f.baptismChurch}` : ''}` },
        f.membershipNumber && { when: null, what: `Church member · #${f.membershipNumber}` },
        cellHealth && cellHealth.tier !== 'loading' && {
          when: cellHealth.lastAttended ? `Last at cell ${fmtD(cellHealth.lastAttended)}` : null,
          what: cellHealth.meetings > 0 ? `${cellHealth.label} · ${cellHealth.count} of ${cellHealth.meetings} cell meetings in 4 weeks` : cellHealth.label,
          warn: cellHealth.tier === 'inactive',
        },
        isCurrentlyAway(entry) && { when: entry.awayFrom ? fmtD(entry.awayFrom) : null, what: awaySummary(entry, fmtD) },
        isRelocated(entry) && { when: entry.relocatedLastDate ? `Last attended ${fmtD(entry.relocatedLastDate)}` : null, what: `Relocated / Moved Out${entry.relocatedDestination ? ` to ${entry.relocatedDestination}` : ''} · ${entry.relocatedStanding || 'In Good Standing'}` },
        // Auto-returns from Away (marked present on a Sunday / Cell sheet)
        ...(entry.awayPeriods || []).filter(p => p?.returnedVia).map(p => ({ when: fmtD(p.to), what: awayReturnHistoryLabel(p, fmtD) })),
        // Relocated: post-move weeks are skipped, so a Sunday line would read "Present".
        !cellHealth && !isRelocated(entry) && sundayAttendanceWeeks.length > 0 && {
          when: null,
          what: absentWeeks === 0 ? 'Present at the most recent Sunday service' : `Absent ${absentWeeks} consecutive Sunday${absentWeeks === 1 ? '' : 's'}${isCurrentlyAway(entry) ? ' (before going Away)' : ''}`,
          warn: absentWeeks >= 4 && !isCurrentlyAway(entry) && !isRelocated(entry),
        },
        ...getRemovalReasons(entry).map(r => ({ when: null, what: `Recommended for removal · ${r.label}`, warn: true })),
        // Ministry roles that have ended — their tenure, as a timeline entry.
        ...ministryAll.filter(r => r.ended).map(r => {
          const tenure = r.from && r.to ? calculateTenure(r.from, r.to) : ''
          if (r.endedReason === 'relocated') {
            return {
              when: r.to ? fmtD(r.to) : null,
              what: `Completed ${r.ministry} ministry tenure on ${r.to ? fmtD(r.to) : 'their last attendance'} due to church relocation${tenure ? ` · Served ${tenure}` : ''}.`,
            }
          }
          return {
            when: r.to ? fmtD(r.to) : null,
            // e.g. "Completed service in Worship (Served 5 mos: 7 Dec 2025 – 14 May 2026)"
            what: `${r.ended === 'inactive' ? 'Became inactive' : 'Completed service'} in ${r.ministry}${r.role ? ` · ${r.role}` : ''}${tenure ? ` (Served ${tenure}: ${formatShortDate(r.from)} – ${formatShortDate(r.to)})` : ''}`,
          }
        }),
        ...(entry.followUps || []).map(fu => ({
          when: formatTimestampFull(fu.at),
          what: `Follow-up${fu.by ? ` by ${fu.by}` : ''}${fu.note ? `: ${fu.note}` : ''}`,
        })),
      ].filter(Boolean)

      return (
        <div className="px-2 py-3 sm:px-4 sm:py-4">
          {pcsExpandedLoading && <p className="text-xs text-slate-400 text-center pb-3">Loading profile…</p>}
          {pcsAppViewing && (
            <SubmittedApplicationViewer type={pcsAppViewing.type} app={pcsAppViewing.app} events={pcsCaringEvents} onClose={() => setPcsAppViewing(null)} />
          )}
          {pcsAppreciationOpenFor === entry.id && (
            <AppreciationSummaryModal
              entry={entry}
              form={f}
              ministry={ministryAll}
              allCellMembers={allCellMembers}
              cellGroups={cellGroups}
              onClose={() => setPcsAppreciationOpenFor(null)}
            />
          )}
          {pcsDedicationOpenFor === entry.id && hasActiveCellGroup && canApplyDedication && (() => {
            // Parents from this profile + their spouse; which is father/mother follows gender.
            const self = String(f.name || '').trim()
            const spouse = f.maritalStatus === 'Married' ? String(f.spouseName || '').trim() : ''
            const isMother = f.gender === 'Female'
            return (
              <DedicationApplicationModal
                entry={entry}
                userEmail={userProfile?.email || ''}
                canReveal={canRevealSurpriseNames(userProfile, isFounder)}
                onClose={() => setPcsDedicationOpenFor(null)}
                prefill={{
                  fatherName: isMother ? spouse : self,
                  motherName: isMother ? self : spouse,
                  phone: f.phone || '', email: f.email || '',
                  cellName: _cg?.cellName || '', cellGroupId: _cg?.id || '',
                  family: buildFamilyPrefill(f),
                }}
              />
            )
          })()}
          {pcsMembershipOpenFor === entry.id && hasActiveCellGroup && membershipBlocked && createPortal(
            <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setPcsMembershipOpenFor(null)}>
              <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
                <p className="text-base font-bold text-slate-900">Baptism required</p>
                <p className="text-sm text-slate-600">{membershipBlockedMsg}</p>
                <div className="flex gap-2 justify-end pt-1">
                  <button type="button" onClick={() => setPcsMembershipOpenFor(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">Close</button>
                  <button type="button" onClick={() => { setPcsMembershipOpenFor(null); setPcsBaptismOpenFor(entry.id) }} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold">Baptism Application</button>
                </div>
              </div>
            </div>,
            document.body
          )}
          {pcsMembershipOpenFor === entry.id && hasActiveCellGroup && !membershipBlocked && (() => {
            // Pre-fill from what PCS already knows; blanks are asked of the applicant.
            const [firstName, ...rest] = String(entry.legalName || f.name || '').trim().split(/\s+/)
            return (
              <MembershipApplicationModal
                entry={entry}
                userName={userProfile?.displayName || ''}
                userEmail={userProfile?.email || ''}
                onClose={() => setPcsMembershipOpenFor(null)}
                baptismBlockedMessage={baptismRecorded ? '' : membershipBlockedMsg}
                prefill={{
                  firstName: firstName || '', lastName: rest.join(' '),
                  gender: f.gender || '', dob: f.dob || '',
                  phone: f.phone || '', email: f.email || '',
                  currentAddress: f.currentPlace || '',
                  permanentAddress: f.permanentAddress || '',
                  dateOfJoin: f.attendedDate || '',
                  baptismDate: f.baptismDate || '', baptismChurch: f.baptismChurch || '',
                  cellName: _cg?.cellName || '', cellGroupId: _cg?.id || '',
                  cellLeader: _cg?.leader || '',
                  family: buildFamilyPrefill(f),
                }}
              />
            )
          })()}
          {pcsBaptismOpenFor === entry.id && hasActiveCellGroup && !baptismRecorded && (() => {
            // Pre-fill from what PCS already knows; blanks are asked of the applicant.
            const [firstName, ...rest] = String(entry.legalName || f.name || '').trim().split(/\s+/)
            return (
              <BaptismApplicationModal
                entry={entry}
                userEmail={userProfile?.email || ''}
                onClose={() => setPcsBaptismOpenFor(null)}
                prefill={{
                  firstName: firstName || '', lastName: rest.join(' '),
                  dob: f.dob || '', gender: f.gender || '', maritalStatus: f.maritalStatus || '',
                  fatherName: f.fatherName || '', motherName: f.motherName || '',
                  spouseName: f.maritalStatus === 'Married' ? (f.spouseName || '') : '',
                  street: f.permanentAddress || '', city: f.currentPlace || '',
                  state: '', zip: '', country: '',
                  phone: f.phone || '', altPhone: '', email: f.email || '',
                  cellName: _cg?.cellName || '', cellGroupId: _cg?.id || '',
                  family: buildFamilyPrefill(f),
                }}
              />
            )
          })()}
          {pcsMarriageOpenFor === entry.id && hasActiveCellGroup && (() => {
            // Pre-fill the applicant from PCS; the partner and wedding details are asked.
            const [firstName, ...rest] = String(entry.legalName || f.name || '').trim().split(/\s+/)
            return (
              <MarriageApplicationModal
                entry={entry}
                userEmail={userProfile?.email || ''}
                onClose={() => setPcsMarriageOpenFor(null)}
                prefill={{
                  firstName: firstName || '', lastName: rest.join(' '),
                  gender: f.gender || '', dob: f.dob || '',
                  maritalStatus: f.maritalStatus && f.maritalStatus !== 'Married' ? f.maritalStatus : '',
                  phone: f.phone || '', email: f.email || '',
                  currentAddress: f.currentPlace || '',
                  baptismDate: f.baptismDate || '', baptismChurch: f.baptismChurch || '',
                  fatherName: '', motherName: '',
                  cellName: _cg?.cellName || '', cellGroupId: _cg?.id || '',
                  family: buildFamilyPrefill(f),
                }}
              />
            )
          })()}
          {/* overflow-visible (not hidden): the status header below must be able to stick. */}
          <div className="@container w-full max-w-[794px] mx-auto bg-white rounded-xl shadow-sm">

            {/* ── Member status header — first in the card, sticky while scrolling.
                top offset = whatever bar is pinned above it: none in the phone
                panel (its own scroller), the 3rem fixed top bar on tablets, the
                89px desktop department nav (two rows) on lg+. ── */}
            <div className="sticky top-0 md:top-[calc(3rem_+_env(safe-area-inset-top,24px))] lg:top-[89px] z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 @xl:px-6 py-3 shadow-sm rounded-t-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-xl font-black text-white shadow ${f.membershipNumber ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-[#1e3a5f]'}`}>
                  {pcsPhotoPreview
                    ? <img src={pcsPhotoPreview} alt="" className="w-12 h-12 rounded-full object-cover" />
                    : (getMemberDisplayName(f) || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Personal Caring System — Member Profile</p>
                  {/* Display Name is the primary title; the legal name sits beneath it. */}
                  <p className="text-lg font-extrabold text-[#1e3a5f] dark:text-white leading-tight tracking-tight break-words">{getMemberDisplayName(f) || '—'}</p>
                  {String(f.displayName || '').trim() && f.name && (
                    <p className="text-xs text-slate-400 break-words">Legal: {f.name}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {/* Key status: Active (unless Away / Relocated / departed) + Visitor / In Progress / Member */}
                    {!entry.departed && !isCurrentlyAway(entry) && !isRelocated(entry) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>
                    )}
                    {f.membershipStatus === 'member' || f.membershipNumber
                      ? (!f.membershipNumber && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">Member</span>)
                      : f.membershipStatus === 'applying'
                        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">Membership – In Progress</span>
                        : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Visitor</span>}
                    {isPastor &&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">{SENIOR_PASTOR_TITLE}</span>}
                    {f.membershipNumber && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">Member #{f.membershipNumber}</span>}
                    {f.leadershipPosition && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">{f.leadershipPosition}</span>}
                    {deaconStatusOf(entry.deaconOffice) === 'Active' && <span title={deaconSummary(entry.deaconOffice)} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-700 text-white">Deacon</span>}
                    {deaconStatusOf(entry.deaconOffice) === 'Former' && <span title={deaconSummary(entry.deaconOffice)} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">Former Deacon</span>}
                    {churchDuration && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{churchDuration} in church</span>}
                    {cellHealth && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CELL_HEALTH_BADGE_CLS[cellHealth.tier]}`}>{cellHealth.label}</span>}
                    {isCurrentlyAway(entry) && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${AWAY_BADGE_CLS}`}>✈ Away</span>}
                    {isRelocated(entry) && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${RELOCATED_BADGE_CLS}`}>🏠 Relocated{entry.relocatedDestination ? ` · ${entry.relocatedDestination}` : ''}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 max-w-[260px]">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barCls(overallFill)}`} style={{ width: `${Math.round(overallFill * 100)}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${pctCls(overallFill)}`}>{pctStr(overallFill)} complete</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 self-start">
                {!isPendingDiscard && (
                  <button type="button" onClick={() => setPcsEditingId(entry.id)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1e3a5f] text-white text-xs font-bold hover:bg-[#16304f] transition-colors shadow-sm">
                    <Pencil className="w-3.5 h-3.5" /> Edit Profile
                  </button>
                )}
                <button type="button"
                  onClick={() => downloadProfileAsPDF(f, churchDuration, ministryAll, _cg, { notes: profileNotes, history: historyItems, kids, parents: familyParents })}
                  title="Export PDF" aria-label="Export PDF"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors">
                  <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export PDF</span>
                </button>
              </div>
            </div>

            {entry.departed && (
              <div className="px-5 @xl:px-8 py-3 bg-slate-100 border-b border-slate-200 text-slate-800">
                <p className="text-sm font-bold">✝ Promoted to Glory{entry.departedDate ? ` · ${formatShortDate(entry.departedDate)}` : ''}</p>
                <p className="text-xs text-slate-500 mt-0.5">Recorded by a burial service in Caring → Events. Absence and removal warnings are switched off.</p>
              </div>
            )}
            <CellPrereqBanner flush />
            {isPendingDiscard && (
              <div className="px-5 @xl:px-8 py-3 bg-amber-50 border-b border-amber-200 text-amber-900">
                <p className="text-sm font-bold">Under Review of the Pastoral Office</p>
                <p className="text-xs mt-0.5">This profile discard request has been submitted and is under review of the Pastoral Office. Editing is locked until a decision is made.</p>
                {(entry.discardRequestedBy || entry.discardReason) && (
                  <p className="text-xs text-amber-800/80 mt-1">
                    {entry.discardRequestedBy && <>Requested by {entry.discardRequestedBy}{entry.discardRequestedAt ? ` on ${fmtD(entry.discardRequestedAt)}` : ''}</>}
                    {entry.discardReason && <>{entry.discardRequestedBy ? ' · ' : ''}Reason: {entry.discardReason}</>}
                  </p>
                )}
              </div>
            )}

            {/* ── Body: two columns on A4 width, one column when narrow ── */}
            <div className="px-5 @xl:px-8 py-6 grid grid-cols-1 @xl:grid-cols-2 gap-x-8">

              {/* Main stack — contact & personal, family, church journey, spiritual, membership */}
              <div className="min-w-0">

                <Section title="Contact & Personal" color="#1d4ed8">
                  {entry.legalName && entry.legalName !== f.name && row('Legal Name', `${entry.legalName} ✓`, { wide: true })}
                  {row('Phone', f.phone)}
                  {row('Email', f.email)}
                  {row('Date of Birth', fmtD(f.dob))}
                  {row('Native Place', f.nativity)}
                  {row('Current Place', f.currentPlace)}
                  {row('How Known', f.howKnown)}
                  {row('Address', f.permanentAddress, { wide: true })}
                </Section>

                {(f.maritalStatus || kids.length > 0 || familyParents.length > 0 || canEdit) && (
                  <Section title="Personal" color="#0f766e">
                    {row('Marital Status', f.maritalStatus)}
                    {f.maritalStatus === 'Married' && row('Marriage Date', fmtD(f.marriageDate), { optional: true })}
                    {f.maritalStatus === 'Married' && row('Spouse Name', f.spouseName || 'Not recorded')}
                    {/* Children — one line each with age / DOB; quick "+ Add Child" opens the
                        edit form with a new blank child row (hidden for Single, like the form). */}
                    <div className="col-span-2 min-w-0 py-1.5 border-b border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Children</p>
                        {canEdit && !isPendingDiscard && f.maritalStatus !== 'Single' && (
                          <button type="button"
                            onClick={() => {
                              setPcsExpandedForm(p => ({ ...p, hasKids: 'yes', children: [...(p.children || []), { id: Date.now().toString(), childType: 'minor', name: '', inRiverKids: '', riverKidsChildId: '', linkedChildMemberId: '' }] }))
                              setPcsEditingId(entry.id)
                            }}
                            className="text-[11px] font-semibold text-teal-700 hover:underline">
                            + Add Child
                          </button>
                        )}
                      </div>
                      {minorKids.length > 0 ? (
                        <ul className="mt-0.5 space-y-0.5">
                          {minorKids.map(c => (
                            <li key={c.id || c.name} className="text-[13px] font-medium text-slate-800 leading-snug">
                              • {childDisplayName(c)}
                              {childAgeText(c) && <span className="font-normal text-slate-500"> ({childAgeText(c)})</span>}
                              {c.riverKidsChildId && <span className="ml-1 text-[10px] font-bold text-teal-600">River Kids</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[13px] text-slate-400 leading-snug">{adultKids.length ? 'No minor children recorded' : 'None / Not recorded'}</p>
                      )}
                    </div>
                    {familyLinks('Linked Adult Child', adultKids.map(c => ({ key: c.id, name: c.name, pcsId: c.linkedChildMemberId })))}
                    {familyLinks(familyParents.length === 1 ? 'Parent' : 'Parents', familyParents.map(p => ({ key: p.pcsEntryId, name: p.name, pcsId: p.pcsEntryId })))}
                    {canEdit && !isPendingDiscard && !pcsExpandedLoading && f.maritalStatus !== 'Married' && (
                      <div className="col-span-2 pt-2">
                        <button type="button" {...appTriggerGuard} onClick={() => openApplication(setPcsMarriageOpenFor)}
                          className="w-full flex items-center justify-center gap-2 min-h-[40px] rounded-xl text-sm font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors">
                          + Marriage Application
                        </button>
                      </div>
                    )}
                  </Section>
                )}

                <Section title="Church Journey" color="#065f46"
                  badge={churchDuration
                    ? <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{churchDuration}</span>
                    : null}>
                  {row('First Visit', fmtD(f.attendedDate))}
                  {row('Service', f.serviceAttended)}
                  {row('Engagement', engagementLabel(entry.engagementType))}
                  {row('Cell Group', _cg ? (_cg.cellName || 'Unnamed Cell') : null)}
                  {!_cg && !isPastor && canEdit && !isPendingDiscard && !entry.departed && (
                    <div className="col-span-2 pb-1.5">
                      {cellReferralSent
                        ? <span title={cellReferralAt ? `Sent ${formatTimestampFull(cellReferralAt)}` : 'Sent'}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                            ✓ Notification sent to Cell Director{cellReferralAt ? ` · ${formatShortDate(cellReferralAt)}` : ''}
                          </span>
                        : <button type="button" disabled={cellReferralSending} onClick={sendCellReferral}
                            className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-md font-medium transition-colors disabled:opacity-50">
                            {cellReferralSending ? 'Sending…' : '+ Notify Cell Director / Assign Cell'}
                          </button>}
                    </div>
                  )}
                  {row('Cell Leader', _cg?.leader, { optional: true })}
                  {row('PCS Year', f.year ? String(f.year) : null, { optional: true })}
                  {isRelocated(entry) && row('Status', `Relocated / Moved Out${entry.relocatedDestination ? ` · ${entry.relocatedDestination}` : ''}`, { wide: true })}
                  {isRelocated(entry) && row('Last Attendance', fmtD(entry.relocatedLastDate))}
                  {isRelocated(entry) && row('Part of Church Till', fmtD(churchTillDate(entry)))}
                  {isRelocated(entry) && row('Standing', entry.relocatedStanding, { optional: true })}
                  <div className="col-span-2 pt-1.5"><AbsenceDiagnostics entry={entry} /></div>
                  {isRelocated(entry) && (
                    <div className="col-span-2 pt-2 space-y-2">
                      <button type="button" onClick={() => setPcsAppreciationOpenFor(entry.id)}
                        className="w-full min-h-[40px] rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 shadow-sm">
                        Generate Appreciation Summary
                      </button>
                      {/* Relocated only — formal letter with 1 Cor 15:58 (utils/pastoralClosureLetter.js) */}
                      <button type="button"
                        disabled={pcsClosureLetterBusy}
                        onClick={async () => {
                          // Every cell roster row that is this person (any status) — visitorId, phone, then name.
                          const ph = String(f.phone || entry.phone || '').replace(/\D/g, '').slice(-10)
                          const nm = String(entry.name || '').trim().toLowerCase()
                          const cells = allCellMembers
                            .filter(m => (entry.visitorId && m.visitorId === entry.visitorId) ||
                              (ph.length === 10 && String(m.phone || '').replace(/\D/g, '').slice(-10) === ph) ||
                              (nm && String(m.name || '').trim().toLowerCase() === nm))
                            .map(m => ({ cellName: cellGroups.find(g => g.id === m.cellId)?.cellName || 'Cell group', since: m.since, leftDate: m.leftDate }))
                          setPcsClosureLetterBusy(true)
                          try {
                            await downloadPastoralClosureLetter({
                              name: f.name || entry.name,
                              destination: entry.relocatedDestination,
                              firstVisit: f.attendedDate,
                              lastDate: entry.relocatedLastDate,
                              standing: entry.relocatedStanding,
                              ministries: ministryAll,
                              cells,
                            })
                          } catch (e) {
                            console.error('Closure letter failed', e)
                            alert('Could not create the PDF. Please try again.')
                          } finally { setPcsClosureLetterBusy(false) }
                        }}
                        className="w-full min-h-[40px] rounded-xl border-2 border-violet-600 text-violet-700 text-sm font-bold hover:bg-violet-50 disabled:opacity-60">
                        {pcsClosureLetterBusy ? 'Preparing PDF…' : 'Download Pastoral Closure Letter (PDF)'}
                      </button>
                    </div>
                  )}
                  {/* Deacon Office Management — last subsection of Church Journey (Founder / Senior Pastor edit) */}
                  {logDeaconGuard(isFounder, userProfile, user)}
                  <DeaconOfficeCard
                    entry={entry}
                    canManage={canManageDeacons(isFounder, userProfile, user) && !isPendingDiscard}
                    managerName={userProfile?.displayName || userProfile?.email || ''}
                    onSaved={(office) => setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, deaconOffice: office } : e))}
                  />
                </Section>

                {(baptismRecorded || f.baptised === 'no' || !pcsExpandedLoading || f.isFirstChurch || f.previousChurchName || f.previousChurchPlace) && (
                  <Section title="Spiritual" color="#5b21b6">
                    {baptismRecorded ? (() => {
                      // "Baptised on 14 Feb 2022 at ROLCC" — or "Baptised: Yes" plus a
                      // pointer to Edit when the details are only partly recorded.
                      const on = formatShortDate(f.baptismDate)
                      const at = [f.baptismChurch, f.baptismPlace].filter(Boolean).join(', ')
                      const partial = !on || !at
                      return (
                        <div className="col-span-2 py-1.5">
                          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            {on || at ? `Baptised${on ? ` on ${on}` : ''}${at ? ` at ${at}` : ''}` : 'Baptised: Yes'}
                          </p>
                          {/* Written by a Caring Events baptism record */}
                          {(f.baptismBatch || f.baptismSerialNo) && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Batch {f.baptismBatch || '—'}{f.baptismSerialNo ? ` · Serial #${String(f.baptismSerialNo).padStart(2, '0')}` : ''}
                            </p>
                          )}
                          {partial && !isPendingDiscard && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Baptism {!on && !at ? 'date and church are' : !on ? 'date is' : 'church is'} not recorded.{' '}
                              {canEdit && <button type="button" onClick={() => setPcsEditingId(entry.id)} className="font-semibold text-violet-700 hover:underline">Add in Edit</button>}
                            </p>
                          )}
                        </div>
                      )
                    })() : row('Baptised', f.baptised === 'no' ? 'No' : null, { optional: true })}
                    {row('First Church', f.isFirstChurch === 'yes' ? 'Yes' : f.isFirstChurch === 'no' ? 'No' : null, { optional: true })}
                    {f.isFirstChurch !== 'yes' && row('Previous Church', f.previousChurchName, { optional: true })}
                    {f.isFirstChurch !== 'yes' && row('Previous Church Location', f.previousChurchPlace, { optional: true })}
                    {baptismRecorded && !pcsExpandedLoading && (() => {
                      // Certificate of Baptism on the official template (utils/baptismCertificate.js).
                      // Only for ROLCC in-house baptisms — external ones get an info badge instead.
                      // Parents come from linked parent profiles (adult-child links), birthplace
                      // from Native Place; blanks stay as lines to fill by hand.
                      const elig = baptismCertificateEligibility({
                        baptised: f.baptised, baptismChurch: f.baptismChurch,
                        baptismBatch: f.baptismBatch, baptismEventId: pcsExpandedProfile?.baptismEventId,
                      })
                      if (!elig.ok) {
                        if (elig.reason === 'not_baptised') return null
                        return (
                          <div className="col-span-2 pt-2">
                            <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {elig.reason === 'external'
                                ? `Baptized Externally: ${elig.church}`
                                : 'Baptism church not recorded'}
                            </span>
                            <p className="text-[11px] text-slate-400 mt-1">
                              {elig.reason === 'external'
                                ? 'Baptized at another church (Certificate not issued by ROLCC).'
                                : 'Set the Baptism Church to River of Life Christian Church to issue a ROLCC certificate.'}
                            </p>
                          </div>
                        )
                      }
                      const cert = () => [{
                        inHouse: true,
                        name: f.name || entry.name,
                        // Father & mother from the profile; else linked parent profiles
                        parents: parentsLine(f.fatherName, f.motherName) || (pcsExpandedProfile?.parents || []).map(x => x?.name).filter(Boolean).join(' & '),
                        gender: f.gender || '',
                        birthplace: f.nativity || '',
                        baptismDate: f.baptismDate || '',
                        officiant: pcsExpandedProfile?.baptismOfficiant || '',
                        regNo: baptismRegNo(f.baptismBatch, f.baptismSerialNo),
                      }]
                      const run = async (fn) => {
                        setPcsCertBusy(true)
                        try { await fn(cert()) } catch (e) { console.error('Baptism certificate', e); alert('Could not create the certificate. Please try again.') }
                        setPcsCertBusy(false)
                      }
                      return (
                        <div className="col-span-2 pt-2 flex gap-2">
                          <button type="button" disabled={pcsCertBusy} onClick={() => run(downloadBaptismCertificates)}
                            className="flex-1 min-h-[40px] rounded-xl bg-[#1e3a5f] text-white text-sm font-bold hover:bg-[#16304f] disabled:opacity-60">
                            {pcsCertBusy ? 'Preparing…' : 'Download Baptism Certificate'}
                          </button>
                          <button type="button" disabled={pcsCertBusy} onClick={() => run(printBaptismCertificates)}
                            className="min-h-[40px] px-4 rounded-xl border-2 border-[#1e3a5f] text-[#1e3a5f] text-sm font-bold hover:bg-slate-50 disabled:opacity-60">
                            Print
                          </button>
                        </div>
                      )
                    })()}
                    {!baptismRecorded && !pcsExpandedLoading && (
                      <div className="col-span-2 pt-2 space-y-2">
                        {/* Application → Cell Leader sign-off → MCQ exam, once an application exists */}
                        <BaptismEntryProgress pcsEntryId={entry.id} />
                        <button type="button" {...appTriggerGuard} onClick={() => openApplication(setPcsBaptismOpenFor)}
                          className={`w-full flex items-center justify-center gap-2 min-h-[40px] rounded-xl text-sm font-bold transition-colors ${f.baptised === 'no'
                                      ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm'
                                      : 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100'}`}>
                          {f.baptised === 'no' ? 'Baptism Application & QR' : '+ Baptism Application'}
                        </button>
                      </div>
                    )}
                    {/* Baby Dedication — married members only (same check guards the modal) */}
                    {canEdit && !isPendingDiscard && !pcsExpandedLoading && (
                      <div className="col-span-2 pt-2">
                        {canApplyDedication ? (
                          <button type="button" {...appTriggerGuard} onClick={() => openApplication(setPcsDedicationOpenFor)}
                            className="w-full flex items-center justify-center gap-2 min-h-[40px] rounded-xl text-sm font-bold bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 transition-colors">
                            + Baby Dedication Application
                          </button>
                        ) : (
                          <button type="button" disabled title={DEDICATION_MARRIED_ONLY_MSG} aria-describedby={`ded-note-${entry.id}`}
                            className="w-full flex items-center justify-center gap-2 min-h-[40px] rounded-xl text-sm font-bold bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed">
                            + Baby Dedication Application
                          </button>
                        )}
                        {!canApplyDedication && <p id={`ded-note-${entry.id}`} className="text-[10px] text-slate-400 mt-1 text-center">{DEDICATION_MARRIED_ONLY_MSG}</p>}
                      </div>
                    )}
                  </Section>
                )}

                {(f.membershipStatus || pcsMembershipApp || canEdit) && (
                  <Section title="Membership" color="#92400e">
                    {f.membershipStatus && row('Status', f.membershipStatus === 'member' ? 'Member' : 'Membership – In Progress')}
                    {/* Membership Onboarding Pipeline — 8 stages (utils/membershipPipeline.js) */}
                    {hasMembershipPipeline(entry) ? (
                      <div className="col-span-2 pt-2 pb-1">
                        <MembershipPipelineTracker
                          entry={entry}
                          stages={resolveMembershipStages(entry, { hasCell: !!_cg, baptised: baptismRecorded, application: pcsMembershipApp })}
                          application={pcsMembershipApp}
                          cellLeaderName={_cg?.leader || ''}
                          canCaring={!!canEdit}
                          canPastor={!!(isFounder || isSeniorPastor)}
                          by={userProfile?.displayName || userProfile?.email || ''}
                          onChanged={(id, fn, patch) => {
                            onPipelineChanged(id, fn, patch)
                            if (patch?.membershipNumber) setF(p => ({ ...p, membershipNumber: patch.membershipNumber, membershipStatus: 'member' }))
                          }}
                        />
                      </div>
                    ) : canEdit && !isPendingDiscard && f.membershipStatus !== 'member' && (
                      <div className="col-span-2 pt-2">
                        <button type="button" disabled={pcsPipelineStarting}
                          onClick={async () => {
                            setPcsPipelineStarting(true)
                            try {
                              const pipeline = await startMembershipPipeline(entry, userProfile?.displayName || userProfile?.email || '')
                              onPipelineChanged(entry.id, () => pipeline)
                              setF(p => ({ ...p, membershipStatus: 'applying' }))
                            } catch (e) { console.error('startMembershipPipeline', e); alert('Could not start the membership process. Please try again.') }
                            setPcsPipelineStarting(false)
                          }}
                          className="w-full min-h-[40px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">
                          {pcsPipelineStarting ? 'Starting…' : '+ Initiate Membership Process'}
                        </button>
                      </div>
                    )}
                    {f.membershipStatus && row('Membership No.', f.membershipNumber)}
                    {pcsMembershipApp && row('Membership Application',
                      pcsMembershipApp.status === 'pending' ? 'Sent · waiting for applicant' : MEMBERSHIP_DECISIONS[pcsMembershipApp.status] || pcsMembershipApp.status,
                      { wide: true })}
                    {/* Certificate of Membership — for members / approved applications */}
                    {(f.membershipStatus === 'member' || pcsMembershipApp?.status === 'approved') && (
                      <div className="col-span-2 pt-2">
                        <button type="button"
                          onClick={() => openMembershipCertificate(membershipCertificateData(
                            { name: f.name || entry.name, membershipNumber: f.membershipNumber, serviceAttended: f.serviceAttended }, pcsMembershipApp))}
                          className="w-full min-h-[40px] rounded-xl bg-[#0d5c46] text-white text-sm font-bold hover:bg-[#168a68] disabled:opacity-60">
                          View Membership Certificate
                        </button>
                        <button type="button"
                          onClick={() => openMembershipIdCard(membershipCertificateData(
                            { name: f.name || entry.name, membershipNumber: f.membershipNumber, serviceAttended: f.serviceAttended }, pcsMembershipApp))}
                          className="mt-2 w-full min-h-[40px] rounded-xl border border-[#0d5c46] text-[#0d5c46] text-sm font-bold hover:bg-emerald-50">
                          View Membership ID Card
                        </button>
                      </div>
                    )}
                    {canEdit && !isPendingDiscard && membershipBlocked && !pcsExpandedLoading && (
                      <div className="col-span-2 pt-2"><MembershipPrereqNotice /></div>
                    )}
                    {canEdit && !isPendingDiscard && !membershipBlocked && (
                      <div className="col-span-2 pt-2">
                        <button type="button" {...appTriggerGuard} onClick={() => openApplication(setPcsMembershipOpenFor)}
                          className="w-full flex items-center justify-center gap-2 min-h-[40px] rounded-xl text-sm font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors">
                          {pcsMembershipApp ? 'Membership Application & QR' : 'Generate QR Code for Applicant'}
                        </button>
                      </div>
                    )}
                  </Section>
                )}
              </div>

              {/* Side — ministry, notes, history, submitted forms */}
              <div className="min-w-0">

                {ministryAll.length > 0 && (
                  <Section title="Ministry & Leadership" color="#1e3a5f" grid={false}>
                    <div className="space-y-1.5 pt-1">
                      {ministryAll.map((r, i) => <MinistryRow key={r.id || i} r={r} />)}
                    </div>
                  </Section>
                )}

                <Section title="Notes" color="#475569" grid={false}>
                  {profileNotes
                    ? <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap pt-1">{profileNotes}</p>
                    : <p className="text-[13px] text-slate-300 pt-1">No notes recorded</p>}
                </Section>

                <Section title="Activity History" color="#4338ca" grid={false}>
                  {historyItems.length === 0
                    ? <p className="text-[13px] text-slate-300 pt-1">No history yet</p>
                    : (
                      <ul className="space-y-2 pt-1">
                        {historyItems.map((h, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.warn ? 'bg-red-500' : 'bg-indigo-300'}`} />
                            <div className="min-w-0 flex-1">
                              <p className={`text-[13px] font-medium leading-snug ${h.warn ? 'text-red-600' : 'text-slate-700'}`}>{h.what}</p>
                              {h.when && <p className="text-[10px] text-slate-400">{h.when}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                </Section>

                {/* Submitted Applications & Forms — every digital form this person
                    has completed (Baptism, Baby Dedication, Membership). */}
                {(() => {
                  const submitted = APPLICATION_TYPE_KEYS.flatMap(type =>
                    (pcsEntryApps[type] || []).filter(a => a.status && a.status !== 'pending').map(app => ({ type, app })))
                  if (!submitted.length) return null
                  return (
                    <Section title="Submitted Applications & Forms" color="#0f766e" grid={false}>
                      <ul className="space-y-2 pt-1">
                        {submitted.map(({ type, app }) => {
                          const st = applicationStatus(app, pcsCaringEvents)
                          const sub = app.submittedAt ? new Date(app.submittedAt) : null
                          return (
                            <li key={`${type}-${app.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-slate-800 leading-snug">{APPLICATION_TYPES[type].label}</p>
                                <p className="text-[10px] text-slate-400">
                                  Submitted {sub && !isNaN(sub.getTime()) ? fmtD(sub) : '—'}{type === 'dedication' && APPLICATION_TYPES.dedication.title(app) ? ` · ${APPLICATION_TYPES.dedication.title(app)}` : ''}
                                </p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                              <button type="button" onClick={() => setPcsAppViewing({ type, app })}
                                className="text-[11px] font-bold text-indigo-700 hover:underline">View Submitted Form</button>
                            </li>
                          )
                        })}
                      </ul>
                    </Section>
                  )
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 @xl:px-8 py-2 flex items-center justify-between gap-3">
              <span className="text-[10px] text-slate-400">River Of Life Church, Bangalore</span>
              <span className="text-[10px] text-slate-400 font-semibold">PCS · Confidential Record</span>
            </div>

          </div>
        </div>
      )
    }

    return (
      <div className="border-t-2 border-amber-400 bg-slate-50 px-2 py-3 sm:px-4 sm:py-4">
        {pcsExpandedLoading && (
          <p className="text-xs text-slate-400 text-center py-6">Loading profile…</p>
        )}
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <span className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full">Editing profile</span>
          <button type="button" onClick={() => { setPcsEditingId(null); setPcsFormDirty(false) }} className="text-xs text-slate-500 hover:text-slate-700 font-medium">← Back to stamp</button>
        </div>
        <div className="mb-2 empty:hidden"><CellPrereqBanner /></div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* ═══ Identity header ═══ */}
          <div className="px-4 py-3 flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50">
            {/* Photo */}
            <div className="relative flex-shrink-0">
              {pcsPhotoPreview
                ? <img src={pcsPhotoPreview} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-indigo-200 shadow" />
                : <div className={`w-14 h-14 rounded-full text-white text-lg font-bold flex items-center justify-center shadow ${f.membershipNumber ? 'bg-amber-500' : 'bg-indigo-500'}`}>
                    {(f.name || '?')[0].toUpperCase()}
                  </div>
              }
              {/* Camera capture button — only for members */}
              {!!f.membershipNumber && (
                <label title="Take member photo" className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center cursor-pointer shadow transition-colors">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1 5a2 2 0 0 1 2-2h1.172a2 2 0 0 0 1.414-.586l.828-.828A2 2 0 0 1 7.828 1h.344a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 11.828 3H13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5zm7 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="currentColor"/></svg>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return
                    setPcsPhotoFile(file)
                    setPcsPhotoPreview(URL.createObjectURL(file))
                  }} />
                </label>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-slate-800">{getMemberDisplayName(f) || '—'}</p>
                {String(f.displayName || '').trim() && f.name && <span className="text-[11px] text-slate-400">Legal: {f.name}</span>}
                {f.membershipNumber && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Member #{f.membershipNumber}</span>}
                {f.leadershipPosition && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{f.leadershipPosition}</span>}
                {churchDuration && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">{churchDuration} in church</span>}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{[f.phone, f.email].filter(Boolean).join(' · ') || 'No contact info'}</p>
              {/* Overall completeness bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${barCls(overallFill)}`} style={{ width: `${Math.round(overallFill * 100)}%` }} />
                </div>
                <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${pctCls(overallFill)}`}>{pctStr(overallFill)} complete</span>
              </div>
              {/* Upload from gallery — only for members */}
              {!!f.membershipNumber && (
                <label className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-amber-600 cursor-pointer hover:text-amber-800">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg>
                  Upload member photo
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return
                    setPcsPhotoFile(file)
                    setPcsPhotoPreview(URL.createObjectURL(file))
                  }} />
                </label>
              )}
            </div>
          </div>

          {/* ═══ Status — Active | Away (travel/vacation), first thing on the profile; saves on its own ═══ */}
          <div className="px-4 py-3 border-b border-slate-100">
            <PcsAwayControl
              key={`${entry.id}-${entry.away ? 'away' : 'active'}`}
              entry={entry}
              canEdit={canEdit}
              suggestedFrom={suggestAwayStart(entry)}
              updatedBy={userProfile?.displayName || userProfile?.email || ''}
              onSaved={(patch) => setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...patch } : e))}
            />
          </div>

          {/* ═══ SECTION 1 · Visitor Data ═══ */}
          <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-blue-300">
            <SecHeader label="Visitor Data" fill={s1Fill} labelColor="text-blue-700" headerBg="bg-blue-50 border-b border-blue-100" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fld('Name', 'name')}
              {/* Display Name — optional; other departments' rosters show this
                  instead of the official name (see utils/displayName.js). */}
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Display Name</p>
                <input type="text" placeholder="e.g. Sam, Alex, Jo" value={f.displayName || ''}
                  onChange={e => setF(p => ({ ...p, displayName: e.target.value }))} className={inp} />
                <p className="text-[9px] text-slate-400 leading-snug">Shown across all other department rosters instead of the full official name.</p>
              </div>
              {/* Phone — country code + number */}
              {(() => {
                const CODES = [
                  { code: '+91',  label: '🇮🇳 +91'  },
                  { code: '+971', label: '🇦🇪 +971' },
                  { code: '+1',   label: '🇺🇸 +1'   },
                  { code: '+44',  label: '🇬🇧 +44'  },
                  { code: '+61',  label: '🇦🇺 +61'  },
                  { code: '+65',  label: '🇸🇬 +65'  },
                  { code: '+60',  label: '🇲🇾 +60'  },
                  { code: '+966', label: '🇸🇦 +966' },
                  { code: '+974', label: '🇶🇦 +974' },
                  { code: '+965', label: '🇰🇼 +965' },
                  { code: '+973', label: '🇧🇭 +973' },
                  { code: '+64',  label: '🇳🇿 +64'  },
                  { code: '+49',  label: '🇩🇪 +49'  },
                ]
                const parsePhone = (val) => {
                  const v = (val || '').trim()
                  for (const { code } of CODES) {
                    if (v.startsWith(code + ' ')) return { code, number: v.slice(code.length + 1) }
                    if (v.startsWith(code) && v.length > code.length) return { code, number: v.slice(code.length) }
                  }
                  return { code: '+91', number: v }
                }
                const { code: cc, number: num } = parsePhone(f.phone)
                return (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Phone</p>
                    <div className="flex gap-1">
                      <select
                        value={cc}
                        onChange={e => setF(p => ({ ...p, phone: e.target.value + ' ' + num }))}
                        className="px-1.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200 flex-shrink-0"
                      >
                        {CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                      <input
                        type="tel"
                        placeholder="Number"
                        value={num}
                        onChange={e => setF(p => ({ ...p, phone: cc + ' ' + e.target.value }))}
                        className={`${inp} flex-1 min-w-0`}
                      />
                    </div>
                  </div>
                )
              })()}
              {fld('Email', 'email', 'email')}
              {fld('Date of Birth', 'dob', 'date')}
              {fld('Nativity / Hometown', 'nativity')}
              {fld('Current Place', 'currentPlace')}
              {fld('Service Attended', 'serviceAttended')}
              {/* How Known / Referred By — searchable: standard answers + D Light people.
                  Saves the text to howKnown (as before) and the linked D Light record
                  to howKnownRefId; older free-text answers still display. */}
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">How Known / Referred by</p>
                <ReferrerCombobox
                  value={f.howKnown || ''}
                  refId={f.howKnownRefId || ''}
                  onChange={({ name, refId }) => setF(p => ({ ...p, howKnown: name, howKnownRefId: refId }))}
                  className={inp}
                />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">First Visit Date</p>
                <DateInput value={f.attendedDate || ''} onChange={e => { const val = e.target.value; const yr = val ? new Date(val).getFullYear() : null; setF(p => ({ ...p, attendedDate: val, ...(yr && yr >= VISITOR_START_YEAR ? { year: yr } : {}) })) }} className={inp} />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Year</p>
                <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
                  {f.year || (f.attendedDate ? new Date(f.attendedDate).getFullYear() : '—')}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SECTION 1.5 · Personal Data ═══ */}
          <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-teal-300">
            <SecHeader label="Personal Data" fill={sPersonalFill} labelColor="text-teal-700" headerBg="bg-teal-50 border-b border-teal-100" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* Gender — drives "husband first" ordering on spouse-paired
                  Family View cards in the First Lady hub */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Gender</p>
                <select
                  value={f.gender}
                  onChange={e => setF(p => ({ ...p, gender: e.target.value }))}
                  className={inp}>
                  <option value="">— Select —</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {/* Parents — printed on the Certificate of Baptism ("Son of" / "Daughter of") */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Father's Name</p>
                <input type="text" value={f.fatherName || ''} onChange={e => setF(p => ({ ...p, fatherName: e.target.value }))} className={inp} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Mother's Name</p>
                <input type="text" value={f.motherName || ''} onChange={e => setF(p => ({ ...p, motherName: e.target.value }))} className={inp} />
              </div>

              {/* Marital status */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Marital Status</p>
                <select
                  value={f.maritalStatus}
                  onChange={e => setF(p => withMaritalStatus(p, e.target.value))}
                  className={inp}>
                  <option value="">— Select —</option>
                  {['Single','Married','Widowed','Divorced'].map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Marriage details — only when Married */}
              {f.maritalStatus === 'Married' && (<>
                {fld('Marriage Date', 'marriageDate', 'date')}
                <div className="space-y-0.5 relative">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Spouse Name</p>
                  <input
                    type="text"
                    placeholder="Search or type name…"
                    value={f.spouseName}
                    onChange={e => {
                      setF(p => ({ ...p, spouseName: e.target.value, spouseVisitorId: '' }))
                      setPcsSpouseFocused(true)
                    }}
                    onFocus={() => setPcsSpouseFocused(true)}
                    onBlur={() => setTimeout(() => setPcsSpouseFocused(false), 150)}
                    className={inp}
                  />
                  {/* Linked badge */}
                  {f.spouseVisitorId && (
                    <span className="absolute right-2 top-7 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">linked</span>
                  )}
                  {/* Typeahead dropdown */}
                  {pcsSpouseFocused && f.spouseName.trim().length >= 2 && (() => {
                    const q = f.spouseName.trim().toLowerCase()
                    const matches = pcsEntries
                      .filter(e => e.id !== entry.id && e.name && e.name.toLowerCase().includes(q))
                      .slice(0, 6)
                    if (!matches.length) return null
                    return (
                      <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                        {matches.map(m => (
                          <button key={m.id} type="button"
                            onMouseDown={() => {
                              setF(p => ({ ...p, spouseName: m.name, spouseVisitorId: m.visitorId || m.id }))
                              setPcsSpouseFocused(false)
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 flex items-center gap-2">
                            <span className="font-semibold text-slate-800 flex-1">{getMemberDisplayName(m)}{String(m.displayName || '').trim() && <span className="font-normal text-slate-400"> · {m.name}</span>}</span>
                            {m.phone && <span className="text-slate-400">{m.phone}</span>}
                            <span className="text-[9px] font-bold text-teal-500 bg-teal-50 border border-teal-200 rounded-full px-1.5 py-0.5 flex-shrink-0">ROL</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </>)}

              {/* Do they have kids? — hidden for Single */}
              {f.maritalStatus !== 'Single' && (
              <div className="space-y-1 sm:col-span-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Do they have kids?</p>
                <select
                  value={f.hasKids || ''}
                  onChange={e => setF(p => ({ ...p, hasKids: e.target.value }))}
                  className={inp}>
                  <option value="">— Select —</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              )}
            </div>

            {/* Children list — one card per child: header (name / number + delete),
                Row 1 type + name/search, Row 2 Sunday School · DOB · gender. */}
            {f.maritalStatus !== 'Single' && f.hasKids === 'yes' && (() => {
              const lbl = 'text-xs font-semibold text-slate-600 tracking-wide mb-1.5 block'
              const fi = 'w-full h-10 px-3 py-2 text-sm text-slate-800 bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'
              const linkedPill = 'bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full border border-emerald-200 font-medium inline-flex items-center gap-1 mt-1.5'
              const cardHeader = (child, idx) => (
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-800 text-sm md:text-base min-w-0 truncate">
                    {child.name.trim() ? `Child: ${child.name.trim()}` : `Child #${idx + 1}`}
                  </p>
                  <button type="button" onClick={() => removeChildRow(child.id)}
                    aria-label={`Remove ${child.name.trim() || `child #${idx + 1}`}`}
                    className="w-9 h-9 -mr-1.5 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
              const typeSelect = (child, onChange) => (
                <div>
                  <label className={lbl} htmlFor={`child-type-${child.id}`}>Child type</label>
                  <select id={`child-type-${child.id}`} value={child.childType === 'adult' ? 'adult' : 'minor'} onChange={onChange} className={fi}>
                    <option value="minor">Minor (Sunday School / River Kids)</option>
                    <option value="adult">Adult son / daughter</option>
                  </select>
                </div>
              )
              return (
              <div className="mt-4">
                {children.map((child, idx) => child.childType === 'adult' ? (
                  // ── Adult son/daughter: search & link an existing PCS member, or
                  //    just type a full name if they aren't in PCS yet. ──
                  <div key={child.id} className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 md:p-5 mb-4 shadow-sm space-y-4 relative">
                    {cardHeader(child, idx)}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {typeSelect(child, e => updateChildRow(child.id, { childType: e.target.value, linkedChildMemberId: '' }))}
                      <div className="relative">
                        <label className={lbl} htmlFor={`child-name-${child.id}`}>Search &amp; link existing member</label>
                        <input
                          id={`child-name-${child.id}`}
                          type="text"
                          placeholder="Search PCS by name or phone…"
                          value={child.name}
                          onChange={e => updateChildRow(child.id, { name: e.target.value, linkedChildMemberId: '' })}
                          onFocus={() => setPcsChildSearchOpenId(child.id)}
                          onBlur={() => setTimeout(() => setPcsChildSearchOpenId(prev => prev === child.id ? null : prev), 150)}
                          className={fi}
                        />
                        {child.linkedChildMemberId
                          ? <span className={linkedPill}>✔ Linked to their PCS profile</span>
                          : child.name.trim() && <p className="text-xs text-slate-500 mt-1.5">Not linked: saved as a name only (not in PCS yet)</p>}
                        {pcsChildSearchOpenId === child.id && child.name.trim().length >= 1 && (() => {
                          const q = child.name.trim().toLowerCase()
                          const qPhone = q.replace(/\s+/g, '')
                          const takenIds = new Set(children.filter(c => c.id !== child.id && c.linkedChildMemberId).map(c => c.linkedChildMemberId))
                          const matches = pcsEntries
                            .filter(e => e.id !== entry.id && !String(e.id).startsWith('temp_') && !takenIds.has(e.id))
                            .filter(e => (e.name || '').toLowerCase().includes(q) || (qPhone.length >= 3 && String(e.phone || '').replace(/\s+/g, '').includes(qPhone)))
                            .slice(0, 6)
                          if (!matches.length) return null
                          return (
                            <div className="absolute z-20 top-[4.25rem] left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                              {matches.map(m => (
                                <button key={m.id} type="button"
                                  onMouseDown={() => { updateChildRow(child.id, { name: m.name, linkedChildMemberId: m.id }); setPcsChildSearchOpenId(null) }}
                                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-teal-50 flex items-center gap-2">
                                  <span className="font-semibold text-slate-800 flex-1 truncate">{getMemberDisplayName(m)}{String(m.displayName || '').trim() && <span className="font-normal text-slate-400"> · {m.name}</span>}</span>
                                  {m.phone && <span className="text-xs text-slate-400 flex-shrink-0">{m.phone}</span>}
                                </button>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={child.id} className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 md:p-5 mb-4 shadow-sm space-y-4 relative">
                    {cardHeader(child, idx)}
                    {/* Row 1 — type + name / River Kids search */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {typeSelect(child, e => updateChildRow(child.id, { childType: e.target.value, inRiverKids: '', riverKidsChildId: '' }))}
                      <div className="relative">
                        <label className={lbl} htmlFor={`child-name-${child.id}`}>
                          {child.inRiverKids === 'yes' ? 'Search River Kids registry' : "Child's name"}
                        </label>
                        {child.inRiverKids === 'yes' ? (
                          <>
                            <input
                              id={`child-name-${child.id}`}
                              type="text"
                              placeholder="Search by name…"
                              value={child.name}
                              onChange={e => updateChildRow(child.id, { name: e.target.value, riverKidsChildId: '' })}
                              onFocus={() => setPcsChildSearchOpenId(child.id)}
                              onBlur={() => setTimeout(() => setPcsChildSearchOpenId(prev => prev === child.id ? null : prev), 150)}
                              className={fi}
                            />
                            {child.riverKidsChildId && <span className={linkedPill}>✔ Linked to River Kids</span>}
                            {pcsChildSearchOpenId === child.id && child.name.trim().length >= 1 && (() => {
                              const q = child.name.trim().toLowerCase()
                              const matches = rkChildrenForPCS.filter(k => (k.name || '').toLowerCase().includes(q)).slice(0, 6)
                              if (!matches.length) return null
                              return (
                                <div className="absolute z-20 top-[4.25rem] left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                                  {matches.map(k => (
                                    <button key={k.id} type="button"
                                      onMouseDown={() => { updateChildRow(child.id, { name: k.name, riverKidsChildId: k.id }); setPcsChildSearchOpenId(null) }}
                                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-teal-50 flex items-center gap-2">
                                      <span className="font-semibold text-slate-800 flex-1">{k.name}</span>
                                      <span className="text-[11px] font-semibold text-teal-600 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 flex-shrink-0">
                                        {(k.classGroups || []).length ? k.classGroups.map(rkClassGroupLabel).join(', ') : 'River Kids'}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )
                            })()}
                          </>
                        ) : (
                          <input
                            id={`child-name-${child.id}`}
                            type="text"
                            placeholder="Child's name"
                            value={child.name}
                            onChange={e => updateChildRow(child.id, { name: e.target.value })}
                            className={fi}
                          />
                        )}
                      </div>
                    </div>
                    {/* Row 2 — Sunday School · date of birth · gender */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className={lbl} htmlFor={`child-rk-${child.id}`}>Attending Sunday School?</label>
                        <select
                          id={`child-rk-${child.id}`}
                          value={child.inRiverKids || ''}
                          onChange={e => updateChildRow(child.id, { inRiverKids: e.target.value, ...(e.target.value !== 'yes' ? { riverKidsChildId: '' } : {}) })}
                          className={fi}>
                          <option value="">Select…</option>
                          <option value="yes">Yes, River Kids</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl} htmlFor={`child-dob-${child.id}`}>Date of birth</label>
                        <DateInput id={`child-dob-${child.id}`} value={child.dob || ''} onChange={e => updateChildRow(child.id, { dob: e.target.value })} className={fi} />
                      </div>
                      <div>
                        <label className={lbl} htmlFor={`child-gender-${child.id}`}>Gender</label>
                        <select id={`child-gender-${child.id}`} value={child.gender || ''} onChange={e => updateChildRow(child.id, { gender: e.target.value })} className={fi}>
                          <option value="">Select…</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addChildRow}
                  className="w-full py-3 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-600 font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  Add Child
                </button>
              </div>
              )
            })()}
          </div>

          {/* ═══ SECTION 2 · Church Journey ═══ */}
          <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-emerald-300">
            <div className="-mx-4 -mt-3 mb-4 px-4 py-3 flex items-center gap-3 bg-emerald-50 border-b border-emerald-100">
              <span className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${dotCls(s2Fill)}`} />
              <p className="text-sm font-bold tracking-tight text-emerald-700">Church Journey</p>
              {churchDuration && <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{churchDuration}</span>}
            </div>

            {/* Engagement Type — decides whether Sunday or cell attendance judges this person */}
            <div className="mb-3 space-y-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Engagement Type</p>
              <select
                value={normalizeEngagementType(f.engagementType)}
                onChange={e => setF(p => ({ ...p, engagementType: e.target.value }))}
                className={`${inp} sm:max-w-xs`}>
                {ENGAGEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Attendance alert — Sunday absences for Sunday-going people (helps the Caring
                Director judge whether to push for cell assignment); Cell Health for Cell Only.
                Follows the saved Engagement Type, so it changes once the form is saved. */}
            <div className="mb-2"><AbsenceDiagnostics entry={entry} /></div>

            {isCurrentlyAway(entry) ? null : isCellOnly(entry) ? (() => {
              const health = getCellHealth(entry)
              return (
                <div className={`mb-3 inline-flex flex-wrap items-center gap-1.5 text-xs font-bold border px-3 py-1.5 rounded-full ${CELL_HEALTH_BADGE_CLS[health.tier]}`}>
                  {health.label}
                  {health.meetings > 0 && <span className="font-medium opacity-80">· {health.count} of {health.meetings} meetings in 4 weeks</span>}
                </div>
              )
            })() : (() => {
              const absentWeeks = getSundayAbsentWeeks(entry)
              if (absentWeeks < 4) return null
              return (
                <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-300 px-3 py-1.5 rounded-full">
                  ⚠️ Absent for {absentWeeks} consecutive Sundays
                </div>
              )
            })()}

            {/* Cell connection */}
            {(() => {
              const cellMember = _cellMember
              const cg = _cg
              const notified = cellReferralSent
              const notifying = cellReferralSending

              // All memberships for this person (history)
              const _np = (entry.phone || '').replace(/\s+/g, '')
              const allMemberships = allCellMembers
                .filter(m =>
                  (entry.visitorId && m.visitorId && m.visitorId === entry.visitorId) ||
                  (_np && m.phone && m.phone.replace(/\s+/g, '') === _np)
                )
                .sort((a, b) => (a.since || '').localeCompare(b.since || ''))
              const pastMemberships = allMemberships.filter(m => m.status === 'inactive')
              const fmtMon = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null

              return (
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cell Group</p>
                    {!cg && !isPastor && canEdit && (
                      notified
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Notification Sent
                          </span>
                        : <button type="button" disabled={notifying} onClick={sendCellReferral} className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50">
                            <svg width="9" height="9" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                            {notifying ? 'Sending…' : 'Notify Cell Director to Assign Cell'}
                          </button>
                    )}
                  </div>

                  {/* Current cell */}
                  {cg
                    ? <>
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                          <span className="font-semibold">{cg.cellName || 'Unnamed Cell'}</span>
                          {cg.leader ? <span className="text-emerald-600"> · {cg.leader}</span> : null}
                          {cellMember?.since ? <span className="text-slate-400"> · since {fmtMon(cellMember.since)}</span> : null}
                        </span>
                        {canEdit && (() => {
                          const inv = pcsInviteStatus[entry.id]
                          const inviting = pcsInvitingId === entry.id
                          if (inv?.status === 'completed') {
                            return (
                              <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                Profile filled by cell leader
                              </span>
                            )
                          }
                          if (inv?.status === 'pending') {
                            return (
                              <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                                Form sent to {inv.cellLeaderName || 'cell leader'}
                              </span>
                            )
                          }
                          return (
                            <button
                              type="button"
                              disabled={inviting}
                              onClick={async () => {
                                setPcsInvitingId(entry.id)
                                try {
                                  const invId = await sendPCSFillInvitation({
                                    pcsEntryId: entry.id,
                                    visitorId: entry.visitorId || '',
                                    personName: entry.name || '',
                                    cellId: cellMember.cellId,
                                    cellName: cg.cellName || '',
                                    cellLeaderName: cg.leader || '',
                                    sentBy: userProfile?.email || '',
                                  })
                                  setPcsInviteStatus(prev => ({ ...prev, [entry.id]: { id: invId, status: 'pending', cellLeaderName: cg.leader || '' } }))
                                } catch { alert('Failed to send invitation') }
                                setPcsInvitingId(null)
                              }}
                              className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50"
                            >
                              <svg width="9" height="9" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              {inviting ? 'Sending…' : 'Send profile form to cell leader'}
                            </button>
                          )
                        })()}
                      </>
                    : isPastor
                      ? <p className="text-xs font-medium text-amber-600">Exempt from cell group assignment — {SENIOR_PASTOR_TITLE}</p>
                      : <p className="text-xs text-slate-400">{entry.visitorId || _np ? 'Not currently in a cell group' : 'Link visitor record to see cell'}</p>
                  }

                  {/* Cell history */}
                  {pastMemberships.length > 0 && (
                    <div className="mt-2.5">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Cell History</p>
                      <div className="space-y-1">
                        {pastMemberships.map((m) => {
                          const pastCg = cellGroups.find(g => g.id === m.cellId)
                          const fromStr = fmtMon(m.since)
                          const toStr = fmtMon(m.leftDate)
                          return (
                            <div key={`${m.cellId}-${m.id}`} className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
                              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                              <div>
                                <span className="font-semibold text-slate-600">{pastCg?.cellName || 'Unknown Cell'}</span>
                                {(fromStr || toStr) && (
                                  <span className="text-slate-400 ml-1">
                                    · {fromStr || '?'} – {toStr || 'unknown'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Ministry — read-only, synced from duty rosters/assignments made by Ministry Leaders */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Ministry</p>
              {autoMinistry.length === 0 ? (
                <p className="text-xs text-slate-400 py-1">No active ministry assignments recorded by Ministry Leaders.</p>
              ) : (
                <div className="space-y-2">
                  {sortMinistry(autoMinistry).map((r) => <MinistryRow key={r.id} r={r} size="lg" />)}
                </div>
              )}
            </div>

          </div>

          {/* ═══ SECTION 3 · Spiritual Data ═══ */}
          <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-violet-300">
            <SecHeader label="Spiritual Data" fill={s3Fill} labelColor="text-violet-700" headerBg="bg-violet-50 border-b border-violet-100" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* Baptised? gate question */}
              <div className="space-y-1 sm:col-span-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Baptised?</p>
                <select
                  value={f.baptised}
                  onChange={e => setF(p => ({ ...p, baptised: e.target.value }))}
                  className={inp}>
                  <option value="">— Select —</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              {f.baptised === 'no' && (
                <div className="sm:col-span-3 py-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                    Not Baptised
                  </span>
                </div>
              )}

              {f.baptised === 'yes' && (<>
                {fld('Baptism Date', 'baptismDate', 'date')}
                {fld('Baptism Place', 'baptismPlace', 'text', 'Location')}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Baptism Church</p>
                  <select
                    value={f.baptismChurchIsOther ? 'other' : f.baptismChurch}
                    onChange={e => {
                      if (e.target.value === 'other') {
                        setF(p => ({ ...p, baptismChurchIsOther: true, baptismChurch: p.baptismChurch === 'River Of Life Christian Church' ? '' : p.baptismChurch }))
                      } else {
                        setF(p => ({ ...p, baptismChurch: e.target.value, baptismChurchIsOther: false }))
                      }
                    }}
                    className={inp}>
                    <option value="">— Select —</option>
                    <option value="River Of Life Christian Church">River Of Life Christian Church</option>
                    <option value="other">Other</option>
                  </select>
                  {f.baptismChurchIsOther && (
                    <input type="text" placeholder="Specify church name…"
                      value={f.baptismChurch}
                      onChange={e => setF(p => ({ ...p, baptismChurch: e.target.value }))}
                      className={`${inp} mt-1`} />
                  )}
                </div>
              </>)}

              {/* First church? gate question — previous church only when "No" */}
              <div className="space-y-1 sm:col-span-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Is this the first church they are attending?</p>
                <select
                  value={f.isFirstChurch || ''}
                  onChange={e => setF(p => withIsFirstChurch(p, e.target.value))}
                  className={inp}>
                  <option value="">— Select —</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              {/* Smooth expand: grid-rows 0fr → 1fr animates to the content's height */}
              <div
                className={`col-span-2 sm:col-span-3 grid transition-all duration-300 ease-out ${f.isFirstChurch === 'no' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                aria-hidden={f.isFirstChurch !== 'no'}
              >
                <div className="overflow-hidden">
                  {f.isFirstChurch === 'no' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {fld('Previous Church Name', 'previousChurchName')}
                      {fld('Previous Church Place / Location', 'previousChurchPlace')}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* ═══ SECTION 4 · Membership ═══ */}
          <div className="px-4 py-3 border-b border-slate-100 border-l-4 border-l-amber-300">
            <div className="-mx-4 -mt-3 mb-4 px-4 py-3 flex items-center gap-3 bg-amber-50 border-b border-amber-100">
              <span className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-300 ${f.membershipStatus ? dotCls(s4Fill) : 'bg-slate-300'}`} />
              <p className="text-sm font-bold tracking-tight text-amber-700">Membership</p>
              <div className="ml-auto flex-shrink-0 flex items-center gap-2">
                {!membershipBlocked && (
                <button type="button" {...appTriggerGuard} onClick={() => openApplication(setPcsMembershipOpenFor)}
                  className="text-xs font-bold text-amber-800 bg-white border border-amber-300 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors">
                  {pcsMembershipApp ? 'Application & QR' : 'QR for Applicant'}
                </button>
                )}
                {!f.membershipStatus && !membershipBlocked && (
                  <button type="button" onClick={() => setF(p => ({ ...p, membershipStatus: 'applying' }))}
                    className="text-xs font-bold text-amber-600 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full hover:bg-amber-200 transition-colors">
                    + Begin Application
                  </button>
                )}
                {f.membershipStatus && (
                  <select value={f.membershipStatus} onChange={e => setF(p => ({ ...p, membershipStatus: e.target.value }))}
                    className="text-xs border border-amber-200 rounded-lg px-2 py-1 bg-amber-100 text-amber-700 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-200">
                    <option value="applying">Applying</option>
                    <option value="member">Member</option>
                  </select>
                )}
              </div>
            </div>

            {f.membershipStatus ? (
              <div className="space-y-3">
                {/* Membership number */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Membership #</p>
                    <input type="text" placeholder="Assign number" value={f.membershipNumber || ''} onChange={e => setF(p => ({ ...p, membershipNumber: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-200" />
                  </div>
                </div>

                {/* Permanent address */}
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Permanent Address</p>
                  <textarea rows={2} placeholder="Full permanent address for membership records…" value={f.permanentAddress || ''} onChange={e => setF(p => ({ ...p, permanentAddress: e.target.value }))} className={`${inp} resize-none`} />
                </div>

                {/* Documents submitted */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Documents Submitted</p>
                  {membershipDocs.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {membershipDocs.map(d => (
                        <div key={d.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                          <select value={d.type} onChange={e => updateDocRow(d.id, 'type', e.target.value)} className={`${inp} text-xs`}>
                            <option value="">Document type…</option>
                            <option>Aadhaar Card</option>
                            <option>Passport</option>
                            <option>Driving License</option>
                            <option>Voter ID</option>
                            <option>PAN Card</option>
                            <option>Other</option>
                          </select>
                          <input type="text" placeholder="Document number" value={d.number} onChange={e => updateDocRow(d.id, 'number', e.target.value)} className={`${inp} text-xs`} />
                          <button type="button" onClick={() => removeDocRow(d.id)} className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 flex items-center justify-center transition-colors">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={addDocRow} className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 py-1 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    Add document
                  </button>
                </div>
              </div>
            ) : (
              membershipBlocked
                ? <MembershipPrereqNotice compact />
                : <p className="text-xs text-slate-400">No membership application yet. Click "+ Begin Application" to start.</p>
            )}
          </div>

          {/* ═══ Actions ═══ */}
          <div className="px-4 py-3 flex items-center gap-2">
            {pcsFormDirty && <button
              type="button"
              disabled={pcsExpandedSaving}
              onClick={async () => {
                setPcsExpandedSaving(true)
                try {
                  const { personId, name, phone, attendedDate, membershipNumber, leadershipPosition, year, email, dob, nativity, currentPlace, serviceAttended, howKnown,
                    ministries, gender, engagementType, displayName, howKnownRefId, fatherName, motherName,
                    baptised, baptismDate, baptismPlace, baptismChurch, maritalStatus, marriageDate, spouseName, spouseVisitorId,
                    hasKids, children, isFirstChurch, previousChurchName, previousChurchPlace,
                    membershipStatus, membershipDocs, permanentAddress } = f
                  const resolvedYear = year || (attendedDate ? new Date(attendedDate).getFullYear() : null)

                  // Upload photo if a new one was selected
                  let savedPhotoUrl = f.photoUrl || ''
                  if (pcsPhotoFile && entry.visitorId) {
                    try { savedPhotoUrl = await uploadMemberPhoto(entry.visitorId, pcsPhotoFile) || savedPhotoUrl } catch { /* non-fatal */ }
                    setPcsPhotoFile(null)
                  }

                  // Write to central people collection (PCS is the gatekeeper)
                  const personData = {
                    name, phone, email, dob, nativity, currentPlace,
                    firstVisitDate: attendedDate, serviceAttended, howKnown,
                    baptised, baptismDate, baptismPlace, baptismChurch,
                    maritalStatus, marriageDate, spouseName,
                    membershipStatus, membershipNumber, permanentAddress,
                    leadershipPosition, ministries: ministries || [],
                    stage: membershipStatus === 'member' ? 'member' : 'pcs',
                    ...(savedPhotoUrl ? { photoUrl: savedPhotoUrl } : {}),
                  }
                  let resolvedPersonId = personId
                  if (resolvedPersonId) {
                    await updatePerson(resolvedPersonId, personData, userProfile?.email || '')
                  } else if (entry.visitorId) {
                    resolvedPersonId = await addPerson({ ...personData, visitorId: entry.visitorId }, userProfile?.email || '')
                  } else {
                    // Legacy PCS entry with no D-Light visitor record: the visitor-first
                    // rule forbids creating a People record for it, so only PCS is saved.
                    resolvedPersonId = ''
                  }

                  await updatePCSEntry(entry.id, { name, phone, email, dob, nativity, currentPlace, serviceAttended, howKnown, attendedDate, membershipNumber, leadershipPosition, year: resolvedYear, ministries: ministries || [], personId: resolvedPersonId, engagementType, displayName: displayName || '', howKnownRefId: howKnownRefId || '' })
                  setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, name, phone, email, dob, nativity, currentPlace, serviceAttended, howKnown, attendedDate, membershipNumber, leadershipPosition, year: resolvedYear ? Number(resolvedYear) : null, ministries: ministries || [], personId: resolvedPersonId, engagementType: normalizeEngagementType(engagementType), displayName: String(displayName || '').trim(), howKnownRefId: howKnownRefId || '' } : e))
                  if (entry.visitorId) {
                    updateDelightVisitor(entry.visitorId, { name, phone, email, dob, nativity, currentPlace, serviceAttended, attendedDate, howKnown }).catch(() => {})
                    // displayName rides along so every other department's roster copy
                    // can label this person by it (official name stays the match key).
                    updateCellMembersByVisitorId(entry.visitorId, { name, phone, birthday: dob, displayName: displayName || '' }).catch(() => {})
                    updatePCSEntriesByVisitorId(entry.visitorId, { name, phone }).catch(() => {})
                    updateDeptTeamMembersByVisitorId(entry.visitorId, { name, phone, displayName: displayName || '' }).catch(() => {})
                    updateWorshipTeamMembersByVisitorId(entry.visitorId, { name, phone, displayName: displayName || '' }).catch(() => {})
                    upsertMemberProfile(entry.visitorId, {
                      phone, email, dob, nativity, currentPlace, gender, fatherName, motherName,
                      baptised, baptismDate, baptismPlace, baptismChurch, maritalStatus, marriageDate, spouseName, spouseVisitorId,
                      hasKids: hasKids || '',
                      children: hasKids === 'yes' ? (children || []) : [],
                      isFirstChurch: isFirstChurch || '',
                      previousChurchName: isFirstChurch === 'no' ? (previousChurchName || '') : '',
                      previousChurchPlace: isFirstChurch === 'no' ? (previousChurchPlace || '') : '',
                      membershipStatus,
                      membershipDocs: membershipDocs || [],
                      permanentAddress,
                      ...(savedPhotoUrl ? { photoUrl: savedPhotoUrl } : {}),
                    }, userProfile?.email || '').catch(() => {})
                  }

                  // Reciprocal spouse link — the spouse picker (above) matches against
                  // pcsEntries by name, so the matched entry there carries the actual
                  // visitorId/personId needed to mirror this marriage onto THEIR own
                  // member_profiles/people records too, not just this one. Without this,
                  // only the person being edited shows as married; the spouse's own
                  // profile stays untouched until someone happens to edit them separately.
                  // Note: member_profiles keys its reciprocal field `spouseVisitorId`
                  // (a visitor id) while people keys it `spousePersonId` (a people-doc
                  // id) — they're deliberately different id spaces, matching how each
                  // collection already stores this person's own spouse link above.
                  const prevSpouseVisitorId = (() => {
                    try { return JSON.parse(pcsSavedRef.current || '{}').spouseVisitorId || '' } catch { return '' }
                  })()
                  if (maritalStatus === 'Married' && spouseVisitorId) {
                    const spouseEntry = pcsEntries.find(e => e.id === spouseVisitorId || e.visitorId === spouseVisitorId)
                    if (spouseEntry) {
                      if (spouseEntry.visitorId) {
                        upsertMemberProfile(spouseEntry.visitorId, {
                          maritalStatus: 'Married', marriageDate, spouseName: name, spouseVisitorId: entry.visitorId || '',
                        }, userProfile?.email || '').catch(() => {})
                      }
                      if (spouseEntry.personId) {
                        updatePerson(spouseEntry.personId, {
                          maritalStatus: 'Married', marriageDate, spouseName: name, spousePersonId: resolvedPersonId || '',
                        }, userProfile?.email || '').catch(() => {})
                      }
                    }
                  }
                  // The spouse link changed (picked someone new, cleared it, or marital
                  // status moved off "Married") — unlink the old spouse's reciprocal
                  // pointer too, but only if it still points back to this person, so we
                  // never clobber a relationship they've since set with someone else in
                  // the meantime. pcsEntries doesn't carry the reciprocal field itself, so
                  // this reads the old spouse's own record fresh to check before clearing.
                  if (prevSpouseVisitorId && (prevSpouseVisitorId !== spouseVisitorId || maritalStatus !== 'Married')) {
                    const oldSpouseEntry = pcsEntries.find(e => e.id === prevSpouseVisitorId || e.visitorId === prevSpouseVisitorId)
                    if (oldSpouseEntry) {
                      if (oldSpouseEntry.visitorId) {
                        getMemberProfile(oldSpouseEntry.visitorId).then(p => {
                          if (p && p.spouseVisitorId === (entry.visitorId || '') && entry.visitorId) {
                            upsertMemberProfile(oldSpouseEntry.visitorId, { spouseName: '', spouseVisitorId: '' }, userProfile?.email || '').catch(() => {})
                          }
                        }).catch(() => {})
                      }
                      if (oldSpouseEntry.personId) {
                        getPerson(oldSpouseEntry.personId).then(p => {
                          if (p && p.spousePersonId === (resolvedPersonId || '') && resolvedPersonId) {
                            updatePerson(oldSpouseEntry.personId, { spouseName: '', spousePersonId: '' }, userProfile?.email || '').catch(() => {})
                          }
                        }).catch(() => {})
                      }
                    }
                  }

                  // Reciprocal adult-child links — mirror this person onto each linked
                  // adult child's member_profiles.parents (and unlink any child removed
                  // since the last save), so the child's own profile shows "Parent: …".
                  // Re-linking current children is idempotent and refreshes the name.
                  const linkedIdsOf = (list) => new Set((list || []).filter(c => c.childType === 'adult' && c.linkedChildMemberId).map(c => c.linkedChildMemberId))
                  const nowLinked = hasKids === 'yes' ? linkedIdsOf(children) : new Set()
                  const prevLinked = (() => {
                    try { const prev = JSON.parse(pcsSavedRef.current || '{}'); return prev.hasKids === 'yes' ? linkedIdsOf(prev.children) : new Set() } catch { return new Set() }
                  })()
                  const parentRef = { pcsEntryId: entry.id, visitorId: entry.visitorId || '', name }
                  const childVisitorIdOf = (pcsId) => pcsEntries.find(e => e.id === pcsId)?.visitorId || ''
                  nowLinked.forEach(id => setParentLinkOnChild(childVisitorIdOf(id), parentRef, true, userProfile?.email || '').catch(() => {}))
                  prevLinked.forEach(id => { if (!nowLinked.has(id)) setParentLinkOnChild(childVisitorIdOf(id), parentRef, false, userProfile?.email || '').catch(() => {}) })

                  if (savedPhotoUrl) setF(p => ({ ...p, photoUrl: savedPhotoUrl }))
                  pcsSavedRef.current = JSON.stringify(savedPhotoUrl ? { ...pcsExpandedForm, photoUrl: savedPhotoUrl } : pcsExpandedForm)
                  setPcsFormDirty(false)
                  setPcsEditingId(null)
                } catch { alert('Failed to save') }
                setPcsExpandedSaving(false)
              }}
              className="flex-1 min-h-[44px] py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 transition-colors"
            >{pcsExpandedSaving ? 'Saving…' : 'Save Changes'}</button>}
            <button
              type="button"
              onClick={() => { setPcsEditingId(null); setPcsFormDirty(false) }}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              {pcsFormDirty ? 'Cancel' : 'Done'}
            </button>
            {/* Discard Profile — wrong / duplicate record only; Founder approval.
                Deliberately a quiet text link (not a red button) tucked in the
                corner, so it isn't hit by accident next to Save / Done. */}
            {canEdit && (
              <button
                type="button"
                onClick={() => { setPcsDiscardReason(''); setPcsDiscardTarget(entry) }}
                className="ml-auto self-center text-xs text-gray-500 hover:text-red-600 hover:underline underline-offset-2 px-2 py-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              >
                Discard
              </button>
            )}
          </div>

        </div>
      </div>
    )
  }

  // A4 profile sheet. Mirrors the on-screen stamp view section-for-section
  // (same navy band, left = identity + contact/personal, right = church
  // journey / ministry / notes / history), so keep the two in step.
  const downloadProfileAsPDF = (data, dur, ministry, cellGroup, extras = {}) => {
    const { notes = '', history = [], kids = [], parents = [] } = extras
    const minorKids = kids.filter(c => c.childType !== 'adult')
    const adultKids = kids.filter(c => c.childType === 'adult')
    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null
    const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== ''

    // Core fields always print ("—" when empty); optional ones only when filled.
    const field = (label, value, { optional = false, wide = false } = {}) => {
      if (optional && !hasVal(value)) return ''
      return `<div style="padding:5px 0;border-bottom:1px solid #f1f5f9;${wide ? 'grid-column:1 / -1;' : ''}">
                    <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:1px">${label}</div>
                    ${hasVal(value)
                      ? `<div style="font-size:10.5px;color:#1f2937;font-weight:500">${esc(value)}</div>`
                      : `<div style="font-size:10.5px;color:#cbd5e1">—</div>`}
                  </div>`
    }

    const section = (title, accentColor, content, { grid = true, badge = '' } = {}) =>
      `<div style="margin-bottom:16px;break-inside:avoid">
                  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid ${accentColor};padding-bottom:3px;margin-bottom:5px">
                    <span style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.15em;color:${accentColor}">${title}</span>${badge}
                  </div>
                  ${grid ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">${content}</div>` : content}
                </div>`

    // Same rules as the on-screen MinistryRow: active → "Joined: <date>" +
    // "Active · <tenure>"; ended → "<start> – <end>" + Completed/Inactive + "Served <tenure>".
    const tenurePill = (text, color, bg, border) => `<span style="font-size:8.5px;font-weight:700;color:${color};white-space:nowrap;background:${bg};border:1px solid ${border};padding:1px 7px;border-radius:20px">${text}</span>`
    const ministryRows = (ministry || []).map(r => {
      const start = formatShortDate(r.from), end = formatShortDate(r.to)
      const tenure = r.from ? calculateTenure(r.from, r.ended ? (r.to || null) : null) : ''
      const sub = r.ended
        ? ((start || end) ? `${start || 'Start not recorded'} – ${end || 'end not recorded'}` : '')
        : (start ? `Joined: ${start}` : '')
      const badges = r.ended
        ? (r.ended === 'inactive' ? tenurePill('Inactive', '#92400e', '#fffbeb', '#fde68a') : tenurePill('Completed', '#475569', '#f1f5f9', '#e2e8f0'))
          + (tenure && r.to ? ' ' + tenurePill(`Served ${tenure}`, '#334155', '#ffffff', '#e2e8f0') : '')
        : tenurePill(`Active${tenure ? ` · ${tenure}` : ''}`, '#047857', '#ecfdf5', '#a7f3d0')
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:4px;break-inside:avoid">
                  <div>
                    <span style="font-size:10px;font-weight:700;color:#1f2937">${esc(r.ministry || '')}</span>
                    ${r.role ? `<span style="font-size:9.5px;color:#64748b"> · ${esc(r.role)}</span>` : ''}
                    ${sub ? `<div style="font-size:8px;color:#94a3b8;margin-top:1px">${esc(sub)}</div>` : ''}
                  </div>
                  <div style="display:flex;gap:4px;flex-shrink:0">${badges}</div>
                </div>`
    }).join('')

    const historyRows = history.map(h =>
      `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px">
                  <span style="width:5px;height:5px;border-radius:50%;margin-top:4px;flex-shrink:0;background:${h.warn ? '#ef4444' : '#a5b4fc'}"></span>
                  <div>
                    <div style="font-size:10.5px;font-weight:500;color:${h.warn ? '#dc2626' : '#334155'}">${esc(h.what)}</div>
                    ${h.when ? `<div style="font-size:8px;color:#94a3b8">${esc(h.when)}</div>` : ''}
                  </div>
                </div>`).join('')

    const pill = (text, color, bg, border) => `<span style="font-size:9px;font-weight:700;color:${color};background:${bg};border:1px solid ${border};padding:2px 8px;border-radius:20px">${esc(text)}</span>`

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PCS — ${esc(data.name || 'Profile')}</title>
              <style>
                * { box-sizing:border-box; margin:0; padding:0; }
                @page { size:A4 portrait; margin:0; }
                html,body { width:210mm; font-family:'Segoe UI',Arial,sans-serif; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
                @media print { .no-print{display:none!important} * {-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important} }
              </style></head><body>

              <div style="width:210mm;min-height:297mm;display:flex;flex-direction:column;background:#fff">

                <!-- Navy band -->
                <div style="background:#1e3a5f;padding:16px 30px">
                  <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:#93c5fd;margin-bottom:3px">River Of Life Church · Bangalore</div>
                  <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#fff">Personal Caring System — Member Profile</div>
                </div>

                <!-- Body: two columns -->
                <div style="padding:22px 30px;flex:1;display:grid;grid-template-columns:1fr 1fr;gap:0 30px;align-content:start">

                  <!-- Left -->
                  <div>
                    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #f1f5f9">
                      <div style="width:56px;height:56px;border-radius:50%;flex-shrink:0;background:${data.membershipNumber ? '#f59e0b' : '#1e3a5f'};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff">
                        ${esc((data.name || '?')[0].toUpperCase())}
                      </div>
                      <div>
                        <div style="font-size:18px;font-weight:800;color:#1e3a5f;letter-spacing:-.3px">${esc(data.name || '—')}</div>
                        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">
                          ${String(data.displayName || '').trim() ? pill(`Display: ${String(data.displayName).trim()}`, '#4338ca', '#eef2ff', '#c7d2fe') : ''}
                          ${data.membershipNumber ? pill(`Member #${data.membershipNumber}`, '#92400e', '#fef3c7', '#fde68a') : ''}
                          ${data.leadershipPosition ? pill(data.leadershipPosition, '#1e40af', '#dbeafe', '#bfdbfe') : ''}
                          ${dur ? pill(`${dur} in church`, '#475569', '#f1f5f9', '#e2e8f0') : ''}
                        </div>
                      </div>
                    </div>

                    ${section('Contact & Personal', '#1d4ed8',
                      field('Phone', data.phone) +
                      field('Email', data.email) +
                      field('Date of Birth', fmt(data.dob)) +
                      field('Native Place', data.nativity) +
                      field('Current Place', data.currentPlace) +
                      field('How Known', data.howKnown) +
                      field('Address', data.permanentAddress, { wide: true })
                    )}
                    ${(data.maritalStatus || kids.length || parents.length) ? section('Personal', '#0f766e',
                      field('Marital Status', data.maritalStatus, { optional: true }) +
                      (data.maritalStatus === 'Married' ? field('Marriage Date', fmt(data.marriageDate), { optional: true }) + field('Spouse', data.spouseName, { optional: true }) : '') +
                      (minorKids.length ? field('Kids', minorKids.map(c => `${c.name}${c.riverKidsChildId ? ' (River Kids)' : ''}`).join(', '), { wide: true }) : '') +
                      (adultKids.length ? field('Linked Adult Child', adultKids.map(c => c.name).join(', '), { wide: true }) : '') +
                      (parents.length ? field(parents.length === 1 ? 'Parent' : 'Parents', parents.map(p => p.name).join(', '), { wide: true }) : '')
                    ) : ''}
                    ${(data.baptised || data.isFirstChurch || data.previousChurchName || data.previousChurchPlace) ? section('Spiritual', '#5b21b6',
                      field('Baptised', data.baptised === 'yes' ? 'Yes' : data.baptised === 'no' ? 'No' : null, { optional: true }) +
                      (data.baptised === 'yes' ? field('Baptism Date', fmt(data.baptismDate), { optional: true }) + field('Baptism Place', data.baptismPlace, { optional: true }) + field('Baptism Church', data.baptismChurch, { optional: true }) : '') +
                      field('First Church', data.isFirstChurch === 'yes' ? 'Yes' : data.isFirstChurch === 'no' ? 'No' : null, { optional: true }) +
                      (data.isFirstChurch !== 'yes' ? field('Previous Church', data.previousChurchName, { optional: true }) + field('Previous Church Location', data.previousChurchPlace, { optional: true }) : '')
                    ) : ''}
                    ${data.membershipStatus ? section('Membership', '#92400e',
                      field('Status', data.membershipStatus === 'member' ? 'Member' : 'Applying') +
                      field('Membership No.', data.membershipNumber)
                    ) : ''}
                  </div>

                  <!-- Right -->
                  <div>
                    ${section('Church Journey', '#065f46',
                      field('First Visit', fmt(data.attendedDate)) +
                      field('Service', data.serviceAttended) +
                      field('Cell Group', cellGroup ? (cellGroup.cellName || 'Unnamed Cell') : null) +
                      field('Cell Leader', cellGroup?.leader, { optional: true }) +
                      field('PCS Year', data.year ? String(data.year) : null, { optional: true }),
                      { badge: dur ? `<span style="font-size:8.5px;font-weight:700;color:#047857;background:#ecfdf5;border:1px solid #d1fae5;padding:1px 7px;border-radius:20px">${dur}</span>` : '' }
                    )}
                    ${ministryRows ? section('Ministry &amp; Leadership', '#1e3a5f', ministryRows, { grid: false }) : ''}
                    ${section('Notes', '#475569',
                      notes
                        ? `<div style="font-size:10.5px;color:#334155;line-height:1.5;white-space:pre-wrap">${esc(notes)}</div>`
                        : `<div style="font-size:10.5px;color:#cbd5e1">No notes recorded</div>`,
                      { grid: false })}
                    ${section('Activity History', '#4338ca',
                      historyRows || `<div style="font-size:10.5px;color:#cbd5e1">No history yet</div>`,
                      { grid: false })}
                  </div>
                </div>

                <!-- Footer -->
                <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:8px 30px;display:flex;justify-content:space-between;align-items:center">
                  <span style="font-size:8px;color:#94a3b8">Generated ${new Date().toLocaleDateString('en-IN', {day: '2-digit',month: '2-digit',year: 'numeric'})} · River Of Life Church, Bangalore</span>
                  <span style="font-size:8px;color:#94a3b8;font-weight:600">PCS · Confidential Record</span>
                </div>

              </div>
              <script>window.onload=function(){window.print()}<\/script>
              </body></html>`

    const win = window.open('', '_blank', 'width=900,height=750')
    if (win) { win.document.write(html); win.document.close() }
  }

  // Inactive cell members who still appear in PCS.
  // Matches by visitorId first, falling back to phone — many PCS entries
  // (anything added via the manual "+ Add" modal) never get a visitorId,
  // so a visitorId-only match would silently never flag them.
  const normPhoneKey = (p) => String(p || '').replace(/\s+/g, '')
  const pcsVisitorIdMap = new Map(pcsEntries.filter(e => e.visitorId).map(e => [e.visitorId, e]))
  const pcsPhoneMap = new Map(pcsEntries.filter(e => !e.visitorId && e.phone).map(e => [normPhoneKey(e.phone), e]))
  const removedFromCellInPCS = []
  const _seenVids = new Set()
  allCellMembers
    .filter(m => m.status === 'inactive')
    .forEach(m => {
      const pe = (m.visitorId && pcsVisitorIdMap.get(m.visitorId)) || (m.phone && pcsPhoneMap.get(normPhoneKey(m.phone)))
      // Sunday Only people aren't expected in a cell — leaving one isn't a flag.
      if (!pe || pe.inactiveCellAlertDismissed || isSundayOnly(pe)) return
      const key = pe.visitorId || pe.id
      if (_seenVids.has(key)) return
      _seenVids.add(key)
      removedFromCellInPCS.push({ ...m, pcsEntry: pe })
    })

  // ── Recommended to Add to PCS ──────────────────────────────────────
  // Anyone not in PCS (active or removed) and not already in the Cell
  // leaders' "Add to PCS" requests, with 2+ attendances across the last
  // 20 Sunday reports and their cell's last CELL_HEALTH_REPORT_COUNT
  // meetings. Matching is by visitorId / phone / lowercased name — the same
  // keys the attendance records themselves carry. Visitor-first rule: only
  // people with a D-Light visitor record are recommended.
  const recNorm = (s) => String(s || '').trim().toLowerCase()
  const recPhone = (p) => String(p || '').replace(/\s+/g, '')
  const inPcsKeys = new Set()
  ;[...pcsEntries, ...pcsFormerForRec].forEach(e => {
    if (e.visitorId) inPcsKeys.add(`v:${e.visitorId}`)
    if (recPhone(e.phone)) inPcsKeys.add(`p:${recPhone(e.phone)}`)
    if (recNorm(e.name)) inPcsKeys.add(`n:${recNorm(e.name)}`)
  })
  pcsAddNotifications.forEach(n => {
    if (n.visitorId) inPcsKeys.add(`v:${n.visitorId}`)
    if (recNorm(n.memberName)) inPcsKeys.add(`n:${recNorm(n.memberName)}`)
  })
  const isKnownToPcs = (p) =>
    (p.visitorId && inPcsKeys.has(`v:${p.visitorId}`)) ||
    (recPhone(p.phone) && inPcsKeys.has(`p:${recPhone(p.phone)}`)) ||
    (recNorm(p.name) && inPcsKeys.has(`n:${recNorm(p.name)}`))
  // River Kids (minors) are never recommended for PCS: anyone on the River Kids
  // registry, added to a roster as a River Kids child, tagged as a minor, or
  // recorded in a Sunday report's River Kids list. Their River Kids attendance
  // also never counts toward an adult's total.
  const riverKidNames = new Set(rkChildrenForPCS.map(k => recNorm(k.name)).filter(Boolean))
  sundayAttendanceWeeks.forEach(wk => wk.kidNames?.forEach(n => riverKidNames.add(n)))
  const isRiverKid = (p) => !!p && (
    p.source === 'river_kids' || !!p.childId ||
    p.isRiverKid === true || p.department === 'River Kids' || p.category === 'Minor' ||
    riverKidNames.has(recNorm(p.name))
  )
  // Sunday weeks credited to a real profile: an ID-linked check-in, or a name in
  // a profile-backed list. Free-text "Others" entries are a headcount only and
  // never count here (an Others name that was explicitly linked to a profile
  // still counts — that link writes an ID check-in, matched via wk.ids).
  // Newest first (sundayAttendanceWeeks is sorted most-recent-first), so [0]
  // is the latest Sunday — shown on the card as recency.
  const sundayDatesFor = (p) => sundayAttendanceWeeks.filter(wk =>
    (p.visitorId && wk.ids?.has(`v:${p.visitorId}`)) ||
    (recNorm(p.name) && (wk.profileNames || wk.names).has(recNorm(p.name)) && !wk.kidNames?.has(recNorm(p.name)))
  ).map(wk => wk.date)
  const visitorFor = (p) =>
    (p.visitorId && delightVisitors.find(v => v.id === p.visitorId)) ||
    (recPhone(p.phone) && delightVisitors.find(v => recPhone(v.phone) === recPhone(p.phone))) ||
    (recNorm(p.name) && delightVisitors.find(v => recNorm(v.name) === recNorm(p.name))) ||
    null

  const pcsRecommendations = []
  const recSeen = new Set()
  const recKeyOf = (p) => p.visitorId ? `v:${p.visitorId}` : `n:${recNorm(p.name)}`
  // 1) Active cell-roster members — Sunday + cell attendance.
  allCellMembers.filter(m => m.status !== 'inactive' && recNorm(m.name) && !isRiverKid(m)).forEach(m => {
    const visitor = visitorFor(m)
    if (!visitor || isRiverKid(visitor)) return
    const person = { name: m.name, displayName: m.displayName || '', phone: m.phone || visitor?.phone || '', visitorId: m.visitorId || visitor?.id || '' }
    const key = recKeyOf(person)
    if (recSeen.has(key) || isKnownToPcs(person) || (visitor && isKnownToPcs(visitor))) return
    recSeen.add(key)
    const reports = pcsCellReportsByCellId.get(m.cellId) || []
    // Cell reports are newest first too.
    const cellDates = reports.filter(r => r.attendeeNames?.has(recNorm(m.name))).map(r => r.reportDate).filter(Boolean)
    const sundayDates = sundayDatesFor(person)
    const cell = cellDates.length
    const sunday = sundayDates.length
    if (sunday + cell < 2) return
    pcsRecommendations.push({ key, ...person, visitor, cellName: cellGroups.find(g => g.id === m.cellId)?.cellName || '', sunday, cell, sundayDates, cellDates })
  })
  // 2) D-Light visitors not on any cell roster — Sunday attendance only.
  delightVisitors.forEach(v => {
    if (!recNorm(v.name) || v.isArchived || isRiverKid(v)) return
    const person = { name: v.name, phone: v.phone || '', visitorId: v.id }
    const key = recKeyOf(person)
    if (recSeen.has(key) || recSeen.has(`n:${recNorm(v.name)}`) || isKnownToPcs(person)) return
    recSeen.add(key)
    const sundayDates = sundayDatesFor(person)
    const sunday = sundayDates.length
    if (sunday < 2) return
    pcsRecommendations.push({ key, ...person, visitor: v, cellName: '', sunday, cell: 0, sundayDates, cellDates: [] })
  })
  pcsRecommendations.sort((a, b) => (b.sunday + b.cell) - (a.sunday + a.cell) || a.name.localeCompare(b.name))

  const addRecommendedToPCS = async (rec) => {
    const v = rec.visitor
    setPcsRecBusy(prev => new Set([...prev, rec.key]))
    const tempId = `temp_${Date.now()}`
    setPcsEntries(prev => [{ id: tempId, visitorId: v.id, personId: '', name: v.name || rec.name, phone: v.phone || rec.phone, attendedDate: v.attendedDate, year: v.year, addedAt: new Date(), addedBy: userProfile?.email || '' }, ...prev])
    try {
      // Same path as the "+ Add" picker: People record, then the PCS entry
      // linked to the existing visitor record — attendance stays matched
      // because it's keyed on that visitorId / name.
      const personId = await addPerson({
        name: v.name || rec.name, phone: v.phone || rec.phone, email: v.email || '',
        dob: v.dob || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '',
        firstVisitDate: v.attendedDate, serviceAttended: v.serviceAttended || '',
        howKnown: v.howKnown || '', stage: 'pcs', visitorId: v.id,
      }, userProfile?.email || '')
      const realId = await addPCSEntry({ visitorId: v.id, personId, name: v.name || rec.name, phone: v.phone || rec.phone, attendedDate: v.attendedDate, year: v.year || new Date().getFullYear(), addedBy: userProfile?.email || 'unknown' })
      if (realId) setPcsEntries(prev => prev.some(e => e.id === realId) ? prev.filter(e => e.id !== tempId) : prev.map(e => e.id === tempId ? { ...e, id: realId, personId } : e))
      setPcsToast(`${rec.name} added to PCS`)
      setTimeout(() => setPcsToast(null), 2500)
    } catch {
      setPcsEntries(prev => prev.filter(e => e.id !== tempId))
      alert(`Couldn't add ${rec.name} to PCS. Please try again.`)
    } finally {
      setPcsRecBusy(prev => { const s = new Set(prev); s.delete(rec.key); return s })
    }
  }

  return (
    <div className="space-y-4">
      {/* Discard Profile — confirmation + reason for the Pastoral Office */}
      {pcsDiscardTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={() => !pcsDiscardSaving && setPcsDiscardTarget(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="pcs-discard-title"
            className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 id="pcs-discard-title" className="text-base font-bold text-slate-800">
              Discard Profile Changes / Under Pastoral Review
            </h3>
            <p className="text-sm text-slate-700">
              Are you sure you want to discard these profile edits? Discarding non-member profiles requires Pastoral Office review.
            </p>
            <p className="text-xs text-slate-500">
              Only for a profile that is wrong, like a duplicate or one entered by mistake. If {pcsDiscardTarget.name} has stopped attending, use <span className="font-semibold">Remove from PCS</span> instead.
            </p>
            <p className="text-sm text-slate-600">
              {isFounder
                ? 'The profile will be deleted from PCS. This cannot be undone.'
                : 'The profile is not deleted now. It is locked as "Under Review of the Pastoral Office" until the Founder approves or rejects the request.'}
            </p>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-500 mb-1">Reason (required)</span>
              <textarea
                value={pcsDiscardReason}
                onChange={e => setPcsDiscardReason(e.target.value)}
                rows={3}
                placeholder="e.g. Duplicate of Anitha Joseph's profile"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </label>
            {/* Keep Editing is the primary, focused action; Confirm Discard is a
                small ghost button so the safe choice is always the obvious one. */}
            <div className="flex flex-row-reverse items-center justify-start gap-3 pt-1">
              <button type="button" autoFocus disabled={pcsDiscardSaving} onClick={() => setPcsDiscardTarget(null)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 disabled:opacity-50">
                Keep Editing
              </button>
              <button type="button" disabled={pcsDiscardSaving || !pcsDiscardReason.trim()} onClick={handleSubmitDiscard}
                title={!pcsDiscardReason.trim() ? 'Enter a reason first' : undefined}
                className="px-2 py-1 rounded text-xs font-medium text-gray-500 hover:text-red-600 hover:underline underline-offset-2 disabled:opacity-40 disabled:hover:no-underline disabled:hover:text-gray-500">
                {pcsDiscardSaving ? 'Sending…' : 'Confirm Discard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {pcsToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
          {pcsToast}
        </div>
      )}
      {/* Top bar — stats row, then the actions row beneath it (stacked, so the
          stat pills and the buttons never compete for one line) */}
      <div className="flex flex-col gap-3">
        {/* Grand total across every year (active entries only). Derived from
            pcsEntries / filteredGrouped, so it follows adds, removals, search
            and filter chips live. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 pl-1.5 pr-3.5 py-1.5 rounded-full bg-indigo-600 text-white shadow-sm">
            <span className="min-w-[1.75rem] h-7 px-1.5 rounded-full bg-white/20 flex items-center justify-center text-sm font-black tabular-nums">
              {loadingPCS ? '…' : pcsVisibleEntries.length}
            </span>
            <span className="text-xs font-bold tracking-wide">
              Total PCS{!loadingPCS && <span className="font-medium text-indigo-100"> · {pcsVisibleEntries.length === 1 ? 'person' : 'people'}</span>}
            </span>
          </span>
          {pcsIsFiltering && !pcsShowFormer && !loadingPCS && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
              Filtered: <span className="tabular-nums">{filteredGrouped.reduce((n, g) => n + g.entries.length, 0)}</span>
            </span>
          )}
          {!loadingPCS && (removalCandidates.length > 0 || pcsRemovalView) && (
            <button
              type="button"
              onClick={() => { setPcsRemovalView(v => !v); setPcsShowFormer(false); setPcsRemovalAction(null) }}
              aria-pressed={pcsRemovalView}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${pcsRemovalView ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'}`}
            >
              ⚠️ Recommended for Removal (<span className="tabular-nums">{removalCandidates.length}</span>)
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            const next = !pcsShowFormer
            setPcsShowFormer(next)
            if (next) setPcsRemovalView(false)
            if (next && pcsInactiveEntries.length === 0) {
              setPcsLoadingFormer(true)
              try { setPcsInactiveEntries(await getInactivePCSEntries()) } catch { /* ignore */ }
              try { setPcsMergedEntries(await getMergedPCSEntries()) } catch { /* ignore */ }
              setPcsLoadingFormer(false)
            }
          }}
          className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${pcsShowFormer ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
        >
          {pcsShowFormer ? 'Active' : 'Former'}
        </button>
        <button
          type="button"
          onClick={() => setPcsPickerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          + Add
        </button>
        </div>
      </div>

      {/* Duplicate PCS records (same person added twice) — review & merge */}
      {canEdit && pcsDuplicateGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="flex-1 min-w-0 text-xs text-amber-900">
            <b>{pcsDuplicateGroups.length} duplicate profile{pcsDuplicateGroups.length === 1 ? '' : 's'}</b> found
            {' '}({pcsDuplicateGroups.map(g => g.master?.name).filter(Boolean).slice(0, 3).join(', ')}{pcsDuplicateGroups.length > 3 ? '…' : ''}).
            {' '}Showing one card each.
          </p>
          <button type="button" onClick={() => setPcsDupesSnapshot(pcsDuplicateGroups.filter(g => g.master))}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700">Review &amp; Merge</button>
        </div>
      )}
      {pcsDupesSnapshot && (
        <PcsDuplicatesModal
          groups={pcsDupesSnapshot}
          mergedBy={userProfile?.displayName || userProfile?.email || ''}
          onClose={() => setPcsDupesSnapshot(null)}
          onMerged={() => { getPCSEntries().then(setPcsEntries).catch(() => {}) }}
        />
      )}

      {/* ── Search + Filter chips ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={pcsSearchQuery}
            onChange={(e) => setPcsSearchQuery(e.target.value)}
            placeholder="Search name..."
            className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white transition-colors"
          />
          {pcsSearchQuery && (
            <button
              type="button"
              onClick={() => setPcsSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PCS_FILTER_CHIPS.map((chip) => {
            const active = pcsActiveFilters.has(chip.key)
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setPcsActiveFilters((prev) => {
                  const next = new Set(prev)
                  next.has(chip.key) ? next.delete(chip.key) : next.add(chip.key)
                  return next
                })}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            active
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
              >
                {chip.label}
              </button>
            )
          })}
          {pcsActiveFilters.size > 0 && (
            <button
              type="button"
              onClick={() => setPcsActiveFilters(new Set())}
              className="px-3 py-1.5 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Picker */}
      {pcsPickerOpen && (
        <PCSPickerModal
          addedIds={new Set(pcsEntries.map((e) => e.visitorId))}
          onAdd={(v) => {
            const tempId = `temp_${Date.now()}`
            const optimistic = { id: tempId, visitorId: v.id, personId: '', name: v.name, phone: v.phone, attendedDate: v.attendedDate, year: v.year, addedAt: new Date(), addedBy: userProfile?.email || '' }
            setPcsEntries((prev) => [optimistic, ...prev])
            addPerson({
              name: v.name, phone: v.phone, email: v.email || '',
              dob: v.dob || '', nativity: v.nativity || '', currentPlace: v.currentPlace || '',
              firstVisitDate: v.attendedDate, serviceAttended: v.serviceAttended || '',
              howKnown: v.howKnown || '', stage: 'pcs', visitorId: v.id,
            }, userProfile?.email || '')
              .then(personId =>
                addPCSEntry({ visitorId: v.id, personId, name: v.name, phone: v.phone, attendedDate: v.attendedDate, year: v.year, addedBy: userProfile?.email || 'unknown' })
                  // addPCSEntry returns the existing entry's id when this person is already in PCS
                  .then((realId) => { if (realId) setPcsEntries((prev) => prev.some((e) => e.id === realId) ? prev.filter((e) => e.id !== tempId) : prev.map((e) => e.id === tempId ? { ...e, id: realId, personId } : e)) })
              )
              .catch(() => { setPcsEntries((prev) => prev.filter((e) => e.id !== tempId)) })
          }}
          onClose={() => setPcsPickerOpen(false)}
        />
      )}

      {/* ── Cell alerts — stacked on mobile, side-by-side on desktop ── */}
      {(cellReferralTasks.length > 0 || removedFromCellInPCS.length > 0) && (
        <div className="space-y-3 sm:space-y-0 sm:flex sm:gap-3 sm:items-start">

          {/* Pending from Cell */}
          {cellReferralTasks.length > 0 && (
            <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden sm:flex-1 sm:min-w-0">
              <button
                type="button"
                onClick={() => setCellReferralOpen(o => !o)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-orange-50 transition-colors text-left"
              >
                <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                <p className="text-sm font-bold text-orange-800 flex-1">Pending from Cell</p>
                <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {cellReferralTasks.length}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-orange-400 transition-transform flex-shrink-0 ${cellReferralOpen ? 'rotate-180' : ''}`}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {cellReferralOpen && (
                <>
                  <p className="px-4 pb-2 text-xs text-slate-400 border-t border-orange-100 pt-3">
                    Cell leaders flagged these members as not yet in PCS.
                  </p>
                  <div className="divide-y divide-slate-100">
                    {cellReferralTasks.map(task => {
                      const name      = task.memberName || task.taskTitle.replace(/^Add /, '').replace(/ to PCS$/, '')
                      const phone     = task.memberPhone || ''
                      const visitorId = task.memberVisitorId || ''
                      const cellName  = task.cellName || ''
                      const adding    = cellReferralAdding.has(task.id)
                      const removing  = cellReferralRemoving.has(task.id)
                      const inVisitorList = visitorId
                        ? delightVisitors.some(v => v.id === visitorId)
                        : delightVisitors.some(v => (v.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase())

                      return (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                            {String(name || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 text-sm truncate">{name}</p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {[phone, cellName ? `Cell: ${cellName}` : ''].filter(Boolean).join(' · ')}
                            </p>
                            {!inVisitorList && (
                              <p className="text-xs text-amber-600 font-medium mt-0.5">Not in visitor list yet</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              disabled={removing || adding}
                              onClick={async () => {
                                setCellReferralRemoving(prev => new Set([...prev, task.id]))
                                try {
                                  await updateTask(task.id, { status: 'Dismissed' })
                                  setCellReferralTasks(prev => prev.filter(t => t.id !== task.id))
                                } catch { /* ignore */ }
                                finally {
                                  setCellReferralRemoving(prev => { const s = new Set(prev); s.delete(task.id); return s })
                                }
                              }}
                              className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-base transition-colors disabled:opacity-40"
                              title="Dismiss"
                            >
                              {removing ? '…' : '×'}
                            </button>
                            {inVisitorList ? (
                              <button
                                type="button"
                                disabled={adding}
                                onClick={async () => {
                                  setCellReferralAdding(prev => new Set([...prev, task.id]))
                                  try {
                                    const resolvedVisitorId = visitorId ||
                                      (delightVisitors.find(v => (v.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase())?.id || '')
                                    await addPCSEntry({
                                      visitorId: resolvedVisitorId, name, phone,
                                      year: new Date().getFullYear(), addedBy: userProfile?.email || 'unknown',
                                    })
                                    await updateTask(task.id, { status: 'Completed' })
                                    setPcsEntries(prev => [{
                                      id: `ref_${task.id}`, visitorId: resolvedVisitorId, name, phone,
                                      year: new Date().getFullYear(), addedAt: new Date(), addedBy: userProfile?.email || '',
                                    }, ...prev])
                                  } catch {
                                    alert(`Couldn't add ${name} — no linked visitor record found. Add them to the D-Light visitor list first, then try again.`)
                                  }
                                  finally {
                                    setCellReferralAdding(prev => { const s = new Set(prev); s.delete(task.id); return s })
                                  }
                                }}
                                className="px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {adding ? 'Adding…' : 'Add to PCS'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDelightVisitorId(null)
                                  setDelightVisitorForm(f => ({
                                    ...f, name, phone,
                                    dob: '', email: '', nativity: '', currentPlace: '',
                                    serviceAttended: '', attendedDate: '', howKnown: '', source: '',
                                    year: new Date().getFullYear(),
                                  }))
                                  setDelightVisitorModalOpen(true)
                                }}
                                className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-xl hover:bg-amber-600 transition-colors whitespace-nowrap"
                              >
                                + Visitor List
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Removed from Cell — still in PCS */}
          {removedFromCellInPCS.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sm:flex-1 sm:min-w-0">
              <button
                type="button"
                onClick={() => setRemovedFromCellOpen(o => !o)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                <p className="text-sm font-bold text-slate-700 flex-1">Removed from Cell</p>
                <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {removedFromCellInPCS.length}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-slate-400 transition-transform flex-shrink-0 ${removedFromCellOpen ? 'rotate-180' : ''}`}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {removedFromCellOpen && (
                <>
                  <p className="px-4 pb-2 text-xs text-slate-400 border-t border-slate-100 pt-3">
                    These people are inactive in their cell group. Remove from PCS if no longer active in church.
                  </p>
                  <div className="divide-y divide-slate-100">
                    {removedFromCellInPCS.map(m => {
                      const pe = m.pcsEntry
                      return (
                        <div key={pe.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-sm font-bold flex items-center justify-center flex-shrink-0">
                            {String(m.name || pe.name || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 text-sm truncate">{m.name || pe.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {[m.phone || pe.phone, pe.year ? `PCS ${pe.year}` : '', pe.membershipNumber ? `#${pe.membershipNumber}` : ''].filter(Boolean).join(' · ')}
                            </p>
                            <p className="text-xs text-red-400 font-medium mt-0.5">Inactive in cell</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDismissInactiveCellAlert(pe)}
                              title="Keep them active in PCS and stop showing this alert"
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                              Keep in PCS
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromPCS({ ...pe, name: m.name || pe.name })}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Remove from PCS
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── Add to PCS — notifications from Cell ── */}
      {pcsAddNotifications.length > 0 && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setPcsAddOpen(o => !o)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-indigo-50 transition-colors text-left"
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
            <p className="text-sm font-bold text-indigo-800 flex-1">Add to PCS — from Cell</p>
            <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {pcsAddNotifications.length}
            </span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-indigo-400 transition-transform flex-shrink-0 ${pcsAddOpen ? 'rotate-180' : ''}`}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {pcsAddOpen && (
            <>
              <p className="px-4 pb-2 text-xs text-slate-400 border-t border-indigo-100 pt-3">
                Cell leaders requested these members be added to PCS.
              </p>
              <div className="divide-y divide-slate-100">
                {pcsAddNotifications.map(notif => {
                  const name      = notif.memberName || ''
                  const phone     = notif.memberPhone || ''
                  const visitorId = notif.visitorId || ''
                  const cellName  = notif.cellName  || ''
                  const sentBy    = notif.sentByName || notif.sentBy || ''
                  const adding    = pcsAddAdding.has(notif.id)
                  const dismissing = pcsAddDismissing.has(notif.id)
                  const inVisitorList = visitorId
                    ? delightVisitors.some(v => v.id === visitorId)
                    : delightVisitors.some(v => (v.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase())
                  // Persisted on the notification doc itself (not local state) so the
                  // status survives a reload and updates live for every Caring user —
                  // once inVisitorList flips true this is superseded by "Add to PCS" below.
                  const alreadyForwarded = !!notif.forwardedToDLight

                  return (
                    <div key={notif.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                        {String(name || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{name}</p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {[phone, cellName ? `Cell: ${cellName}` : '', sentBy ? `by ${sentBy}` : ''].filter(Boolean).join(' · ')}
                        </p>
                        {!inVisitorList && (
                          <p className="text-xs text-amber-600 font-medium mt-0.5">Not in visitor list yet</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          disabled={dismissing || adding}
                          onClick={async () => {
                            setPcsAddDismissing(prev => new Set([...prev, notif.id]))
                            try {
                              await dismissPCSAddNotification(notif.id)
                              setPcsAddNotifications(prev => prev.filter(n => n.id !== notif.id))
                            } catch { /* ignore */ }
                            finally {
                              setPcsAddDismissing(prev => { const s = new Set(prev); s.delete(notif.id); return s })
                            }
                          }}
                          className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-base transition-colors disabled:opacity-40"
                          title="Dismiss"
                        >
                          {dismissing ? '…' : '×'}
                        </button>
                        {inVisitorList ? (
                          <button
                            type="button"
                            disabled={adding}
                            onClick={async () => {
                              setPcsAddAdding(prev => new Set([...prev, notif.id]))
                              try {
                                const resolvedVisitorId = visitorId ||
                                  (delightVisitors.find(v => (v.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase())?.id || '')
                                await addPCSEntry({
                                  visitorId: resolvedVisitorId, name, phone,
                                  year: new Date().getFullYear(), addedBy: userProfile?.email || 'unknown',
                                })
                                await completePCSAddNotification(notif.id)
                                setPcsEntries(prev => [{
                                  id: `add_${notif.id}`, visitorId: resolvedVisitorId, name, phone,
                                  year: new Date().getFullYear(), addedAt: new Date(), addedBy: userProfile?.email || '',
                                }, ...prev])
                                setPcsAddNotifications(prev => prev.filter(n => n.id !== notif.id))
                              } catch {
                                alert(`Couldn't add ${name} — no linked visitor record found. Add them to the D-Light visitor list first, then try again.`)
                              }
                              finally {
                                setPcsAddAdding(prev => { const s = new Set(prev); s.delete(notif.id); return s })
                              }
                            }}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {adding ? 'Adding…' : 'Add to PCS'}
                          </button>
                        ) : alreadyForwarded ? (
                          <span className="text-xs text-emerald-600 font-medium px-1">✓ Forwarded to D-Light</span>
                        ) : (
                          <button
                            type="button"
                            disabled={pcsAddForwarding.has(notif.id) || dismissing}
                            onClick={async () => {
                              setPcsAddForwarding(prev => new Set([...prev, notif.id]))
                              try {
                                const sentByName = userProfile?.displayName || userProfile?.name || userProfile?.email || 'Caring'
                                await createTask({
                                  taskTitle: `Add ${name} to D-Light`,
                                  department: 'D Light',
                                  assignedPerson: '',
                                  priority: 'Medium',
                                  deadline: '',
                                  status: 'Pending',
                                  notes: `Forwarded from Caring PCS by ${sentByName}. ${name} needs D-Light registration before being added to PCS.${phone ? ` Phone: ${phone}` : ''}`,
                                  createdBy: userProfile?.email || '',
                                  pcsReferral: true,
                                  pcsPersonName: name,
                                  pcsPersonPhone: phone || '',
                                  pcsPersonVisitorId: visitorId || '',
                                  // Identity + action-kind pair the To-Do List dedupes on (ToDoListCard.jsx).
                                  personId: visitorId || phone || name,
                                  taskType: 'addToDLight',
                                  // Registration decision, not shared team work — D-Light Director only,
                                  // mirrors the Cell "Add to a cell group" scoping (ToDoListCard.jsx).
                                  visibleToRole: 'DIRECTOR',
                                })
                                await markPCSAddNotificationForwarded(notif.id)
                              } catch (e) {
                                console.error('Forward to D-Light error', e)
                                alert('Failed to forward to D-Light. Please try again.')
                              } finally {
                                setPcsAddForwarding(prev => { const s = new Set(prev); s.delete(notif.id); return s })
                              }
                            }}
                            className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {pcsAddForwarding.has(notif.id) ? 'Forwarding…' : 'Forward to D-Light'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Recommended to Add — recurring attendees not yet in PCS ── */}
      {!pcsShowFormer && pcsRecommendations.length > 0 && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setPcsRecOpen(o => !o)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-emerald-50 transition-colors text-left"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <p className="text-sm font-bold text-emerald-800 flex-1">Recommended to Add ({pcsRecommendations.length})</p>
            <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {pcsRecommendations.length}
            </span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-emerald-400 transition-transform flex-shrink-0 ${pcsRecOpen ? 'rotate-180' : ''}`}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {pcsRecOpen && (
            <>
              <p className="px-4 pb-2 text-xs text-slate-400 border-t border-emerald-100 pt-3">
                Not in PCS yet, but attended 2 or more gatherings: the last 20 Sundays plus their cell's recent meetings.
              </p>
              <div className="divide-y divide-slate-100">
                {pcsRecommendations.map(rec => {
                  const busy = pcsRecBusy.has(rec.key)
                  const attended = [
                    rec.sunday > 0 ? `${rec.sunday} Sunday${rec.sunday === 1 ? '' : 's'}` : '',
                    rec.cell > 0 ? `${rec.cell} Cell` : '',
                  ].filter(Boolean).join(', ')
                  return (
                    <div key={rec.key} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                        {String(rec.name || '?').split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{getMemberDisplayName(rec)}</p>
                        {String(rec.displayName || '').trim() && <p className="text-[10px] text-slate-400 truncate">Legal: {rec.name}</p>}
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {[rec.phone, rec.cellName ? `Cell: ${rec.cellName}` : ''].filter(Boolean).join(' · ') || 'No contact on record'}
                        </p>
                        <p className="text-xs font-semibold text-emerald-700 mt-0.5">Attended: {attended}</p>
                        {(() => {
                          // Recency line + hover list of the last 3 gatherings of each kind.
                          const fmtRec = (d) => { const dt = new Date(String(d).slice(0, 10) + 'T00:00:00'); return isNaN(dt.getTime()) ? String(d) : format(dt, 'dd/MM/yyyy') }
                          const sundays = rec.sundayDates || []
                          const cells = rec.cellDates || []
                          const tip = [
                            `Last Sundays: ${sundays.length ? sundays.slice(0, 3).map(fmtRec).join(', ') : 'No records'}`,
                            `Last Cell meetings: ${cells.length ? cells.slice(0, 3).map(fmtRec).join(', ') : 'No records'}`,
                          ].join('\n')
                          return (
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate cursor-help" title={tip}>
                              Latest Sunday: <span className="font-medium text-slate-700">{sundays[0] ? fmtRec(sundays[0]) : 'No records'}</span>
                              <span className="text-slate-300"> | </span>
                              Latest Cell: <span className="font-medium text-slate-700">{cells[0] ? fmtRec(cells[0]) : 'No records'}</span>
                            </p>
                          )
                        })()}
                      </div>
                      <div className="flex-shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => addRecommendedToPCS(rec)}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {busy ? 'Adding…' : '+ Add to PCS'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Former (inactive) panel */}
      {pcsShowFormer && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <span className="text-sm font-bold text-slate-700">Former Members</span>
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{pcsInactiveEntries.length}</span>
          </div>
          {pcsLoadingFormer ? (
            <div className="py-6 text-center text-slate-400 text-sm">Loading…</div>
          ) : pcsInactiveEntries.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm">No former members.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pcsInactiveEntries.map(e => (
                <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{e.name}</p>
                    {e.phone && <p className="text-xs text-slate-400">{e.phone}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {e.year && <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{e.year}</span>}
                    {e.removedAt && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Removed {e.removedAt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {pcsMergedEntries.length > 0 && (
            <>
              <div className="px-4 py-3 bg-slate-50 border-y border-slate-100 flex items-center gap-2">
                <span className="text-sm font-bold text-slate-700">Merged into another profile</span>
                <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{pcsMergedEntries.length}</span>
              </div>
              {pcsUnmergeMsg && <p className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50 whitespace-pre-line">{pcsUnmergeMsg}</p>}
              <div className="divide-y divide-slate-100">
                {pcsMergedEntries.map(e => {
                  const into = pcsEntries.find(x => x.id === e.mergedInto)
                  return (
                    <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{e.name}</p>
                        <p className="text-xs text-slate-400">Merged into {into?.name || 'another profile'}{e.phone ? ` · ${e.phone}` : ''}</p>
                      </div>
                      {isFounder && (
                        <button
                          type="button"
                          disabled={!!pcsUnmergingId}
                          onClick={async () => {
                            if (!window.confirm(`Undo the merge and show ${e.name} as a separate PCS profile again${into ? ` (apart from ${into.name})` : ''}?`)) return
                            setPcsUnmergingId(e.id); setPcsUnmergeMsg('')
                            try {
                              const r = await unmergePCSEntry(e.id, userProfile?.email || '')
                              setPcsMergedEntries(prev => prev.filter(x => x.id !== e.id))
                              setPcsUnmergeMsg(`${e.name} is a separate profile again (${r.people} People, ${r.visitors} visitor, ${r.cellRows} cell row restored).` +
                                (r.toCheck.length ? `\nPlease check — may still belong to ${e.name}: ${r.toCheck.join('; ')}` : ''))
                            } catch (err) {
                              console.error('Undo merge failed', err)
                              setPcsUnmergeMsg(`Undo failed: ${err?.message || err}`)
                            } finally { setPcsUnmergingId(null) }
                          }}
                          className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-40"
                        >
                          {pcsUnmergingId === e.id ? 'Restoring…' : 'Undo merge'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Recommended for Removal — review list */}
      {pcsRemovalView && !pcsShowFormer && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-800">Recommended for Removal</span>
              <span className="text-xs font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5 tabular-nums">{removalCandidates.length}</span>
            </div>
            <p className="text-xs text-red-700/80 mt-0.5">
              Missed {REMOVAL_ABSENCE_THRESHOLD} consecutive Sundays AND {REMOVAL_ABSENCE_THRESHOLD} consecutive Cell meetings. People marked &lsquo;Away&rsquo; are excluded.
            </p>
          </div>
          {removalCandidates.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">No one is recommended for removal.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {removalCandidates.map(({ entry, reasons }) => {
                const cm = findPcsCellMember(entry, allCellMembers)
                const cellName = cm ? (cellGroups.find(g => g.id === cm.cellId)?.cellName || 'Unnamed Cell') : ''
                const lastFollowUp = (entry.followUps || [])[entry.followUps.length - 1]
                const action = pcsRemovalAction?.id === entry.id ? pcsRemovalAction.kind : null
                const btn = 'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50'
                return (
                  <div key={entry.id} className="px-4 py-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => { setPcsRemovalView(false); handleChipClick(entry) }}
                          className="text-sm font-bold text-slate-800 hover:text-indigo-700 hover:underline text-left"
                        >
                          {getMemberDisplayName(entry)}
                        </button>
                        <p className="text-xs text-slate-500">
                          {[engagementLabel(entry.engagementType), cellName].filter(Boolean).join(' · ')}
                          {entry.phone && <> · <a href={`tel:${entry.phone.replace(/\s+/g, '')}`} className="text-indigo-600 hover:underline">{entry.phone}</a></>}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {reasons.map(r => (
                          <span key={r.kind} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
                            {r.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {lastFollowUp && (
                      <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                        <span className="font-semibold">Followed up {formatTimestampFull(lastFollowUp.at)}</span>
                        {lastFollowUp.by && <span className="text-slate-400"> by {lastFollowUp.by}</span>}
                        {lastFollowUp.note && <>: {lastFollowUp.note}</>}
                        {entry.followUps.length > 1 && <span className="text-slate-400"> ({entry.followUps.length} follow-ups)</span>}
                      </p>
                    )}

                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button"
                          onClick={() => setPcsRemovalAction(action === 'away' ? null : { id: entry.id, kind: 'away' })}
                          className={`${btn} ${action === 'away' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-700 border-sky-300 hover:bg-sky-50'}`}>
                          ✈ Mark as Away
                        </button>
                        <button type="button"
                          onClick={() => { setPcsFollowUpText(''); setPcsRemovalAction(action === 'followup' ? null : { id: entry.id, kind: 'followup' }) }}
                          className={`${btn} ${action === 'followup' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'}`}>
                          Contact / Follow Up
                        </button>
                        <button type="button"
                          onClick={() => handleRemoveFromPCS(entry)}
                          className={`${btn} bg-white text-red-700 border-red-300 hover:bg-red-50`}>
                          Remove from PCS
                        </button>
                      </div>
                    )}

                    {action === 'away' && (
                      <PcsAwayControl
                        entry={entry}
                        canEdit={canEdit}
                        startEditing
                        suggestedFrom={suggestAwayStart(entry)}
                        updatedBy={userProfile?.displayName || userProfile?.email || ''}
                        onSaved={(patch) => {
                          setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...patch } : e))
                          setPcsRemovalAction(null)
                        }}
                      />
                    )}

                    {action === 'followup' && (
                      <div className="space-y-2">
                        <textarea
                          value={pcsFollowUpText}
                          onChange={e => setPcsFollowUpText(e.target.value)}
                          rows={2}
                          autoFocus
                          placeholder="What happened? e.g. Called — moved to Chennai, will visit in December"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setPcsRemovalAction(null)} disabled={pcsFollowUpSaving}
                            className={`${btn} bg-white text-slate-600 border-slate-300 hover:bg-slate-50`}>
                            Cancel
                          </button>
                          <button type="button"
                            disabled={pcsFollowUpSaving || !pcsFollowUpText.trim()}
                            onClick={async () => {
                              setPcsFollowUpSaving(true)
                              try {
                                const item = await addPCSFollowUp(entry.id, pcsFollowUpText, userProfile?.displayName || userProfile?.email || '')
                                if (item) setPcsEntries(prev => prev.map(e => e.id === entry.id ? { ...e, followUps: [...(e.followUps || []), item] } : e))
                                setPcsRemovalAction(null)
                              } catch (err) {
                                console.error('addPCSFollowUp failed:', err)
                                alert('Could not save the follow-up. Please try again.')
                              } finally {
                                setPcsFollowUpSaving(false)
                              }
                            }}
                            className={`${btn} bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700`}>
                            {pcsFollowUpSaving ? 'Saving…' : 'Save follow-up'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Main card — all years on one page */}
      {/* No overflow-hidden here: it clipped the cards' ⋮ menu on the last row. The
          tinted year strip / footer round their own corners instead. */}
      {!pcsShowFormer && !pcsRemovalView && <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {loadingPCS ? (
          <div className="py-14 text-center text-slate-400 text-sm">Loading…</div>
        ) : pcsEntries.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <svg width="38" height="38" viewBox="0 0 36 36" fill="none" className="text-slate-200">
              <circle cx="18" cy="12" r="6" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M6 30c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <p className="text-sm text-slate-400">No people added yet. Click "Add Person" to start.</p>
          </div>
        ) : filteredGrouped.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-slate-400">No one matches your search or filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredGrouped.map(({ year, entries }, yearIdx) => {
              return (
                <div key={year ?? 'no-year'}>
                  {/* Year label */}
                  <div className={`px-4 py-2 flex items-center gap-2 bg-slate-50 ${yearIdx === 0 ? 'rounded-t-xl' : ''}`}>
                    <span className="text-sm font-bold text-slate-700">{year ?? '—'}</span>
                    <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {entries.length} {entries.length === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  {/* Cards — fixed-size grid tiles (auto-fill/minmax) so every card
                      lines up in equal-width columns instead of the old variable-width
                      flex-wrap chips. The expanded profile panel spans the full grid
                      row (col-span-full) so it still breaks onto its own row below
                      whichever card was clicked. */}
                  <div className="px-4 py-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                    {entries.map(entry => (
                      <Fragment key={entry.id}>
                        <Chip entry={entry} />
                        {pcsExpandedId === entry.id && !pcsIsMobile && (
                          <div className="col-span-full -mx-4" onPointerDownCapture={() => { pcsProfileClickInsideRef.current = true }}>
                            {PCSInlineProfile({ entry })}
                          </div>
                        )}
                      </Fragment>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        {!loadingPCS && pcsEntries.length > 0 && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 rounded-b-xl text-xs text-slate-400 text-center">
            {pcsVisibleEntries.length} {pcsVisibleEntries.length === 1 ? 'person' : 'people'} · {grouped.length} {grouped.length === 1 ? 'year' : 'years'}
          </div>
        )}
      </div>}

      {/* Mobile (<768px): full profile slides in over the list; ← Back slides it away. */}
      {createPortal(
        <AnimatePresence>
          {pcsIsMobile && !pcsShowFormer && (() => {
            const panelEntry = pcsEntries.find(e => e.id === pcsExpandedId)
            if (!panelEntry) return null
            const editing = pcsEditingId === panelEntry.id
            const handleBack = () => {
              if (editing && pcsFormDirty && !window.confirm('Discard unsaved changes to this profile?')) return
              closePcsProfile()
            }
            return (
              <motion.div
                key="pcs-mobile-profile"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
                className="fixed inset-0 safe-top-off z-[70] flex flex-col bg-slate-100"
              >
                <div className="flex-shrink-0 flex items-center gap-1 px-2 py-2 bg-white border-b border-slate-200 shadow-sm" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
                  <button
                    type="button"
                    onClick={handleBack}
                    aria-label="Back to list"
                    className="flex items-center gap-0.5 pl-1 pr-2.5 py-1.5 rounded-lg text-indigo-600 font-semibold text-sm active:bg-indigo-50"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    Back
                  </button>
                  <p className="flex-1 min-w-0 truncate text-center text-sm font-bold text-slate-800">{getMemberDisplayName(panelEntry)}</p>
                  {editing ? (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-1 rounded-full">Editing</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPcsEditingId(panelEntry.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-indigo-600 font-semibold text-sm active:bg-indigo-50"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                  {PCSInlineProfile({ entry: panelEntry })}
                </div>
              </motion.div>
            )
          })()}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

// ─── PCS Manual Entry Modal ───────────────────────────────────────────────────
// ─── PCS Picker Modal ─────────────────────────────────────────────────────────
function PCSPickerModal({ addedIds, onAdd, onClose }) {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')

  useEffect(() => {
    getDelightVisitors()
      .then(setVisitors)
      .catch(() => setVisitors([]))
      .finally(() => setLoading(false))
  }, [])

  const years = [...new Set(visitors.map((v) => v.year).filter(Boolean))].sort((a, b) => b - a)

  const filtered = visitors.filter((v) => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase())
    const matchYear = yearFilter === 'all' || String(v.year) === String(yearFilter)
    return matchSearch && matchYear
  })

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

          {/* Modal header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Add to Personal Caring System</p>
              <p className="text-xs text-slate-400 mt-0.5">Select from D Light visitor list</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-xl leading-none"
            >×</button>
          </div>

          {/* Search */}
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400"
            />
          </div>

          {/* Year filter chips */}
          {years.length > 0 && (
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap flex-shrink-0">
              <button
                type="button"
                onClick={() => setYearFilter('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${yearFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >All</button>
              {years.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setYearFilter(String(yr))}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${yearFilter === String(yr) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >{yr}</button>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-slate-100 flex-shrink-0" />

          {/* List */}
          <div className="overflow-y-auto min-h-0 flex-1">
            {loading ? (
              <div className="px-4 py-12 text-center text-slate-400 text-sm">Loading visitors…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-400 text-sm">
                {search || yearFilter !== 'all' ? 'No matches found.' : 'No visitors available.'}
              </div>
            ) : filtered.map((v) => {
              const added = addedIds.has(v.id)
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={added}
                  onClick={() => {
                    if (added) return
                    onAdd(v)
                    onClose()
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-50 transition-colors
                    ${added ? 'opacity-40 cursor-not-allowed bg-slate-50' : 'hover:bg-indigo-50 active:bg-indigo-100'}`}
                >
                  {/* Avatar initial */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
                    ${added ? 'bg-slate-200 text-slate-400' : 'bg-indigo-100 text-indigo-700'}`}>
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{v.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {v.phone && <span className="text-xs text-slate-400">{v.phone}</span>}
                      {v.year && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{v.year}</span>
                      )}
                      {v.attendedDate && <span className="text-xs text-slate-400">{isoToDMY(v.attendedDate)}</span>}
                    </div>
                  </div>
                  {added
                    ? <span className="text-xs text-indigo-400 font-medium flex-shrink-0">Added</span>
                    : <svg className="flex-shrink-0 text-slate-300" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  }
                </button>
              )
            })}
          </div>

          {/* Footer count */}
          {!loading && (
            <div className="px-4 py-2.5 border-t border-slate-100 flex-shrink-0">
              <p className="text-xs text-slate-400 text-center">{filtered.length} visitor{filtered.length !== 1 ? 's' : ''} shown</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
