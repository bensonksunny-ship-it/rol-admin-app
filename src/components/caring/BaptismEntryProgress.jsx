import { useEffect, useState } from 'react'
import { subscribeBaptismApplicationsForEntry } from '../../services/firestore'
import BaptismStageTracker from './BaptismStageTracker'

/** PCS profile: the 3-stage Baptism progress for this person's latest application
 *  (renders nothing until they have one). */
export default function BaptismEntryProgress({ pcsEntryId }) {
  const [app, setApp] = useState(null)
  useEffect(() => subscribeBaptismApplicationsForEntry(pcsEntryId, (apps) => setApp(apps[0] || null), () => setApp(null)), [pcsEntryId])
  if (!app) return null
  return <BaptismStageTracker app={app} />
}
