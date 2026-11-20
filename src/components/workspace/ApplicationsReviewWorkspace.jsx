import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPCSEntries, getCellGroups, getCellGroupMembers } from '../../services/firestore'
import ApplicationsQueueCard from '../caring/ApplicationsQueueCard'

/**
 * My Workspace → "Applications & Form Requests" (moved here from the Caring Hub
 * summary): the same review card — Approve, Reject / Request Info, Approve & Link to
 * a Caring event. It needs PCS entries and cell rosters for each applicant's name
 * and cell, which the Caring Hub had already loaded; here they are loaded once.
 */
export default function ApplicationsReviewWorkspace({ canEdit, savedBy }) {
  const navigate = useNavigate()
  const [pcsEntries, setPcsEntries] = useState([])
  const [cellGroups, setCellGroups] = useState([])
  const [allCellMembers, setAllCellMembers] = useState([])

  useEffect(() => {
    let cancelled = false
    getPCSEntries().then((list) => { if (!cancelled) setPcsEntries(list) }).catch(() => {})
    getCellGroups('Cell').then((groups) => {
      if (cancelled) return
      setCellGroups(groups)
      return Promise.all(groups.map((g) => getCellGroupMembers(g.id).then((ms) => ms.map((m) => ({ ...m, cellId: g.id }))).catch(() => [])))
        .then((lists) => { if (!cancelled) setAllCellMembers(lists.flat()) })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <ApplicationsQueueCard
      pcsEntries={pcsEntries}
      allCellMembers={allCellMembers}
      cellGroups={cellGroups}
      canEdit={!!canEdit}
      savedBy={savedBy}
      onOpenEvents={() => navigate('/department/caring?tab=events')}
    />
  )
}
