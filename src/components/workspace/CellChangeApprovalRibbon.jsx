import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { subscribeCellMemberPendingChanges } from '../../services/firestore'
import { RIBBON_BAR, RIBBON_TONES } from '../../constants/ribbon'

/**
 * My Workspace → Cell Director / Founder: one amber ribbon while cell leaders'
 * member change requests (add / edit / transfer / remove) wait for approval.
 * "Review" opens the Cell dashboard scrolled to Pending Member Changes. Live
 * (onSnapshot), so it disappears once the last request is approved or rejected.
 */
export default function CellChangeApprovalRibbon() {
  const navigate = useNavigate()
  const [changes, setChanges] = useState([])
  useEffect(() => subscribeCellMemberPendingChanges(setChanges), [])
  if (!changes.length) return null

  const t = RIBBON_TONES.amber
  const n = changes.length
  const names = changes.map((c) => c.memberData?.name).filter(Boolean)
  const who = names.length ? ` — ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2} more` : ''}` : ''
  return (
    <button type="button" onClick={() => navigate('/department/cell?tab=summary&focus=pendingChanges')}
      className={`${RIBBON_BAR} rounded-xl shadow-md justify-between text-left transition-colors ${t.bar}`}>
      <span className="min-w-0 font-medium">
        {n} cell member change{n === 1 ? '' : 's'} waiting for approval<span className={t.sub}>{who}</span>
      </span>
      <span className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 whitespace-nowrap ${t.primary}`}>
        Review <ChevronRight size={14} />
      </span>
    </button>
  )
}
