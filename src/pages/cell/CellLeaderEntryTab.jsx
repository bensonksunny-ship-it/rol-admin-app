import ShepherdView from '../ShepherdView'
import MidweekMinistry from '../MidweekMinistry'

/**
 * Leader Entry tab on the Cell page — Shepherd Care | Mid-week. `view` is now driven
 * by DepartmentHub from the ?leaderView= query param (set by DepartmentFolderModal's
 * nested Leader Entry grid) instead of an inline toggle strip owning its own state;
 * defaults to Shepherd Care, same as the toggle's own previous default.
 */
export default function CellLeaderEntryTab({ view = 'shepherd', pendingFillInvitations = [], onOpenFillInvite } = {}) {
  return view === 'midweek' ? (
    <MidweekMinistry embedded />
  ) : (
    <ShepherdView embedded pendingFillInvitations={pendingFillInvitations} onOpenFillInvite={onOpenFillInvite} />
  )
}
