import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import RowActionsMenu from '../../components/RowActionsMenu'
import {
  createRFFStudent,
  updateRFFStudent,
  deleteRFFStudent,
} from '../../services/firestore'
import { BLANK_STUDENT, formatDisplayDate, studentToFormState, summarizeFees, formatINR } from './studentUtils'
import useRFFData from '../../hooks/useRFFData'
import RFFSyncStatus from './RFFSyncStatus'
import StudentFormModal from './StudentFormModal'
import BackButton from '../../components/BackButton'

// One program's own roster page — /rff/:programId (or /rff/unassigned for
// students whose program was deleted/never set — see RFFHub.jsx). Each
// program is a real page rather than a shared table filtered by a dropdown.

export default function RFFProgramPage() {
  const { programId } = useParams()
  const { userProfile, hasAccess } = useAuth()
  const canAccess = hasAccess(userProfile, 'RFF')
  const isUnassignedView = programId === 'unassigned'

  // Live from the RFF app's database when connected (read-only), else this project.
  const rff = useRFFData(canAccess)
  const { programs, students, loading, readOnly } = rff
  const [editingStudent, setEditingStudent] = useState(null)
  const [deletingStudentId, setDeletingStudentId] = useState(null)
  const [openActionMenu, setOpenActionMenu] = useState(null)

  const programIds = useMemo(() => new Set(programs.map((p) => p.id)), [programs])
  const program = isUnassignedView ? null : programs.find((p) => p.id === programId)

  const scopedStudents = isUnassignedView
    ? students.filter((s) => !s.programId || !programIds.has(s.programId))
    : students.filter((s) => s.programId === programId)

  const totals = summarizeFees(scopedStudents)

  function openAddStudent() {
    setEditingStudent({ ...BLANK_STUDENT, programId: isUnassignedView ? '' : programId })
  }

  function openEditStudent(s) {
    setEditingStudent(studentToFormState(s))
  }

  async function handleSaveStudent(form) {
    if (form.id) {
      await updateRFFStudent(form.id, form)
    } else {
      await createRFFStudent(form)
    }
    setEditingStudent(null)
  }

  async function handleDeleteStudent(id) {
    try {
      await deleteRFFStudent(id)
      setDeletingStudentId(null)
    } catch {
      // row stays; user can retry via the same menu
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

  if (!isUnassignedView && !loading && rff.status !== 'error' && !program) {
    return (
      <div className="p-6 text-slate-600">
        <BackButton fallback="/rff" className="-ml-2.5" />
        <p className="mt-2">This program no longer exists.</p>
      </div>
    )
  }

  const title = isUnassignedView ? 'Unassigned' : (program?.name || '')

  return (
    <div className="w-full space-y-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <BackButton fallback="/rff" label="Back to RFF" className="-ml-2.5" />
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-800 leading-10 truncate">{title}</h1>
          {isUnassignedView && (
            <p className="text-sm text-slate-500">Students with no program, or whose program was removed.</p>
          )}
        </div>
      </div>
      <RFFSyncStatus rff={rff} />
      </div>

      {/* Summary strip — scoped to this program only */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl border border-indigo-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Students</p>
          <p className="text-xl font-black text-indigo-700">{loading ? '…' : totals.count}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Fees Collected</p>
          <p className="text-xl font-black text-emerald-700">{loading ? '…' : formatINR(totals.collected)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border border-amber-200 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-1">Fees Pending</p>
          <p className="text-xl font-black text-amber-700">{loading ? '…' : formatINR(totals.pending)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Students</h3>
          {readOnly ? (
            <span className="text-[11px] text-slate-400">Managed in the RFF app</span>
          ) : (
          <button
            type="button"
            onClick={openAddStudent}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
          >
            + Add Student
          </button>
          )}
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
        ) : scopedStudents.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">No students yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-indigo-700 bg-gradient-to-r from-indigo-50 via-violet-50 to-rose-50">
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Name</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Age / Class</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Guardian</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Admitted</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide text-right border-b-2 border-indigo-100">Fee</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Status</th>
                  {!readOnly && <th className="px-3 py-2 border-b-2 border-indigo-100 w-16" />}
                </tr>
              </thead>
              <tbody>
                {scopedStudents.map((s, idx) => (
                  <tr key={s.id} className={`border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{s.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{s.ageOrClass || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {s.guardianName || '—'}
                      {s.guardianPhone && <span className="block text-xs text-slate-400">{s.guardianPhone}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatDisplayDate(s.admissionDate)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800">₹{(Number(s.feeAmount) || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.feePaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {s.feePaid ? 'Paid' : 'Pending'}
                      </span>
                    </td>
                    {!readOnly && <td className="px-3 py-2.5 text-center">
                      {deletingStudentId === s.id ? (
                        <div className="flex items-center justify-center gap-1.5 text-[10px]">
                          <button type="button" onClick={() => handleDeleteStudent(s.id)} className="text-red-600 font-semibold hover:underline">Yes</button>
                          <button type="button" onClick={() => setDeletingStudentId(null)} className="text-slate-500 hover:underline">No</button>
                        </div>
                      ) : (
                        <RowActionsMenu
                          menuKey={`rff-student-${s.id}`}
                          openKey={openActionMenu}
                          onOpen={setOpenActionMenu}
                          onClose={() => setOpenActionMenu(null)}
                          onEdit={() => openEditStudent(s)}
                          onDelete={() => setDeletingStudentId(s.id)}
                        />
                      )}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingStudent && !readOnly && (
        <StudentFormModal
          initial={editingStudent}
          programs={programs}
          onCancel={() => setEditingStudent(null)}
          onSave={handleSaveStudent}
        />
      )}
    </div>
  )
}
