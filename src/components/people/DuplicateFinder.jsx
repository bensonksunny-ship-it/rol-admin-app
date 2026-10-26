// TEMPORARY tool (Oct 2026): find and merge/delete duplicate People Directory
// profiles left over from free-text name entry. Founder-only, opened from the People
// Directory header. Remove this file + its button in PeopleDirectory.jsx once the
// directory is clean — the visitor-first rule stops new duplicates being created.
import { useMemo, useState } from 'react'
import { mergeDirectoryProfiles, deleteDirectoryProfile, directoryEntryVisitorId } from '../../services/firestore'

const DISMISS_KEY = 'rol.dupFinder.notDuplicates'
const compact = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
const nameNorm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const phone10 = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : '' }
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')) } catch { return new Set() }
}
function saveDismissed(set) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set])) } catch { /* private mode */ }
}

// How alike two names are: 'strong' = same letters ignoring spaces/punctuation
// ("Priya Abraham" / "priyaabraham"); 'possible' = one name sits inside the other
// ("Priya" in "Priya Abraham" or "Ramapriyakumbhar") or a lone first name matches.
function nameRelation(a, b) {
  const ca = compact(a.name), cb = compact(b.name)
  if (!ca || !cb) return null
  if (ca === cb) return 'strong'
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca]
  if (short.length >= 5 && long.includes(short)) return 'possible'
  const ta = tokens(a.name), tb = tokens(b.name)
  if ((ta.length === 1 || tb.length === 1) && ta[0] && ta[0] === tb[0] && ta[0].length >= 3) return 'possible'
  return null
}

function findGroups(people, dismissed) {
  const edges = []
  const n = people.length
  const comp = people.map((p) => compact(p.name))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = people[i], b = people[j]
      if (dismissed.has(pairKey(a._key, b._key))) continue
      let rel = null
      const pa = phone10(a.phone), pb = phone10(b.phone)
      const samePhone = pa && pa === pb
      if (comp[i] && comp[i] === comp[j]) rel = 'strong'
      else {
        const nr = nameRelation(a, b)
        // Same phone + related name = same person. Same phone alone is only "possible":
        // spouses and family often share one number.
        if (samePhone) rel = nr ? 'strong' : 'possible'
        else rel = nr
      }
      if (rel) edges.push({ i, j, rel, samePhone })
    }
  }
  const components = (filter) => {
    const parent = people.map((_, k) => k)
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
    edges.filter(filter).forEach(({ i, j }) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj })
    const groups = new Map()
    people.forEach((_, k) => { const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k) })
    return [...groups.values()].filter((g) => g.length > 1)
  }
  const strong = components((e) => e.rel === 'strong')
  const strongSet = new Set(strong.map((g) => g.slice().sort((x, y) => x - y).join(',')))
  const possible = components(() => true).filter((g) => !strongSet.has(g.slice().sort((x, y) => x - y).join(',')))
  const toEntries = (g) => g.map((k) => people[k])
  return { strong: strong.map(toEntries), possible: possible.map(toEntries) }
}

// Which entry to keep by default: the richest, with a visitor record as a bonus.
function masterScore(p) {
  return (directoryEntryVisitorId(p) ? 3 : 0) + (p.personId ? 4 : 0) + (p.pcs ? 4 : 0) + p.cells.filter((c) => c.status !== 'inactive').length * 3 +
    p.deptTeams.length + p.worshipTeams.length + (p.sundayAttendance?.length || 0) * 0.1 +
    (p.phone ? 1 : 0) + (p.attendedDate ? 1 : 0) + (tokens(p.name).length > 1 ? 1 : 0)
}

function rowNames(p) {
  return [p.name, ...p.cells.map((c) => c.name), ...p.deptTeams.map((t) => t.name), ...p.worshipTeams.map((t) => t.name), p.pcs?.name]
    .filter(Boolean)
}

function EntrySummary({ p }) {
  const activeCells = p.cells.filter((c) => c.status !== 'inactive')
  const bits = [
    p.personId && 'People record',
    p._visitorIds.length > 0 && `Visitor entry${p._visitorIds.length > 1 ? ` ×${p._visitorIds.length}` : ''}`,
    p.pcs && 'PCS',
    ...activeCells.map((c) => `Cell: ${c.cellName}`),
    ...p.deptTeams.map((t) => `Team: ${t.department}`),
    p.worshipTeams.length > 0 && 'Worship',
    p.sundayAttendance?.length > 0 && `${p.sundayAttendance.length} Sundays linked`,
  ].filter(Boolean)
  return (
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-800 truncate">{p.name || <span className="italic text-slate-400">Unnamed</span>}</p>
      <p className="text-[11px] text-slate-500">
        {[p.phone, p.attendedDate && `first visit ${p.attendedDate}`].filter(Boolean).join(' · ') || 'no phone'}
      </p>
      <div className="flex flex-wrap gap-1 mt-1">
        {bits.length ? bits.map((b) => (
          <span key={b} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{b}</span>
        )) : <span className="text-[9px] text-slate-400">no linked records</span>}
      </div>
    </div>
  )
}

function GroupCard({ group, allPeople, cellGroups, userEmail, onDone, onDismiss, onRemoveFromGroup }) {
  const sorted = useMemo(() => [...group].sort((a, b) => masterScore(b) - masterScore(a)), [group])
  const [masterKey, setMasterKey] = useState(() => sorted[0]._key)
  const [included, setIncluded] = useState(() => new Set(group.map((p) => p._key)))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const master = group.find((p) => p._key === masterKey)
  const dups = group.filter((p) => p._key !== masterKey && included.has(p._key))

  // Names whose Sunday attendance moves to the master. A name another person outside
  // this merge also uses is left alone — renaming it would steal their attendance.
  const { renameNames, sharedNames } = useMemo(() => {
    if (!master) return { renameNames: [], sharedNames: [] }
    const groupKeys = new Set(group.map((p) => p._key))
    const others = new Set()
    allPeople.forEach((p) => { if (!groupKeys.has(p._key)) others.add(nameNorm(p.name)) })
    const target = nameNorm(master.name)
    // The kept profile's own other spellings (PCS / roster names) are folded in too.
    const names = [...new Set([...rowNames(master), ...dups.flatMap(rowNames)].map((n) => n.trim()).filter((n) => nameNorm(n) !== target))]
    return { renameNames: names.filter((n) => !others.has(nameNorm(n))), sharedNames: names.filter((n) => others.has(nameNorm(n))) }
  }, [master, dups, group, allPeople])

  const toggle = (key) => setIncluded((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const handleMerge = async () => {
    if (!master || !dups.length) return
    const msg = `Merge ${dups.length} profile${dups.length > 1 ? 's' : ''} into "${master.name}"?\n\n` +
      (renameNames.length ? `Sunday attendance recorded as ${renameNames.map((n) => `"${n}"`).join(', ')} will count for ${master.name}.\n` : '') +
      'Duplicate records are archived, not deleted.'
    if (!window.confirm(msg)) return
    setError(''); setBusy('Starting…')
    try {
      const r = await mergeDirectoryProfiles({ master, duplicates: dups, cellGroups, renameNames, by: userEmail, onProgress: setBusy })
      onDone(`Merged into ${master.name} — ${r.people} people, ${r.visitors} visitor, ${r.pcs} PCS, ${r.cellRows} cell and ${r.teamRows} team records; ${r.sundayReports} Sunday reports and ${r.cellReports} cell reports updated.`)
    } catch (e) {
      console.error('Merge failed', e)
      setError(e?.message || 'Merge failed. Some records may already be merged — reload and check.')
    } finally { setBusy('') }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`Permanently delete "${p.name}"? Its People and D-Light visitor records will be removed. This cannot be undone.`)) return
    setError(''); setBusy('Deleting…')
    try {
      await deleteDirectoryProfile(p)
      onRemoveFromGroup?.(p._key)
      onDone(`Deleted ${p.name}.`)
    } catch (e) {
      setError(e?.message || 'Delete failed.')
    } finally { setBusy('') }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {sorted.map((p) => {
          const deletable = !p.pcs && !p.cells.length && !p.deptTeams.length && !p.worshipTeams.length
          return (
            <li key={p._key} className={`flex items-start gap-3 px-3 py-2.5 ${included.has(p._key) ? '' : 'opacity-50'}`}>
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <input type="radio" name={`master-${sorted[0]._key}`} checked={masterKey === p._key} disabled={!!busy}
                  onChange={() => { setMasterKey(p._key); setIncluded((s) => new Set(s).add(p._key)) }} title="Keep this one" />
                <span className="text-[8px] font-bold uppercase text-slate-400">keep</span>
              </div>
              <div className="flex-1 min-w-0"><EntrySummary p={p} /></div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {masterKey !== p._key && (
                  <label className="flex items-center gap-1 text-[10px] text-slate-600">
                    <input type="checkbox" checked={included.has(p._key)} onChange={() => toggle(p._key)} disabled={!!busy} /> merge
                  </label>
                )}
                {masterKey !== p._key && deletable && (
                  <button type="button" onClick={() => handleDelete(p)} disabled={!!busy} className="text-[10px] font-semibold text-red-600 hover:underline disabled:opacity-40">Delete</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 space-y-2">
        {master && renameNames.length > 0 && (
          <p className="text-[11px] text-slate-600">Sunday attendance as {renameNames.map((n) => <b key={n}>“{n}” </b>)}→ <b>{master.name}</b></p>
        )}
        {master && sharedNames.length > 0 && (
          <p className="text-[11px] text-amber-700">Not renamed in Sunday history (another person uses it): {sharedNames.map((n) => `“${n}”`).join(', ')}</p>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleMerge} disabled={!master || !dups.length || !!busy}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">
            {busy || `Merge ${dups.length} into kept profile`}
          </button>
          {onDismiss && (
            <button type="button" onClick={() => onDismiss(group)} disabled={!!busy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-white disabled:opacity-40">
              Not duplicates
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DuplicateFinder({ people, cellGroups, userEmail, onClose, onChanged }) {
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [tab, setTab] = useState('strong')
  const [manualQuery, setManualQuery] = useState('')
  const [manualKeys, setManualKeys] = useState([])
  const [manualRun, setManualRun] = useState(0)
  const [lastResult, setLastResult] = useState('')
  const handleDone = (msg) => { setLastResult(msg || ''); onChanged() }

  const { strong, possible } = useMemo(() => findGroups(people, dismissed), [people, dismissed])
  const extraCount = (groups) => groups.reduce((sum, g) => sum + g.length - 1, 0)

  const dismissGroup = (group) => {
    const next = new Set(dismissed)
    group.forEach((a) => group.forEach((b) => { if (a._key !== b._key) next.add(pairKey(a._key, b._key)) }))
    saveDismissed(next)
    setDismissed(next)
  }

  const manualGroup = manualKeys.map((k) => people.find((p) => p._key === k)).filter(Boolean)
  const manualMatches = manualQuery.trim()
    ? people.filter((p) => !manualKeys.includes(p._key) && (p.name.toLowerCase().includes(manualQuery.trim().toLowerCase()) || (p.phone || '').includes(manualQuery.trim()))).slice(0, 10)
    : []

  const groups = tab === 'strong' ? strong : possible

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl bg-slate-50 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 bg-white border-b border-slate-200">
          <div>
            <h2 className="text-base font-black text-slate-800">Duplicate profiles <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full align-middle">temporary tool</span></h2>
            <p className="text-xs text-slate-500 mt-1">
              <b>{strong.length}</b> likely groups ({extraCount(strong)} extra profiles) · <b>{possible.length}</b> possible groups ({extraCount(possible)} extra) · {people.length} profiles checked
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
        </div>

        <div className="flex gap-1.5 px-5 pt-3">
          {[['strong', `Likely (${strong.length})`], ['possible', `Possible (${possible.length})`], ['manual', 'Pick manually']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${tab === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="px-5 pt-2 text-[11px] text-slate-500">
          {tab === 'strong' && 'Same name (ignoring spaces), or same phone with a matching name.'}
          {tab === 'possible' && 'One name inside another ("Priya" / "Priya Abraham" / "Ramapriyakumbhar"), a lone first name, or a shared phone. Check each before merging.'}
          {tab === 'manual' && 'Search and pick the profiles that are the same person, then choose which to keep.'}
        </p>

        <div className="overflow-y-auto p-5 space-y-3 flex-1">
          {lastResult && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">{lastResult}</div>}
          {tab !== 'manual' && groups.length === 0 && <p className="text-center text-sm text-slate-400 py-10">No groups here.</p>}
          {tab !== 'manual' && groups.map((g) => (
            <GroupCard key={g.map((p) => p._key).sort().join(',')} group={g} allPeople={people} cellGroups={cellGroups}
              userEmail={userEmail} onDone={handleDone} onDismiss={dismissGroup} />
          ))}

          {tab === 'manual' && (
            <div className="space-y-3">
              <div className="relative">
                <input type="text" value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} placeholder="Search name or phone…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                {manualMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {manualMatches.map((p) => (
                      <button key={p._key} type="button" onClick={() => { setManualKeys((k) => [...k, p._key]); setManualQuery(''); setManualRun((r) => r + 1) }}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0">
                        <EntrySummary p={p} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {manualGroup.length === 1 && <p className="text-xs text-slate-400">Pick at least one more profile.</p>}
              {manualGroup.length >= 2 && (
                <GroupCard key={`manual-${manualRun}`} group={manualGroup} allPeople={people} cellGroups={cellGroups} userEmail={userEmail}
                  onDone={(msg) => { handleDone(msg); setManualKeys([]) }}
                  onRemoveFromGroup={(key) => setManualKeys((k) => k.filter((x) => x !== key))} />
              )}
              {manualGroup.length > 0 && (
                <button type="button" onClick={() => setManualKeys([])} className="text-xs text-slate-500 hover:underline">Clear selection</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
