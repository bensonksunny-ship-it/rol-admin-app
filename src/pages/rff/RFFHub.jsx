import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getRFFPrograms,
  createRFFProgram,
  updateRFFProgram,
  deleteRFFProgram,
  listenRFFStudents,
} from '../../services/firestore'

// RFF is a church-sponsored school program tracked here for now, but is
// deliberately kept off the church's regular department roster — see
// docs/superpowers/specs/2026-08-26-rff-department-design.md. Its data lives
// in its own Firestore collections (rff_programs/rff_students), untouched by
// any other department's code, so a future standalone RFF app can be
// connected to this data without untangling it from the rest of the church's
// records.
//
// Each program (Montessori, PSA, ROL's Nest, ...) is its own page —
// /rff/:programId, see RFFProgramPage.jsx — rather than one shared table
// filtered by a dropdown. Routing by the program's Firestore id (not a
// derived slug) means a renamed program's link never breaks, and a newly
// added program gets a working page immediately with no code change.

export default function RFFHub() {
  const { userProfile, hasAccess } = useAuth()
  const canAccess = hasAccess(userProfile, 'RFF')

  const [programs, setPrograms] = useState([])
  const [programsLoading, setProgramsLoading] = useState(true)
  const [newProgramName, setNewProgramName] = useState('')
  const [programError, setProgramError] = useState('')
  const [renamingProgramId, setRenamingProgramId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deletingProgramId, setDeletingProgramId] = useState(null)

  const [students, setStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(true)

  async function loadPrograms() {
    setProgramsLoading(true)
    try {
      setPrograms(await getRFFPrograms())
    } catch {
      // list stays empty
    } finally {
      setProgramsLoading(false)
    }
  }

  useEffect(() => {
    if (!canAccess) return
    loadPrograms()
    setStudentsLoading(true)
    const unsub = listenRFFStudents(
      (rows) => { setStudents(rows); setStudentsLoading(false) },
      () => setStudentsLoading(false),
    )
    return unsub
  }, [canAccess])

  const totalStudents = students.length
  const feesCollected = students.filter((s) => s.feePaid).reduce((sum, s) => sum + (Number(s.feeAmount) || 0), 0)
  const feesPending = students.filter((s) => !s.feePaid).reduce((sum, s) => sum + (Number(s.feeAmount) || 0), 0)

  const programIds = new Set(programs.map((p) => p.id))
  const unassignedStudents = students.filter((s) => !s.programId || !programIds.has(s.programId))

  function statsFor(programId) {
    const rows = students.filter((s) => s.programId === programId)
    return { count: rows.length, fees: rows.reduce((sum, s) => sum + (Number(s.feeAmount) || 0), 0) }
  }

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
      await loadPrograms()
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
      await loadPrograms()
    } catch {
      setProgramError('Failed to rename. Please try again.')
    }
  }

  async function handleDeleteProgram(id) {
    try {
      await deleteRFFProgram(id)
      setDeletingProgramId(null)
      await loadPrograms()
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

  return (
    <div className="w-full space-y-5 pb-12">
      <div>
        <h1 className="text-xl font-black text-slate-800">RFF</h1>
        <p className="text-sm text-slate-500">Students, programs, and fees for the RFF school program.</p>
      </div>

      {/* Summary strip — combined across every program */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl border border-indigo-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Students</p>
          <p className="text-xl font-black text-indigo-700">{totalStudents}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Fees Collected</p>
          <p className="text-xl font-black text-emerald-700">₹{feesCollected.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border border-amber-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-1">Fees Pending</p>
          <p className="text-xl font-black text-amber-700">₹{feesPending.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Programs — each one is its own page (click through below); managed here */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Programs</h3>
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

        {programsLoading || studentsLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : programs.length === 0 ? (
          <p className="text-sm text-slate-400">No programs yet — add one above.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {programs.map((p) => {
              const stats = statsFor(p.id)
              return (
                <div key={p.id} className="rounded-xl border border-slate-200 overflow-hidden">
                  <Link
                    to={`/rff/${p.id}`}
                    className="block p-3.5 hover:bg-indigo-50/50 transition-colors"
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
                    <p className="text-lg font-bold text-slate-900 mt-1">{stats.count} {stats.count === 1 ? 'student' : 'students'}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">₹{stats.fees.toLocaleString('en-IN')} in fees</p>
                  </Link>
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
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Only shown when it's non-empty — students left behind by a deleted/renamed
          program still need a way back into the roster rather than silently vanishing. */}
      {!studentsLoading && unassignedStudents.length > 0 && (
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
