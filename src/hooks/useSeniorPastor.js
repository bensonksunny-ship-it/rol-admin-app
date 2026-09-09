import { useEffect, useState } from 'react'
import { subscribeToSeniorPastor } from '../services/firestore'
import { SENIOR_PASTOR_NAME, SENIOR_PASTOR_TITLE, SENIOR_PASTOR_FULL_TITLE, normalizePastorName } from '../utils/seniorPastor'

// Live-updating replacement for the hardcoded SENIOR_PASTOR_NAME constant — subscribes
// to settings/senior_pastor (set via PCS's "Set as Senior Pastor" action, see
// assignSeniorPastor in services/firestore.js) and falls back to the hardcoded name
// until a Founder has ever used that action, so every existing badge/highlight call
// site keeps working unchanged before this feature is first used.
export default function useSeniorPastor() {
  const [name, setName] = useState(SENIOR_PASTOR_NAME)

  useEffect(() => {
    const unsub = subscribeToSeniorPastor(
      (data) => setName(data?.name || SENIOR_PASTOR_NAME),
      () => setName(SENIOR_PASTOR_NAME)
    )
    return unsub
  }, [])

  return {
    name,
    title: SENIOR_PASTOR_TITLE,
    fullTitle: SENIOR_PASTOR_FULL_TITLE,
    isSeniorPastorName: (candidate) => normalizePastorName(candidate) === normalizePastorName(name),
  }
}
