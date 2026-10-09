import { useEffect, useRef } from 'react'
import { applicationHasCell } from '../utils/applicationCellGuard'

/**
 * An application's `prefill` is a snapshot taken when it was created, and the
 * public QR page (signed-out — it can't read cell rosters) locks on that
 * snapshot's cell (applicationHasCell). A link created before the person was put
 * in a cell — or before the cell rule existed — therefore stayed "Application
 * Locked" even after they joined one, because staff reopening the modal just
 * reshows that same application.
 *
 * Whenever staff open the modal on a still-pending application whose snapshot has
 * no cell, but the person is in a cell now, re-stamp the snapshot from current PCS
 * data (the applicant hasn't submitted, so nothing of theirs is overwritten).
 */
export default function useRefreshPendingApplication(app, prefill, update) {
  const done = useRef(new Set())
  useEffect(() => {
    if (!app || app.status !== 'pending' || done.current.has(app.id)) return
    if (applicationHasCell(app) || !applicationHasCell({ prefill })) return
    done.current.add(app.id)
    update(app.id, { prefill: { ...(app.prefill || {}), ...prefill } })
      .catch((err) => { console.error('Refreshing application cell failed:', err); done.current.delete(app.id) })
  }, [app, prefill, update])
}
