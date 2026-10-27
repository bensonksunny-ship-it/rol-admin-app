import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import useSeniorPastor from './useSeniorPastor'
import { getWorshipTeamMembers } from '../services/firestore'

const norm = (v) => String(v || '').trim().toLowerCase().replace(/^pastor\s+/, '').replace(/\s+/g, ' ')

// The signed-in user as a song scheduler: { uid, email, name, memberId, memberName }.
// A Founder profile whose name is still the legacy literal "Founder" (or empty) is
// shown as the Senior Pastor, same as song designer credits in the Songs Directory.
//
// memberId is their worship_team_members entry — the id Lead Vocal rows carry.
// Team members have no uid, so (as elsewhere in Worship) the link is a name match:
// profile name / display name, plus the Senior Pastor's name for a Founder login.
// Empty when they aren't on the worship team.
export default function useSongScheduler() {
  const { user, userProfile, isFounder } = useAuth()
  const { name: seniorPastorName } = useSeniorPastor()
  const [members, setMembers] = useState([])

  useEffect(() => {
    getWorshipTeamMembers('Worship', { former: false }).then(setMembers).catch(() => setMembers([]))
  }, [])

  const rawName = String(userProfile?.name || '').trim()
  const founderLike = !rawName || rawName.toLowerCase() === 'founder'
  const name = founderLike && isFounder ? `Pastor ${seniorPastorName}` : (rawName || userProfile?.email || '')
  const uid = user?.uid || ''
  const email = userProfile?.email || user?.email || ''

  const me = useMemo(() => {
    const mine = new Set([rawName, userProfile?.displayName, isFounder ? seniorPastorName : ''].map(norm).filter((n) => n && n !== 'founder'))
    return members.find((m) => mine.has(norm(m.name)) || mine.has(norm(m.displayName))) || null
  }, [members, rawName, userProfile?.displayName, isFounder, seniorPastorName])

  const memberId = me?.id || ''
  const memberName = me?.name || ''
  return useMemo(() => ({ uid, email, name, memberId, memberName }), [uid, email, name, memberId, memberName])
}
