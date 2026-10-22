import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  createRFFProgram,
  updateRFFProgram,
  deleteRFFProgram,
} from '../../services/firestore'
import useRFFData from '../../hooks/useRFFData'
import RFFSyncStatus from './RFFSyncStatus'
import RFFStudentsList from './RFFStudentsList'
import RFFExpensesTable from './RFFExpensesTable'
import { summarizeFees, formatINR } from './studentUtils'

// Static class strings so Tailwind's scanner picks them up.
const CARD_TONES = {
  indigo: { box: 'bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200', label: 'text-indigo-500', value: 'text-indigo-700' },
  violet: { box: 'bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200', label: 'text-violet-500', value: 'text-violet-700' },
  emerald: { box: 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200', label: 'text-emerald-500', value: 'text-emerald-700' },
  amber: { box: 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200', label: 'text-amber-500', value: 'text-amber-700' },
  rose: { box: 'bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200', label: 'text-rose-500', value: 'text-rose-700' },
}

// RFF is a church-sponsored school program, deliberately kept off the church's
// regular department roster — see
// docs/superpowers/specs/2026-08-26-rff-department-design.md. Its data comes
// from the standalone RFF app's own Firebase project when that connection is
// configured (getRFFData Cloud Function — a read-only mirror; the RFF app is the
// system of record), or from this project's rff_programs/rff_students
// collections otherwise. useRFFData() hides which one is in use.
//
// Each program (Montessori, PSA, ROL's Nest, ...) is its own page —
// /rff/:programId, see RFFProgramPage.jsx — rather than one shared table
// filtered by a dropdown. Routing by the program's Firestore id (not a
// derived slug) means a renamed program's link never breaks, and a newly
// added program gets a working page immediately with no code change.

export default function RFFHub() {
  const { userProfile, hasAccess } = useAuth()
  const canAccess = hasAccess(userProfile, 'RFF')

  const rff = useRFFData(canAccess)
  const { programs, students, loading, readOnly } = rff
  // Connected to the RFF app: it has no programs, so the page shows read-only
  // Overview (students + fees) and Finance (expenses) tabs instead.
  const external = rff.source === 'external'
  // In the URL (?tab=finance) so the Finance view can be linked to directly.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'finance' ? 'finance' : 'overview'
  const setTab = (t) => setSearchParams(t === 'overview' ? {} : { tab: t }, { replace: true })

  const [newProgramName, setNewProgramName] = useState('')
  const [programError, setProgramError] = useState('')
  const [renamingProgramId, setRenamingProgramId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deletingProgramId, setDeletingProgramId] = useState(null)

  const totals = summarizeFees(students)

  const programIds = new Set(programs.map((p) => p.id))
  const unassignedStudents = students.filter((s) => !s.programId || !programIds.has(s.programId))

  function statsFor(programId) {
    return summarizeFees(students.filter((s) => s.programId === programId))
  }

  // Program changes land through the live listener — no manual reload needed.
  async function handleAddProgram(e) {
    e.preventDefault()
    const trimmed = newProgramName.trim()
    if (!trimmed) { setProgramError('Program name is required.'); return }
    if (programs.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setProgramError('This program already exists.')
      return
    }
    setProgramError('')
    try {
      await createRFFProgram(trimmed)
      setNewProgramName('')
    } catch {
      setProgramError('Failed to add. Please try again.')
    }
  }

  function startRenameProgram(p) {
    setRenamingProgramId(p.id)
    setRenameDraft(p.name)
  }

  async function commitRenameProgram() {
    const trimmed = renameDraft.trim()
    const id = renamingProgramId
    setRenamingProgramId(null)
    if (!id || !trimmed) return
    try {
      await updateRFFProgram(id, trimmed)
    } catch {
      setProgramError('Failed to rename. Please try again.')
    }
  }

  async function handleDeleteProgram(id) {
    try {
      await deleteRFFProgram(id)
      setDeletingProgramId(null)
    } catch {
      setProgramError('Failed to delete. Please try again.')
    }
  }

  if (!canAccess) {
    return (
      <div className="p-6 text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">RFF</p>
        <p>You don&apos;t have access to this page.</p>
      </div>
    )
  }

  const dash = loading ? '…' : null

  if (external) {
    const ft = rff.financeTotals || {}
    const cards = [
      { label: 'Total Students', value: rff.totalStudents, tone: 'indigo' },
      { label: 'Total Fee Offered', value: formatINR(ft.totalFeeOffered), tone: 'violet' },
      { label: 'Total Collected', value: formatINR(ft.totalCollected), tone: 'emerald' },
      { label: 'Total Pending', value: formatINR(ft.totalPending), tone: 'amber' },
      { label: 'Total Expenses', value: formatINR(ft.totalExpenses), tone: 'rose' },
    ]
    const isFinance = tab === 'finance'
    return (
      <div className="w-full space-y-5 pb-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-800">RFF</h1>
            <p className="text-sm text-slate-500">Students and finances from the RFF app — read-only, synced live.</p>
          </div>
          <RFFSyncStatus rff={rff} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {cards.map((c) => (
            <div key={c.label} className={`rounded-2xl border shadow-sm px-4 py-3 ${CARD_TONES[c.tone].box}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${CARD_TONES[c.tone].label}`}>{c.label}</p>
              <p className={`text-xl font-black ${CARD_TONES[c.tone].value}`}>{dash ?? c.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-1 border-b border-slate-200" role="tablist">
          {[['overview', 'Overview'], ['finance', 'Finance']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 -mb-px text-sm font-semibold border-b-2 transition-colors ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {isFinance ? (
          <RFFExpensesTable
            expenses={rff.expenses}
            total={ft.totalExpenses || 0}
            loading={loading}
            error={rff.status === 'error'}
          />
        ) : (
          <RFFStudentsList students={students} loading={loading} error={rff.status === 'error'} />
        )}
      </div>
    )
  }

  return (
    <div className="w-full space-y-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800">RFF</h1>
          <p className="text-sm text-slate-500">Students, programs, and fees for the RFF school program.</p>
        </div>
        <RFFSyncStatus rff={rff} />
      </div>

      {/* Summary strip — combined across every program */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl border border-indigo-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Students</p>
          <p className="text-xl font-black text-indigo-700">{dash ?? totals.count}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Fees Collected</p>
          <p className="text-xl font-black text-emerald-700">{dash ?? formatINR(totals.collected)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border border-amber-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-1">Fees Pending</p>
          <p className="text-xl font-black text-amber-700">{dash ?? formatINR(totals.pending)}</p>
        </div>
      </div>

      {/* Programs — each one is its own page (click through below) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Programs</h3>
          {readOnly && (
            <span className="text-[11px] text-slate-400">Managed in the RFF app</span>
          )}
        </div>

        {!readOnly && (
          <>
            <form onSubmit={handleAddProgram} className="flex items-center gap-2">
              <input
                type="text"
                value={newProgramName}
                onChange={(e) => { setNewProgramName(e.target.value); setProgramError('') }}
                placeholder="New program name"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
              >
                Add
              </button>
            </form>
            {programError && <p className="text-xs font-medium text-red-600">{programError}</p>}
          </>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : rff.status === 'error' && programs.length === 0 ? (
          <p className="text-sm text-slate-400">Programs will appear here once the RFF database connects.</p>
        ) : programs.length === 0 ? (
          <p className="text-sm text-slate-400">
            {readOnly ? 'No programs in the RFF database yet.' : 'No programs yet — add one above.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {programs.map((p) => {
              const stats = statsFor(p.id)
              const paidPct = stats.total > 0 ? Math.round((stats.collected / stats.total) * 100) : 0
              return (
                <div key={p.id} className="rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                  <Link
                    to={`/rff/${p.id}`}
                    className="block flex-1 p-3.5 hover:bg-indigo-50/50 transition-colors"
                  >
                    {renamingProgramId === p.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={commitRenameProgram}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        onClick={(e) => e.preventDefault()}
                        className="text-sm px-1 py-0.5 rounded border border-indigo-300 focus:outline-none w-full"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                    )}
                    <p className="text-lg font-bold text-slate-900 mt-1">
                      {stats.count} <span className="text-sm font-medium text-slate-500">{stats.count === 1 ? 'student' : 'students'}</span>
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <p className="text-slate-400">Collected</p>
                        <p className="font-semibold text-emerald-700">{formatINR(stats.collected)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Pending</p>
                        <p className="font-semibold text-amber-700">{formatINR(stats.pending)}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden" title={`${paidPct}% of fees collected`}>
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{paidPct}% of {formatINR(stats.total)} collected</p>
                  </Link>
                  {!readOnly && (
                    <div className="px-3.5 pb-2.5 flex items-center gap-3 text-[11px]">
                      <button
                        type="button"
                        onClick={() => startRenameProgram(p)}
                        className="text-slate-500 hover:text-indigo-600 hover:underline"
                      >
                        Rename
                      </button>
                      {deletingProgramId === p.id ? (
                        <span className="flex items-center gap-1.5">
                          <button type="button" onClick={() => handleDeleteProgram(p.id)} className="text-red-600 font-semibold hover:underline">Confirm delete</button>
                          <button type="button" onClick={() => setDeletingProgramId(null)} className="text-slate-500 hover:underline">Cancel</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingProgramId(p.id)}
                          className="text-red-500 hover:text-red-700 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Only shown when it's non-empty — students left behind by a deleted/renamed
          program still need a way back into the roster rather than silently vanishing. */}
      {!loading && unassignedStudents.length > 0 && (
        <Link
          to="/rff/unassigned"
          className="block rounded-xl border border-amber-200 bg-amber-50 p-3.5 hover:bg-amber-100/60 transition-colors"
        >
          <p className="text-sm font-semibold text-amber-800">
            {unassignedStudents.length} {unassignedStudents.length === 1 ? 'student needs' : 'students need'} a program assigned
          </p>
          <p className="text-[11px] text-amber-600 mt-0.5">View unassigned students →</p>
        </Link>
      )}
    </div>
  )
}
