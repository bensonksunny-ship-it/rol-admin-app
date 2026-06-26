import { useEffect, useState } from 'react'
import {
  getSundayProgramDefault,
  getSundayProgramDesign,
  getProgramNotification,
  getSundayPreServiceEntry,
  getSundayCrewEntry,
  getSundayReport,
} from '../services/firestore'

function getNextSundayISO() {
  const today = new Date()
  const diff = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STEPS = [
  { key: 'programSet' },
  { key: 'programDesigned' },
  { key: 'notifSent' },
  { key: 'preService' },
  { key: 'crewAssigned' },
  { key: 'pushedToLive' },
]

export default function SundayPrepTracker() {
  const sundayDate = getNextSundayISO()
  const [checks, setChecks] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getSundayProgramDefault(),
      getSundayProgramDesign(),
      getProgramNotification(sundayDate),
      getSundayPreServiceEntry(sundayDate),
      getSundayCrewEntry(sundayDate),
      getSundayReport(sundayDate),
    ])
      .then(([defaultDoc, designDoc, notif, preService, crewEntry, report]) => {
        const designs = designDoc?.designs || {}
        const hasDesign = Object.values(designs).some((els) => Array.isArray(els) && els.length > 0)
        setChecks({
          programSet:      (defaultDoc?.items?.length || 0) > 0,
          programDesigned: hasDesign,
          notifSent:       notif !== null,
          preService:      !!(preService && (preService.speakers?.length > 0 || preService.topics?.length > 0)),
          crewAssigned:    !!(crewEntry && crewEntry.serving?.length > 0),
          pushedToLive:    (report?.programList?.length || 0) > 0,
        })
      })
      .catch(() => setChecks(null))
      .finally(() => setLoading(false))
  }, [sundayDate])

  const done = checks ? STEPS.filter((s) => checks[s.key]).length : 0
  const total = STEPS.length
  const pct = total ? Math.round((done / total) * 100) : 0

  const barColor =
    pct === 100 ? '#059669'
    : pct >= 60  ? '#6366f1'
    : pct >= 30  ? '#f59e0b'
    :               '#e11d48'

  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: loading ? '0%' : `${pct}%`, background: barColor }}
      />
    </div>
  )
}
