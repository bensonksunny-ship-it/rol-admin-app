import { useEffect, useMemo, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Check, CopyPlus, Loader2, RotateCcw, UserRound } from 'lucide-react'
import {
  getSundayProgramDefault,
  subscribeProgramNotification,
  getSundayProgramPeople,
  setSundayProgramPeople,
  getSundayCrewRoster,
} from '../../services/firestore'
import useProgramPeople from '../../hooks/useProgramPeople'
import { autoRuleFor, resolveProgramPeople } from '../../utils/programPeople'

function upcomingSundays(count = 8) {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 0 : 7 - d.getDay()))
  return Array.from({ length: count }, (_, i) => format(addDays(d, i * 7), 'yyyy-MM-dd'))
}

/**
 * Program Design → "People in charge": for one Sunday, who conducts or operates
 * each programme item. Roster-mapped items (Worship, Pre-Service, Sermon) show the
 * auto name and only need a name typed to override it (e.g. a guest speaker);
 * the rest (Opening Prayer, Psalms Reading, Announcements…) are typed in here.
 * Shown on the Sunday Report run sheet and the Media Control Center.
 */
export default function ProgramPeoplePanel({ canEdit, userProfile }) {
  const sundays = useMemo(() => upcomingSundays(), [])
  const [date, setDate] = useState(sundays[0])
  const [template, setTemplate] = useState([])
  const [pushed, setPushed] = useState(null)
  const [draft, setDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const { loaded, manual, setManual, rosters } = useProgramPeople(date)

  useEffect(() => {
    getSundayProgramDefault().then((d) => setTemplate((d?.items || []).map((i) => i.programName).filter(Boolean))).catch(() => setTemplate([]))
    getSundayCrewRoster().then((r) => setSuggestions(r.map((m) => m.name))).catch(() => {})
  }, [])
  useEffect(() => subscribeProgramNotification(date, setPushed), [date])
  // A fresh copy of the saved names whenever the Sunday (or its saved doc) changes.
  const [draftOf, setDraftOf] = useState(manual)
  if (draftOf !== manual) {
    setDraftOf(manual); setDraft(manual); setDirty(false); setStatus('')
  }

  const names = pushed?.programs?.length ? pushed.programs : template
  const resolved = resolveProgramPeople(names, {}, rosters)
  const nameOptions = [...new Set([rosters.seniorPastor, ...suggestions].filter(Boolean))]

  function setName(prog, value) {
    setDraft((d) => ({ ...d, [prog]: { ...d[prog], name: value } }))
    setDirty(true); setStatus('')
  }
  function clearName(prog) {
    setDraft((d) => { const n = { ...d }; delete n[prog]; return n })
    setDirty(true); setStatus('')
  }

  async function copyPrevious() {
    const prev = format(addDays(parseISO(date), -7), 'yyyy-MM-dd')
    try {
      const p = await getSundayProgramPeople(prev)
      if (!Object.keys(p).length) { setStatus(`Nothing saved for ${format(parseISO(prev), 'd MMM')}.`); return }
      setDraft((d) => ({ ...p, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v?.name?.trim())) }))
      setDirty(true); setStatus(`Filled from ${format(parseISO(prev), 'd MMM')} — review and save.`)
    } catch { setStatus('Could not load the previous Sunday.') }
  }

  async function save() {
    setSaving(true); setStatus('')
    try {
      await setSundayProgramPeople(date, draft, userProfile?.email || '')
      const saved = Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.name?.trim()))
      setManual(saved); setDraftOf(saved); setDraft(saved); setDirty(false)
      setStatus('Saved')
    } catch (e) {
      console.error(e); setStatus('Could not save. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><UserRound className="w-5 h-5" /></span>
        <div className="min-w-[12rem] flex-1">
          <p className="font-semibold text-slate-800">People in charge</p>
          <p className="text-xs text-slate-500">Who conducts each item. Worship, Pre-Service and Sermon fill in from their rosters; type a name to override.</p>
        </div>
        <select value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white">
          {sundays.map((d, i) => <option key={d} value={d}>{format(parseISO(d), 'EEE d MMM yyyy')}{i === 0 ? ' (upcoming)' : ''}</option>)}
        </select>
      </div>

      {!loaded ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
      ) : names.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">No programme items yet — add them in Default Program.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {names.map((prog) => {
            const auto = resolved[prog]
            const rule = autoRuleFor(prog)
            const value = draft[prog]?.name || ''
            const overriding = value.trim() && auto
            return (
              <li key={prog} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium text-slate-800">{prog}</p>
                  <p className="text-[11px] text-slate-500">
                    {auto
                      ? <>{overriding ? <s>{auto.name}</s> : <b className="font-semibold text-emerald-700">{auto.name}</b>} · auto from {auto.source}</>
                      : rule ? `${rule.source}: nobody assigned yet` : 'Assign manually'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 w-full sm:w-64">
                  <input list="program-people-names" value={value} disabled={!canEdit} maxLength={80}
                    onChange={(e) => setName(prog, e.target.value)}
                    placeholder={auto ? `${auto.name} (auto)` : rule?.role || 'Name'}
                    className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-sm ${overriding ? 'border-amber-300 bg-amber-50' : 'border-slate-300'} disabled:bg-slate-50`} />
                  {canEdit && value && (
                    <button type="button" onClick={() => clearName(prog)} title={auto ? 'Back to the roster name' : 'Clear'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><RotateCcw className="w-4 h-4" /></button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <datalist id="program-people-names">
        {nameOptions.map((n) => <option key={n} value={n} />)}
      </datalist>

      {canEdit && names.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60">
          <button type="button" onClick={copyPrevious} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
            <CopyPlus className="w-4 h-4" />Copy from previous Sunday
          </button>
          <div className="flex items-center gap-3">
            {status && <span className={`text-xs ${status === 'Saved' ? 'text-emerald-600' : 'text-slate-500'}`}>{status === 'Saved' ? <><Check className="inline w-3.5 h-3.5 -mt-0.5" /> Saved</> : status}</span>}
            <button type="button" onClick={save} disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
