import { useCallback, useEffect, useState } from 'react'
import {
  getSundayProgramPeople,
  getWorshipScheduleByDate,
  getSundayPreServiceEntry,
  subscribeSundayPreServiceEntry,
  getMediaScheduleByDate,
  getSundayProgramDefault,
  getSecCoreSundayLeaderEntry,
} from '../services/firestore'
import useSeniorPastor from './useSeniorPastor'
import { soundEngineer } from '../utils/programPeople'

/**
 * Everything needed to say who is in charge of each programme item on `date`:
 * the Director's manual names plus the rosters auto-mapping draws from. Each source
 * loads on its own, so one the viewer can't read (e.g. Media's crew outside Media)
 * just contributes nothing.
 */
export default function useProgramPeople(date) {
  const { name: seniorPastor } = useSeniorPastor()
  const [manual, setManual] = useState({})
  const [worship, setWorship] = useState([])
  const [preServiceLeader, setPreServiceLeader] = useState('')
  const [preServiceSpeakers, setPreServiceSpeakers] = useState([])
  const [crew, setCrew] = useState([])
  // { [programName]: departmentId } chosen in Default Program (setOwners for a local change).
  const [owners, setOwners] = useState({})
  // Sec Core's Sunday Leader for the date (Psalms Reading + Announcements).
  const [sundayLeader, setSundayLeader] = useState('')
  const [loaded, setLoaded] = useState(false)

  // isLive guards against a slow response for a previous date landing late.
  const load = useCallback((isLive = () => true) => {
    if (!date) return Promise.resolve()
    const put = (fn) => (v) => { if (isLive()) fn(v) }
    return Promise.allSettled([
      getSundayProgramPeople(date).then(put(setManual)),
      getWorshipScheduleByDate('Worship', date).then(put((s) => setWorship(s?.assignments || []))),
      getSundayPreServiceEntry(date).then(put((e) => { setPreServiceLeader(e?.leaderName || ''); setPreServiceSpeakers(e?.speakers || []) })),
      getSecCoreSundayLeaderEntry(date).then(put((e) => setSundayLeader(String(e?.leader || '').trim()))),
      getSundayProgramDefault().then(put((d) => setOwners(d?.programOwners || {}))),
      getMediaScheduleByDate(date).then(put((s) => setCrew((s?.assignments || [])
        .filter((a) => String(a.memberName || '').trim())
        .map((a) => ({ area: a.role || 'Crew', name: a.memberName.trim() }))))),
    ]).then(put(() => setLoaded(true)))
  }, [date])

  useEffect(() => {
    let live = true
    load(() => live)
    return () => { live = false }
  }, [load])

  // The monthly Pre-Service schedule stays live: a speaker change there reaches the
  // run sheet and the Media Control Center without a reload.
  useEffect(() => subscribeSundayPreServiceEntry(date, (e) => {
    setPreServiceLeader(e?.leaderName || '')
    setPreServiceSpeakers(e?.speakers || [])
  }), [date])

  return {
    loaded,
    manual,
    setManual,
    reload: load,
    crew,
    soundEngineer: soundEngineer(worship),
    setOwners,
    rosters: { worship, preServiceLeader, preServiceSpeakers, seniorPastor, mediaCrew: crew, owners, sundayLeader },
  }
}
