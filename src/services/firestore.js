import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  increment,
  getDocsFromServer,
  arrayUnion,
  deleteField,
  runTransaction,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage, functions, httpsCallable } from '../lib/firebase'
import { ROLES, deriveRoleFromPositions } from '../constants/roles'
import { categorizeMemberByAttendance } from '../utils/cellMemberCategory'
import { normalizeEngagementType } from '../utils/pcsEngagement'
import { mergeFamilyIntoProfile } from '../utils/familyDetails'

// Firestore's writes reject any `undefined` field value, including ones nested inside
// array elements (e.g. one row of a dynamically-built assignments array). Recursively
// drops them so payloads assembled from loosely-typed UI state can't fail the write.
// Leaves Timestamp/FieldValue instances (anything not a plain object/array) untouched.
function stripUndefinedDeep(value) {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep)
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue
      out[k] = stripUndefinedDeep(v)
    }
    return out
  }
  return value
}

function normalizeGlobalRole(v) {
  const s = v == null ? '' : String(v).trim()
  if (s === 'FOUNDER') return s
  return ''
}

const toDate = (v) => (v?.toDate ? v.toDate() : v)

// ── Visitor-first rule ──────────────────────────────────────────────────────
// Every new person enters through D-Light Visitor Entry. Roster adds (cell,
// department, worship) must link an existing directory record; this error is
// thrown — and shown by the calling screen — when one tries to create a person
// from a typed name instead. `createdSource` tags where each new record came from:
// 'visitor_form' | 'cell_leader' | 'admin_import' | 'pcs_direct'.
export const VISITOR_REQUIRED_MESSAGE =
  'Pick this person from the People Directory. New people must first be registered through D-Light Visitor Entry.'
function requireLinkedPerson(...ids) {
  if (!ids.some(Boolean)) throw new Error(VISITOR_REQUIRED_MESSAGE)
}

// Users (read/update by auth)
export async function getUser(uid) {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function updateUser(uid, data) {
  await updateDoc(doc(db, 'users', uid), data)
}

// Department assignments (e.g., D Light Assign tab)
export async function getDepartmentAssignments(departmentSlug) {
  if (!db || !departmentSlug) return null
  const ref = doc(db, 'department_assignments', String(departmentSlug))
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function setDepartmentAssignments(departmentSlug, payload) {
  if (!db || !departmentSlug) return
  const ref = doc(db, 'department_assignments', String(departmentSlug))
  await setDoc(ref, payload, { merge: true })
}

// D-Light Assign tab — per-Sunday duty assignments, one doc per service date
// (doc id = 'YYYY-MM-DD'). Distinct from the generic, undated
// department_assignments doc above, which other departments' Assign tabs still use.
const DLIGHT_ASSIGNMENTS_COLLECTION = 'dlight_assignments'

export async function getDlightAssignmentsForDate(serviceDate) {
  if (!db || !serviceDate) return null
  const id = String(serviceDate).slice(0, 10)
  const snap = await getDoc(doc(db, DLIGHT_ASSIGNMENTS_COLLECTION, id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function setDlightAssignmentsForDate(serviceDate, assignments, updatedBy) {
  if (!db || !serviceDate) return
  const id = String(serviceDate).slice(0, 10)
  await setDoc(doc(db, DLIGHT_ASSIGNMENTS_COLLECTION, id), {
    serviceDate: id,
    assignments,
    updatedAt: Timestamp.now(),
    updatedBy: updatedBy || 'unknown',
  }, { merge: true })
}

/**
 * Every saved D-Light duty roster, newest Sunday first — backs the Archives tab.
 * Ordered by the `serviceDate` field rather than doc id so a doc written before
 * that field existed still sorts correctly once backfilled.
 */
export async function getDlightAssignmentsArchive(maxWeeks = 104) {
  if (!db) return []
  const q = query(
    collection(db, DLIGHT_ASSIGNMENTS_COLLECTION),
    orderBy('serviceDate', 'desc'),
    limit(maxWeeks)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      serviceDate: data.serviceDate || d.id,
      assignments: data.assignments && typeof data.assignments === 'object' ? data.assignments : {},
      updatedAt: toDate(data.updatedAt),
      updatedBy: data.updatedBy || '',
    }
  })
}

// Users – admin management helpers
export async function getAllUsers() {
  if (!db) return []
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

function normalizePositions(positions) {
  if (!Array.isArray(positions)) return []
  return positions
    .filter((p) => p && (p.department || p.position || p.role))
    .slice(0, 10)
    .map((p) => {
      const out = {
        department: String(p.department || ''),
      }
      // new schema
      if (p.role != null && p.role !== '') out.role = String(p.role)
      // legacy schema
      if (p.position != null && p.position !== '') out.position = String(p.position)
      return out
    })
}

export async function createUserByAdmin(data) {
  if (!db) return null
  const positions = normalizePositions(data.positions)
  const depts = positions.length
    ? [...new Set(positions.map((p) => p.department).filter(Boolean))]
    : (Array.isArray(data.departments) ? data.departments : data.department ? [data.department] : [])
  const globalRole = normalizeGlobalRole(data.globalRole)
  const role = data.role != null && data.role !== '' ? data.role : (positions.length ? deriveRoleFromPositions(positions) : 'Viewer')
  const ref = await addDoc(collection(db, 'users'), {
    name: data.name || '',
    email: (data.email || '').toLowerCase(),
    phone: data.phone || '',
    membershipNumber: data.membershipNumber || '',
    role,
    globalRole: globalRole || null,
    department: depts[0] || data.department || '',
    departments: depts,
    positions,
    cellGroup: data.cellGroup || '',
    cellId: data.cellId || '',
    status: data.status || 'active',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateUserByAdmin(id, data) {
  if (!db || !id) return
  const positions = data.positions !== undefined ? normalizePositions(data.positions) : undefined
  const depts = positions !== undefined
    ? [...new Set(positions.map((p) => p.department).filter(Boolean))]
    : undefined
  const globalRole = data.globalRole !== undefined ? normalizeGlobalRole(data.globalRole) : undefined
  const role = data.role !== undefined
    ? String(data.role)
    : (positions !== undefined && positions.length ? deriveRoleFromPositions(positions) : undefined)
  const department = depts && depts[0] ? depts[0] : (data.department !== undefined ? data.department : undefined)
  const payload = {
    name: data.name !== undefined ? String(data.name) : undefined,
    email: data.email !== undefined ? String(data.email).toLowerCase() : undefined,
    phone: data.phone !== undefined ? String(data.phone) : undefined,
    membershipNumber: data.membershipNumber !== undefined ? String(data.membershipNumber) : undefined,
    role: role !== undefined ? role : (data.role !== undefined ? String(data.role) : undefined),
    globalRole: globalRole !== undefined ? (globalRole || null) : undefined,
    department,
    departments: depts !== undefined ? depts : (data.departments !== undefined ? (Array.isArray(data.departments) ? data.departments : [data.departments].filter(Boolean)) : undefined),
    positions: positions !== undefined ? positions : undefined,
    cellGroup: data.cellGroup !== undefined ? String(data.cellGroup) : undefined,
    cellId: data.cellId !== undefined ? String(data.cellId) : undefined,
    status: data.status !== undefined ? String(data.status) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, 'users', id), clean)
}

export async function setUserStatus(id, status) {
  if (!db || !id) return
  await updateDoc(doc(db, 'users', id), { status })
}

// Departments
export async function getDepartments() {
  const snap = await getDocs(collection(db, 'departments'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getDepartment(id) {
  const ref = doc(db, 'departments', id)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function createDepartment(data) {
  const ref = await addDoc(collection(db, 'departments'), {
    ...data,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateDepartment(id, data) {
  await updateDoc(doc(db, 'departments', id), data)
}

// Tasks
export async function getTasks(filters = {}) {
  let q = collection(db, 'tasks')
  const constraints = []
  if (filters.department) constraints.push(where('department', '==', filters.department))
  if (filters.status) constraints.push(where('status', '==', filters.status))
  if (constraints.length) q = query(q, ...constraints, orderBy('createdAt', 'desc'))
  else q = query(q, orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, deadline: toDate(data.deadline) }
  })
}

export async function createTask(data) {
  const ref = await addDoc(collection(db, 'tasks'), {
    ...data,
    deadline: data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateTask(id, data) {
  const payload = { ...data }
  if (data.deadline) payload.deadline = Timestamp.fromDate(new Date(data.deadline))
  await updateDoc(doc(db, 'tasks', id), payload)
}

export async function deleteTask(id) {
  await deleteDoc(doc(db, 'tasks', id))
}

// Status transitions for the global To-Do List (ToDoListCard) — stamp their own
// timestamp so completed/turned-down items can still be shown (greyed out) for their
// 30-day retention window instead of disappearing the instant they're actioned.
export async function markTaskCompleted(id) {
  await updateDoc(doc(db, 'tasks', id), { status: 'Completed', completedAt: Timestamp.now() })
}

export async function markTaskTurnedDown(id) {
  await updateDoc(doc(db, 'tasks', id), { status: 'Turned Down', turnedDownAt: Timestamp.now() })
}

function taskDocToRecord(d) {
  const data = d.data()
  return {
    id: d.id,
    ...data,
    deadline: toDate(data.deadline),
    createdAt: toDate(data.createdAt),
    completedAt: toDate(data.completedAt),
    turnedDownAt: toDate(data.turnedDownAt),
  }
}

export function subscribeTasksByDepartment(department, onChange) {
  if (!db || !department) return () => {}
  const q = query(collection(db, 'tasks'), where('department', '==', department), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(taskDocToRecord))
  }, () => {})
}

// Live feed for My Workspace's To-Do List — pass `null` for "no department filter"
// (Founder: every task); pass an array to scope to just those departments. No
// orderBy here on purpose: a Firestore `in` filter combined with orderBy on a
// different field needs a composite index, so callers sort the results themselves.
export function subscribeTasksForDepartments(departments, onChange) {
  if (!db) return () => {}
  if (Array.isArray(departments) && departments.length === 0) {
    onChange([])
    return () => {}
  }
  const q = Array.isArray(departments)
    ? query(collection(db, 'tasks'), where('department', 'in', departments.slice(0, 30)))
    : collection(db, 'tasks')
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(taskDocToRecord))
  }, () => {})
}

// Real-time listener for cell-leader referrals sent to the Caring department
export function subscribeCellMemberReferralTasks(onChange) {
  if (!db) return () => {}
  const q = query(collection(db, 'tasks'), where('department', '==', 'Caring'))
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    onChange(all.filter(t =>
      t.status !== 'Completed' &&
      t.status !== 'Dismissed' &&
      (t.cellMemberReferral === true || (t.notes && t.notes.includes('Referred from Cell')))
    ))
  }, () => {})
}

// Real-time listener for pending PCS referral tasks sent to the Cell department
export function subscribePCSReferralTasks(onChange) {
  if (!db) return () => {}
  const q = query(
    collection(db, 'tasks'),
    where('department', '==', 'Cell')
  )
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    onChange(all.filter(t =>
      t.status !== 'Completed' &&
      (t.pcsReferral === true || (t.notes && t.notes.includes('Referred from Caring PCS')))
    ))
  }, () => {})
}

// Real-time listener for "consult D Light Director" requests raised from the Cell
// Director's Unassigned drawer — read by both Cell (for the row status badge) and
// D Light (to respond with a recommendation).
export function subscribeCellDlightConsultTasks(onChange) {
  if (!db) return () => {}
  const q = query(collection(db, 'tasks'), where('department', '==', 'D Light'))
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    onChange(all.filter(t => t.cellAssignConsult === true && t.status !== 'Completed'))
  }, () => {})
}

// Department entries (director data: team, budget, participation – same data for pastor insights)
export async function getDepartmentEntries(department, filters = {}) {
  if (!db) return []
  const constraints = [where('department', '==', department)]
  if (filters.period) constraints.push(where('period', '==', filters.period))
  let q = query(
    collection(db, 'department_entries'),
    ...constraints,
    orderBy('createdAt', 'desc')
  )
  if (filters.limit) q = query(q, limit(filters.limit))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, createdAt: toDate(data.createdAt) }
  })
}

export async function addDepartmentEntry(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, 'department_entries'), {
    ...data,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

// Worship detailed budget items (spreadsheet-style budget for the department)
export async function getWorshipBudgetItems(department) {
  if (!db) return []
  const q = query(
    collection(db, 'worship_budget_items'),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, createdAt: toDate(data.createdAt) }
  })
  // Sort similar to Excel view: by category then subCategory then description
  list.sort((a, b) => {
    const cat = (a.category || '').localeCompare(b.category || '')
    if (cat !== 0) return cat
    const sub = (a.subCategory || '').localeCompare(b.subCategory || '')
    if (sub !== 0) return sub
    return (a.description || '').localeCompare(b.description || '')
  })
  return list
}

export async function addWorshipBudgetItem(department, data, addedBy) {
  if (!db) return null
  const payload = {
    department,
    category: data.category || '',
    subCategory: data.subCategory || '',
    description: data.description || '',
    quantity: Number(data.quantity) || 0,
    unitCost: Number(data.unitCost) || 0,
    totalCost: Number(data.totalCost ?? data.quantity * data.unitCost) || 0,
    type: data.type || '',
    expectedDate: data.expectedDate || '',
    notes: data.notes || '',
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  }
  const ref = await addDoc(collection(db, 'worship_budget_items'), payload)
  return ref.id
}

export async function updateWorshipBudgetItem(id, data) {
  if (!db) return
  const payload = { ...data }
  if (payload.quantity != null) payload.quantity = Number(payload.quantity) || 0
  if (payload.unitCost != null) payload.unitCost = Number(payload.unitCost) || 0
  if (payload.totalCost != null) payload.totalCost = Number(payload.totalCost) || 0
  await updateDoc(doc(db, 'worship_budget_items', id), payload)
}

export async function deleteWorshipBudgetItem(id) {
  if (!db) return
  await deleteDoc(doc(db, 'worship_budget_items', id))
}

// Worship Songs Directory
const WORSHIP_SONGS_COLLECTION = 'worship_songs'

export async function getWorshipSongs() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, WORSHIP_SONGS_COLLECTION), orderBy('title', 'asc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function addWorshipSong(data, addedBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, WORSHIP_SONGS_COLLECTION), {
    title: data.title || '',
    artist: data.artist || '',
    key: data.key || '',
    tempo: data.tempo ? Number(data.tempo) : null,
    notes: data.notes || '',
    sections: Array.isArray(data.sections) ? data.sections : [],
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    rawText: data.rawText || '',
    designedBy: data.designedBy || addedBy || '',
    createdBy: addedBy || '',
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateWorshipSong(id, data) {
  if (!db || !id) return
  await updateDoc(doc(db, WORSHIP_SONGS_COLLECTION, id), { ...data })
}

export async function deleteWorshipSong(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, WORSHIP_SONGS_COLLECTION, id))
}

// Sunday Ministry team members (director's team list)
const SUNDAY_MINISTRY_DEPT = 'Sunday Ministry'
export async function getSundayMinistryTeamMembers(options = {}) {
  if (!db) return []
  const q = query(
    collection(db, 'sunday_ministry_team_members'),
    where('department', '==', SUNDAY_MINISTRY_DEPT)
  )
  const snap = await getDocs(q)
  let list = snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, createdAt: toDate(data.createdAt) }
  })
  list.sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))
  if (options.former === true) list = list.filter((m) => m.isFormer)
  if (options.former === false) list = list.filter((m) => !m.isFormer)
  return list
}

export async function addSundayMinistryTeamMember(data, addedBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, 'sunday_ministry_team_members'), {
    department: SUNDAY_MINISTRY_DEPT,
    name: data.name,
    memberSince: data.memberSince || new Date().toISOString().slice(0, 10),
    isFormer: data.isFormer ?? false,
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateSundayMinistryTeamMember(id, data) {
  if (!db) return
  await updateDoc(doc(db, 'sunday_ministry_team_members', id), data)
}

export async function deleteSundayMinistryTeamMember(id) {
  if (!db) return
  await deleteDoc(doc(db, 'sunday_ministry_team_members', id))
}

// Sunday Ministry budget items (spreadsheet-style)
export async function getSundayMinistryBudgetItems() {
  if (!db) return []
  const q = query(
    collection(db, 'sunday_ministry_budget_items'),
    where('department', '==', SUNDAY_MINISTRY_DEPT)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, createdAt: toDate(data.createdAt) }
  })
  list.sort((a, b) => (a.category || '').localeCompare(b.category || ''))
  return list
}

export async function addSundayMinistryBudgetItem(data, addedBy) {
  if (!db) return null
  const payload = {
    department: SUNDAY_MINISTRY_DEPT,
    category: data.category || '',
    subCategory: data.subCategory || '',
    description: data.description || '',
    quantity: Number(data.quantity) || 0,
    unitCost: Number(data.unitCost) || 0,
    totalCost: Number(data.totalCost ?? data.quantity * data.unitCost) || 0,
    type: data.type || '',
    expectedDate: data.expectedDate || '',
    notes: data.notes || '',
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  }
  const ref = await addDoc(collection(db, 'sunday_ministry_budget_items'), payload)
  return ref.id
}

export async function updateSundayMinistryBudgetItem(id, data) {
  if (!db) return
  const payload = { ...data }
  if (payload.quantity != null) payload.quantity = Number(payload.quantity) || 0
  if (payload.unitCost != null) payload.unitCost = Number(payload.unitCost) || 0
  if (payload.totalCost != null) payload.totalCost = Number(payload.totalCost) || 0
  await updateDoc(doc(db, 'sunday_ministry_budget_items', id), payload)
}

export async function deleteSundayMinistryBudgetItem(id) {
  if (!db) return
  await deleteDoc(doc(db, 'sunday_ministry_budget_items', id))
}

// Worship team members (director's full team list + former members)
// No orderBy to avoid composite index; sort in memory
export async function getWorshipTeamMembers(department, options = {}) {
  if (!db) return []
  const q = query(
    collection(db, 'worship_team_members'),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  let list = snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, createdAt: toDate(data.createdAt) }
  })
  list.sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))
  if (options.former === true) list = list.filter((m) => m.isFormer === true)
  if (options.former === false) list = list.filter((m) => m.isFormer !== true)
  return list
}

export async function addWorshipTeamMember(department, data, addedBy) {
  if (!db) return null
  requireLinkedPerson(data.visitorId, data.personId)
  const ref = await addDoc(collection(db, 'worship_team_members'), {
    department,
    name: data.name,
    // Foreign-key binding to the People Directory — previously dropped entirely even
    // when the caller supplied them (the Add Member picker always passed a visitorId),
    // leaving every newly-added team member permanently disconnected from their
    // underlying directory record, matched only by name string thereafter.
    visitorId: data.visitorId || '',
    personId: data.personId || '',
    memberSince: data.memberSince || new Date().toISOString().slice(0, 10),
    isFormer: data.isFormer ?? false,
    positions: Array.isArray(data.positions) ? data.positions : [],
    isWorshipDirector: !!data.isWorshipDirector,
    addedBy: addedBy || 'unknown',
    createdSource: data.createdSource || 'admin_import',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateWorshipTeamMember(id, data) {
  if (!db) return
  // updatedAt is the last-resort end date PCS uses for a Former member with no
  // "Former since" date and no rehearsal attendance (see DepartmentHub teamEnd).
  await updateDoc(doc(db, 'worship_team_members', id), { ...data, updatedAt: Timestamp.now() })
}

export async function deleteWorshipTeamMember(id, { department, name } = {}) {
  if (!db) return
  if (department && name) {
    // Batch-delete all docs with this name to eliminate silent duplicates
    const q = query(
      collection(db, 'worship_team_members'),
      where('department', '==', department),
      where('name', '==', name)
    )
    const snap = await getDocs(q)
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  } else {
    await deleteDoc(doc(db, 'worship_team_members', id))
  }
}

// Generic department team members (for all other departments)
// Query: department_team_members where department == current department (name).
// Stored fields: department, name, rolePosition, subDepartment (legacy), subDepartments (array), phone, status, memberSince, notes (optional), createdAt.
function normalizeSubDepartments(data) {
  if (Array.isArray(data.subDepartments)) return data.subDepartments.filter(Boolean)
  if (data.subDepartment) return [data.subDepartment]
  return []
}

// Some department rosters ended up with more than one `department_team_members`
// doc for the same person (e.g. assigning a second sub-department re-added them
// instead of updating their record). Collapse those into a single row per person
// — keyed by their linked directory/River Kids id, falling back to name — so the
// roster shows one row with every sub-department tag rather than duplicate rows.
function dedupeTeamMembersList(list) {
  const byId = Array.from(new Map(list.map((m) => [m.id, m])).values())
  const byPerson = new Map()
  for (const m of byId) {
    const key = m.visitorId || (m.childId ? `child:${m.childId}` : '') || `name:${String(m.name || '').trim().toLowerCase()}`
    const existing = byPerson.get(key)
    if (!existing) {
      byPerson.set(key, m)
      continue
    }
    const mergedSubDepts = Array.from(new Set([...(existing.subDepartments || []), ...(m.subDepartments || [])]))
    const primary = (existing.createdAt && m.createdAt && m.createdAt < existing.createdAt) ? m : existing
    byPerson.set(key, { ...primary, subDepartments: mergedSubDepts, subDepartment: mergedSubDepts[0] || primary.subDepartment })
  }
  return Array.from(byPerson.values())
}

export async function getDepartmentTeamMembers(department) {
  if (!db) return []
  const q = query(
    collection(db, 'department_team_members'),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => {
    const data = d.data()
    const rolePosition = data.rolePosition ?? data.role ?? ''
    const subDepts = normalizeSubDepartments(data)
    return {
      id: d.id,
      department: data.department,
      name: data.name,
      displayName: data.displayName || '',
      role: rolePosition,
      rolePosition,
      subDepartment: subDepts[0] || '',
      subDepartments: subDepts,
      phone: data.phone || '',
      status: data.status || 'active',
      memberSince: data.memberSince || '',
      notes: data.notes || '',
      isFormer: data.isFormer ?? false,
      formerDate: data.formerDate || '',
      updatedAt: toDate(data.updatedAt),
      isDirector: data.isDirector ?? false,
      memberType: data.memberType || 'core',
      visitorId: data.visitorId || '',
      source: data.source || '',
      childId: data.childId || '',
      createdAt: toDate(data.createdAt),
    }
  })
  const deduped = dedupeTeamMembersList(list)
  deduped.sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))
  return deduped
}

export function subscribeDepartmentTeamMembers(department, onChange) {
  if (!db || !department) return () => {}
  const q = query(collection(db, 'department_team_members'), where('department', '==', department))
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => {
      const data = d.data()
      const rolePosition = data.rolePosition ?? data.role ?? ''
      const subDepts = normalizeSubDepartments(data)
      return {
        id: d.id,
        department: data.department,
        name: data.name,
        displayName: data.displayName || '',
        role: rolePosition,
        rolePosition,
        subDepartment: subDepts[0] || '',
        subDepartments: subDepts,
        phone: data.phone || '',
        status: data.status || 'active',
        memberSince: data.memberSince || '',
        notes: data.notes || '',
        isFormer: data.isFormer ?? false,
        // Tenure end date for former members — see updateDepartmentTeamMember for when
        // this gets stamped, and formatMemberDuration/getMemberTenureEnd in
        // DepartmentHub.jsx for how it caps the "member since" duration instead of
        // letting a former member's tenure keep growing against today.
        formerDate: data.formerDate || '',
        updatedAt: toDate(data.updatedAt),
        isDirector: data.isDirector ?? false,
        memberType: data.memberType || 'core',
        visitorId: data.visitorId || '',
        source: data.source || '',
        childId: data.childId || '',
        createdAt: toDate(data.createdAt),
      }
    })
    const deduped = dedupeTeamMembersList(list)
    deduped.sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))
    onChange(deduped)
  }, () => {})
}

export async function addDepartmentTeamMember(department, data, addedBy) {
  if (!db) return null
  const subDepts = Array.isArray(data.subDepartments) ? data.subDepartments.filter(Boolean) : (data.subDepartment ? [data.subDepartment] : [])
  requireLinkedPerson(data.visitorId, data.childId)
  const ref = await addDoc(collection(db, 'department_team_members'), {
    department,
    name: data.name || '',
    rolePosition: data.rolePosition ?? data.role ?? '',
    subDepartment: subDepts[0] || '',
    subDepartments: subDepts,
    phone: data.phone || '',
    status: data.status || 'active',
    memberSince: data.memberSince ? String(data.memberSince).slice(0, 10) : new Date().toISOString().slice(0, 10),
    notes: data.notes != null ? String(data.notes) : '',
    isFormer: data.isFormer ?? false,
    // Only meaningful when isFormer is true — caller stamps this to "today" (or an
    // explicit departure date) the moment a member is marked former, so their tenure
    // duration locks there instead of continuing to count against today. See
    // getMemberTenureEnd/formatMemberDuration in DepartmentHub.jsx.
    formerDate: data.isFormer ? (data.formerDate ? String(data.formerDate).slice(0, 10) : new Date().toISOString().slice(0, 10)) : '',
    updatedAt: Timestamp.now(),
    isDirector: data.isDirector ?? false,
    memberType: data.memberType === 'guest' ? 'guest' : 'core',
    // Link references — previously dropped on add, so a member picked from the
    // directory search saved unlinked and showed the "Unlinked" badge until an
    // edit + re-save. `source: 'river_kids'` + `childId` identify a River Kids
    // child (who has no adult visitor record, so `visitorId` stays empty).
    visitorId: data.visitorId || '',
    source: data.source || '',
    childId: data.childId || '',
    addedBy: addedBy || 'unknown',
    createdSource: data.createdSource || 'admin_import',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateDepartmentTeamMember(id, data) {
  if (!db) return
  const subDepts = data.subDepartments !== undefined
    ? (Array.isArray(data.subDepartments) ? data.subDepartments.filter(Boolean) : [])
    : undefined
  const payload = {
    name: data.name != null ? String(data.name) : undefined,
    rolePosition: (data.rolePosition !== undefined || data.role !== undefined) ? (data.rolePosition ?? data.role ?? '') : undefined,
    subDepartment: subDepts !== undefined ? (subDepts[0] || '') : (data.subDepartment != null ? String(data.subDepartment) : undefined),
    subDepartments: subDepts,
    phone: data.phone != null ? String(data.phone) : undefined,
    status: data.status != null ? String(data.status) : undefined,
    memberSince: data.memberSince != null ? String(data.memberSince).slice(0, 10) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    isFormer: data.isFormer !== undefined ? !!data.isFormer : undefined,
    // Caller-driven, not auto-derived here: DepartmentHub.jsx stamps today's date (or
    // an explicit one) when isFormer flips to true, and clears it back to '' when a
    // former member is reactivated — this function has no prior-doc read to detect
    // that transition itself.
    formerDate: data.formerDate !== undefined ? String(data.formerDate) : undefined,
    isDirector: data.isDirector !== undefined ? !!data.isDirector : undefined,
    memberType: data.memberType !== undefined ? (data.memberType === 'guest' ? 'guest' : 'core') : undefined,
    visitorId: data.visitorId !== undefined ? String(data.visitorId) : undefined,
    source: data.source !== undefined ? String(data.source) : undefined,
    childId: data.childId !== undefined ? String(data.childId) : undefined,
    // Legacy former records (marked former before formerDate existed) have no way to
    // know their true departure date; this "last touched" timestamp is the fallback
    // getMemberTenureEnd uses so their tenure stops growing even without one.
    updatedAt: Timestamp.now(),
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, 'department_team_members', id), clean)
}

export async function deleteDepartmentTeamMember(id) {
  if (!db) return
  await deleteDoc(doc(db, 'department_team_members', id))
}

// Assigns additional sub-department(s) to a person already on the roster —
// merges into their existing record instead of the caller inserting a new
// `department_team_members` doc (which used to render as a duplicate row).
export async function addSubDepartmentsToTeamMember(id, subDepartments) {
  if (!db) return
  const subDepts = Array.isArray(subDepartments) ? subDepartments.filter(Boolean) : []
  if (!subDepts.length) return
  await updateDoc(doc(db, 'department_team_members', id), {
    subDepartments: arrayUnion(...subDepts),
  })
}

// Department sub-departments (all departments except Cell & Worship use this)
const DEPARTMENT_SUBDEPARTMENTS_COLLECTION = 'department_sub_departments'

function mapDepartmentSubDepartments(department, snap) {
  const list = snap.docs.map((d) => ({
    id: d.id,
    department,
    name: d.data().name || '',
    servingArea: d.data().servingArea || '',
    // River Kids groups its sub-departments under a fixed set of category keys
    // (see RK_CLASS_GROUPS in DepartmentHub.jsx); every other department leaves
    // this blank and keeps the flat list.
    category: d.data().category || '',
    // Director-set display position (see reorderDepartmentSubDepartments).
    // Rows never reordered have no `order` and fall after ordered ones, by name.
    order: typeof d.data().order === 'number' ? d.data().order : null,
    createdAt: toDate(d.data().createdAt),
  }))
  return sortDepartmentSubDepartments(list)
}

export function sortDepartmentSubDepartments(list) {
  const rank = (sd) => (typeof sd.order === 'number' ? sd.order : Number.POSITIVE_INFINITY)
  return [...list].sort((a, b) => (rank(a) - rank(b)) || (a.name || '').localeCompare(b.name || ''))
}

export async function getDepartmentSubDepartments(department) {
  if (!db || !department) return []
  const q = query(
    collection(db, DEPARTMENT_SUBDEPARTMENTS_COLLECTION),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  return mapDepartmentSubDepartments(department, snap)
}

/** Live version of getDepartmentSubDepartments — sub-departments added, renamed,
 *  reordered or deleted elsewhere show up without a reload. Returns unsubscribe. */
export function subscribeDepartmentSubDepartments(department, callback, onError) {
  if (!db || !department) {
    callback([])
    return () => {}
  }
  const q = query(
    collection(db, DEPARTMENT_SUBDEPARTMENTS_COLLECTION),
    where('department', '==', department)
  )
  return onSnapshot(
    q,
    (snap) => callback(mapDepartmentSubDepartments(department, snap)),
    (err) => {
      console.error('subscribeDepartmentSubDepartments', err)
      if (onError) onError(err)
    }
  )
}

/** Persists display order: writes `order: index` for each id, in the given sequence. */
export async function reorderDepartmentSubDepartments(orderedIds) {
  if (!db || !Array.isArray(orderedIds) || !orderedIds.length) return
  const batch = writeBatch(db)
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, DEPARTMENT_SUBDEPARTMENTS_COLLECTION, id), { order: index })
  })
  await batch.commit()
}

export async function addDepartmentSubDepartment(department, name, addedBy, servingArea = '', category = '') {
  if (!db || !department || !name) return null
  const ref = await addDoc(collection(db, DEPARTMENT_SUBDEPARTMENTS_COLLECTION), {
    department,
    name,
    servingArea: String(servingArea || '').trim(),
    category: String(category || '').trim(),
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateDepartmentSubDepartment(id, data) {
  if (!db || !id) return
  const payload = {
    name: data.name != null ? String(data.name) : undefined,
    servingArea: data.servingArea != null ? String(data.servingArea) : undefined,
    category: data.category != null ? String(data.category) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, DEPARTMENT_SUBDEPARTMENTS_COLLECTION, id), clean)
}

export async function deleteDepartmentSubDepartment(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, DEPARTMENT_SUBDEPARTMENTS_COLLECTION, id))
}

// Children roster per department (e.g. River Kids)
const DEPARTMENT_CHILDREN_COLLECTION = 'department_children'

export async function getDepartmentChildren(department) {
  if (!db || !department) return []
  const q = query(collection(db, DEPARTMENT_CHILDREN_COLLECTION), where('department', '==', department))
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => ({
    id: d.id,
    department,
    name: d.data().name || '',
    dob: d.data().dob || '',
    fatherName: d.data().fatherName || '',
    motherName: d.data().motherName || '',
    currentPlace: d.data().currentPlace || '',
    // Legacy docs only ever had a single `group` string — normalize those into a
    // one-item array here so every consumer can treat classGroups as the one true
    // shape regardless of when the record was created.
    classGroups: Array.isArray(d.data().classGroups) ? d.data().classGroups : (d.data().group ? [d.data().group] : []),
    joinedDate: d.data().joinedDate || '',
    joinedVia: d.data().joinedVia || '',
    active: d.data().active !== false,
    createdAt: toDate(d.data().createdAt),
  }))
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  return list
}

export async function addDepartmentChild(department, childData, addedBy) {
  if (!db || !department || !String(childData?.name || '').trim()) return null
  const name = String(childData.name).trim()
  const ref = await addDoc(collection(db, DEPARTMENT_CHILDREN_COLLECTION), {
    department,
    name,
    dob: childData.dob || '',
    fatherName: (childData.fatherName || '').trim(),
    motherName: (childData.motherName || '').trim(),
    currentPlace: (childData.currentPlace || '').trim(),
    classGroups: Array.isArray(childData.classGroups) ? childData.classGroups : [],
    joinedDate: childData.joinedDate || '',
    joinedVia: childData.joinedVia || '',
    active: true,
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  if (department === 'River Kids') {
    setDoc(doc(db, RIVER_KIDS_LOOKUP_COLLECTION, ref.id), { name }).catch(() => {})
  }
  return ref.id
}

export async function updateDepartmentChild(id, data, department) {
  if (!db || !id) return
  const payload = {}
  if (data.name !== undefined) payload.name = String(data.name || '').trim()
  if (data.active !== undefined) payload.active = data.active !== false
  if (data.dob !== undefined) payload.dob = data.dob || ''
  if (data.fatherName !== undefined) payload.fatherName = (data.fatherName || '').trim()
  if (data.motherName !== undefined) payload.motherName = (data.motherName || '').trim()
  if (data.currentPlace !== undefined) payload.currentPlace = (data.currentPlace || '').trim()
  if (data.classGroups !== undefined) payload.classGroups = Array.isArray(data.classGroups) ? data.classGroups : []
  if (data.joinedDate !== undefined) payload.joinedDate = data.joinedDate || ''
  if (data.joinedVia !== undefined) payload.joinedVia = data.joinedVia || ''
  if (Object.keys(payload).length) await updateDoc(doc(db, DEPARTMENT_CHILDREN_COLLECTION, id), payload)
  // Keep the name-only river_kids_lookup index (used by cross-department team-member
  // search) in step. Only the caller that knows this is a River Kids child passes
  // `department`; others leave the lookup untouched.
  if (department === 'River Kids') {
    if (payload.active === false) {
      deleteDoc(doc(db, RIVER_KIDS_LOOKUP_COLLECTION, id)).catch(() => {})
    } else if (payload.name !== undefined || payload.active === true) {
      const lookup = {}
      if (payload.name !== undefined) lookup.name = payload.name
      setDoc(doc(db, RIVER_KIDS_LOOKUP_COLLECTION, id), lookup, { merge: true }).catch(() => {})
    }
  }
}

export async function deleteDepartmentChild(id) {
  if (!db || !id) return
  await updateDoc(doc(db, DEPARTMENT_CHILDREN_COLLECTION, id), { active: false })
  deleteDoc(doc(db, RIVER_KIDS_LOOKUP_COLLECTION, id)).catch(() => {})
}

// ── River Kids lookup ─────────────────────────────────────────────────────────
// Name-only index of active River Kids children, readable by any signed-in user
// so the team-member picker in every department can offer children by name
// without exposing the full department_children record (DOB, parent names).
// Doc id === the department_children doc id. A doc exists iff the child is active.
// Mirrors the pcs_lookup pattern above.
const RIVER_KIDS_LOOKUP_COLLECTION = 'river_kids_lookup'

export async function getRiverKidsLookup() {
  if (!db) return []
  const snap = await getDocs(collection(db, RIVER_KIDS_LOOKUP_COLLECTION))
  return snap.docs.map((d) => ({ id: d.id, name: d.data().name || '' }))
}

// Bulk-sync active River Kids children into river_kids_lookup (run by a River Kids
// director on the register/attendance tab load). Backfills legacy rosters.
export async function syncAllRiverKidsToLookup(children) {
  if (!db || !Array.isArray(children)) return
  const existing = await getDocs(collection(db, RIVER_KIDS_LOOKUP_COLLECTION))
  const existingById = new Map(existing.docs.map((d) => [d.id, d.data().name || '']))
  const activeIds = new Set()
  const batch = writeBatch(db)
  let dirty = false
  children.forEach((c) => {
    if (c.active === false) return
    activeIds.add(c.id)
    const name = String(c.name || '').trim()
    if (existingById.get(c.id) !== name) {
      batch.set(doc(db, RIVER_KIDS_LOOKUP_COLLECTION, c.id), { name })
      dirty = true
    }
  })
  existing.docs.forEach((d) => {
    if (!activeIds.has(d.id)) { batch.delete(d.ref); dirty = true }
  })
  if (dirty) await batch.commit()
}

// Daily attendance: present[classGroup][childId] = true/false — nested by class/
// group (not a single flat childId map) because a child can now belong to more
// than one classGroup (e.g. Sunday School + River Kids-1); a flat map would have
// conflated the same child's presence across every group tab they appear under.
const DEPARTMENT_CHILD_ATTENDANCE_COLLECTION = 'department_child_attendance'

export async function getDepartmentChildAttendance(department, dateStr) {
  if (!db || !department || !dateStr) return { id: null, department, date: dateStr, present: {} }
  const q = query(
    collection(db, DEPARTMENT_CHILD_ATTENDANCE_COLLECTION),
    where('department', '==', department),
    where('date', '==', String(dateStr).slice(0, 10)),
    limit(1)
  )
  const snap = await getDocs(q)
  if (snap.empty) return { id: null, department, date: dateStr, present: {} }
  const d = snap.docs[0]
  const data = d.data()
  return {
    id: d.id,
    department: data.department,
    date: data.date,
    present: typeof data.present === 'object' && data.present !== null ? data.present : {},
    updatedAt: toDate(data.updatedAt),
  }
}

// `classGroup` scopes the write to that one group's sub-map inside the shared
// department+date doc (read-fresh-merge-write) — every other group's attendance
// already saved for this date is preserved untouched.
export async function setDepartmentChildAttendance(department, dateStr, classGroup, presentForGroup, updatedBy) {
  if (!db || !department || !dateStr || !classGroup) return
  const date = String(dateStr).slice(0, 10)
  const existing = await getDepartmentChildAttendance(department, date)
  const payload = {
    department,
    date,
    present: {
      ...existing.present,
      [classGroup]: presentForGroup && typeof presentForGroup === 'object' ? presentForGroup : {},
    },
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }
  if (existing.id) {
    await updateDoc(doc(db, DEPARTMENT_CHILD_ATTENDANCE_COLLECTION, existing.id), payload)
    return existing.id
  }
  await addDoc(collection(db, DEPARTMENT_CHILD_ATTENDANCE_COLLECTION), {
    ...payload,
    createdAt: Timestamp.now(),
  })
}

// Department events (e.g. Event M) — program / budget / team as text fields
const DEPARTMENT_EVENTS_COLLECTION = 'department_events'

export async function getDepartmentEvents(department) {
  if (!db || !department) return []
  const q = query(collection(db, DEPARTMENT_EVENTS_COLLECTION), where('department', '==', department))
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      department,
      name: x.name || '',
      programs: Array.isArray(x.programs) ? x.programs : [],
      liveCellAttendance: x.liveCellAttendance && typeof x.liveCellAttendance === 'object' ? x.liveCellAttendance : {},
      program: x.program || '',
      programScheduleStartTime: x.programScheduleStartTime || '',
      budget: x.budget || '',
      team: x.team || '',
      createdAt: toDate(x.createdAt),
    }
  })
  list.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))
  return list
}

export async function addDepartmentEvent(department, name, createdBy) {
  if (!db || !department || !String(name || '').trim()) return null
  const ref = await addDoc(collection(db, DEPARTMENT_EVENTS_COLLECTION), {
    department,
    name: String(name).trim(),
    program: '',
    programs: [],
    liveCellAttendance: {},
    programScheduleStartTime: '',
    budget: '',
    team: '',
    createdBy: createdBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateDepartmentEvent(id, data) {
  if (!db || !id) return
  const payload = {}
  if (data.name !== undefined) payload.name = String(data.name || '').trim()
  if (data.program !== undefined) payload.program = String(data.program || '')
  if (data.programs !== undefined) payload.programs = Array.isArray(data.programs) ? data.programs : []
  if (data.liveCellAttendance !== undefined) payload.liveCellAttendance = data.liveCellAttendance && typeof data.liveCellAttendance === 'object' ? data.liveCellAttendance : {}
  if (data.budget !== undefined) payload.budget = String(data.budget || '')
  if (data.team !== undefined) payload.team = String(data.team || '')
  if (data.programScheduleStartTime !== undefined) payload.programScheduleStartTime = String(data.programScheduleStartTime || '')
  payload.updatedAt = Timestamp.now()
  await updateDoc(doc(db, DEPARTMENT_EVENTS_COLLECTION, id), payload)
}

export async function deleteDepartmentEvent(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, DEPARTMENT_EVENTS_COLLECTION, id))
}

// Worship schedule by date: one doc per date, assignments = [{ role, memberId, memberName }]
export async function updateWorshipScheduleById(id, data) {
  if (!db || !id) return
  await updateDoc(doc(db, 'worship_schedule', id), data)
}

export async function getAllWorshipSchedules(department) {
  if (!db) return []
  const q = query(collection(db, 'worship_schedule'), where('department', '==', department))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getWorshipScheduleByDate(department, date) {
  if (!db) return { date, assignments: [] }
  const q = query(
    collection(db, 'worship_schedule'),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const d = snap.docs.find((doc) => doc.data().date === date)
  return d ? { id: d.id, ...d.data() } : { date, assignments: [], songs: [] }
}

// Worship rehearsals
const WORSHIP_REHEARSALS_COLLECTION = 'worship_rehearsals'

export async function getWorshipRehearsals(department) {
  if (!db) return []
  const q = query(collection(db, WORSHIP_REHEARSALS_COLLECTION), where('department', '==', department))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getWorshipRehearsalByDate(department, date) {
  if (!db) return null
  const q = query(
    collection(db, WORSHIP_REHEARSALS_COLLECTION),
    where('department', '==', department),
    where('date', '==', date)
  )
  const snap = await getDocs(q)
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}

export async function addWorshipRehearsal(department, data, createdBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, WORSHIP_REHEARSALS_COLLECTION), stripUndefinedDeep({
    department, ...data, createdBy, createdAt: Timestamp.now(),
  }))
  return ref.id
}

export async function updateWorshipRehearsal(id, data) {
  if (!db || !id) return
  await updateDoc(doc(db, WORSHIP_REHEARSALS_COLLECTION, id), stripUndefinedDeep(data))
}

export async function deleteWorshipRehearsal(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, WORSHIP_REHEARSALS_COLLECTION, id))
}

// A worship_schedule doc's `date` is always a Sunday service date — snaps any other
// weekday forward to its nearest Sunday so a stray caller (a free-typed date input, a
// timezone-shifted date string, etc.) can never persist a non-Sunday "service" record
// that Archives/Records would then have to filter back out. Anchored to noon so the
// day-of-week check itself is never off by one from a timezone shift.
function normalizeToSunday(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  const diff = (7 - d.getDay()) % 7
  d.setDate(d.getDate() + diff)
  // Local date components, not toISOString() (which converts to UTC and can shift
  // the calendar date near midnight in timezones far from UTC).
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function setWorshipScheduleByDate(department, date, assignments, updatedBy, extra = {}) {
  if (!db) return null
  const normalizedDate = normalizeToSunday(date)
  const q = query(
    collection(db, 'worship_schedule'),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const existing = snap.docs.find((doc) => doc.data().date === normalizedDate)
  const payload = stripUndefinedDeep({
    department, date: normalizedDate, assignments, updatedBy: updatedBy || '', updatedAt: Timestamp.now(), ...extra,
  })
  if (existing) {
    await updateDoc(doc(db, 'worship_schedule', existing.id), payload)
    return existing.id
  }
  const ref = await addDoc(collection(db, 'worship_schedule'), payload)
  return ref.id
}

// ── Media schedule ───────────────────────────────────────────────────────────
// Per-Sunday crew assignments for the Media department's Assign tab — same shape
// and Sunday-only date convention as worship_schedule above. One doc per service
// date: { department: 'Media', date, assignments: [{ subDeptId, role, memberId,
// memberName }], updatedBy, updatedAt }. Rows are generated from the
// department's Sub-Departments; `subDeptId` is the stable key and `role` is the
// sub-department name snapshotted at save time.
export async function getMediaScheduleByDate(date) {
  if (!db) return { date, assignments: [] }
  const q = query(collection(db, 'media_schedule'), where('department', '==', 'Media'))
  const snap = await getDocs(q)
  const d = snap.docs.find((doc) => doc.data().date === date)
  return d ? { id: d.id, ...d.data() } : { date, assignments: [] }
}

// Every Media crew schedule, oldest date first — feeds the Media Hub's coverage
// and serving-load insights.
export async function getMediaSchedules() {
  if (!db) return []
  const q = query(collection(db, 'media_schedule'), where('department', '==', 'Media'))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, date: d.data().date || '', assignments: Array.isArray(d.data().assignments) ? d.data().assignments : [] }))
    .filter((s) => s.date)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function setMediaScheduleByDate(date, assignments, updatedBy) {
  if (!db) return null
  const normalizedDate = normalizeToSunday(date)
  const q = query(collection(db, 'media_schedule'), where('department', '==', 'Media'))
  const snap = await getDocs(q)
  const existing = snap.docs.find((doc) => doc.data().date === normalizedDate)
  const payload = stripUndefinedDeep({
    department: 'Media',
    date: normalizedDate,
    assignments: Array.isArray(assignments) ? assignments : [],
    updatedBy: updatedBy || '',
    updatedAt: Timestamp.now(),
  })
  if (existing) {
    await updateDoc(doc(db, 'media_schedule', existing.id), payload)
    return existing.id
  }
  const ref = await addDoc(collection(db, 'media_schedule'), payload)
  return ref.id
}

// ── Sunday Ministry crew schedule ────────────────────────────────────────────
// Per-Sunday crew assignments for Sunday Ministry's Assign tab (SundayCrew.jsx) —
// same shape and convention as media_schedule above, since sub-departments are
// director-defined (not a fixed list) here too. One doc per service date:
// { department: 'Sunday Ministry', date, assignments: [{ subDeptId, role,
// memberId, memberName }], updatedBy, updatedAt }.
export async function getSundayCrewScheduleByDate(date) {
  if (!db) return { date, assignments: [] }
  const q = query(collection(db, 'sunday_crew_schedule'), where('department', '==', 'Sunday Ministry'))
  const snap = await getDocs(q)
  // Same normalization as the setter, so a date saved as its Sunday is found again.
  const normalizedDate = normalizeToSunday(date)
  const d = snap.docs.find((doc) => doc.data().date === normalizedDate)
  return d ? { id: d.id, ...d.data() } : { date: normalizedDate, assignments: [] }
}

export async function setSundayCrewScheduleByDate(date, assignments, updatedBy) {
  if (!db) return null
  const normalizedDate = normalizeToSunday(date)
  const q = query(collection(db, 'sunday_crew_schedule'), where('department', '==', 'Sunday Ministry'))
  const snap = await getDocs(q)
  const existing = snap.docs.find((doc) => doc.data().date === normalizedDate)
  const payload = stripUndefinedDeep({
    department: 'Sunday Ministry',
    date: normalizedDate,
    assignments: Array.isArray(assignments) ? assignments : [],
    updatedBy: updatedBy || '',
    updatedAt: Timestamp.now(),
  })
  if (existing) {
    await updateDoc(doc(db, 'sunday_crew_schedule', existing.id), payload)
    return existing.id
  }
  const ref = await addDoc(collection(db, 'sunday_crew_schedule'), payload)
  return ref.id
}

// Worship Ministry applications — a review queue, not a direct write into the
// People's Directory/PCS. The Worship Director hands the device to the applicant to
// fill out; submissions land here for the Director to read afterward and manually
// decide what (if anything) to copy into PD/PCS and the Worship Team roster.
const WORSHIP_APPLICATIONS_COLLECTION = 'worship_applications'

export async function getWorshipApplications(department) {
  if (!db) return []
  const q = query(collection(db, WORSHIP_APPLICATIONS_COLLECTION), where('department', '==', department))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
}

export async function addWorshipApplication(department, data, submittedBy) {
  if (!db) return null
  const payload = stripUndefinedDeep({
    department,
    ...data,
    status: 'pending',
    submittedBy: submittedBy || '',
    createdAt: Timestamp.now(),
  })
  const ref = await addDoc(collection(db, WORSHIP_APPLICATIONS_COLLECTION), payload)
  return ref.id
}

export async function updateWorshipApplication(id, data) {
  if (!db || !id) return
  await updateDoc(doc(db, WORSHIP_APPLICATIONS_COLLECTION, id), stripUndefinedDeep(data))
}

export async function deleteWorshipApplication(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, WORSHIP_APPLICATIONS_COLLECTION, id))
}

// Attendance (Sunday Ministry)
export async function getAttendance(filters = {}) {
  let q = collection(db, 'attendance')
  if (filters.year) {
    const start = new Date(filters.year, 0, 1)
    const end = new Date(filters.year, 11, 31, 23, 59, 59)
    q = query(
      q,
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end)),
      orderBy('date', 'desc')
    )
  } else {
    q = query(q, orderBy('date', 'desc'), limit(100))
  }
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, date: toDate(data.date) }
  })
}

export async function createAttendance(data) {
  const ref = await addDoc(collection(db, 'attendance'), {
    ...data,
    date: Timestamp.fromDate(new Date(data.date)),
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateAttendance(id, data) {
  const payload = { ...data }
  if (data.date) payload.date = Timestamp.fromDate(new Date(data.date))
  await updateDoc(doc(db, 'attendance', id), payload)
}

// Sunday Ministry Plans (one doc per date, sections filled by departments)
export async function getSundayPlan(dateStr) {
  if (!db) return null
  const ref = doc(db, 'sunday_plans', dateStr)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function setSundayPlanSection(dateStr, sectionKey, sectionData) {
  if (!db) return
  const ref = doc(db, 'sunday_plans', dateStr)
  const snap = await getDoc(ref)
  const dateTimestamp = Timestamp.fromDate(new Date(dateStr))
  if (snap.exists()) {
    await updateDoc(ref, {
      [sectionKey]: sectionData,
      updatedAt: Timestamp.now(),
    })
  } else {
    await setDoc(ref, {
      date: dateTimestamp,
      [sectionKey]: sectionData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  }
}

export async function setSundayPlanFull(dateStr, data) {
  if (!db) return
  const ref = doc(db, 'sunday_plans', dateStr)
  const dateTimestamp = Timestamp.fromDate(new Date(dateStr))
  const snap = await getDoc(ref)
  const payload = {
    ...data,
    date: dateTimestamp,
    updatedAt: Timestamp.now(),
  }
  if (snap.exists()) {
    await updateDoc(ref, payload)
  } else {
    await setDoc(ref, { ...payload, createdAt: Timestamp.now() })
  }
}

export async function getSundayPlansForYear(year) {
  if (!db) return []
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31, 23, 59, 59)
  const q = query(
    collection(db, 'sunday_plans'),
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<=', Timestamp.fromDate(end)),
    orderBy('date', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, date: data.date?.toDate?.() ?? data.date }
  })
}

// Finance Income
export async function getFinanceIncome(filters = {}) {
  let q = collection(db, 'finance_income')
  const constraints = []
  if (filters.startDate && filters.endDate) {
    constraints.push(where('date', '>=', Timestamp.fromDate(filters.startDate)))
    constraints.push(where('date', '<=', Timestamp.fromDate(filters.endDate)))
  } else if (filters.month != null && filters.year != null) {
    const y = filters.year
    const m = filters.month
    const start = new Date(y, m, 1)
    const end = new Date(y, m + 1, 0, 23, 59, 59)
    constraints.push(where('date', '>=', Timestamp.fromDate(start)))
    constraints.push(where('date', '<=', Timestamp.fromDate(end)))
  } else if (filters.year) {
    const start = new Date(filters.year, 0, 1)
    const end = new Date(filters.year, 11, 31, 23, 59, 59)
    constraints.push(where('date', '>=', Timestamp.fromDate(start)))
    constraints.push(where('date', '<=', Timestamp.fromDate(end)))
  }
  if (constraints.length) q = query(q, ...constraints, orderBy('date', 'asc'))
  else q = query(q, orderBy('date', 'asc'), limit(200))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, date: toDate(data.date) }
  })
}

export async function createFinanceIncome(data) {
  const [y, m, d] = String(data.date).split('-').map(Number)
  const ref = await addDoc(collection(db, 'finance_income'), {
    ...data,
    date: Timestamp.fromDate(new Date(y, m - 1, d)),
    amount: Number(data.amount) || 0,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

// Bulk create for the Income "Paste from Excel" flow. Each chunk is one atomic
// writeBatch, so a paste either lands whole or not at all (per 450-doc chunk) —
// no half-saved paste with rows silently missing. Returns the new ids in input order.
export async function createFinanceIncomeMany(items) {
  const ids = []
  for (let i = 0; i < items.length; i += 450) {
    const batch = writeBatch(db)
    for (const data of items.slice(i, i + 450)) {
      const [y, m, d] = String(data.date).split('-').map(Number)
      const ref = doc(collection(db, 'finance_income'))
      batch.set(ref, {
        ...data,
        date: Timestamp.fromDate(new Date(y, m - 1, d)),
        amount: Number(data.amount) || 0,
        createdAt: Timestamp.now(),
      })
      ids.push(ref.id)
    }
    await batch.commit()
  }
  return ids
}

export async function updateFinanceIncome(id, data) {
  const [y, m, d] = String(data.date).split('-').map(Number)
  await updateDoc(doc(db, 'finance_income', id), {
    ...data,
    date: Timestamp.fromDate(new Date(y, m - 1, d)),
    amount: Number(data.amount) || 0,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteFinanceIncome(id) {
  await deleteDoc(doc(db, 'finance_income', id))
}

/** Removes exactly the given income entries (used to undo an Income-tab paste). */
export async function deleteFinanceIncomeMany(ids) {
  if (!db || !Array.isArray(ids) || !ids.length) return
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db)
    ids.slice(i, i + 450).forEach((id) => batch.delete(doc(db, 'finance_income', id)))
    await batch.commit()
  }
}

/** One Income card's "Save": writes only the changed fields of the changed
 *  entries in that card, atomically. updates = [{ id, data: { date?, amount?,
 *  giverName?, towards?, category? } }] — omitted fields are left untouched. */
export async function batchUpdateFinanceIncome(updates) {
  if (!db || !Array.isArray(updates) || !updates.length) return
  const batch = writeBatch(db)
  updates.forEach(({ id, data }) => {
    const payload = { updatedAt: Timestamp.now() }
    if (data.date != null) {
      const [y, m, d] = String(data.date).split('-').map(Number)
      payload.date = Timestamp.fromDate(new Date(y, m - 1, d))
    }
    if (data.amount != null) payload.amount = Number(data.amount) || 0
    ;['giverName', 'towards', 'category'].forEach((k) => {
      if (data[k] != null) payload[k] = String(data[k]).trim()
    })
    batch.update(doc(db, 'finance_income', id), payload)
  })
  await batch.commit()
}

/** Income tab spreadsheet grids: one cell edit, paste, row delete or undo,
 *  written as a single atomic batch (per 450-write chunk).
 *  ops = { creates: [{ date: 'yyyy-MM-dd', category, amount, giverName, towards }],
 *          updates: [{ id, data }] (same shape as batchUpdateFinanceIncome),
 *          deletes: [id] }. Returns the new ids in `creates` order. */
export async function applyFinanceIncomeOps({ creates = [], updates = [], deletes = [] }) {
  if (!db) return []
  const writes = [
    ...creates.map((data) => ({ kind: 'create', data })),
    ...updates.map((u) => ({ kind: 'update', ...u })),
    ...deletes.map((id) => ({ kind: 'delete', id })),
  ]
  const ids = []
  for (let i = 0; i < writes.length; i += 450) {
    const batch = writeBatch(db)
    writes.slice(i, i + 450).forEach((w) => {
      if (w.kind === 'create') {
        const [y, m, d] = String(w.data.date).split('-').map(Number)
        const ref = doc(collection(db, 'finance_income'))
        ids.push(ref.id)
        batch.set(ref, {
          ...w.data,
          date: Timestamp.fromDate(new Date(y, m - 1, d)),
          amount: Number(w.data.amount) || 0,
          createdAt: Timestamp.now(),
        })
      } else if (w.kind === 'update') {
        const payload = { updatedAt: Timestamp.now() }
        if (w.data.date != null) {
          const [y, m, d] = String(w.data.date).split('-').map(Number)
          payload.date = Timestamp.fromDate(new Date(y, m - 1, d))
        }
        if (w.data.amount != null) payload.amount = Number(w.data.amount) || 0
        ;['giverName', 'towards', 'category'].forEach((k) => {
          if (w.data[k] != null) payload[k] = String(w.data[k]).trim()
        })
        batch.update(doc(db, 'finance_income', w.id), payload)
      } else {
        batch.delete(doc(db, 'finance_income', w.id))
      }
    })
    await batch.commit()
  }
  return ids
}

export async function deleteAllFinanceIncomeForMonth(year, month) {
  if (!db) return
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59)
  const q = query(
    collection(db, 'finance_income'),
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<=', Timestamp.fromDate(end))
  )
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
}

// Finance Expense
export async function getFinanceExpense(filters = {}) {
  let q = collection(db, 'finance_expense')
  const constraints = []
  if (filters.startDate && filters.endDate) {
    constraints.push(where('date', '>=', Timestamp.fromDate(filters.startDate)))
    constraints.push(where('date', '<=', Timestamp.fromDate(filters.endDate)))
  } else if (filters.month != null && filters.year != null) {
    const y = filters.year
    const m = filters.month
    const start = new Date(y, m, 1)
    const end = new Date(y, m + 1, 0, 23, 59, 59)
    constraints.push(where('date', '>=', Timestamp.fromDate(start)))
    constraints.push(where('date', '<=', Timestamp.fromDate(end)))
  } else if (filters.year) {
    const start = new Date(filters.year, 0, 1)
    const end = new Date(filters.year, 11, 31, 23, 59, 59)
    constraints.push(where('date', '>=', Timestamp.fromDate(start)))
    constraints.push(where('date', '<=', Timestamp.fromDate(end)))
  }
  if (constraints.length) q = query(q, ...constraints, orderBy('date', 'asc'))
  else q = query(q, orderBy('date', 'asc'), limit(200))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, date: toDate(data.date) }
  })
}

// Finance Tally — optional per-month opening-balance anchors. The Tally page normally
// carries the balance forward automatically (all income minus all non-pending expense
// before the month); a doc here overrides the opening balance for its month AND becomes
// the baseline every later month carries forward from. Doc id is the month key "yyyy-MM".
export async function getFinanceTallyAnchors() {
  const snap = await getDocs(collection(db, 'finance_tally'))
  return snap.docs.map((d) => ({ monthKey: d.id, ...d.data() }))
}

export async function setFinanceTallyAnchor(monthKey, { openingBalance, note, updatedBy } = {}) {
  await setDoc(
    doc(db, 'finance_tally', monthKey),
    {
      openingBalance: Number(openingBalance) || 0,
      note: note || '',
      updatedBy: updatedBy || '',
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  )
}

export async function deleteFinanceTallyAnchor(monthKey) {
  await deleteDoc(doc(db, 'finance_tally', monthKey))
}

// ── Advance Payout Requests ───────────────────────────────────────────────────

const ADVANCE_PAYOUT_COLLECTION = 'advance_payout_requests'

export async function createAdvancePayoutRequest(data) {
  const ref = await addDoc(collection(db, ADVANCE_PAYOUT_COLLECTION), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
  })
  return ref.id
}

export async function getAdvancePayoutRequests(filters = {}) {
  const constraints = []
  if (filters.status) constraints.push(where('status', '==', filters.status))
  if (filters.departmentSlug) constraints.push(where('departmentSlug', '==', filters.departmentSlug))
  const q = constraints.length
    ? query(collection(db, ADVANCE_PAYOUT_COLLECTION), ...constraints)
    : collection(db, ADVANCE_PAYOUT_COLLECTION)
  const snap = await getDocs(q)
  const data = snap.docs.map(d => {
    const raw = d.data()
    return { id: d.id, ...raw, createdAt: toDate(raw.createdAt), reviewedAt: toDate(raw.reviewedAt) }
  })
  data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return data
}

export async function updateAdvancePayoutRequest(id, data) {
  await updateDoc(doc(db, ADVANCE_PAYOUT_COLLECTION, id), {
    ...data,
    reviewedAt: serverTimestamp(),
  })
}

export function listenFinanceExpense(filters = {}, callback, onError) {
  let q = collection(db, 'finance_expense')
  const constraints = []
  if (filters.month != null && filters.year != null) {
    const y = filters.year
    const m = filters.month
    const start = new Date(y, m, 1)
    const end = new Date(y, m + 1, 0, 23, 59, 59)
    constraints.push(where('date', '>=', Timestamp.fromDate(start)))
    constraints.push(where('date', '<=', Timestamp.fromDate(end)))
  }
  if (constraints.length) q = query(q, ...constraints, orderBy('date', 'asc'))
  else q = query(q, orderBy('date', 'asc'), limit(200))
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }))),
    onError,
  )
}

export async function createFinanceExpense(data) {
  const [y, m, d] = String(data.date).split('-').map(Number)
  const ref = await addDoc(collection(db, 'finance_expense'), {
    ...data,
    date: Timestamp.fromDate(new Date(y, m - 1, d)),
    amount: Number(data.amount) || 0,
    status: data.status || 'pending',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateFinanceExpenseStatus(id, status, approvedBy) {
  await updateDoc(doc(db, 'finance_expense', id), {
    status,
    approvedBy: approvedBy || '',
    approvedAt: Timestamp.now(),
  })
}

export async function updateFinanceExpense(id, data) {
  const [y, m, d] = String(data.date).split('-').map(Number)
  await updateDoc(doc(db, 'finance_expense', id), {
    date: Timestamp.fromDate(new Date(y, m - 1, d)),
    department: data.department,
    item: data.item || '',
    billNo: data.billNo || '',
    amount: Number(data.amount) || 0,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteFinanceExpense(id) {
  await deleteDoc(doc(db, 'finance_expense', id))
}

// Bulk-delete several finance_expense docs in one atomic batch — used by the
// Expense grid's checkbox "Delete Selected" action. Firestore caps a batch at
// 500 writes; a department card never holds that many rows, so a single batch is
// enough (chunk here if that ever changes).
export async function deleteFinanceExpenseMany(ids = []) {
  if (!db || !ids.length) return
  const batch = writeBatch(db)
  ids.forEach((id) => batch.delete(doc(db, 'finance_expense', id)))
  await batch.commit()
}

// `sheetYear`/`sheetMonth` are optional and independent of `date` — they record which
// month sheet an expense was deliberately entered/kept under, which can differ from its
// transaction date (e.g. a January-dated entry kept under the July sheet on purpose).
// Only ExpensePage.jsx's department cards read/write these fields today; every other
// finance_expense query in this file is untouched and still filters by `date` alone.
export function listenFinanceExpenseBySheet({ year, month }, callback, onError) {
  const q = query(
    collection(db, 'finance_expense'),
    where('sheetYear', '==', year),
    where('sheetMonth', '==', month),
  )
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }))),
    onError,
  )
}

export async function updateFinanceExpenseSheet(id, { sheetYear, sheetMonth }) {
  await updateDoc(doc(db, 'finance_expense', id), { sheetYear, sheetMonth })
}

// ── Savings ────────────────────────────────────────────────────────────────
// Deposits/withdrawals against fixed savings funds (Emergency Reserve, Building
// Fund, …), tracked in their own collection so they never affect Expense totals.
// Unlike Expense, a fund's balance is a running total that never resets — so
// this listens to the whole collection with no month filter, and SavingsPage
// computes each fund's balance client-side from every one of its transactions.
// A month filter on that page only changes which rows are *displayed*, never
// which ones count toward the balance.

export function listenFinanceSavings(callback, onError) {
  const q = query(collection(db, 'finance_savings'), orderBy('date', 'asc'))
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data(), date: toDate(d.data().date) }))),
    onError,
  )
}

// One-shot fetch of every savings transaction, no date filter — used by the
// Accounts Hub's "Total Savings" summary card, which (like SavingsPage's own
// banner) is always an all-time balance, never scoped to the Hub's year/month
// picker.
export async function getFinanceSavings() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, 'finance_savings'), orderBy('date', 'asc')))
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, date: toDate(data.date) }
  })
}

export async function createFinanceSavings(data) {
  const [y, m, d] = String(data.date).split('-').map(Number)
  const ref = await addDoc(collection(db, 'finance_savings'), {
    ...data,
    date: Timestamp.fromDate(new Date(y, m - 1, d)),
    amount: Number(data.amount) || 0,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateFinanceSavings(id, data) {
  const [y, m, d] = String(data.date).split('-').map(Number)
  await updateDoc(doc(db, 'finance_savings', id), {
    date: Timestamp.fromDate(new Date(y, m - 1, d)),
    fund: data.fund,
    type: data.type,
    item: data.item || '',
    reference: data.reference || '',
    amount: Number(data.amount) || 0,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteFinanceSavings(id) {
  await deleteDoc(doc(db, 'finance_savings', id))
}

export async function getFinanceExpenseByDept(department) {
  if (!db || !department) return []
  const q = query(collection(db, 'finance_expense'), where('department', '==', department))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => {
      const data = d.data()
      return { id: d.id, ...data, date: toDate(data.date) }
    })
    .sort((a, b) => (b.date || 0) - (a.date || 0))
}

export function subscribeFinanceExpenseByDept(department, onChange) {
  if (!db || !department) return () => {}
  const q = query(collection(db, 'finance_expense'), where('department', '==', department))
  return onSnapshot(q, (snap) => {
    const entries = snap.docs
      .map((d) => {
        const data = d.data()
        return { id: d.id, ...data, date: toDate(data.date) }
      })
      .sort((a, b) => (b.date || 0) - (a.date || 0))
    onChange(entries)
  }, () => {})
}

export async function approveFinanceWeeklyEntry(id) {
  await updateDoc(doc(db, 'finance_expense', id), {
    status: 'approved',
    approvedAt: Timestamp.now(),
  })
}

export async function approveAllFinanceWeeklyEntries(ids) {
  const batch = writeBatch(db)
  ids.forEach(id => {
    batch.update(doc(db, 'finance_expense', id), {
      status: 'approved',
      approvedAt: Timestamp.now(),
    })
  })
  await batch.commit()
}

// Finance Voucher Requests
const FINANCE_VOUCHER_REQUESTS_COLLECTION = 'finance_voucher_requests'

export async function getFinanceVoucherRequests(status = 'pending') {
  if (!db) return []
  const q = query(
    collection(db, FINANCE_VOUCHER_REQUESTS_COLLECTION),
    where('status', '==', status),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      date: toDate(data.date),
      category: data.category || '',
      amount: Number(data.amount) || 0,
      description: data.description || '',
      departmentTag: data.departmentTag || '',
      submittedBy: data.submittedBy || '',
      submittedByUid: data.submittedByUid || '',
      status: data.status || 'pending',
      reviewedBy: data.reviewedBy || null,
      reviewedAt: toDate(data.reviewedAt),
      rejectionReason: data.rejectionReason || null,
      createdAt: toDate(data.createdAt),
    }
  })
}

export async function createFinanceVoucherRequest(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, FINANCE_VOUCHER_REQUESTS_COLLECTION), {
    date: Timestamp.fromDate(new Date(data.date)),
    category: data.category || '',
    amount: Number(data.amount) || 0,
    description: data.description || '',
    departmentTag: data.departmentTag || '',
    submittedBy: data.submittedBy || '',
    submittedByUid: data.submittedByUid || '',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function approveFinanceVoucherRequest(requestId, approvedBy) {
  if (!db || !requestId) return null
  const voucherRef = doc(db, FINANCE_VOUCHER_REQUESTS_COLLECTION, requestId)
  const voucherSnap = await getDoc(voucherRef)
  if (!voucherSnap.exists()) throw new Error('Voucher not found')
  const voucherData = voucherSnap.data()
  const now = Timestamp.now()
  const batch = writeBatch(db)
  batch.update(voucherRef, {
    status: 'approved',
    reviewedBy: approvedBy,
    reviewedAt: now,
  })
  const expenseRef = doc(collection(db, 'finance_expense'))
  batch.set(expenseRef, {
    date: voucherData.date,
    category: voucherData.category,
    amount: voucherData.amount,
    description: voucherData.description,
    departmentTag: voucherData.departmentTag,
    submittedBy: voucherData.submittedBy,
    approvedBy,
    voucherRequestId: requestId,
    createdAt: now,
  })
  await batch.commit()
  return expenseRef.id
}

export async function rejectFinanceVoucherRequest(requestId, rejectedBy, rejectionReason = '') {
  if (!db || !requestId) return
  await updateDoc(doc(db, FINANCE_VOUCHER_REQUESTS_COLLECTION, requestId), {
    status: 'rejected',
    reviewedBy: rejectedBy,
    reviewedAt: Timestamp.now(),
    rejectionReason: rejectionReason || '',
  })
}

// Finance Budget (Budget tab: category, subCategory, description, quantity, unitCost, priority, type, justification, expectedDate)
const FINANCE_BUDGET_COLLECTION = 'finance_budget'

export async function getFinanceBudgetItems() {
  if (!db) return []
  const snap = await getDocs(collection(db, FINANCE_BUDGET_COLLECTION))
  const list = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      quantity: Number(data.quantity) || 0,
      unitCost: Number(data.unitCost) || 0,
      totalCost: Number(data.totalCost) ?? (Number(data.quantity) || 0) * (Number(data.unitCost) || 0),
      expectedDate: data.expectedDate || '',
    }
  })
  list.sort((a, b) => {
    const c = (a.category || '').localeCompare(b.category || '')
    if (c !== 0) return c
    const s = (a.subCategory || '').localeCompare(b.subCategory || '')
    if (s !== 0) return s
    return (a.description || '').localeCompare(b.description || '')
  })
  return list
}

function financeBudgetPayload(data) {
  const quantity = Number(data.quantity) || 0
  const unitCost = Number(data.unitCost) || 0
  const payload = {
    category: data.category || '',
    subCategory: data.subCategory || '',
    description: data.description || '',
    quantity,
    unitCost,
    totalCost: quantity * unitCost,
    priority: data.priority || 'Medium',
    type: data.type || 'Recurring',
    justification: data.justification || '',
    expectedDate: data.expectedDate || '',
  }
  if (data.department != null && data.department !== '') payload.department = String(data.department)
  return payload
}

export async function getFinanceBudgetItemsByDepartment(department) {
  if (!db || !department) return []
  const q = query(
    collection(db, FINANCE_BUDGET_COLLECTION),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      quantity: Number(data.quantity) || 0,
      unitCost: Number(data.unitCost) || 0,
      totalCost: Number(data.totalCost) ?? (Number(data.quantity) || 0) * (Number(data.unitCost) || 0),
      expectedDate: data.expectedDate || '',
    }
  })
  list.sort((a, b) => {
    const c = (a.category || '').localeCompare(b.category || '')
    if (c !== 0) return c
    const s = (a.subCategory || '').localeCompare(b.subCategory || '')
    if (s !== 0) return s
    return (a.description || '').localeCompare(b.description || '')
  })
  return list
}

export async function addFinanceBudgetItem(data, addedBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, FINANCE_BUDGET_COLLECTION), {
    ...financeBudgetPayload(data),
    status: 'pending',
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateFinanceBudgetItem(id, data) {
  if (!db) return
  await updateDoc(doc(db, FINANCE_BUDGET_COLLECTION, id), financeBudgetPayload(data))
}

export async function updateFinanceBudgetItemStatus(id, status, approvedBy) {
  if (!db) return
  await updateDoc(doc(db, FINANCE_BUDGET_COLLECTION, id), {
    status,
    approvedBy: approvedBy || '',
    approvedAt: Timestamp.now(),
  })
}

export async function deleteFinanceBudgetItem(id) {
  if (!db) return
  await deleteDoc(doc(db, FINANCE_BUDGET_COLLECTION, id))
}

// Event spending (Event Management → Spending section)
const EVENT_SPENDING_COLLECTION = 'event_spending'

export async function getEventSpendingItemsByDepartment(department) {
  if (!db || !department) return []
  const q = query(collection(db, EVENT_SPENDING_COLLECTION), where('department', '==', department))
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      department: data.department || '',
      eventId: data.eventId || '',
      eventName: data.eventName || '',
      amount: Number(data.amount) || 0,
      description: data.description || '',
      itemsPurchased: data.itemsPurchased != null ? String(data.itemsPurchased) : '',
      createdAt: toDate(data.createdAt),
    }
  })
  list.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))
  return list
}

export async function addEventSpendingItem(data, addedBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, EVENT_SPENDING_COLLECTION), {
    department: String(data.department || ''),
    eventId: String(data.eventId || ''),
    eventName: String(data.eventName || ''),
    amount: Number(data.amount) || 0,
    description: String(data.description || ''),
    itemsPurchased: String(data.itemsPurchased || ''),
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateEventSpendingItem(id, data) {
  if (!db || !id) return
  const payload = {
    eventId: data.eventId !== undefined ? String(data.eventId || '') : undefined,
    eventName: data.eventName !== undefined ? String(data.eventName || '') : undefined,
    amount: data.amount !== undefined ? Number(data.amount) || 0 : undefined,
    description: data.description !== undefined ? String(data.description || '') : undefined,
    itemsPurchased: data.itemsPurchased !== undefined ? String(data.itemsPurchased || '') : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, EVENT_SPENDING_COLLECTION, id), clean)
}

export async function deleteEventSpendingItem(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, EVENT_SPENDING_COLLECTION, id))
}

// Pastor department updates (Pastor page → Updates subpage: date, notes, pastorRating 1–10, changesSuggested)
const PASTOR_UPDATES_COLLECTION = 'pastor_department_updates'

export async function getDepartmentPastorUpdates(departmentSlug) {
  if (!db || !departmentSlug) return []
  const q = query(
    collection(db, PASTOR_UPDATES_COLLECTION),
    where('department', '==', departmentSlug)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, date: data.date || '', createdAt: toDate(data.createdAt) }
  })
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return list.slice(0, 100)
}

export async function addDepartmentPastorUpdate(data, addedBy, addedByRole) {
  if (!db) return null
  const ref = await addDoc(collection(db, PASTOR_UPDATES_COLLECTION), {
    department: data.department || '',
    date: data.date ? String(data.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    notes: data.notes || '',
    pastorRating: Math.min(10, Math.max(1, Number(data.pastorRating) || 5)),
    changesSuggested: data.changesSuggested || '',
    addedBy: addedBy || 'unknown',
    addedByRole: addedByRole || '',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateDepartmentPastorUpdate(id, data) {
  if (!db) return
  const payload = {
    date: data.date != null ? String(data.date).slice(0, 10) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    pastorRating: data.pastorRating != null ? Math.min(10, Math.max(1, Number(data.pastorRating))) : undefined,
    changesSuggested: data.changesSuggested != null ? String(data.changesSuggested) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, PASTOR_UPDATES_COLLECTION, id), clean)
}

export async function deleteDepartmentPastorUpdate(id) {
  if (!db) return
  await deleteDoc(doc(db, PASTOR_UPDATES_COLLECTION, id))
}

// Generic department updates (Department Planning tab → Updates section)
const DEPARTMENT_UPDATES_COLLECTION = 'department_updates'

export async function getDepartmentUpdates(department) {
  if (!db || !department) return []
  const q = query(
    collection(db, DEPARTMENT_UPDATES_COLLECTION),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      department: data.department || '',
      date: data.date || '',
      update: data.update || '',
      actionPlan: data.actionPlan || '',
      createdAt: toDate(data.createdAt),
    }
  })
  list.sort((a, b) => {
    const da = a.date || ''
    const db = b.date || ''
    if (da !== db) return db.localeCompare(da)
    const ca = a.createdAt?.getTime?.() || 0
    const cb = b.createdAt?.getTime?.() || 0
    return cb - ca
  })
  return list
}

export async function addDepartmentUpdate(data, addedBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, DEPARTMENT_UPDATES_COLLECTION), {
    department: String(data.department || ''),
    date: data.date ? String(data.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    update: data.update || '',
    actionPlan: data.actionPlan || '',
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateDepartmentUpdate(id, data) {
  if (!db) return
  const payload = {
    date: data.date !== undefined ? String(data.date).slice(0, 10) : undefined,
    update: data.update !== undefined ? String(data.update) : undefined,
    actionPlan: data.actionPlan !== undefined ? String(data.actionPlan) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, DEPARTMENT_UPDATES_COLLECTION, id), clean)
}

export async function deleteDepartmentUpdate(id) {
  if (!db) return
  await deleteDoc(doc(db, DEPARTMENT_UPDATES_COLLECTION, id))
}

// Users by department (to show Director/Coordinator on pastor page)
// Includes users whose primary department or departments array contains this department
export async function getUsersByDepartment(departmentName) {
  if (!db || !departmentName) return []
  const [snapPrimary, snapArray] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('department', '==', departmentName))),
    getDocs(query(collection(db, 'users'), where('departments', 'array-contains', departmentName))),
  ])
  const byId = new Map()
  ;[...snapPrimary.docs, ...snapArray.docs].forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }))
  return Array.from(byId.values())
}

// Department planning board notes (movable notepads on canvas)
const PLANNING_NOTES_COLLECTION = 'department_planning_notes'

export async function getDepartmentPlanningNotes(department) {
  if (!db || !department) return []
  const q = query(
    collection(db, PLANNING_NOTES_COLLECTION),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    const pos = data.position || {}
    const sz = data.size || {}
    return {
      id: d.id,
      noteId: d.id,
      department: data.department,
      content: data.content || '',
      position: { x: Number(pos.x) || 20, y: Number(pos.y) || 20 },
      size: { width: Number(sz.width) || 200, height: Number(sz.height) || 180 },
      rotation: Number(data.rotation) || 0,
      color: data.color || 'yellow',
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    }
  })
}

export async function addDepartmentPlanningNote(department, data) {
  if (!db) return null
  const now = Timestamp.now()
  const ref = await addDoc(collection(db, PLANNING_NOTES_COLLECTION), {
    department: String(department),
    content: data.content || '',
    position: { x: Number(data.position?.x) || 20, y: Number(data.position?.y) || 20 },
    size: { width: Number(data.size?.width) || 200, height: Number(data.size?.height) || 180 },
    rotation: Number(data.rotation) || 0,
    color: data.color || 'yellow',
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

export async function updateDepartmentPlanningNote(id, data) {
  if (!db) return
  const payload = {
    updatedAt: Timestamp.now(),
  }
  if (data.content !== undefined) payload.content = String(data.content)
  if (data.position !== undefined) payload.position = { x: Number(data.position.x) || 0, y: Number(data.position.y) || 0 }
  if (data.size !== undefined) payload.size = { width: Number(data.size.width) || 200, height: Number(data.size.height) || 180 }
  if (data.rotation !== undefined) payload.rotation = Number(data.rotation) || 0
  if (data.color !== undefined) payload.color = String(data.color)
  await updateDoc(doc(db, PLANNING_NOTES_COLLECTION, id), payload)
}

export async function deleteDepartmentPlanningNote(id) {
  if (!db) return
  await deleteDoc(doc(db, PLANNING_NOTES_COLLECTION, id))
}

// Cell department – cell groups and members (cell_groups + cell_groups/{cellId}/members)
const CELL_GROUPS_COLLECTION = 'cell_groups'

export async function getCellGroup(cellId) {
  if (!db || !cellId) return null
  const ref = doc(db, CELL_GROUPS_COLLECTION, cellId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: snap.id,
    cellId: data.cellId != null && data.cellId !== '' ? String(data.cellId) : snap.id,
    cellName: data.cellName || '',
    leader: data.leader || '',
    leaderPersonId: data.leaderPersonId || '',
    meetingDay: data.meetingDay || '',
    launchDate: data.launchDate || '',
    memberCount: Number(data.memberCount) || 0,
    department: data.department || '',
    status: data.status === 'inactive' ? 'inactive' : 'active',
  }
}

export async function getCellGroups(department) {
  if (!db || !department) return []
  const col = collection(db, CELL_GROUPS_COLLECTION)
  const variants = department === 'Cell' ? ['Cell', 'cell', 'CELL'] : [department]
  const merged = new Map()
  for (const dep of variants) {
    const q = query(col, where('department', '==', dep))
    const snap = await getDocs(q)
    for (const d of snap.docs) merged.set(d.id, d)
  }
  return Array.from(merged.values()).map((d) => {
    const data = d.data()
    return {
      id: d.id,
      cellId: data.cellId != null && data.cellId !== '' ? String(data.cellId) : d.id,
      cellName: data.cellName || '',
      leader: data.leader || '',
      leaderPersonId: data.leaderPersonId || '',
      meetingDay: data.meetingDay || '',
      launchDate: data.launchDate || '',
      memberCount: Number(data.memberCount) || 0,
      department: data.department || '',
      status: data.status === 'inactive' ? 'inactive' : 'active',
    }
  })
}

export async function addCellGroup(data) {
  if (!db) return null
  const ref = doc(collection(db, CELL_GROUPS_COLLECTION))
  const cellIdField = data.cellId != null && String(data.cellId).trim() !== '' ? String(data.cellId).trim() : ref.id
  await setDoc(ref, {
    cellName: data.cellName || '',
    leader: data.leader || '',
    leaderPersonId: data.leaderPersonId || '',
    meetingDay: data.meetingDay || '',
    launchDate: data.launchDate ? String(data.launchDate).slice(0, 10) : '',
    memberCount: 0,
    department: data.department || 'Cell',
    status: data.status === 'inactive' ? 'inactive' : 'active',
    cellId: cellIdField,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateCellGroup(id, data) {
  if (!db) return
  const payload = {}
  if (data.cellName !== undefined) payload.cellName = String(data.cellName)
  if (data.leader !== undefined) payload.leader = String(data.leader)
  if (data.leaderPersonId !== undefined) payload.leaderPersonId = String(data.leaderPersonId || '')
  if (data.meetingDay !== undefined) payload.meetingDay = String(data.meetingDay)
  if (data.launchDate !== undefined) payload.launchDate = data.launchDate ? String(data.launchDate).slice(0, 10) : ''
  if (data.memberCount !== undefined) payload.memberCount = Number(data.memberCount) || 0
  if (data.status !== undefined) payload.status = data.status === 'inactive' ? 'inactive' : 'active'
  if (data.cellId !== undefined) payload.cellId = String(data.cellId || '').trim() || id
  if (Object.keys(payload).length) await updateDoc(doc(db, CELL_GROUPS_COLLECTION, id), payload)
}

function cellGroupMembersRef(cellId) {
  return collection(db, CELL_GROUPS_COLLECTION, cellId, 'members')
}

export async function getCellGroupMembers(cellId) {
  if (!db || !cellId) return []
  const snap = await getDocs(cellGroupMembersRef(cellId))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name || '',
      displayName: data.displayName || '',
      birthday: data.birthday || '',
      anniversary: data.anniversary || '',
      phone: data.phone || '',
      email: data.email || '',
      role: data.role || '',
      locality: data.locality || '',
      since: data.since || '',
      leftDate: data.leftDate || '',
      status: data.status === 'inactive' ? 'inactive' : 'active',
      memberCategory: data.memberCategory || '',
      attendanceCountAtExit: Number.isFinite(data.attendanceCountAtExit) ? data.attendanceCountAtExit : null,
      visitorId: data.visitorId || '',
      createdAt: toDate(data.createdAt),
    }
  })
}

export async function getAllCellGroupMembers() {
  if (!db) return []
  const snap = await getDocs(collectionGroup(db, 'members'))
  return snap.docs.map((d) => ({
    id: d.id,
    cellId: d.ref.parent.parent.id,
    name: d.data().name || '',
    displayName: d.data().displayName || '',
    phone: d.data().phone || '',
    visitorId: d.data().visitorId || '',
    createdAt: toDate(d.data().createdAt),
    createdSource: d.data().createdSource || '',
    since: d.data().since || '',
    leftDate: d.data().leftDate || '',
    status: d.data().status === 'inactive' ? 'inactive' : 'active',
    memberCategory: d.data().memberCategory || '',
    attendanceCountAtExit: Number.isFinite(d.data().attendanceCountAtExit) ? d.data().attendanceCountAtExit : null,
  }))
}

// Normalise phone to 10 digits — same rule used across the app's other member-matching
// helpers (ShepherdView.jsx, CellDirectorCockpit.jsx) for identifying the same person.
function memberPhoneKey(raw) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1)
  return digits.length >= 10 ? digits : ''
}

export async function addCellGroupMember(cellId, data) {
  if (!db || !cellId) return { id: null, created: false }
  // Moving an existing roster row between cells (`transferOfExisting`) isn't a new
  // person, so legacy rows without a visitorId may still be transferred.
  if (!data.transferOfExisting) requireLinkedPerson(data.visitorId)

  // Duplicate guard — every UI path that adds a member (Assign from a referral,
  // approving an "add" pending change, the Director's own Add Member form, the
  // To-Do List's quick-add) funnels through this one function, so the check lives
  // here instead of being re-implemented (inconsistently) at each call site. Scoped
  // to *this* cell only — matches an existing active member by visitorId, then
  // phone, then exact name — and is idempotent (returns the existing member's id
  // rather than erroring), so a double-click or two independent flows racing to add
  // the same person can't create a second roster entry for them.
  const visitorId = data.visitorId || ''
  const phoneKey = memberPhoneKey(data.phone)
  const nameKey = String(data.name || '').trim().toLowerCase()
  let existingMembers = null
  if ((data.status !== 'inactive') && (visitorId || phoneKey || nameKey)) {
    existingMembers = await getCellGroupMembers(cellId)
    const dupe = existingMembers.find((m) => {
      if (m.status === 'inactive') return false
      if (visitorId && m.visitorId === visitorId) return true
      if (phoneKey && memberPhoneKey(m.phone) === phoneKey) return true
      if (nameKey && String(m.name || '').trim().toLowerCase() === nameKey) return true
      return false
    })
    if (dupe) return { id: dupe.id, created: false }
  }

  const ref = await addDoc(cellGroupMembersRef(cellId), {
    name:        data.name        || '',
    phone:       data.phone       || '',
    email:       data.email       || '',
    birthday:    data.birthday    ? String(data.birthday).slice(0, 10)    : '',
    anniversary: data.anniversary ? String(data.anniversary).slice(0, 10) : '',
    since:       data.since       ? String(data.since).slice(0, 10)       : '',
    locality:    data.locality    || '',
    address:     data.address     || '',
    occupation:  data.occupation  || '',
    role:        data.role        || '',
    notes:       data.notes       || '',
    visitorId:   data.visitorId   || '',
    status: data.status === 'inactive' ? 'inactive' : 'active',
    createdSource: data.createdSource || 'cell_leader',
    createdAt: Timestamp.now(),
  })
  const memberCount = existingMembers ? existingMembers.length + 1 : (await getCellGroupMembers(cellId)).length
  await updateDoc(doc(db, CELL_GROUPS_COLLECTION, cellId), { memberCount })
  return { id: ref.id, created: true }
}

export async function updateCellGroupMember(cellId, memberId, data) {
  if (!db || !cellId || !memberId) return
  const payload = {
    name:        data.name        !== undefined ? String(data.name)                                    : undefined,
    phone:       data.phone       !== undefined ? String(data.phone)                                   : undefined,
    email:       data.email       !== undefined ? String(data.email)                                   : undefined,
    birthday:    data.birthday    !== undefined ? String(data.birthday).slice(0, 10)                   : undefined,
    anniversary: data.anniversary !== undefined ? String(data.anniversary).slice(0, 10)                : undefined,
    since:       data.since       !== undefined ? String(data.since).slice(0, 10)                      : undefined,
    locality:    data.locality    !== undefined ? String(data.locality)                                : undefined,
    address:     data.address     !== undefined ? String(data.address)                                 : undefined,
    occupation:  data.occupation  !== undefined ? String(data.occupation)                              : undefined,
    role:        data.role        !== undefined ? String(data.role)                                    : undefined,
    notes:       data.notes       !== undefined ? String(data.notes)                                   : undefined,
    status:      data.status      !== undefined ? (data.status === 'inactive' ? 'inactive' : 'active') : undefined,
    visitorId:   data.visitorId   !== undefined ? String(data.visitorId) : undefined,
    leftDate:    data.leftDate    !== undefined ? String(data.leftDate).slice(0, 10)
                 : data.status === 'inactive'   ? new Date().toISOString().slice(0, 10)
                 : undefined,
    // Reactivating (status -> 'active') without an explicit category clears the
    // stale Former/Inactive categorization from the previous departure.
    memberCategory:        data.memberCategory        !== undefined ? String(data.memberCategory)
                            : data.status === 'active' ? ''
                            : undefined,
    attendanceCountAtExit: data.attendanceCountAtExit  !== undefined ? Number(data.attendanceCountAtExit) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, CELL_GROUPS_COLLECTION, cellId, 'members', memberId), clean)
}

export async function deleteCellGroupMember(cellId, memberId) {
  if (!db || !cellId || !memberId) return
  await deleteDoc(doc(db, CELL_GROUPS_COLLECTION, cellId, 'members', memberId))
  const members = await getCellGroupMembers(cellId)
  await updateDoc(doc(db, CELL_GROUPS_COLLECTION, cellId), { memberCount: members.length })
}

/**
 * Total historical cell-meeting attendance for one member, scanned across
 * that cell's reports (matched by memberId, falling back to trimmed/lowercased
 * name for older attendee docs that predate memberId linking).
 * Capped to the same last-100-reports window as getCellReportsByCell.
 */
export async function getCellMemberAttendanceCount(cellId, memberId, memberName) {
  if (!db || !cellId) return 0
  const reports = await getCellReportsByCell(cellId)
  if (!reports.length) return 0
  const targetName = String(memberName || '').trim().toLowerCase()
  const attendeeLists = await Promise.all(reports.map((r) => getCellReportAttendees(r.id)))
  let count = 0
  for (const attendees of attendeeLists) {
    const attended = attendees.some((a) =>
      (memberId && a.memberId === memberId) ||
      (targetName && String(a.name || '').trim().toLowerCase() === targetName)
    )
    if (attended) count++
  }
  return count
}

/**
 * Marks a cell member inactive, first tallying their attendance history to
 * categorize them as a Former Member (>= FORMER_MEMBER_ATTENDANCE_THRESHOLD
 * meetings) vs an Inactive/Not Attending Member.
 */
export async function deactivateCellGroupMember(cellId, memberId, memberName) {
  if (!db || !cellId || !memberId) return null
  const attendanceCount = await getCellMemberAttendanceCount(cellId, memberId, memberName)
  const memberCategory = categorizeMemberByAttendance(attendanceCount)
  await updateCellGroupMember(cellId, memberId, { status: 'inactive', memberCategory, attendanceCountAtExit: attendanceCount })
  return { memberCategory, attendanceCount }
}

// Default program list per cell (cell_groups/{cellId}/program_items)
function cellProgramItemsRef(cellId) {
  return collection(db, CELL_GROUPS_COLLECTION, cellId, 'program_items')
}

export async function getCellProgramItems(cellId) {
  if (!db || !cellId) return []
  const q = query(cellProgramItemsRef(cellId), orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, programName: data.programName || '', order: Number(data.order) || 0 }
  })
}

export async function addCellProgramItem(cellId, data) {
  if (!db || !cellId) return null
  const ref = await addDoc(cellProgramItemsRef(cellId), {
    programName: String(data.programName || '').trim(),
    order: Number(data.order) ?? 0,
  })
  return ref.id
}

export async function updateCellProgramItem(cellId, itemId, data) {
  if (!db || !cellId || !itemId) return
  const payload = {}
  if (data.programName !== undefined) payload.programName = String(data.programName).trim()
  if (data.order !== undefined) payload.order = Number(data.order) ?? 0
  if (Object.keys(payload).length) await updateDoc(doc(db, CELL_GROUPS_COLLECTION, cellId, 'program_items', itemId), payload)
}

export async function deleteCellProgramItem(cellId, itemId) {
  if (!db || !cellId || !itemId) return
  await deleteDoc(doc(db, CELL_GROUPS_COLLECTION, cellId, 'program_items', itemId))
}

// Program start logging (cell_program_log)
const CELL_PROGRAM_LOG_COLLECTION = 'cell_program_log'

export async function addProgramLog(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, CELL_PROGRAM_LOG_COLLECTION), {
    cellName: data.cellName || '',
    programName: data.programName || '',
    startTime: data.startTime ? Timestamp.fromDate(data.startTime instanceof Date ? data.startTime : new Date(data.startTime)) : Timestamp.now(),
    reportDate: String(data.reportDate || '').slice(0, 10),
  })
  return ref.id
}

export async function getProgramLogsByCellAndDate(cellName, reportDate) {
  if (!db || !cellName || !reportDate) return []
  const dateStr = String(reportDate).slice(0, 10)
  const q = query(
    collection(db, CELL_PROGRAM_LOG_COLLECTION),
    where('cellName', '==', cellName),
    where('reportDate', '==', dateStr),
    orderBy('startTime', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      cellName: data.cellName || '',
      programName: data.programName || '',
      startTime: toDate(data.startTime),
      reportDate: data.reportDate || '',
    }
  })
}

export async function getLatestProgramLogs(limitCount = 50) {
  if (!db) return []
  const q = query(
    collection(db, CELL_PROGRAM_LOG_COLLECTION),
    orderBy('startTime', 'desc'),
    limit(limitCount)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      cellName: data.cellName || '',
      programName: data.programName || '',
      startTime: toDate(data.startTime),
      reportDate: data.reportDate || '',
    }
  })
}

export async function updateProgramLog(id, data) {
  if (!db || !id) return
  const ref = doc(db, CELL_PROGRAM_LOG_COLLECTION, id)
  const payload = {}
  if (data.startTime != null) {
    payload.startTime = Timestamp.fromDate(data.startTime instanceof Date ? data.startTime : new Date(data.startTime))
  }
  if (data.programName != null) payload.programName = data.programName
  await updateDoc(ref, payload)
}

export async function deleteProgramLog(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, CELL_PROGRAM_LOG_COLLECTION, id))
}

// Cell member pending changes (approval workflow for Cell Leader actions)
const CELL_MEMBER_PENDING_CHANGES_COLLECTION = 'cell_member_pending_changes'

export async function addCellMemberPendingChange(data) {
  if (!db) return null
  const payload = {
    changeType: data.changeType || '',
    cellId: data.cellId || '',
    cellName: data.cellName || '',
    memberId: data.memberId || '',
    memberData: data.memberData || null,
    requestedBy: data.requestedBy || '',
    requestedAt: Timestamp.now(),
    status: 'pending',
  }
  if (data.changeSummary != null) payload.changeSummary = data.changeSummary
  if (data.reason != null) payload.reason = String(data.reason)
  if (data.toCellId != null) payload.toCellId = data.toCellId
  if (data.toCellName != null) payload.toCellName = data.toCellName
  const ref = await addDoc(collection(db, CELL_MEMBER_PENDING_CHANGES_COLLECTION), payload)
  return ref.id
}

export async function getCellMemberPendingChanges() {
  if (!db) return []
  const q = query(
    collection(db, CELL_MEMBER_PENDING_CHANGES_COLLECTION),
    where('status', '==', 'pending'),
    orderBy('requestedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      changeType: data.changeType || '',
      changeSummary: data.changeSummary || '',
      reason: data.reason || '',
      cellId: data.cellId || '',
      cellName: data.cellName || '',
      toCellId: data.toCellId || '',
      toCellName: data.toCellName || '',
      memberId: data.memberId || '',
      memberData: data.memberData || null,
      requestedBy: data.requestedBy || '',
      requestedAt: toDate(data.requestedAt),
      status: data.status || 'pending',
    }
  })
}

export async function deleteCellMemberPendingChange(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, CELL_MEMBER_PENDING_CHANGES_COLLECTION, id))
}

// Real-time listener for the Cell Director's Pending Member Changes widget — so a
// request submitted by a leader (or resolved by another director) shows up/clears
// live instead of only on next mount of the Cell Summary tab.
export function subscribeCellMemberPendingChanges(onChange) {
  if (!db) return () => {}
  const q = query(
    collection(db, CELL_MEMBER_PENDING_CHANGES_COLLECTION),
    where('status', '==', 'pending'),
    orderBy('requestedAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        changeType: data.changeType || '',
        changeSummary: data.changeSummary || '',
        reason: data.reason || '',
        cellId: data.cellId || '',
        cellName: data.cellName || '',
        toCellId: data.toCellId || '',
        toCellName: data.toCellName || '',
        memberId: data.memberId || '',
        memberData: data.memberData || null,
        requestedBy: data.requestedBy || '',
        requestedAt: toDate(data.requestedAt),
        status: data.status || 'pending',
      }
    }))
  }, () => {})
}

// Back to the Bible (Cell Department planning – weekly teaching)
const CELL_BACK_TO_BIBLE_COLLECTION = 'cell_back_to_bible'

export async function addBackToBible(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, CELL_BACK_TO_BIBLE_COLLECTION), {
    fromDate: String(data.fromDate || '').slice(0, 10),
    toDate: String(data.toDate || '').slice(0, 10),
    title: data.title || '',
    content: data.content || '',
    createdBy: data.createdBy || '',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function getBackToBibleList() {
  if (!db) return []
  const q = query(
    collection(db, CELL_BACK_TO_BIBLE_COLLECTION),
    orderBy('fromDate', 'desc'),
    limit(50)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      fromDate: data.fromDate || '',
      toDate: data.toDate || '',
      title: data.title || '',
      content: data.content || '',
      createdBy: data.createdBy || '',
      createdAt: toDate(data.createdAt),
    }
  })
}

export async function getActiveBackToBibleForDate(dateStr) {
  if (!db || !dateStr) return null
  const d = String(dateStr).slice(0, 10)
  const list = await getBackToBibleList()
  return list.find((item) => item.fromDate <= d && item.toDate >= d) || null
}

// Cell reports (one per cell per date; attendees in subcollection)
const CELL_REPORTS_COLLECTION = 'cell_reports'
// Weekly archive documents (grouped by weekStartISO)
const CELL_REPORT_HISTORY_COLLECTION = 'cell_report_history'

function cellReportAttendeesRef(reportId) {
  return collection(db, CELL_REPORTS_COLLECTION, reportId, 'attendees')
}

export async function getCellReportByCellAndDate(cellId, reportDate, altCellId) {
  if (!db || !cellId || !reportDate) return null
  const dateStr = String(reportDate).slice(0, 10)
  function buildShape(d) {
    const data = d.data()
    return {
      id: d.id,
      cellId: data.cellId || '',
      cellName: data.cellName || '',
      meetingDay: data.meetingDay || '',
      membersAttended: Number(data.membersAttended) || 0,
      visitors: Number(data.visitors) || 0,
      children: Number(data.children) || 0,
      visitorsList: Array.isArray(data.visitorsList) ? data.visitorsList : [],
      childrenList: Array.isArray(data.childrenList) ? data.childrenList : [],
      reportDate: data.reportDate || '',
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      attendanceFinalizedAt: data.attendanceFinalizedAt ? toDate(data.attendanceFinalizedAt) : null,
      meetingFinalizedAt: data.meetingFinalizedAt ? toDate(data.meetingFinalizedAt) : null,
      createdBy: data.createdBy || '',
      createdAt: toDate(data.createdAt),
    }
  }
  const snap = await getDocs(query(
    collection(db, CELL_REPORTS_COLLECTION),
    where('cellId', '==', cellId),
    where('reportDate', '==', dateStr)
  ))
  if (!snap.empty) return buildShape(snap.docs[0])
  // Fallback: legacy reports may store a logical cellId (e.g. "bethany") instead of the Firestore doc ID.
  if (altCellId && altCellId !== cellId) {
    const snap2 = await getDocs(query(
      collection(db, CELL_REPORTS_COLLECTION),
      where('cellId', '==', altCellId),
      where('reportDate', '==', dateStr)
    ))
    if (!snap2.empty) return buildShape(snap2.docs[0])
  }
  return null
}

export async function getCellReportsByCell(cellId) {
  if (!db || !cellId) return []
  const q = query(
    collection(db, CELL_REPORTS_COLLECTION),
    where('cellId', '==', cellId),
    orderBy('reportDate', 'desc'),
    limit(100)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      cellId: data.cellId || '',
      cellName: data.cellName || '',
      meetingDay: data.meetingDay || '',
      membersAttended: Number(data.membersAttended) || 0,
      visitors: Number(data.visitors) || 0,
      children: Number(data.children) || 0,
      visitorsList: Array.isArray(data.visitorsList) ? data.visitorsList : [],
      childrenList: Array.isArray(data.childrenList) ? data.childrenList : [],
      reportDate: data.reportDate || '',
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      attendanceFinalizedAt: data.attendanceFinalizedAt ? toDate(data.attendanceFinalizedAt) : null,
      meetingFinalizedAt: data.meetingFinalizedAt ? toDate(data.meetingFinalizedAt) : null,
      createdBy: data.createdBy || '',
      createdAt: toDate(data.createdAt),
    }
  })
}

export async function getLatestCellReports(limitCount = 30) {
  if (!db) return []
  const q = query(
    collection(db, CELL_REPORTS_COLLECTION),
    orderBy('reportDate', 'desc'),
    limit(limitCount)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      cellId: data.cellId || '',
      cellName: data.cellName || '',
      meetingDay: data.meetingDay || '',
      membersAttended: Number(data.membersAttended) || 0,
      visitors: Number(data.visitors) || 0,
      children: Number(data.children) || 0,
      visitorsList: Array.isArray(data.visitorsList) ? data.visitorsList : [],
      childrenList: Array.isArray(data.childrenList) ? data.childrenList : [],
      reportDate: data.reportDate || '',
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      attendanceFinalizedAt: data.attendanceFinalizedAt ? toDate(data.attendanceFinalizedAt) : null,
      meetingFinalizedAt: data.meetingFinalizedAt ? toDate(data.meetingFinalizedAt) : null,
      createdBy: data.createdBy || '',
      createdAt: toDate(data.createdAt),
    }
  })
}

/**
 * Read-only weekly archive history.
 * Each doc is grouped by weekStartISO and contains program summary + totals.
 */
export async function getCellReportHistory({ cellId = null, limitCount = 200 } = {}) {
  if (!db) return []

  const constraints = []
  if (cellId) constraints.push(where('cellId', '==', String(cellId)))
  constraints.push(orderBy('weekStartISO', 'desc'))
  constraints.push(limit(limitCount))

  const q = query(collection(db, CELL_REPORT_HISTORY_COLLECTION), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createCellReport(data, createdBy) {
  if (!db) return null
  const dateStr = String(data.reportDate || '').slice(0, 10)
  const ref = await addDoc(collection(db, CELL_REPORTS_COLLECTION), {
    cellId: data.cellId || '',
    cellName: data.cellName || '',
    meetingDay: data.meetingDay || '',
    membersAttended: Number(data.membersAttended) || 0,
    visitors: Number(data.visitors) || 0,
    children: Number(data.children) || 0,
    visitorsList: Array.isArray(data.visitorsList) ? data.visitorsList : [],
    childrenList: Array.isArray(data.childrenList) ? data.childrenList : [],
    reportDate: dateStr,
    createdBy: createdBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

/**
 * Patches counts on the weekly `cell_report_history` archive doc, if one already
 * exists for that cell/week — keeps Cell Reports history from going stale when a
 * report is edited (e.g. via the Live Entry page) after the Sunday-night archive job.
 */
async function syncCellReportHistoryCounts(cellId, meetingDateISO, { membersAttended, visitors, children, startTime, endTime }) {
  if (!db || !cellId || !meetingDateISO) return
  try {
    const weekStart = toMondayISO(meetingDateISO)
    const historyRef = doc(db, CELL_REPORT_HISTORY_COLLECTION, `${weekStart}_${cellId}`)
    const historySnap = await getDoc(historyRef)
    if (historySnap.exists()) {
      const patch = {
        membersAttended,
        visitors,
        children,
        totalAttendance: membersAttended + visitors + children,
      }
      if (startTime !== undefined) patch.startTime = startTime
      if (endTime !== undefined) patch.endTime = endTime
      await updateDoc(historyRef, patch)
    }
  } catch (err) {
    console.warn('syncCellReportHistoryCounts: could not patch cell_report_history', err)
  }
}

export async function updateCellReport(reportId, data) {
  if (!db || !reportId) return
  const payload = {
    membersAttended: data.membersAttended !== undefined ? Number(data.membersAttended) : undefined,
    visitors: data.visitors !== undefined ? Number(data.visitors) : undefined,
    children: data.children !== undefined ? Number(data.children) : undefined,
    visitorsList: data.visitorsList !== undefined ? (Array.isArray(data.visitorsList) ? data.visitorsList : []) : undefined,
    childrenList: data.childrenList !== undefined ? (Array.isArray(data.childrenList) ? data.childrenList : []) : undefined,
    startTime: data.startTime !== undefined ? String(data.startTime || '') : undefined,
    endTime: data.endTime !== undefined ? String(data.endTime || '') : undefined,
    attendanceFinalizedAt: data.attendanceFinalized === true ? serverTimestamp() : undefined,
    meetingFinalizedAt: data.meetingFinalized === true ? serverTimestamp() : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId), clean)

  const countsChanged = clean.membersAttended !== undefined || clean.visitors !== undefined || clean.children !== undefined
  const timingChanged = clean.startTime !== undefined || clean.endTime !== undefined
  if (countsChanged || timingChanged) {
    const reportSnap = await getDoc(doc(db, CELL_REPORTS_COLLECTION, reportId))
    const reportData = reportSnap.exists() ? reportSnap.data() : null
    if (reportData?.cellId && reportData?.reportDate) {
      await syncCellReportHistoryCounts(reportData.cellId, reportData.reportDate, {
        membersAttended: clean.membersAttended ?? (Number(reportData.membersAttended) || 0),
        visitors: clean.visitors ?? (Number(reportData.visitors) || 0),
        children: clean.children ?? (Number(reportData.children) || 0),
        ...(clean.startTime !== undefined ? { startTime: clean.startTime } : {}),
        ...(clean.endTime !== undefined ? { endTime: clean.endTime } : {}),
      })
    }
  }
}

export async function getCellReportAttendees(reportId) {
  if (!db || !reportId) return []
  const snap = await getDocs(cellReportAttendeesRef(reportId))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      memberId: data.memberId || null,
      name: data.name || '',
      birthday: data.birthday || '',
      anniversary: data.anniversary || '',
      phone: data.phone || '',
      locality: data.locality || '',
      isVisitor: !!data.isVisitor,
    }
  })
}

export async function addCellReportAttendee(reportId, data, createdBy) {
  if (!db || !reportId) return null
  const ref = await addDoc(cellReportAttendeesRef(reportId), {
    memberId: data.memberId || null,
    name: String(data.name || '').trim(),
    birthday: data.birthday ? String(data.birthday).slice(0, 10) : '',
    anniversary: data.anniversary ? String(data.anniversary).slice(0, 10) : '',
    phone: data.phone || '',
    locality: data.locality || '',
  })
  // Sync membersAttended in the same write — mirrors deleteCellReportAttendee below.
  // Previously this relied on a separate useEffect in CellReport to catch up
  // afterward, which could miss (permission/render timing, navigating away
  // before it resolved), leaving the attendees subcollection correct but
  // membersAttended/totalAttendance stuck at a stale count.
  const attendees = await getCellReportAttendees(reportId)
  await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId), { membersAttended: attendees.length })
  return ref.id
}

export async function updateCellReportAttendee(reportId, attendeeId, data) {
  if (!db || !reportId || !attendeeId) return
  const payload = {
    name: data.name !== undefined ? String(data.name).trim() : undefined,
    birthday: data.birthday !== undefined ? String(data.birthday).slice(0, 10) : undefined,
    anniversary: data.anniversary !== undefined ? String(data.anniversary).slice(0, 10) : undefined,
    phone: data.phone !== undefined ? String(data.phone) : undefined,
    locality: data.locality !== undefined ? String(data.locality) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId, 'attendees', attendeeId), clean)
}

export async function deleteCellReportAttendee(reportId, attendeeId) {
  if (!db || !reportId || !attendeeId) return
  await deleteDoc(doc(db, CELL_REPORTS_COLLECTION, reportId, 'attendees', attendeeId))
  const attendees = await getCellReportAttendees(reportId)
  await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId), { membersAttended: attendees.length })
}

// Cell group attendance (latest total attendance across cell groups)
const CELL_ATTENDANCE_COLLECTION = 'cell_attendance'

export async function getLatestCellAttendance(department) {
  if (!db || !department) return null
  const q = query(
    collection(db, CELL_ATTENDANCE_COLLECTION),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), totalAttendance: Number(d.data().totalAttendance) || 0 }))
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return list[0] || null
}

export async function addCellAttendance(department, date, totalAttendance) {
  if (!db) return null
  const ref = await addDoc(collection(db, CELL_ATTENDANCE_COLLECTION), {
    department: String(department),
    date: String(date).slice(0, 10),
    totalAttendance: Number(totalAttendance) || 0,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

// Caring department – church members (caring_members)
const CARING_MEMBERS_COLLECTION = 'caring_members'

export async function getCaringMembers() {
  if (!db) return []
  const snap = await getDocs(collection(db, CARING_MEMBERS_COLLECTION))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      membershipNumber: data.membershipNumber || '',
      name: data.name || '',
      dob: data.dob || '',
      phone: data.phone || '',
      email: data.email || '',
      nativity: data.nativity || '',
      currentPlace: data.currentPlace || '',
      firstSunday: data.firstSunday || '',
      cellName: data.cellName || '',
      createdAt: toDate(data.createdAt),
    }
  })
}

export async function addCaringMember(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, CARING_MEMBERS_COLLECTION), {
    membershipNumber: data.membershipNumber || '',
    name: data.name || '',
    dob: data.dob ? String(data.dob).slice(0, 10) : '',
    phone: data.phone || '',
    email: data.email || '',
    nativity: data.nativity || '',
    currentPlace: data.currentPlace || '',
    firstSunday: data.firstSunday ? String(data.firstSunday).slice(0, 10) : '',
    cellName: data.cellName || '',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateCaringMember(id, data) {
  if (!db) return
  const payload = {
    membershipNumber: data.membershipNumber !== undefined ? String(data.membershipNumber) : undefined,
    name: data.name !== undefined ? String(data.name) : undefined,
    dob: data.dob !== undefined ? String(data.dob).slice(0, 10) : undefined,
    phone: data.phone !== undefined ? String(data.phone) : undefined,
    email: data.email !== undefined ? String(data.email) : undefined,
    nativity: data.nativity !== undefined ? String(data.nativity) : undefined,
    currentPlace: data.currentPlace !== undefined ? String(data.currentPlace) : undefined,
    firstSunday: data.firstSunday !== undefined ? String(data.firstSunday).slice(0, 10) : undefined,
    cellName: data.cellName !== undefined ? String(data.cellName) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, CARING_MEMBERS_COLLECTION, id), clean)
}

export async function deleteCaringMember(id) {
  if (!db) return
  await deleteDoc(doc(db, CARING_MEMBERS_COLLECTION, id))
}

// Delight department – visitors (delight_visitors)
const DELIGHT_VISITORS_COLLECTION = 'delight_visitors'

export async function migrateSundayServiceToEnglish() {
  if (!db) return 0
  const q = query(collection(db, DELIGHT_VISITORS_COLLECTION), where('serviceAttended', '==', 'Sunday Service'))
  const snap = await getDocs(q)
  if (snap.empty) return 0
  await Promise.all(snap.docs.map(d => updateDoc(doc(db, DELIGHT_VISITORS_COLLECTION, d.id), { serviceAttended: 'English Service' })))
  return snap.size
}

export async function getDelightVisitorById(id) {
  if (!db || !id) return null
  const snap = await getDoc(doc(db, DELIGHT_VISITORS_COLLECTION, id))
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    id: snap.id, name: d.name || '', dob: d.dob || '', phone: d.phone || '',
    email: d.email || '', nativity: d.nativity || '', currentPlace: d.currentPlace || '',
    serviceAttended: d.serviceAttended || '', attendedDate: d.attendedDate || '',
    howKnown: d.howKnown || '', source: d.source || '', year: d.year ? Number(d.year) : null,
    onlyVisit: !!d.onlyVisit, isArchived: !!d.isArchived, flaggedForReview: !!d.flaggedForReview,
  }
}

export async function getDelightVisitors() {
  if (!db) return []
  const q = query(
    collection(db, DELIGHT_VISITORS_COLLECTION),
    orderBy('createdAt', 'desc')
  )
  // Bypass the persistent local cache — a permission-denied result on this query
  // can otherwise get stuck in IndexedDB and keep rejecting on retry even after
  // the underlying Firestore rule has been fixed and the page reloaded.
  const snap = await getDocsFromServer(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name || '',
      dob: data.dob || '',
      phone: data.phone || '',
      email: data.email || '',
      nativity: data.nativity || '',
      currentPlace: data.currentPlace || '',
      serviceAttended: data.serviceAttended || '',
      attendedDate: data.attendedDate || '',
      howKnown: data.howKnown || '',
      source: data.source || '',
      year: data.year ? Number(data.year) : null,
      onlyVisit: !!data.onlyVisit,
      isArchived: !!data.isArchived,
      flaggedForReview: !!data.flaggedForReview,
      createdAt: toDate(data.createdAt),
      createdBy: data.createdBy || '',
    }
  })
}

export function subscribeDelightVisitors(onChange) {
  if (!db) return () => {}
  const q = query(collection(db, DELIGHT_VISITORS_COLLECTION), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        name: data.name || '',
        dob: data.dob || '',
        phone: data.phone || '',
        email: data.email || '',
        nativity: data.nativity || '',
        currentPlace: data.currentPlace || '',
        serviceAttended: data.serviceAttended || '',
        attendedDate: data.attendedDate || '',
        howKnown: data.howKnown || '',
        source: data.source || '',
        year: data.year ? Number(data.year) : null,
        onlyVisit: !!data.onlyVisit,
        isArchived: !!data.isArchived,
        flaggedForReview: !!data.flaggedForReview,
        createdAt: toDate(data.createdAt),
        createdBy: data.createdBy || '',
      }
    }))
  }, () => {})
}

export async function addDelightVisitor(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, DELIGHT_VISITORS_COLLECTION), {
    createdSource: data.createdSource || 'visitor_form',
    name: data.name || '',
    dob: data.dob ? String(data.dob).slice(0, 10) : '',
    phone: data.phone || '',
    email: data.email || '',
    nativity: data.nativity || '',
    currentPlace: data.currentPlace || '',
    serviceAttended: data.serviceAttended || '',
    attendedDate: data.attendedDate ? String(data.attendedDate).slice(0, 10) : '',
    howKnown: data.howKnown || '',
    source: data.source || '',
    year: data.year || new Date().getFullYear(),
    onlyVisit: !!data.onlyVisit,
    createdAt: Timestamp.now(),
    createdBy: data.createdBy || 'unknown',
  })
  return ref.id
}

export async function updateDelightVisitor(id, data) {
  if (!db || !id) return
  const payload = {
    name: data.name !== undefined ? String(data.name) : undefined,
    dob: data.dob !== undefined ? String(data.dob).slice(0, 10) : undefined,
    phone: data.phone !== undefined ? String(data.phone) : undefined,
    email: data.email !== undefined ? String(data.email) : undefined,
    nativity: data.nativity !== undefined ? String(data.nativity) : undefined,
    currentPlace: data.currentPlace !== undefined ? String(data.currentPlace) : undefined,
    serviceAttended: data.serviceAttended !== undefined ? String(data.serviceAttended) : undefined,
    attendedDate: data.attendedDate !== undefined ? String(data.attendedDate).slice(0, 10) : undefined,
    howKnown: data.howKnown !== undefined ? String(data.howKnown) : undefined,
    source: data.source !== undefined ? String(data.source) : undefined,
    onlyVisit: data.onlyVisit !== undefined ? !!data.onlyVisit : undefined,
    isArchived: data.isArchived !== undefined ? !!data.isArchived : undefined,
    flaggedForReview: data.flaggedForReview !== undefined ? !!data.flaggedForReview : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, DELIGHT_VISITORS_COLLECTION, id), clean)
}

export async function deleteDelightVisitor(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, DELIGHT_VISITORS_COLLECTION, id))
}

// Caring – PCS (caring_pcs)
const CARING_PCS_COLLECTION = 'caring_pcs'
const PCS_LOOKUP_COLLECTION = 'pcs_lookup'

function mapPCSDoc(d) {
  const data = d.data()
  return {
    id: d.id,
    visitorId: data.visitorId || '',
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    dob: data.dob || '',
    nativity: data.nativity || '',
    currentPlace: data.currentPlace || '',
    serviceAttended: data.serviceAttended || '',
    howKnown: data.howKnown || '',
    attendedDate: data.attendedDate || '',
    year: data.year ? Number(data.year) : null,
    membershipNumber: data.membershipNumber || '',
    leadershipPosition: data.leadershipPosition || '',
    addedAt: toDate(data.addedAt),
    addedBy: data.addedBy || '',
    status: data.status || 'active',
    removedAt: toDate(data.removedAt),
    removedBy: data.removedBy || '',
    inactiveCellAlertDismissed: !!data.inactiveCellAlertDismissed,
    engagementType: normalizeEngagementType(data.engagementType),
    // Verified legal name (as per government ID) — set from a submitted baptism /
    // membership application by the syncBaptismLegalName / syncMembershipLegalName functions.
    legalName: data.legalName || '',
    legalNameParts: data.legalNameParts || null,
    legalNameSource: data.legalNameSource || '',
    displayName: data.displayName || '',
    // Linked "Referred by" D Light record ("<source>:<docId>"); text stays in howKnown
    howKnownRefId: data.howKnownRefId || '',
    // Travel / vacation availability — see utils/awayStatus.js
    away: !!data.away,
    awayFrom: data.awayFrom || '',
    awayUntil: data.awayUntil || '',
    awayNote: data.awayNote || '',
    awayPeriods: Array.isArray(data.awayPeriods) ? data.awayPeriods : [],
    // Relocated / Moved Out — see utils/relocation.js
    relocated: !!data.relocated,
    relocatedLastDate: data.relocatedLastDate || '',
    relocatedDestination: data.relocatedDestination || '',
    relocatedStanding: data.relocatedStanding || '',
    relocatedOn: data.relocatedOn || '',
    // Official end of church membership for a Relocated person — see utils/relocation.js
    churchJourney: {
      partOfChurchTillDate: data.churchJourney?.partOfChurchTillDate || '',
    },
    // Pastoral follow-up log — [{ at: ISO timestamp, by, note }], oldest first
    followUps: Array.isArray(data.followUps) ? data.followUps : [],
    // Duplicate merge (utils/pcsDedupe.js, mergePCSEntries): a merged duplicate is
    // archived (status inactive) and points at the profile it was merged into.
    mergedInto: data.mergedInto || '',
    mergedVisitorIds: Array.isArray(data.mergedVisitorIds) ? data.mergedVisitorIds : [],
    updatedAt: toDate(data.updatedAt),
    // Promoted to Glory — set by a Caring Events burial record (kept in PCS, out of
    // every absence / removal warning).
    departed: !!data.departed,
    departedDate: data.departedDate || '',
    departedEventId: data.departedEventId || '',
    // status 'pending_discard' — a Discard Profile request awaits the Founder
    discardApprovalId: data.discardApprovalId || '',
    discardRequestedBy: data.discardRequestedBy || '',
    discardRequestedAt: toDate(data.discardRequestedAt),
    discardReason: data.discardReason || '',
  }
}

/** Live list of PCS entries currently marked Away — lets attendance sheets spot an
 *  Away person being marked present without a query per tap. */
export function subscribeAwayPCSEntries(onChange) {
  if (!db) { onChange([]); return () => {} }
  const q = query(collection(db, CARING_PCS_COLLECTION), where('away', '==', true))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(mapPCSDoc).filter((e) => e.status !== 'inactive'))
  }, (err) => { console.error('subscribeAwayPCSEntries:', err); onChange([]) })
}

/**
 * Auto-return: an Away person was marked present on an attendance sheet. Flips them
 * back to Active and archives the Away period with how they came back — that
 * archived period is what the PCS history shows as "Returned from Away status on
 * [date] via [Sunday Service / Cell Group] attendance". Field set is limited to the
 * keys firestore.rules lets Cell / Sunday Ministry users write on caring_pcs.
 */
export async function returnPCSEntryFromAway(entry, { via, dateStr, by }) {
  if (!db || !entry?.id) return
  const date = String(dateStr || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
  const periods = Array.isArray(entry.awayPeriods) ? [...entry.awayPeriods] : []
  periods.push({ from: entry.awayFrom || date, to: date, note: entry.awayNote || '', returnedVia: via || '' })
  await updateDoc(doc(db, CARING_PCS_COLLECTION, entry.id), {
    away: false,
    awayFrom: '',
    awayUntil: '',
    awayNote: '',
    awayPeriods: periods,
    awayUpdatedBy: by || 'unknown',
    awayUpdatedAt: Timestamp.now(),
  })
}

/** Write a PCS entry's Away/Active availability (patch from buildAwayPatch / buildReturnPatch). */
/**
 * Relocation write-through: every department-team (River Kids, Media, …) and
 * Worship-team row for this person that isn't already Former is closed out as
 * Former ("Completed") with formerDate = their last attendance date — or an earlier
 * formerDate already on the row, so a role that ended long ago keeps its real end.
 * formerReason: 'relocated' drives the PCS history line. Field set matches the
 * Caring carve-out on department_team_members in firestore.rules.
 * Returns { completed, failed }.
 */
export async function completeMinistryRolesForRelocation({ visitorId, phone, lastDate, by }) {
  if (!db || (!visitorId && !phone) || !lastDate) return { completed: 0, failed: 0 }
  const normalPhone = String(phone || '').replace(/\s+/g, '')
  const end = String(lastDate).slice(0, 10)
  const snaps = await Promise.all(['department_team_members', 'worship_team_members'].flatMap((col) => [
    visitorId ? getDocs(query(collection(db, col), where('visitorId', '==', visitorId))).catch(() => null) : null,
    normalPhone ? getDocs(query(collection(db, col), where('phone', '==', normalPhone))).catch(() => null) : null,
  ]))
  const seen = new Set()
  const targets = []
  snaps.forEach((snap) => snap?.docs.forEach((d) => {
    if (seen.has(d.ref.path)) return
    seen.add(d.ref.path)
    const data = d.data()
    if (data.isFormer === true || data.status === 'former') return
    const existing = String(data.formerDate || '').slice(0, 10)
    targets.push({ ref: d.ref, formerDate: existing && existing < end ? existing : end })
  }))
  const results = await Promise.allSettled(targets.map((t) => updateDoc(t.ref, {
    isFormer: true,
    formerDate: t.formerDate,
    formerReason: 'relocated',
    formerSetBy: by || 'unknown',
  })))
  const failed = results.filter((r) => r.status === 'rejected')
  failed.forEach((r) => console.error('completeMinistryRolesForRelocation:', r.reason))
  return { completed: results.length - failed.length, failed: failed.length }
}

export async function setPCSAwayStatus(id, patch, updatedBy = '') {
  if (!db || !id) return
  await updateDoc(doc(db, CARING_PCS_COLLECTION, id), {
    ...patch,
    awayUpdatedBy: updatedBy || 'unknown',
    awayUpdatedAt: Timestamp.now(),
  })
}

/** Append a pastoral follow-up note to a PCS entry; returns the saved item. */
export async function addPCSFollowUp(id, note, by = '') {
  if (!db || !id) return null
  const item = { at: new Date().toISOString(), by: by || 'unknown', note: String(note || '').trim() }
  await updateDoc(doc(db, CARING_PCS_COLLECTION, id), { followUps: arrayUnion(item) })
  return item
}

export async function getPCSEntries() {
  if (!db) return []
  const q = query(collection(db, CARING_PCS_COLLECTION), orderBy('addedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(mapPCSDoc).filter(e => e.status !== 'inactive')
}

// Lightweight lookup readable by any signed-in user (no sensitive PCS data)
export async function getPCSLookup() {
  if (!db) return []
  const snap = await getDocs(collection(db, PCS_LOOKUP_COLLECTION))
  return snap.docs.map(d => {
    const data = d.data()
    return { id: d.id, visitorId: data.visitorId || '', name: data.name || '', phone: data.phone || '' }
  })
}

// Bulk-sync all active PCS entries into pcs_lookup (run by Caring Director on tab load)
export async function syncAllPCSToLookup(pcsEntries) {
  if (!db) return
  const existing = await getDocs(collection(db, PCS_LOOKUP_COLLECTION))
  const existingIds = new Set(existing.docs.map(d => d.id))
  const activeIds = new Set(pcsEntries.map(e => e.id))
  const batch = writeBatch(db)
  // Add/update entries that are missing from lookup
  pcsEntries.forEach(e => {
    if (!existingIds.has(e.id)) {
      batch.set(doc(db, PCS_LOOKUP_COLLECTION, e.id), {
        visitorId: e.visitorId || '', name: e.name || '', phone: e.phone || '',
      })
    }
  })
  // Remove stale entries no longer active
  existing.docs.forEach(d => {
    if (!activeIds.has(d.id)) batch.delete(d.ref)
  })
  await batch.commit()
}

export async function getInactivePCSEntries() {
  if (!db) return []
  const q = query(collection(db, CARING_PCS_COLLECTION), orderBy('addedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(mapPCSDoc).filter(e => e.status === 'inactive' && !e.mergedInto)
}

// Silence the "Removed from Cell — still in PCS" alert for one entry without removing
// them from PCS — used by the "Dismiss / Keep in PCS" action on that notification.
export async function dismissInactiveCellAlert(id) {
  if (!db || !id) return
  await updateDoc(doc(db, CARING_PCS_COLLECTION, id), { inactiveCellAlertDismissed: true })
}

export async function deactivatePCSEntry(id, removedBy = '') {
  if (!db || !id) return
  await updateDoc(doc(db, CARING_PCS_COLLECTION, id), {
    status: 'inactive',
    removedAt: Timestamp.now(),
    removedBy,
  })
  deleteDoc(doc(db, PCS_LOOKUP_COLLECTION, id)).catch(() => {})
}

/** Active PCS entry for the same person: same visitorId, or same name + phone. */
async function findActivePCSEntryFor(data) {
  const live = (snap) => snap.docs.map(mapPCSDoc).filter(e => e.status !== 'inactive')
  const byVisitor = live(await getDocs(query(collection(db, CARING_PCS_COLLECTION), where('visitorId', '==', data.visitorId))))
  if (byVisitor.length) return byVisitor[0]
  const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const ph = String(data.phone || '').replace(/\D/g, '').slice(-10)
  const nm = normName(data.name)
  if (ph.length !== 10 || !nm) return null
  const byPhone = live(await getDocs(query(collection(db, CARING_PCS_COLLECTION), where('phone', '==', data.phone))))
  return byPhone.find(e => normName(e.name) === nm) || null
}

export async function addPCSEntry(data) {
  if (!db) return null
  // A PCS entry must be linked to a D-Light visitor record — no freeform/unlinked adds.
  if (!data.visitorId) throw new Error('A linked visitor record is required to add someone to PCS.')

  // Duplicate guard (two windows / double clicks adding the same person):
  // 1) an active entry already exists for this visitor, or for the same name + phone
  //    → reuse it (fill any blanks) instead of creating another;
  // 2) otherwise create with a deterministic id ("v_<visitorId>") inside a
  //    transaction, so two simultaneous adds resolve to the same document.
  const existing = await findActivePCSEntryFor(data)
  if (existing) {
    const fill = {}
    ;['phone', 'email', 'dob', 'nativity', 'currentPlace', 'serviceAttended', 'howKnown', 'attendedDate'].forEach(k => {
      if (!existing[k] && data[k]) fill[k] = String(data[k])
    })
    if (Object.keys(fill).length) await updateDoc(doc(db, CARING_PCS_COLLECTION, existing.id), { ...fill, updatedAt: Timestamp.now() })
    return existing.id
  }
  const ref = doc(db, CARING_PCS_COLLECTION, `v_${data.visitorId}`)
  const payload = {
    visitorId: data.visitorId || '',
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    dob: data.dob || '',
    nativity: data.nativity || '',
    currentPlace: data.currentPlace || '',
    serviceAttended: data.serviceAttended || '',
    howKnown: data.howKnown || '',
    attendedDate: data.attendedDate || '',
    year: data.year ? Number(data.year) : null,
    membershipNumber: data.membershipNumber || '',
    leadershipPosition: data.leadershipPosition || '',
    addedAt: Timestamp.now(),
    addedBy: data.addedBy || 'unknown',
  }
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    // An archived/removed doc at this id is reused (re-adding the person); a live one wins.
    if (snap.exists() && snap.data().status !== 'inactive') return
    tx.set(ref, payload)
  })
  setDoc(doc(db, PCS_LOOKUP_COLLECTION, ref.id), {
    visitorId: data.visitorId || '',
    name: data.name || '',
    phone: data.phone || '',
  }).catch(() => {})
  return ref.id
}

export async function updatePCSEntry(id, data) {
  if (!db || !id) return
  const payload = {}
  if (data.visitorId !== undefined) payload.visitorId = String(data.visitorId)
  if (data.name !== undefined) payload.name = String(data.name)
  if (data.phone !== undefined) payload.phone = String(data.phone)
  if (data.email !== undefined) payload.email = String(data.email)
  if (data.dob !== undefined) payload.dob = String(data.dob).slice(0, 10)
  if (data.nativity !== undefined) payload.nativity = String(data.nativity)
  if (data.currentPlace !== undefined) payload.currentPlace = String(data.currentPlace)
  if (data.serviceAttended !== undefined) payload.serviceAttended = String(data.serviceAttended)
  if (data.howKnown !== undefined) payload.howKnown = String(data.howKnown)
  if (data.attendedDate !== undefined) payload.attendedDate = String(data.attendedDate).slice(0, 10)
  if (data.year !== undefined) payload.year = data.year ? Number(data.year) : null
  if (data.membershipNumber !== undefined) payload.membershipNumber = String(data.membershipNumber)
  if (data.leadershipPosition !== undefined) payload.leadershipPosition = String(data.leadershipPosition)
  if (data.engagementType !== undefined) payload.engagementType = normalizeEngagementType(data.engagementType)
  if (data.displayName !== undefined) payload.displayName = String(data.displayName).trim()
  if (data.howKnownRefId !== undefined) payload.howKnownRefId = String(data.howKnownRefId)
  if (Object.keys(payload).length) await updateDoc(doc(db, CARING_PCS_COLLECTION, id), { ...payload, updatedAt: Timestamp.now() })
  // pcs_lookup is a denormalized name/phone/visitorId index for fast search elsewhere —
  // without this it only catches up the next time someone runs the manual bulk sync.
  if (payload.name !== undefined || payload.phone !== undefined || payload.visitorId !== undefined) {
    const lookupUpdate = {}
    if (payload.name !== undefined) lookupUpdate.name = payload.name
    if (payload.phone !== undefined) lookupUpdate.phone = payload.phone
    if (payload.visitorId !== undefined) lookupUpdate.visitorId = payload.visitorId
    await setDoc(doc(db, PCS_LOOKUP_COLLECTION, id), lookupUpdate, { merge: true }).catch(() => {})
  }
}

export async function deletePCSEntry(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, CARING_PCS_COLLECTION, id))
}

// ── Founder approvals (My Workspace > Approvals) ─────────────────────────────
// Discarding a PCS profile is for records that are wrong (duplicate, entered by
// mistake) — unlike "Remove from PCS", which only marks someone as no longer
// attending. Caring files a request; the profile is locked as 'pending_discard'
// until the Founder approves (profile deleted) or rejects (back to active).
const APPROVALS_COLLECTION = 'approvals'

/** Caring → Founder: ask to discard a PCS profile. Returns the approval id. */
export async function requestPCSDiscard(entry, { reason = '', requestedBy = '', requestedByUid = '' } = {}) {
  if (!db || !entry?.id) return null
  const ref = doc(collection(db, APPROVALS_COLLECTION))
  const batch = writeBatch(db)
  batch.set(ref, {
    type: 'pcs_discard',
    status: 'pending',
    memberId: entry.id,
    memberName: entry.name || '',
    memberPhone: entry.phone || '',
    memberVisitorId: entry.visitorId || '',
    reason: String(reason || '').trim(),
    requestedBy: requestedBy || 'unknown',
    requestedByUid: requestedByUid || '',
    timestamp: Timestamp.now(),
  })
  batch.update(doc(db, CARING_PCS_COLLECTION, entry.id), {
    status: 'pending_discard',
    discardApprovalId: ref.id,
    discardRequestedBy: requestedBy || 'unknown',
    discardRequestedAt: Timestamp.now(),
    discardReason: String(reason || '').trim(),
  })
  await batch.commit()
  return ref.id
}

/** Founder: live list of pending approval requests, newest first. */
export function subscribePendingApprovals(onChange, onError) {
  if (!db) { onChange([]); return () => {} }
  const q = query(collection(db, APPROVALS_COLLECTION), where('status', '==', 'pending'))
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, timestamp: toDate(data.timestamp) }
    })
    rows.sort((a, b) => (b.timestamp?.getTime?.() || 0) - (a.timestamp?.getTime?.() || 0))
    onChange(rows)
  }, (err) => { console.error('subscribePendingApprovals failed:', err); onError?.(err) })
}

/** Founder approves: the PCS profile and its lookup row are deleted; the approval
 *  doc stays as the record of what was discarded, by whom and why. */
export async function approvePCSDiscard(approval, decidedBy = '') {
  if (!db || !approval?.id) return
  const batch = writeBatch(db)
  batch.update(doc(db, APPROVALS_COLLECTION, approval.id), { status: 'approved', decidedBy: decidedBy || 'unknown', decidedAt: Timestamp.now() })
  if (approval.memberId) {
    batch.delete(doc(db, CARING_PCS_COLLECTION, approval.memberId))
    batch.delete(doc(db, PCS_LOOKUP_COLLECTION, approval.memberId))
  }
  await batch.commit()
}

/** Founder rejects: the PCS profile goes back to active, request details cleared. */
export async function rejectPCSDiscard(approval, decidedBy = '') {
  if (!db || !approval?.id) return
  const batch = writeBatch(db)
  batch.update(doc(db, APPROVALS_COLLECTION, approval.id), { status: 'rejected', decidedBy: decidedBy || 'unknown', decidedAt: Timestamp.now() })
  if (approval.memberId) {
    const pcsRef = doc(db, CARING_PCS_COLLECTION, approval.memberId)
    const pcsSnap = await getDoc(pcsRef)
    if (pcsSnap.exists()) {
      batch.update(pcsRef, { status: 'active', discardApprovalId: '', discardRequestedBy: '', discardRequestedAt: null, discardReason: '' })
    }
  }
  await batch.commit()
}

// D Light – sub departments (dlight_sub_departments)
const DLIGHT_SUB_DEPARTMENTS_COLLECTION = 'dlight_sub_departments'

export async function getDlightSubDepartments() {
  if (!db) return []
  const q = query(collection(db, DLIGHT_SUB_DEPARTMENTS_COLLECTION), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name || '',
      servingArea: data.servingArea || '',
      createdAt: toDate(data.createdAt),
    }
  })
}

export async function addDlightSubDepartment({ name, servingArea }, createdBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, DLIGHT_SUB_DEPARTMENTS_COLLECTION), {
    name: String(name || '').trim(),
    servingArea: String(servingArea || '').trim(),
    createdAt: serverTimestamp(),
    createdBy: createdBy || 'unknown',
  })
  return ref.id
}

export async function updateDlightSubDepartment(id, { name, servingArea }) {
  if (!db || !id) return
  await updateDoc(doc(db, DLIGHT_SUB_DEPARTMENTS_COLLECTION, id), {
    name: String(name || '').trim(),
    servingArea: String(servingArea || '').trim(),
  })
}

export async function deleteDlightSubDepartment(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, DLIGHT_SUB_DEPARTMENTS_COLLECTION, id))
}

// Sunday Ministry – default program (sunday_program / default doc)
const SUNDAY_PROGRAM_COLLECTION = 'sunday_program'
const SUNDAY_PROGRAM_DEFAULT_DOC_ID = 'default'

export async function getSundayProgramDefault() {
  if (!db) return { items: [], serviceStartTime: '' }
  const ref = doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_PROGRAM_DEFAULT_DOC_ID)
  const snap = await getDoc(ref)
  if (!snap.exists()) return { items: [], serviceStartTime: '' }
  const data = snap.data()
  const items = Array.isArray(data.items)
    ? data.items.map((x, i) => ({
        programName: x.programName || x.name || '',
        order: typeof x.order === 'number' ? x.order : i,
        duration: typeof x.duration === 'number' && x.duration >= 0 ? x.duration : 0,
        startTime: typeof x.startTime === 'string' ? x.startTime : '',
      }))
    : []
  items.sort((a, b) => a.order - b.order)
  return {
    items,
    serviceStartTime: data.serviceStartTime || '',
    parallelPrograms: data.parallelPrograms && typeof data.parallelPrograms === 'object' ? data.parallelPrograms : {},
    updatedAt: toDate(data.updatedAt),
    updatedBy: data.updatedBy || '',
  }
}

export async function setSundayProgramDefault(items, updatedBy, serviceStartTime = '', parallelPrograms = {}) {
  if (!db) return
  const ref = doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_PROGRAM_DEFAULT_DOC_ID)
  const clean = (Array.isArray(items) ? items : [])
    .map((x, i) => ({
      programName: String(x.programName || x.name || '').trim(),
      order: typeof x.order === 'number' ? x.order : i,
      duration: typeof x.duration === 'number' && x.duration >= 0 ? x.duration : 0,
      startTime: typeof x.startTime === 'string' ? x.startTime : '',
    }))
    .filter((x) => x.programName)
  await setDoc(
    ref,
    {
      items: clean,
      serviceStartTime: String(serviceStartTime || ''),
      parallelPrograms: parallelPrograms && typeof parallelPrograms === 'object' ? parallelPrograms : {},
      updatedBy: updatedBy || 'unknown',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

// Sunday Ministry – program design (sunday_program / design_plan doc)
const SUNDAY_PROGRAM_DESIGN_DOC_ID = 'design_plan'

export async function getSundayProgramDesign() {
  if (!db) return { designs: {}, customElements: [], customPrograms: [] }
  const ref = doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_PROGRAM_DESIGN_DOC_ID)
  const snap = await getDoc(ref)
  if (!snap.exists()) return { designs: {}, customElements: [], customPrograms: [] }
  const data = snap.data()
  return {
    designs: data.designs || {},
    customElements: Array.isArray(data.customElements) ? data.customElements : [],
    customPrograms: Array.isArray(data.customPrograms) ? data.customPrograms : [],
  }
}

export async function setSundayProgramDesign({ designs, customElements, customPrograms }, updatedBy) {
  if (!db) return
  const ref = doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_PROGRAM_DESIGN_DOC_ID)
  await setDoc(
    ref,
    {
      designs: designs || {},
      customElements: Array.isArray(customElements) ? customElements : [],
      customPrograms: Array.isArray(customPrograms) ? customPrograms : [],
      updatedBy: updatedBy || 'unknown',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

// Sunday Ministry – programme notification (sent to departments)
const SUNDAY_NOTIFICATIONS_COLLECTION = 'sunday_notifications'

export async function sendProgramNotification(date, programs, sentBy) {
  if (!db) return
  const ref = doc(db, SUNDAY_NOTIFICATIONS_COLLECTION, date)
  await setDoc(ref, {
    programs: Array.isArray(programs) ? programs : [],
    sentAt: serverTimestamp(),
    sentBy: sentBy || 'unknown',
  })
}

export async function getProgramNotification(date) {
  if (!db) return null
  const ref = doc(db, SUNDAY_NOTIFICATIONS_COLLECTION, date)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    programs: Array.isArray(data.programs) ? data.programs : [],
    sentAt: toDate(data.sentAt),
    sentBy: data.sentBy || '',
  }
}

// Live counterpart to getProgramNotification — every department's Upcoming Sunday
// page (UpcomingSunday.jsx, shared by Worship/Media/D-Light/Administration) uses this
// so a programme Sunday Ministry publishes/edits after the page has already loaded
// still shows up immediately, with no manual refresh needed.
export function subscribeProgramNotification(date, onChange) {
  if (!db || !date) return () => {}
  const ref = doc(db, SUNDAY_NOTIFICATIONS_COLLECTION, date)
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) { onChange(null); return }
    const data = snap.data()
    onChange({
      programs: Array.isArray(data.programs) ? data.programs : [],
      sentAt: toDate(data.sentAt),
      sentBy: data.sentBy || '',
    })
  }, () => {})
}

// Department programme inputs (elements + custom programmes per dept per date)
const SUNDAY_DEPT_INPUTS_COLLECTION = 'sunday_dept_inputs'

export async function getDeptProgramInput(date, deptSlug) {
  if (!db) return { programElements: {}, programDurations: {}, customPrograms: [], customElements: [] }
  const ref = doc(db, SUNDAY_DEPT_INPUTS_COLLECTION, `${date}_${deptSlug}`)
  const snap = await getDoc(ref)
  if (!snap.exists()) return { programElements: {}, programDurations: {}, customPrograms: [], customElements: [] }
  const data = snap.data()
  return {
    programElements: data.programElements || {},
    programDurations: data.programDurations || {},
    customPrograms: Array.isArray(data.customPrograms) ? data.customPrograms : [],
    customElements: Array.isArray(data.customElements) ? data.customElements : [],
  }
}

export async function setDeptProgramInput(date, deptSlug, { programElements, programDurations, customPrograms, customElements }, updatedBy) {
  if (!db) return
  const ref = doc(db, SUNDAY_DEPT_INPUTS_COLLECTION, `${date}_${deptSlug}`)
  await setDoc(ref, {
    programElements: programElements || {},
    programDurations: programDurations || {},
    customPrograms: Array.isArray(customPrograms) ? customPrograms : [],
    customElements: Array.isArray(customElements) ? customElements : [],
    updatedAt: serverTimestamp(),
    updatedBy: updatedBy || 'unknown',
  })
}

// Sunday Ministry – pre-service monthly schedule (sunday_pre_service/{date} docs).
// Leader + Speaker options are drawn live from the Sunday Ministry team roster's
// Pre-Service sub-department (see PreServiceTab, SundayCrew.jsx) rather than a
// separately-managed name list.
const SUNDAY_PRE_SERVICE_COLLECTION = 'sunday_pre_service'

export async function getSundayPreServiceEntry(dateStr) {
  if (!db || !dateStr) return null
  const id = String(dateStr).slice(0, 10)
  const snap = await getDoc(doc(db, SUNDAY_PRE_SERVICE_COLLECTION, id))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    date: id,
    speakers: Array.isArray(data.speakers) ? data.speakers.map((n) => String(n).trim()).filter(Boolean) : [],
    topics: Array.isArray(data.topics) ? data.topics.map((t) => String(t).trim()).filter(Boolean) : [],
    // Sunday Ministry team roster (department_team_members) doc id for the
    // assigned Pre-Service Leader — see PreServiceTab, SundayCrew.jsx.
    leaderMemberId: data.leaderMemberId || '',
    leaderName: data.leaderName || '',
  }
}

export async function setSundayPreServiceEntry(dateStr, { speakers, topics, leaderMemberId, leaderName }, updatedBy) {
  if (!db || !dateStr) return
  const id = String(dateStr).slice(0, 10)
  await setDoc(
    doc(db, SUNDAY_PRE_SERVICE_COLLECTION, id),
    {
      date: id,
      // Up to 5 speakers per Sunday (see PreServiceTab, SundayCrew.jsx).
      speakers: (Array.isArray(speakers) ? speakers : []).map((n) => String(n).trim()).filter(Boolean).slice(0, 5),
      topics: (Array.isArray(topics) ? topics : []).map((t) => String(t).trim()).filter(Boolean),
      leaderMemberId: leaderMemberId || '',
      leaderName: leaderName || '',
      updatedBy: String(updatedBy || ''),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  )
}

// Batch-writes every Sunday's Pre-Service entry for a month in one commit — backs
// the monthly "Save Month Schedule" table (mirrors setSecCoreSundayLeaderMonth).
// Only ever writes `speakers` — the table this backs has no Leader or Topics
// column (Pre-Service Leader is a standing position assigned via Admin User
// Management, not a per-Sunday pick here; see isPreServiceLeaderInPositions).
// Deliberately omits leaderMemberId/leaderName/topics from the payload rather
// than writing them blank, so merge:true leaves any pre-existing values on
// these docs untouched instead of silently wiping them on every save.
export async function setSundayPreServiceMonth(entries, updatedBy) {
  if (!db || !entries?.length) return
  const batch = writeBatch(db)
  entries.forEach(({ date, speakers }) => {
    const id = String(date).slice(0, 10)
    batch.set(doc(db, SUNDAY_PRE_SERVICE_COLLECTION, id), {
      date: id,
      speakers: (Array.isArray(speakers) ? speakers : []).map((n) => String(n).trim()).filter(Boolean).slice(0, 5),
      updatedBy: String(updatedBy || ''),
      updatedAt: Timestamp.now(),
    }, { merge: true })
  })
  await batch.commit()
}

// Pre-Service Leader is a standing position (see isPreServiceLeaderInPositions,
// sundayMinistryAccess.js) — single-slot: assigning someone new revokes the
// previous holder's position first, so app access always reflects whoever is
// currently assigned rather than accumulating past leaders. This pointer doc
// tracks who currently holds it, so a reassignment can find and revoke them
// without scanning every user. Writing to another user's `positions[]` requires
// Founder-level access under firestore.rules (users/{userId} is self-or-Founder
// only) — callers must only invoke this as a Founder; see PreServiceTab.
const PRE_SERVICE_LEADER_DOC_ID = 'pre_service_leader'

export async function getCurrentPreServiceLeader() {
  if (!db) return null
  const snap = await getDoc(doc(db, SUNDAY_PROGRAM_COLLECTION, PRE_SERVICE_LEADER_DOC_ID))
  return snap.exists() ? snap.data() : null
}

const PRE_SERVICE_LEADER_POSITION = { department: 'Sunday Ministry', position: 'Pre-Service Leader' }

function isPreServiceLeaderPosition(p) {
  return p?.department === PRE_SERVICE_LEADER_POSITION.department && p?.position === PRE_SERVICE_LEADER_POSITION.position
}

// newLeader: { uid, name, email } or null to clear the role entirely.
export async function setPreServiceLeader(newLeader, updatedBy) {
  if (!db) return
  const current = await getCurrentPreServiceLeader()

  if (current?.uid && current.uid !== newLeader?.uid) {
    const prevRef = doc(db, 'users', current.uid)
    const prevSnap = await getDoc(prevRef)
    if (prevSnap.exists()) {
      const positions = Array.isArray(prevSnap.data().positions) ? prevSnap.data().positions : []
      await updateDoc(prevRef, { positions: positions.filter((p) => !isPreServiceLeaderPosition(p)) })
    }
  }

  if (newLeader?.uid && newLeader.uid !== current?.uid) {
    const nextRef = doc(db, 'users', newLeader.uid)
    const nextSnap = await getDoc(nextRef)
    if (nextSnap.exists()) {
      const positions = Array.isArray(nextSnap.data().positions) ? nextSnap.data().positions : []
      if (!positions.some(isPreServiceLeaderPosition)) {
        await updateDoc(nextRef, { positions: [...positions, PRE_SERVICE_LEADER_POSITION] })
      }
    }
  }

  await setDoc(doc(db, SUNDAY_PROGRAM_COLLECTION, PRE_SERVICE_LEADER_DOC_ID), {
    uid: newLeader?.uid || null,
    name: newLeader?.name || '',
    email: newLeader?.email || '',
    updatedBy: String(updatedBy || ''),
    updatedAt: Timestamp.now(),
  })
}

// Sunday Ministry – crew roster + weekly entries
const SUNDAY_CREW_ROSTER_DOC_ID = 'crew_roster'
const SUNDAY_CREW_ENTRIES_COLLECTION = 'sunday_crew_entries'

export async function getSundayCrewRoster() {
  if (!db) return []
  const snap = await getDoc(doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_CREW_ROSTER_DOC_ID))
  if (!snap.exists()) return []
  const data = snap.data()
  return Array.isArray(data.members)
    ? data.members.map((m) => ({ name: String(m.name || '').trim(), role: String(m.role || '').trim() })).filter((m) => m.name)
    : []
}

export async function setSundayCrewRoster(members, updatedBy) {
  if (!db) return
  const clean = (Array.isArray(members) ? members : [])
    .map((m) => ({ name: String(m.name || '').trim(), role: String(m.role || '').trim() }))
    .filter((m) => m.name)
  await setDoc(
    doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_CREW_ROSTER_DOC_ID),
    { members: clean, updatedBy: String(updatedBy || ''), updatedAt: Timestamp.now() },
    { merge: true }
  )
}

export async function getSundayCrewEntry(dateStr) {
  if (!db || !dateStr) return null
  const id = String(dateStr).slice(0, 10)
  const snap = await getDoc(doc(db, SUNDAY_CREW_ENTRIES_COLLECTION, id))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    date: id,
    serving: Array.isArray(data.serving) ? data.serving.map((n) => String(n).trim()).filter(Boolean) : [],
    notes: String(data.notes || ''),
  }
}

export async function setSundayCrewEntry(dateStr, { serving, notes }, updatedBy) {
  if (!db || !dateStr) return
  const id = String(dateStr).slice(0, 10)
  await setDoc(
    doc(db, SUNDAY_CREW_ENTRIES_COLLECTION, id),
    {
      date: id,
      serving: (Array.isArray(serving) ? serving : []).map((n) => String(n).trim()).filter(Boolean),
      notes: String(notes || ''),
      updatedBy: String(updatedBy || ''),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  )
}

// Sunday program timing (sunday_program_log)
const SUNDAY_PROGRAM_LOG_COLLECTION = 'sunday_program_log'

export async function addSundayProgramLog(data) {
  if (!db) return null
  const start = data.startTime instanceof Date ? data.startTime : new Date(data.startTime || Date.now())
  const ref = await addDoc(collection(db, SUNDAY_PROGRAM_LOG_COLLECTION), {
    programName: data.programName || '',
    startTime: Timestamp.fromDate(start),
    reportDate: String(data.reportDate || '').slice(0, 10),
  })
  return ref.id
}

export async function getSundayProgramLogsByDate(reportDate) {
  if (!db || !reportDate) return []
  const dateStr = String(reportDate).slice(0, 10)
  const q = query(
    collection(db, SUNDAY_PROGRAM_LOG_COLLECTION),
    where('reportDate', '==', dateStr),
    orderBy('startTime', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      programName: data.programName || '',
      startTime: toDate(data.startTime),
      reportDate: data.reportDate || '',
    }
  })
}

export async function updateSundayProgramLog(id, startTime) {
  if (!db || !id) return
  const start = startTime instanceof Date ? startTime : new Date(startTime)
  await updateDoc(doc(db, SUNDAY_PROGRAM_LOG_COLLECTION, id), {
    startTime: Timestamp.fromDate(start),
  })
}

// Pastor department remarks (Senior Pastor hub – one doc per department)
const PASTOR_REMARKS_COLLECTION = 'pastor_department_remarks'

export async function getPastorRemarks(department) {
  if (!db || !department) return null
  const ref = doc(db, PASTOR_REMARKS_COLLECTION, String(department))
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data()
  return { id: snap.id, ...data, updatedAt: toDate(data.updatedAt) }
}

export async function setPastorRemarks(department, payload, updatedBy) {
  if (!db || !department) return null
  const { notes = '' } = payload
  const ref = doc(db, PASTOR_REMARKS_COLLECTION, String(department))
  await setDoc(ref, {
    department: String(department),
    notes: String(notes),
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
  return ref.id
}

// Sunday Ministry – Sunday Report (one doc per date, keyed by date yyyy-MM-dd)
const SUNDAY_REPORTS_COLLECTION = 'sunday_reports'

const DEFAULT_SUNDAY_REPORT = {
  /** True once the report has been saved through the "Save" action — the page then shows
   *  a read-only summary ("filed") instead of the edit form, until "Edit" is tapped. */
  filed: false,
  sundayMinistryTeam: [],
  pastoralAttendees: [],
  /** Per–cell-group attendance: { [cellGroupDocId]: string[] (member names) } */
  sundayCellAttendance: {},
  olive: [],
  jordan: [],
  bethany: [],
  edenStream: [],
  bethel: [],
  newCell1: [],
  children: [],
  newComers: [],
  others: [],
  nonCell: [],
  secondWeekAttendeesNames: [],
  thirdWeekAttendeesNames: [],
  fourthWeekAttendeesNames: [],
  programList: [],
  preservice: { lead1: '', lead2: '' },
  summary: {
    cellAttendance: '',
    othersCount: '',
    nonCellCount: '',
    newcomers: '',
    secondWeekAttendees: '',
    sundaySchool: '',
    totalAdults: '',
    totalAttendance: '',
  },
}

function normalizeReport(data) {
  const sca = data.sundayCellAttendance
  const sundayCellAttendance =
    sca && typeof sca === 'object' && !Array.isArray(sca)
      ? Object.fromEntries(
          Object.entries(sca).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []])
        )
      : {}
  // Per-cell names marked "Away" (travel/vacation) for this Sunday — neither present
  // nor absent; see utils/awayStatus.js.
  const away = data.sundayCellAway
  const sundayCellAway =
    away && typeof away === 'object' && !Array.isArray(away)
      ? Object.fromEntries(
          Object.entries(away).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []])
        )
      : {}
  return {
    date: data.date || '',
    filed: !!data.filed,
    sundayMinistryTeam: Array.isArray(data.sundayMinistryTeam) ? data.sundayMinistryTeam : [],
    pastoralAttendees: Array.isArray(data.pastoralAttendees) ? data.pastoralAttendees : [],
    pastoralLinked: data.pastoralLinked && typeof data.pastoralLinked === 'object' ? data.pastoralLinked : {},
    sundayCellAttendance,
    sundayCellAway,
    olive: Array.isArray(data.olive) ? data.olive : [],
    jordan: Array.isArray(data.jordan) ? data.jordan : [],
    bethany: Array.isArray(data.bethany) ? data.bethany : [],
    edenStream: Array.isArray(data.edenStream) ? data.edenStream : [],
    bethel: Array.isArray(data.bethel) ? data.bethel : [],
    newCell1: Array.isArray(data.newCell1) ? data.newCell1 : [],
    children: Array.isArray(data.children) ? data.children : [],
    newComers: Array.isArray(data.newComers) ? data.newComers : [],
    others: Array.isArray(data.others) ? data.others : [],
    othersLinked: data.othersLinked && typeof data.othersLinked === 'object' ? data.othersLinked : {},
    nonCell: Array.isArray(data.nonCell) ? data.nonCell : [],
    secondWeekAttendeesNames: Array.isArray(data.secondWeekAttendeesNames) ? data.secondWeekAttendeesNames : [],
    thirdWeekAttendeesNames: Array.isArray(data.thirdWeekAttendeesNames) ? data.thirdWeekAttendeesNames : [],
    fourthWeekAttendeesNames: Array.isArray(data.fourthWeekAttendeesNames) ? data.fourthWeekAttendeesNames : [],
    riverKids: Array.isArray(data.riverKids) ? data.riverKids.filter(Boolean) : [],
    programList: Array.isArray(data.programList) ? data.programList : [],
    preservice: data.preservice && typeof data.preservice === 'object' ? { lead1: data.preservice.lead1 || '', lead2: data.preservice.lead2 || '' } : { lead1: '', lead2: '' },
    summary: data.summary && typeof data.summary === 'object'
      ? {
          cellAttendance: data.summary.cellAttendance ?? '',
          othersCount: data.summary.othersCount ?? '',
          nonCellCount: data.summary.nonCellCount ?? '',
          newcomers: data.summary.newcomers ?? '',
          secondWeekAttendees: data.summary.secondWeekAttendees ?? '',
          riverKids: data.summary.riverKids ?? '',
          sundaySchool: data.summary.sundaySchool ?? '',
          totalAdults: data.summary.totalAdults ?? '',
          totalAttendance: data.summary.totalAttendance ?? '',
        }
      : { ...DEFAULT_SUNDAY_REPORT.summary },
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function deleteSundayReport(dateStr) {
  if (!db || !dateStr) return
  await deleteDoc(doc(db, SUNDAY_REPORTS_COLLECTION, String(dateStr).slice(0, 10)))
}

export async function pushProgramToSundayReport(dateStr, items) {
  if (!db || !dateStr) return
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  const payload = items
    .map((x) => ({ programName: String(x.programName || '').trim(), order: typeof x.order === 'number' ? x.order : 0 }))
    .filter((x) => x.programName)
  await setDoc(ref, { date: id, programList: payload }, { merge: true })
}

export async function getSundayReport(dateStr) {
  if (!db || !dateStr) return null
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return { id, date: id, ...DEFAULT_SUNDAY_REPORT, riverKids: [] }
  const data = snap.data()
  return {
    id: snap.id,
    ...normalizeReport({
      ...data,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    }),
  }
}

/** Real-time subscription to just the riverKids field of a sunday_reports doc. */
export function subscribeSundayReportRiverKids(dateStr, callback) {
  if (!db || !dateStr) return () => {}
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  return onSnapshot(ref, snap => {
    const data = snap.data() || {}
    callback(Array.isArray(data.riverKids) ? data.riverKids.filter(Boolean) : [])
  })
}

/** Real-time subscription to a single flat name-array field on a sunday_reports doc —
 *  used for fields another department can write to concurrently (e.g. D-Light marking
 *  second/third/fourth week comers while Sunday Ministry has the report open). */
export function subscribeSundayReportNameField(dateStr, fieldKey, callback) {
  if (!db || !dateStr || !fieldKey) return () => {}
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  return onSnapshot(ref, (snap) => {
    const data = snap.data() || {}
    callback(Array.isArray(data[fieldKey]) ? data[fieldKey].filter(Boolean) : [])
  })
}

/** Patch a single flat name-array field (e.g. 'others', 'nonCell') on a sunday_reports doc. */
export async function patchSundayReportNameField(dateStr, fieldKey, names, updatedBy) {
  if (!db || !dateStr || !fieldKey) return
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  await setDoc(ref, {
    date: id,
    [fieldKey]: Array.isArray(names) ? names.filter(Boolean) : [],
    updatedAt: Timestamp.now(),
    updatedBy: updatedBy || 'unknown',
  }, { merge: true })
}

/** Patch one cell's name list inside sundayCellAttendance on a sunday_reports doc. */
export async function patchSundayReportCellAttendance(dateStr, cellId, names, updatedBy) {
  if (!db || !dateStr || !cellId) return
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  await setDoc(ref, { date: id }, { merge: true })
  await updateDoc(ref, {
    [`sundayCellAttendance.${cellId}`]: Array.isArray(names) ? names.filter(Boolean) : [],
    updatedAt: Timestamp.now(),
    updatedBy: updatedBy || 'unknown',
  })
}

/** Write just the riverKids array — used by both Sunday Ministry and River Kids Sunday School. */
export async function patchSundayReportRiverKids(dateStr, names, updatedBy) {
  if (!db || !dateStr) return
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  await setDoc(ref, {
    date: id,
    riverKids: Array.isArray(names) ? names.filter(Boolean) : [],
    updatedAt: Timestamp.now(),
    updatedBy: updatedBy || 'unknown',
  }, { merge: true })
}

export async function getRecentNonCellAttendees(numWeeks = 6) {
  if (!db) return []
  const q = query(collection(db, SUNDAY_REPORTS_COLLECTION), orderBy('date', 'desc'), limit(numWeeks))
  const snap = await getDocs(q)
  const nameMap = new Map() // normalised → { name, lastSeen, count }
  snap.docs.forEach((d) => {
    const nonCell = d.data().nonCell
    if (!Array.isArray(nonCell)) return
    nonCell.filter(Boolean).forEach((n) => {
      const norm = String(n).trim().toLowerCase()
      if (!norm) return
      if (!nameMap.has(norm)) {
        nameMap.set(norm, { name: String(n).trim(), norm, lastSeen: d.id, count: 1 })
      } else {
        nameMap.get(norm).count++
      }
    })
  })
  return Array.from(nameMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Live version of the old one-time getRecentSundayAttendanceWeeks — subscribes to
 * both sunday_reports (name-based attendance: pastoral, cells, non-cell, others,
 * new comers, river kids, 2nd/3rd/4th week attendees) AND person_sunday_attendance
 * (ID-based check-ins, written whenever a Non Cell/Others attendee is linked to a
 * real People Directory or D-Light visitor record — see recordPersonSundayAttendance
 * in SundayReport.jsx), merging both into each week's presence data. This is what
 * lets consecutive-absence calculations match a PCS entry by its real visitorId
 * (reliable) as well as by name (fallback, for weeks that were never explicitly
 * linked), and lets the badge update live instead of only refreshing on tab-mount.
 *
 * Emits an array of { date, names: Set<lowercased name>, ids: Set<'p:'+personId |
 * 'v:'+visitorId> } sorted most-recent-first, on every relevant Firestore change.
 * Returns an unsubscribe function.
 */
export function subscribeToRecentSundayAttendanceWeeks(numWeeks, onChange, onError) {
  if (!db) { onChange([]); return () => {} }
  let latestReportDocs = []
  let latestPersonAttendance = []

  const emit = () => {
    const idsByDate = new Map()
    latestPersonAttendance.forEach((rec) => {
      const date = String(rec.date || '').slice(0, 10)
      if (!date) return
      if (!idsByDate.has(date)) idsByDate.set(date, new Set())
      const set = idsByDate.get(date)
      if (rec.personId) set.add(`p:${rec.personId}`)
      if (rec.visitorId) set.add(`v:${rec.visitorId}`)
    })

    const weeks = latestReportDocs
      .map((d) => {
        const data = d.data()
        const names = new Set()
        // `profileNames` = names from every list EXCEPT "Others" (free-text, ad-hoc
        // headcount — not tied to any profile) and River Kids. Profile-matching
        // engines (PCS "Recommended to Add") use this so a typed "Ramesh" in Others
        // never credits whichever directory profile happens to share that name.
        const profileNames = new Set()
        const addAll = (arr, { profile = true } = {}) => {
          if (!Array.isArray(arr)) return
          arr.forEach((n) => {
            const norm = String(n).trim().toLowerCase()
            if (!norm) return
            names.add(norm)
            if (profile) profileNames.add(norm)
          })
        }
        addAll(data.nonCell)
        addAll(data.others, { profile: false })
        addAll(data.newComers)
        addAll(data.pastoralAttendees)
        addAll(data.riverKids, { profile: false })
        addAll(data.secondWeekAttendeesNames)
        addAll(data.thirdWeekAttendeesNames)
        addAll(data.fourthWeekAttendeesNames)
        const sca = data.sundayCellAttendance
        if (sca && typeof sca === 'object') Object.values(sca).forEach((arr) => addAll(arr))
        // Names marked Away this Sunday — absence counters skip the week for them.
        const awayNames = new Set()
        const away = data.sundayCellAway
        if (away && typeof away === 'object') {
          Object.values(away).forEach((arr) => (Array.isArray(arr) ? arr : []).forEach((n) => {
            const norm = String(n).trim().toLowerCase()
            if (norm) awayNames.add(norm)
          }))
        }
        // River Kids (Sunday School) names on their own — callers that only care about
        // adults (PCS "Recommended to Add") use this to leave children out.
        const kidNames = new Set()
        ;(Array.isArray(data.riverKids) ? data.riverKids : []).forEach((n) => {
          const norm = String(n).trim().toLowerCase()
          if (norm) kidNames.add(norm)
        })
        return { date: d.id, names, profileNames, awayNames, kidNames, ids: idsByDate.get(d.id) || new Set() }
      })
      .sort((a, b) => b.date.localeCompare(a.date))

    onChange(weeks)
  }

  const unsubReports = onSnapshot(
    query(collection(db, SUNDAY_REPORTS_COLLECTION), orderBy('date', 'desc'), limit(numWeeks)),
    (snap) => { latestReportDocs = snap.docs; emit() },
    (err) => { console.error('subscribeToRecentSundayAttendanceWeeks (reports):', err); onError?.() }
  )
  const unsubPersonAttendance = onSnapshot(
    collection(db, PERSON_SUNDAY_ATTENDANCE_COLLECTION),
    (snap) => { latestPersonAttendance = snap.docs.map((d) => d.data()); emit() },
    (err) => {
      // Non-fatal — this collection is a secondary ID-matching enrichment on top of
      // sunday_reports (e.g. permission-denied if its rules haven't deployed yet).
      // Fall back to name-only matching instead of calling onError and wiping out
      // otherwise-good report data via the caller's error handler.
      console.error('subscribeToRecentSundayAttendanceWeeks (person attendance):', err)
      latestPersonAttendance = []
      emit()
    }
  )

  return () => { unsubReports(); unsubPersonAttendance() }
}

/**
 * Count how many distinct Sunday reports (weeks) each name appears in, across
 * nonCell, others, newComers, secondWeekAttendeesNames, and every cell's
 * sundayCellAttendance list. Name-based matching (lowercased, trimmed), same
 * approach as the rest of the Sunday attendance code.
 * Returns a Map<normalizedName, count>.
 */
// Shared by addSundayReportAttendanceCounts and getSundayAttendanceNameSetsInRange so
// every caller unions the same set of fields per report doc.
function extractAttendanceNamesFromReport(data) {
  const namesThisWeek = new Set()
  const addAll = (arr) => {
    if (!Array.isArray(arr)) return
    arr.forEach((n) => {
      const norm = String(n).trim().toLowerCase()
      if (norm) namesThisWeek.add(norm)
    })
  }
  addAll(data.nonCell)
  addAll(data.others)
  addAll(data.newComers)
  addAll(data.secondWeekAttendeesNames)
  addAll(data.thirdWeekAttendeesNames)
  addAll(data.fourthWeekAttendeesNames)
  const sca = data.sundayCellAttendance
  if (sca && typeof sca === 'object') {
    Object.values(sca).forEach((arr) => addAll(arr))
  }
  return namesThisWeek
}

// Shared by getSundayAttendanceCountsByName and getSundayAttendanceCountsByNameInRange
// so both count the same set of fields per report doc.
function addSundayReportAttendanceCounts(counts, data) {
  extractAttendanceNamesFromReport(data).forEach((norm) => {
    counts.set(norm, (counts.get(norm) || 0) + 1)
  })
}

export async function getSundayAttendanceCountsByName() {
  const counts = new Map()
  if (!db) return counts
  const snap = await getDocs(collection(db, SUNDAY_REPORTS_COLLECTION))
  snap.docs.forEach((d) => addSundayReportAttendanceCounts(counts, d.data()))
  return counts
}

// Same as getSundayAttendanceCountsByName but scoped to reports whose `date` (every
// write path sets this to the doc's own Sunday-date ID) falls within [startDateStr,
// endDateStr] inclusive — used by the D-Light Week Comer candidate filters, which need
// attendance counts within a rolling window rather than all-time.
export async function getSundayAttendanceCountsByNameInRange(startDateStr, endDateStr) {
  const counts = new Map()
  if (!db || !startDateStr || !endDateStr) return counts
  const q = query(
    collection(db, SUNDAY_REPORTS_COLLECTION),
    where('date', '>=', startDateStr),
    where('date', '<=', endDateStr)
  )
  const snap = await getDocs(q)
  snap.docs.forEach((d) => addSundayReportAttendanceCounts(counts, d.data()))
  return counts
}

// Like getSundayAttendanceCountsByNameInRange, but returns per-week detail instead of
// an aggregate count — used by the D-Light 2nd Week Return Rate KPI, which needs to know
// *which* Sundays a name attended (to check they fall inside a specific visitor's own
// return window) rather than just a total count across the whole range.
export async function getSundayAttendanceNameSetsInRange(startDateStr, endDateStr) {
  if (!db || !startDateStr || !endDateStr) return []
  const q = query(
    collection(db, SUNDAY_REPORTS_COLLECTION),
    where('date', '>=', startDateStr),
    where('date', '<=', endDateStr)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({
    date: d.id,
    names: extractAttendanceNamesFromReport(d.data()),
  }))
}

export async function getRecentSundayReports(numWeeks = 8) {
  if (!db) return []
  const today = new Date()
  const lastSunday = new Date(today)
  lastSunday.setDate(today.getDate() - today.getDay())
  const dateStrings = Array.from({ length: numWeeks }, (_, i) => {
    const d = new Date(lastSunday)
    d.setDate(lastSunday.getDate() - i * 7)
    return d.toISOString().slice(0, 10)
  })
  const snaps = await Promise.all(
    dateStrings.map((dateStr) => getDoc(doc(db, SUNDAY_REPORTS_COLLECTION, dateStr)))
  )
  return snaps
    .filter((snap) => snap.exists())
    .map((snap) => {
      const data = snap.data()
      return {
        id: snap.id,
        date: snap.id,
        secondWeekAttendeesNames: Array.isArray(data.secondWeekAttendeesNames)
          ? data.secondWeekAttendeesNames.map((n) => String(n).trim()).filter(Boolean)
          : [],
        nonCell: Array.isArray(data.nonCell)
          ? data.nonCell.map((n) => String(n).trim()).filter(Boolean)
          : [],
      }
    })
}

// numWeeks caps how many of the most recent reports to fetch — omit it (as the Sunday
// Reports history page does) to load the full archive. Weekly reports for one church
// stay a small collection for many years, so an unbounded query here is still cheap;
// capping it by default previously made anything older than ~3 months (12 reports)
// silently vanish from that page even though it was never deleted.
export async function getSundayReportSummaries(numWeeks = null) {
  if (!db) return []
  const clauses = [collection(db, SUNDAY_REPORTS_COLLECTION), orderBy('date', 'desc')]
  if (numWeeks) clauses.push(limit(numWeeks))
  const q = query(...clauses)
  const snap = await getDocs(q)
  return snap.docs.map((docSnap) => {
    const data = docSnap.data()
    const s   = data.summary && typeof data.summary === 'object' ? data.summary : {}
    const sca = data.sundayCellAttendance && typeof data.sundayCellAttendance === 'object' ? data.sundayCellAttendance : {}

    const othersCount         = Array.isArray(data.others)                    ? data.others.filter(Boolean).length                    : Number(s.othersCount) || 0
    const nonCellCount        = Array.isArray(data.nonCell)                   ? data.nonCell.filter(Boolean).length                   : Number(s.nonCellCount) || 0
    const secondWeekAttendees = Array.isArray(data.secondWeekAttendeesNames)  ? data.secondWeekAttendeesNames.filter(Boolean).length  : Number(s.secondWeekAttendees) || 0
    const pastoralCount       = Array.isArray(data.pastoralAttendees)         ? data.pastoralAttendees.filter(Boolean).length         : 0
    const riverKidsCount      = Array.isArray(data.riverKids)                 ? data.riverKids.filter(Boolean).length                 : Number(s.riverKids) || 0
    // Live Control now confirms New Comers into a real names array (report.newComers),
    // same as every other attendance section. Older reports saved before that fix — and
    // bulk Excel imports, which only ever wrote the summary count — still only have
    // summary.newcomers, so keep preferring whichever source is actually non-zero.
    const newcomersFromArray  = Array.isArray(data.newComers) ? data.newComers.filter(Boolean).length : 0
    const newcomers           = newcomersFromArray > 0 ? newcomersFromArray : (Number(s.newcomers) || 0)
    const sundaySchool        = Number(s.sundaySchool) || 0
    const cellAttendance      = Object.values(sca).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.filter(Boolean).length : 0), 0)
    const totalAdults         = cellAttendance + othersCount + nonCellCount + newcomers + secondWeekAttendees + pastoralCount
    const totalAttendance     = totalAdults + sundaySchool + riverKidsCount

    return {
      date: docSnap.id,
      sundayCellAttendance: sca,
      othersCount,
      nonCellCount,
      newcomers,
      secondWeekAttendees,
      sundaySchool,
      pastoralCount,
      riverKidsCount,
      totalAdults,
      totalAttendance,
      programTimings: Array.isArray(data.programTimings) ? data.programTimings : [],
    }
  })
}

export async function setSundayReport(dateStr, payload, updatedBy) {
  if (!db || !dateStr) return null
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  const now = Timestamp.now()
  const data = normalizeReport(payload)
  const snap = await getDoc(ref)
  await setDoc(ref, {
    date: id,
    ...(snap.exists() ? {} : { createdAt: now }),
    filed: data.filed,
    sundayMinistryTeam: data.sundayMinistryTeam,
    pastoralAttendees: data.pastoralAttendees,
    pastoralLinked: data.pastoralLinked || {},
    sundayCellAttendance: data.sundayCellAttendance || {},
    sundayCellAway: data.sundayCellAway || {},
    olive: data.olive,
    jordan: data.jordan,
    bethany: data.bethany,
    edenStream: data.edenStream,
    bethel: data.bethel,
    newCell1: data.newCell1,
    children: data.children,
    newComers: data.newComers,
    others: data.others,
    othersLinked: data.othersLinked || {},
    nonCell: data.nonCell,
    secondWeekAttendeesNames: data.secondWeekAttendeesNames,
    riverKids: data.riverKids,
    programList: data.programList,
    preservice: data.preservice,
    summary: data.summary,
    cellBreakdown: payload.cellBreakdown && typeof payload.cellBreakdown === 'object' ? payload.cellBreakdown : {},
    programTimings: Array.isArray(payload.programTimings) ? payload.programTimings : [],
    updatedBy: updatedBy || 'unknown',
    updatedAt: now,
  }, { merge: true })
  return ref.id
}

export async function bulkImportSundayReports(rows, importedBy) {
  if (!db || !Array.isArray(rows) || rows.length === 0) return { imported: 0, skipped: 0 }
  const now = Timestamp.now()
  let imported = 0
  let skipped = 0
  for (const row of rows) {
    const id = String(row.date || '').slice(0, 10)
    if (!id || id.length < 10) { skipped++; continue }
    const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
    const snap = await getDoc(ref)
    if (snap.exists()) { skipped++; continue }
    await setDoc(ref, {
      date: id,
      sundayCellAttendance:    row.sundayCellAttendance    || {},
      others:                  row.others                  || [],
      newComers:               row.newcomers               || [],
      secondWeekAttendeesNames: row.secondWeekAttendees    || [],
      summary: { sundaySchool: Number(row.sundaySchool) || 0 },
      programTimings: Array.isArray(row.programTimings) ? row.programTimings : [],
      importedBy: importedBy || 'import',
      importedAt: now,
      createdAt: now,
      updatedBy: importedBy || 'import',
      updatedAt: now,
    })
    imported++
  }
  return { imported, skipped }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEPHERD VIEW — Back to Bible (extend with 5 pastoral fields)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the 5 Shepherd content fields on an existing cell_back_to_bible doc.
 * Only Cell Directors should call this.
 */
export async function setCellBackToBibleShepherdFields(docId, fields) {
  if (!db || !docId) return
  const ref = doc(db, 'cell_back_to_bible', docId)
  await updateDoc(ref, {
    worship_song:   fields.worship_song   ?? '',
    ice_breaker:    fields.ice_breaker    ?? '',
    bible_content:  fields.bible_content  ?? '',
    bible_quiz:     fields.bible_quiz     ?? '',
    prayer_points:  fields.prayer_points  ?? '',
    updatedAt: Timestamp.now(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEPHERD VIEW — Transfer a member between cell groups
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move a member doc from one cell group to another.
 * The caller (Cell Leader) must own fromCellId; enforced also in Firestore rules.
 */
export async function transferCellMember(fromCellId, memberId, toCellId) {
  if (!db || !fromCellId || !memberId || !toCellId) return
  const fromRef = doc(db, CELL_GROUPS_COLLECTION, fromCellId, 'members', memberId)
  const snap = await getDoc(fromRef)
  if (!snap.exists()) throw new Error('Member not found')
  const memberData = snap.data()

  const toRef = doc(db, CELL_GROUPS_COLLECTION, toCellId, 'members', memberId)
  const batch = writeBatch(db)
  batch.set(toRef, { ...memberData, transferredAt: Timestamp.now(), previousCellId: fromCellId })
  batch.delete(fromRef)
  await batch.commit()

  // Update member counts on both cells
  const [fromSnap, toSnap] = await Promise.all([
    getDocs(collection(db, CELL_GROUPS_COLLECTION, fromCellId, 'members')),
    getDocs(collection(db, CELL_GROUPS_COLLECTION, toCellId, 'members')),
  ])
  await Promise.all([
    updateDoc(doc(db, CELL_GROUPS_COLLECTION, fromCellId), { memberCount: fromSnap.size }),
    updateDoc(doc(db, CELL_GROUPS_COLLECTION, toCellId),   { memberCount: toSnap.size }),
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEPHERD VIEW — Recent cell reports for attendance heatmap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the last `count` cell reports for a given cellId, each with their attendee names.
 * Returns: [{ reportId, reportDate, attendeeNames: Set<string> }, ...]  (newest first)
 */
export async function getRecentCellReportsForHeatmap(cellId, count = 2, altCellId) {
  if (!db || !cellId) return []
  async function fetchDocs(cid) {
    const snap = await getDocs(query(
      collection(db, CELL_REPORTS_COLLECTION),
      where('cellId', '==', cid),
      orderBy('reportDate', 'desc'),
      limit(count)
    ))
    return snap.docs
  }
  let docs = await fetchDocs(cellId)
  if (docs.length < count && altCellId && altCellId !== cellId) {
    const fallbackDocs = await fetchDocs(altCellId)
    const seen = new Set(docs.map((d) => d.id))
    const merged = [...docs, ...fallbackDocs.filter((d) => !seen.has(d.id))]
    merged.sort((a, b) => (b.data().reportDate || '').localeCompare(a.data().reportDate || ''))
    docs = merged.slice(0, count)
  }
  if (docs.length === 0) return []
  return Promise.all(
    docs.map(async (d) => {
      const attendeeSnap = await getDocs(
        collection(db, CELL_REPORTS_COLLECTION, d.id, 'attendees')
      )
      const attendeeNames = new Set(
        attendeeSnap.docs.map((a) => String(a.data().name || '').trim().toLowerCase())
      )
      // Members marked Away for this meeting (travel/vacation) — see utils/awayStatus.js
      const awayNames = new Set(
        (Array.isArray(d.data().awayNames) ? d.data().awayNames : []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean)
      )
      return { reportId: d.id, reportDate: d.data().reportDate || '', attendeeNames, awayNames }
    })
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUNDAY PLAN — Publish / Unpublish workflow
// ─────────────────────────────────────────────────────────────────────────────

export async function publishSundayPlan(dateStr, publishedBy) {
  if (!db || !dateStr) return
  const id = String(dateStr).slice(0, 10)
  await setDoc(doc(db, 'sunday_plans', id), {
    status: 'published',
    publishedBy: publishedBy || 'unknown',
    publishedAt: Timestamp.now(),
  }, { merge: true })
}

export async function unpublishSundayPlan(dateStr, updatedBy) {
  if (!db || !dateStr) return
  const id = String(dateStr).slice(0, 10)
  await setDoc(doc(db, 'sunday_plans', id), {
    status: 'draft',
    unpublishedBy: updatedBy || 'unknown',
    unpublishedAt: Timestamp.now(),
  }, { merge: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUNDAY SERVICE ATTENDANCE — per-cell bubble grid (new collection)
// ─────────────────────────────────────────────────────────────────────────────

const SUNDAY_SVC_ATTENDANCE = 'sunday_service_attendance'

/** Get the most recent Sunday service attendance for a specific cell (JS-sorted, no composite index needed). */
export async function getLatestSundayAttendanceForCell(cellId) {
  if (!db || !cellId) return { presentIds: [], date: null }
  const q = query(collection(db, SUNDAY_SVC_ATTENDANCE), where('cellId', '==', cellId))
  const snap = await getDocs(q)
  if (snap.empty) return { presentIds: [], date: null }
  const sorted = snap.docs
    .map((d) => d.data())
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return { presentIds: sorted[0].presentIds || [], date: sorted[0].date || null }
}

/** Get last N Sunday attendance records for a cell, newest first. */
export async function getRecentSundayAttendanceForCell(cellId, count = 5) {
  if (!db || !cellId) return []
  const q = query(collection(db, SUNDAY_SVC_ATTENDANCE), where('cellId', '==', cellId))
  const snap = await getDocs(q)
  if (snap.empty) return []
  return snap.docs
    .map(d => d.data())
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, count)
    .map(d => ({ date: d.date || null, presentIds: d.presentIds || [] }))
}

/**
 * Get last N Sundays where attendance was recorded for a cell, from sunday_reports.
 * Returns [{date, presentNames: string[]}] newest first.
 * Uses name-based matching (same source as Reports History).
 */
export async function getRecentSundayAttendanceNamesByCell(cellId, count = 5) {
  if (!db || !cellId) return []
  const q = query(collection(db, SUNDAY_REPORTS_COLLECTION), orderBy('date', 'desc'), limit(count * 4))
  const snap = await getDocs(q)
  if (snap.empty) return []
  const results = []
  for (const d of snap.docs) {
    const sca = d.data().sundayCellAttendance
    if (!sca || typeof sca !== 'object') continue
    const names = sca[cellId]
    if (!Array.isArray(names)) continue
    results.push({
      date: d.id,
      presentNames: names.map(n => String(n).trim().toLowerCase()).filter(Boolean),
    })
    if (results.length >= count) break
  }
  return results
}

/**
 * Distinct names recorded specifically in the Non Cell attendance section across
 * the last `count` Sunday reports strictly before `beforeDate` — deliberately
 * scoped to just `nonCell` (not Others, not any other section) so the Non Cell
 * "recently seen, not yet in a cell" suggestion pool only draws from people who
 * were themselves marked Non Cell before, not from every attendance category.
 */
export async function getRecentNonCellAttendeeNames(beforeDate, count = 4) {
  if (!db || !beforeDate) return []
  const q = query(collection(db, SUNDAY_REPORTS_COLLECTION), orderBy('date', 'desc'), limit(count * 6))
  const snap = await getDocs(q)
  if (snap.empty) return []
  const seen = new Set()
  let weeksCounted = 0
  for (const d of snap.docs) {
    const data = d.data()
    const date = data.date || d.id
    if (!date || date >= beforeDate) continue
    for (const n of (Array.isArray(data.nonCell) ? data.nonCell : [])) {
      const t = String(n || '').trim()
      if (t) seen.add(t)
    }
    weeksCounted += 1
    if (weeksCounted >= count) break
  }
  return [...seen]
}

export async function getSundayServiceAttendance(dateStr, cellId) {
  if (!db || !dateStr || !cellId) return { presentIds: [] }
  const id = `${String(dateStr).slice(0, 10)}_${cellId}`
  const snap = await getDoc(doc(db, SUNDAY_SVC_ATTENDANCE, id))
  if (!snap.exists()) return { presentIds: [] }
  return { presentIds: snap.data().presentIds || [] }
}

export async function setSundayServiceAttendance(dateStr, cellId, presentIds, updatedBy) {
  if (!db || !dateStr || !cellId) return
  const id = `${String(dateStr).slice(0, 10)}_${cellId}`
  await setDoc(doc(db, SUNDAY_SVC_ATTENDANCE, id), {
    date: String(dateStr).slice(0, 10),
    cellId,
    presentIds: Array.isArray(presentIds) ? presentIds : [],
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

// Per-person Sunday attendance — for people linked from Live Control attendance
// (e.g. "Others") to a People Directory record or a D-Light visitor record, so
// their own profile shows the Sundays they were marked present, independent of
// whether they belong to a cell.
const PERSON_SUNDAY_ATTENDANCE_COLLECTION = 'person_sunday_attendance'

export async function recordPersonSundayAttendance({ date, personId, visitorId, name, recordedBy }) {
  if (!db || !date || (!personId && !visitorId)) return
  const id = `${String(date).slice(0, 10)}_${personId || visitorId}`
  await setDoc(doc(db, PERSON_SUNDAY_ATTENDANCE_COLLECTION, id), {
    date: String(date).slice(0, 10),
    personId: personId || null,
    visitorId: visitorId || null,
    name: name || '',
    recordedBy: recordedBy || 'unknown',
    recordedAt: Timestamp.now(),
  }, { merge: true })
}

export async function getAllPersonSundayAttendance() {
  if (!db) return []
  const snap = await getDocs(collection(db, PERSON_SUNDAY_ATTENDANCE_COLLECTION))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Sync cell-level name list into sunday_reports.sundayCellAttendance so Reports History reflects it. */
export async function syncCellAttendanceToReport(dateStr, cellId, presentNames) {
  if (!db || !dateStr || !cellId) return
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  const names = Array.isArray(presentNames) ? presentNames.filter(Boolean) : []
  try {
    await updateDoc(ref, {
      [`sundayCellAttendance.${cellId}`]: names,
      updatedAt: Timestamp.now(),
    })
  } catch {
    await setDoc(ref, {
      date: id,
      sundayCellAttendance: { [cellId]: names },
      updatedAt: Timestamp.now(),
    }, { merge: true })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUNDAY CHECKLISTS — defaults + weekly instances
// ─────────────────────────────────────────────────────────────────────────────

const SUNDAY_CHECKLIST_DEFAULTS = 'sunday_checklist_defaults'
const SUNDAY_CHECKLIST_WEEKLY   = 'sunday_checklist_weekly'

export async function getSundayChecklistDefaults() {
  if (!db) return {}
  const snap = await getDocs(collection(db, SUNDAY_CHECKLIST_DEFAULTS))
  const result = {}
  snap.docs.forEach((d) => { result[d.id] = d.data().items || [] })
  return result
}

export async function setSundayChecklistDefault(dept, items, updatedBy) {
  if (!db || !dept) return
  await setDoc(doc(db, SUNDAY_CHECKLIST_DEFAULTS, dept), {
    items: Array.isArray(items) ? items : [],
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  })
}

/** Get weekly checklist completions for a given Sunday date. */
export async function getSundayWeeklyChecklists(dateStr) {
  if (!db || !dateStr) return {}
  const d = String(dateStr).slice(0, 10)
  const q = query(collection(db, SUNDAY_CHECKLIST_WEEKLY), where('date', '==', d))
  const snap = await getDocs(q)
  const result = {}
  snap.docs.forEach((doc) => { result[doc.data().dept] = doc.data() })
  return result
}

/** Toggle a single checklist item for a dept on a given Sunday date. */
export async function setSundayWeeklyChecklistItem(dateStr, dept, items, updatedBy) {
  if (!db || !dateStr || !dept) return
  const d = String(dateStr).slice(0, 10)
  const id = `${d}_${dept}`
  await setDoc(doc(db, SUNDAY_CHECKLIST_WEEKLY, id), {
    date: d,
    dept,
    items: Array.isArray(items) ? items : [],
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

// ─── Mid-week Ministry ────────────────────────────────────────────────────────

/** Get saved prayer points for a cell meeting on a given date. */
export async function getMidweekPrayerPoints(cellId, dateStr) {
  if (!db || !cellId || !dateStr) return []
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  const snap = await getDoc(doc(db, 'cell_midweek_prayer', id))
  return snap.exists() ? (snap.data().points || []) : []
}

/** Overwrite all prayer points for a cell meeting on a given date. */
export async function saveMidweekPrayerPoints(cellId, dateStr, points, updatedBy) {
  if (!db || !cellId || !dateStr) return
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  await setDoc(doc(db, 'cell_midweek_prayer', id), {
    cellId,
    date: d,
    points: Array.isArray(points) ? points : [],
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

/** Real-time subscription to prayer points for a cell meeting on a given date —
 *  used so a Director's read-only mirror of the Live Control tab updates as the
 *  Leader (or another viewer with Live Control on) adds/removes points. */
export function subscribeMidweekPrayerPoints(cellId, dateStr, callback) {
  if (!db || !cellId || !dateStr) return () => {}
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  return onSnapshot(doc(db, 'cell_midweek_prayer', id), (snap) => {
    callback(snap.exists() ? (snap.data().points || []) : [])
  })
}

/** Get saved midweek settings (segment order) for a cell group. */
export async function getMidweekSettings(cellId) {
  if (!db || !cellId) return null
  const snap = await getDoc(doc(db, 'cell_midweek_settings', cellId))
  return snap.exists() ? snap.data() : null
}

/** Save midweek settings (segment order + program schedule) for a cell group. */
export async function setMidweekSettings(cellId, segmentOrder, updatedBy, extra = {}) {
  if (!db || !cellId) return
  await setDoc(doc(db, 'cell_midweek_settings', cellId), {
    segmentOrder: Array.isArray(segmentOrder) ? segmentOrder : ['Worship', 'Ice Breaker', 'Back to Bible', 'Prayer'],
    programStartTime: extra.programStartTime || '',
    segmentDetails: Array.isArray(extra.segmentDetails) ? extra.segmentDetails : [],
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

/** Initialise weekly checklist docs from defaults if they don't exist yet. */
export async function initWeeklyChecklistsFromDefaults(dateStr, defaults, updatedBy) {
  if (!db || !dateStr || !defaults) return
  const d = String(dateStr).slice(0, 10)
  const batch = writeBatch(db)
  for (const [dept, defaultItems] of Object.entries(defaults)) {
    const id = `${d}_${dept}`
    const ref = doc(db, SUNDAY_CHECKLIST_WEEKLY, id)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      batch.set(ref, {
        date: d,
        dept,
        items: defaultItems.map((label) => ({ label, done: false })),
        updatedBy: updatedBy || 'system',
        updatedAt: Timestamp.now(),
      })
    }
  }
  await batch.commit()
}

// ── Midweek Session Data (timings, shepherd notes, summary) ──────────────────
const MIDWEEK_SESSIONS = 'cell_midweek_sessions'

/**
 * Get a saved midweek session doc for a given cell + date.
 * Returns { segmentTimings: [{name, durationMinutes}], shepherdNotes, updatedAt } or null.
 */
export async function getMidweekSessionData(cellId, dateStr) {
  if (!db || !cellId || !dateStr) return null
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  const snap = await getDoc(doc(db, MIDWEEK_SESSIONS, id))
  return snap.exists() ? snap.data() : null
}

/**
 * Save shepherd notes for a midweek session.
 */
export async function saveMidweekShepherdNotes(cellId, dateStr, notes, updatedBy) {
  if (!db || !cellId || !dateStr) return
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  await setDoc(doc(db, MIDWEEK_SESSIONS, id), {
    cellId,
    date: d,
    shepherdNotes: notes || '',
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

/**
 * Real-time subscription to a midweek session's in-progress `live` state — used by
 * the Live Control tab's Director View-Only mirror (and to hydrate a Director taking
 * over Live Control mid-meeting). Calls back with the `live` map or null if no live
 * session has been pushed yet for this cell + date.
 */
export function subscribeMidweekLiveSession(cellId, dateStr, callback) {
  if (!db || !cellId || !dateStr) return () => {}
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  return onSnapshot(doc(db, MIDWEEK_SESSIONS, id), (snap) => {
    callback(snap.exists() ? (snap.data().live || null) : null)
  })
}

/**
 * Push the current in-progress live state (segment/attendance/visitors/etc.) for a
 * midweek session, overwriting the whole `live` map. Called by whoever currently has
 * write access — the Leader always, or a Director with Live Control enabled.
 */
export async function pushMidweekLiveState(cellId, dateStr, liveState, updatedBy) {
  if (!db || !cellId || !dateStr) return
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  await setDoc(doc(db, MIDWEEK_SESSIONS, id), {
    cellId,
    date: d,
    live: {
      ...liveState,
      updatedBy: updatedBy || 'unknown',
      updatedAt: Timestamp.now(),
    },
  }, { merge: true })
}

/**
 * Save the full session summary (segment timings + attendee IDs) when meeting ends.
 */
export async function saveMidweekSessionSummary(cellId, dateStr, { segmentTimings, presentIds, attendanceDetails, updatedBy }) {
  if (!db || !cellId || !dateStr) return
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  await setDoc(doc(db, MIDWEEK_SESSIONS, id), {
    cellId,
    date: d,
    segmentTimings: Array.isArray(segmentTimings) ? segmentTimings : [],
    presentIds: Array.isArray(presentIds) ? presentIds : [],
    attendanceDetails: attendanceDetails && typeof attendanceDetails === 'object' ? attendanceDetails : {},
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

/**
 * After a midweek meeting ends, sync attendance into cell_reports so it
 * appears in the reports history immediately (without waiting for the Sunday Cloud Function).
 * Creates a minimal cell_reports doc if none exists for the given cell + date.
 * Adds present members to the attendees subcollection (skipping any already recorded).
 * `visitors`/`children` are name-only lists ({name} or {id, name}); `children` here is
 * distinct from department_children — it's the session's roster of River Kids children
 * confirmed as attending alongside their parent, written to cell_reports.childrenList.
 */
export async function syncMidweekAttendanceToCellReport(cellId, cellName, dateStr, presentMembers, updatedBy, visitors = [], children = [], awayNames = []) {
  if (!db || !cellId || !dateStr || !Array.isArray(presentMembers)) return
  const d = String(dateStr).slice(0, 10)
  const visitorNames = Array.isArray(visitors) ? visitors.map((v) => v.name).filter(Boolean) : []
  const childNames = Array.isArray(children) ? children.map((c) => c.name).filter(Boolean) : []

  // Find or create the cell_reports doc for this cell + date
  const q = query(
    collection(db, CELL_REPORTS_COLLECTION),
    where('cellId', '==', cellId),
    where('reportDate', '==', d),
    limit(1)
  )
  const snap = await getDocs(q)

  // Don't create a new doc if the meeting ended with no attendance recorded.
  // If an existing doc is already there, proceed normally (preserve its data).
  if (snap.empty && presentMembers.length === 0 && awayNames.length === 0) return

  let reportId
  if (!snap.empty) {
    reportId = snap.docs[0].id
  } else {
    const ref = await addDoc(collection(db, CELL_REPORTS_COLLECTION), {
      cellId,
      cellName: cellName || '',
      meetingDay: '',
      membersAttended: 0,
      visitors: 0,
      children: 0,
      visitorsList: [],
      childrenList: [],
      reportDate: d,
      createdBy: updatedBy || 'unknown',
      createdAt: Timestamp.now(),
    })
    reportId = ref.id
  }

  // Load existing attendees to avoid duplicates
  const attendeesRef = collection(db, CELL_REPORTS_COLLECTION, reportId, 'attendees')
  const existingSnap = await getDocs(attendeesRef)
  const existingMemberIds = new Set(existingSnap.docs.map((d) => d.data().memberId).filter(Boolean))

  // Batch-write new attendees
  const batch = writeBatch(db)
  for (const member of presentMembers) {
    if (member.id && !existingMemberIds.has(member.id)) {
      batch.set(doc(attendeesRef), {
        memberId: member.id,
        name: member.name || '',
        birthday: member.birthday || '',
        anniversary: member.anniversary || '',
        phone: member.phone || '',
        locality: member.locality || '',
      })
    }
  }
  await batch.commit()

  // Update membersAttended count from final subcollection size
  const finalSnap = await getDocs(attendeesRef)
  await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId), {
    membersAttended: finalSnap.size,
    visitors: visitorNames.length,
    visitorsList: visitorNames,
    children: childNames.length,
    childrenList: childNames,
    awayNames: Array.isArray(awayNames) ? awayNames.filter(Boolean) : [],
  })
}

// Returns the ISO date string (YYYY-MM-DD) of the Monday of the week containing dateStr
function toMondayISO(dateStr) {
  const [y, m, day] = String(dateStr).slice(0, 10).split('-').map(Number)
  const d = new Date(y, m - 1, day)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Full update of a cell meeting report.
 * Reconciles cell_reports, its attendees subcollection, cell_midweek_sessions,
 * and patches cell_report_history if an archived doc exists.
 *
 * @param {object} row - history/live row with { cellId, cellName, meetingDateISO }
 * @param {object} payload
 * @param {Array<{id?:string, memberId?:string, name:string}>} payload.attendees - full desired list
 * @param {Array<{name:string, durationMinutes:number}>} payload.segmentTimings
 * @param {string} payload.shepherdNotes
 * @param {number} payload.visitors
 * @param {number} payload.children
 * @param {string} [payload.startTime] - "HH:mm" (24-hour), meeting start time
 * @param {string} [payload.endTime] - "HH:mm" (24-hour), start + total segment duration
 * @param {string} [payload.updatedBy]
 * @returns {Promise<{membersAttended:number, visitors:number, children:number, meetingDurationMinutes:number, programList:Array, startTime:string, endTime:string}>}
 */
export async function updateCellReportFull(row, { attendees, segmentTimings, shepherdNotes, visitors, children, startTime, endTime, updatedBy }) {
  if (!db || !row?.cellId || !row?.meetingDateISO) throw new Error('updateCellReportFull: missing row fields')
  const d = String(row.meetingDateISO).slice(0, 10)

  // 1. Find or create cell_reports doc
  let report = await getCellReportByCellAndDate(row.cellId, d)
  if (!report) {
    const ref = await addDoc(collection(db, CELL_REPORTS_COLLECTION), {
      cellId: row.cellId,
      cellName: row.cellName || '',
      meetingDay: row.meetingDay || '',
      membersAttended: 0,
      visitors: Number(visitors) || 0,
      children: Number(children) || 0,
      visitorsList: [],
      childrenList: [],
      reportDate: d,
      createdBy: updatedBy || 'unknown',
      createdAt: Timestamp.now(),
    })
    report = { id: ref.id, cellId: row.cellId, cellName: row.cellName || '' }
  }
  const reportId = report.id

  // 2. Update counts + meeting timing on cell_reports doc
  await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId), {
    membersAttended: attendees.length,
    visitors: Number(visitors) || 0,
    children: Number(children) || 0,
    startTime: startTime || '',
    endTime: endTime || '',
  })

  // 3. Reconcile attendees subcollection
  const attendeesRef = collection(db, CELL_REPORTS_COLLECTION, reportId, 'attendees')
  const existingSnap = await getDocs(attendeesRef)
  const existingDocs = existingSnap.docs.map((sd) => ({ docId: sd.id, ...sd.data() }))

  // Build desired set by name (case-insensitive) for matching
  const desiredNames = new Set(attendees.map((a) => String(a.name || '').trim().toLowerCase()).filter(Boolean))

  // Delete removed docs
  const batch = writeBatch(db)
  for (const ex of existingDocs) {
    const exName = String(ex.name || '').trim().toLowerCase()
    if (!desiredNames.has(exName)) {
      batch.delete(doc(attendeesRef, ex.docId))
    }
  }
  await batch.commit()

  // Add new docs not already present by name
  const existingNames = new Set(existingDocs.map((e) => String(e.name || '').trim().toLowerCase()))
  const addBatch = writeBatch(db)
  for (const a of attendees) {
    const normName = String(a.name || '').trim().toLowerCase()
    if (!normName) continue   // skip blank-name entries
    if (existingNames.has(normName)) continue
    addBatch.set(doc(attendeesRef), {
      memberId: a.memberId || null,
      name: String(a.name || '').trim(),
      birthday: a.birthday || '',
      anniversary: a.anniversary || '',
      phone: a.phone || '',
      locality: a.locality || '',
      isVisitor: !!a.isVisitor,
    })
  }
  await addBatch.commit()

  // 4. Upsert cell_midweek_sessions
  const sessionId = `${row.cellId}_${d}`
  await setDoc(doc(db, MIDWEEK_SESSIONS, sessionId), {
    cellId: row.cellId,
    date: d,
    segmentTimings: Array.isArray(segmentTimings) ? segmentTimings : [],
    shepherdNotes: shepherdNotes || '',
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })

  // 5. Patch cell_report_history if an archived doc exists
  const meetingDurationMinutes = (segmentTimings || []).reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0)
  const weekStart = toMondayISO(d)
  const historyId = `${weekStart}_${row.cellId}`
  try {
    const historyRef = doc(db, CELL_REPORT_HISTORY_COLLECTION, historyId)
    const historySnap = await getDoc(historyRef)
    if (historySnap.exists()) {
      await updateDoc(historyRef, {
        membersAttended: attendees.length,
        totalAttendance: attendees.length + (Number(visitors) || 0) + (Number(children) || 0),
        visitors: Number(visitors) || 0,
        children: Number(children) || 0,
        meetingDurationMinutes,
        programList: (segmentTimings || []).map((t) => ({ programName: t.name, durationMinutes: t.durationMinutes })),
      })
    }
  } catch (err) {
    console.warn('updateCellReportFull: could not patch cell_report_history', err)
  }

  return {
    membersAttended: attendees.length,
    visitors: Number(visitors) || 0,
    children: Number(children) || 0,
    meetingDurationMinutes,
    programList: (segmentTimings || []).map((t) => ({ programName: t.name, durationMinutes: t.durationMinutes })),
    startTime: startTime || '',
    endTime: endTime || '',
  }
}

/**
 * Delete all Firestore data for a cell meeting report:
 * cell_report_history (if archived), cell_reports attendees, cell_reports doc,
 * and cell_midweek_sessions doc.
 *
 * @param {object} row - { cellId, meetingDateISO }
 */
export async function deleteCellReportFull(row) {
  if (!db || !row?.cellId || !row?.meetingDateISO) throw new Error('deleteCellReportFull: missing row fields')
  const d = String(row.meetingDateISO).slice(0, 10)

  // 1. Delete cell_report_history if archived
  const weekStart = toMondayISO(d)
  const historyId = `${weekStart}_${row.cellId}`
  try {
    await deleteDoc(doc(db, CELL_REPORT_HISTORY_COLLECTION, historyId))
  } catch {
    // may not exist — ignore
  }

  // 2. Find and delete cell_reports + attendees subcollection
  const q = query(
    collection(db, CELL_REPORTS_COLLECTION),
    where('cellId', '==', row.cellId),
    where('reportDate', '==', d)
  )
  const snap = await getDocs(q)
  for (const reportDoc of snap.docs) {
    const attendeesRef = collection(db, CELL_REPORTS_COLLECTION, reportDoc.id, 'attendees')
    const attendeesSnap = await getDocs(attendeesRef)
    const batch = writeBatch(db)
    attendeesSnap.docs.forEach((ad) => batch.delete(ad.ref))
    batch.delete(reportDoc.ref)
    await batch.commit()
  }

  // 3. Delete cell_midweek_sessions doc
  try {
    await deleteDoc(doc(db, MIDWEEK_SESSIONS, `${row.cellId}_${d}`))
  } catch {
    // may not exist — ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SP OFFICE — Daily Schedule (one doc per agenda item, filtered by `date`)
// ─────────────────────────────────────────────────────────────────────────────

const SP_OFFICE_SCHEDULE = 'sp_office_schedule'

export function subscribeToSpOfficeSchedule(dateStr, onChange, onError) {
  if (!db || !dateStr) { onError?.(); return () => {} }
  return onSnapshot(
    query(collection(db, SP_OFFICE_SCHEDULE), where('date', '==', dateStr)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.error('subscribeToSpOfficeSchedule:', err); onError?.(err) }
  )
}

export async function addSpOfficeScheduleItem(data, createdBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, SP_OFFICE_SCHEDULE), {
    ...data,
    done: false,
    createdBy: createdBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateSpOfficeScheduleItem(id, data, updatedBy) {
  if (!db || !id) return
  await updateDoc(doc(db, SP_OFFICE_SCHEDULE, id), {
    ...data,
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  })
}

export async function deleteSpOfficeScheduleItem(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, SP_OFFICE_SCHEDULE, id))
}

// Regular programs offered in the Daily Schedule combobox. `list` is the full,
// user-managed list; until it's first saved the client falls back to its built-in
// defaults (plus any legacy `names` remembered before the list was manageable).
const SP_OFFICE_PROGRAMS_DOC = ['sp_office_settings', 'programs']

export function subscribeToSpOfficePrograms(onChange, onError) {
  if (!db) { onError?.(); return () => {} }
  return onSnapshot(
    doc(db, ...SP_OFFICE_PROGRAMS_DOC),
    (snap) => onChange(snap.exists() ? snap.data() : {}),
    (err) => { console.error('subscribeToSpOfficePrograms:', err); onError?.(err) }
  )
}

export async function setSpOfficeProgramList(list, updatedBy) {
  if (!db) throw new Error('Firestore is not initialised')
  // Plain trimmed strings only — Firestore rejects `undefined` inside arrays.
  const clean = (Array.isArray(list) ? list : [])
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean)
  await setDoc(doc(db, ...SP_OFFICE_PROGRAMS_DOC), {
    list: clean,
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// SEC-CORE — Director Board & Sunday Leader
// ─────────────────────────────────────────────────────────────────────────────

const SEC_CORE_COLLECTION = 'sec_core'
const SEC_CORE_SUNDAY_LEADER = 'sec_core_sunday_leader'

export async function getSecCoreDirectorBoard() {
  if (!db) return {}
  const snap = await getDoc(doc(db, SEC_CORE_COLLECTION, 'director_board'))
  return snap.exists() ? snap.data() : {}
}

export function subscribeToDirectorBoard(onChange, onError) {
  if (!db) { onError?.(); return () => {} }
  return onSnapshot(
    doc(db, SEC_CORE_COLLECTION, 'director_board'),
    (snap) => onChange(snap.exists() ? snap.data() : {}),
    (err) => { console.error('subscribeToDirectorBoard:', err); onError?.() }
  )
}

export async function setSecCoreDirectorBoard(data, updatedBy) {
  if (!db) return
  await setDoc(doc(db, SEC_CORE_COLLECTION, 'director_board'), {
    ...data,
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

export async function getSecCoreSundayLeaderEntries(count = 12) {
  if (!db) return []
  const q = query(collection(db, SEC_CORE_SUNDAY_LEADER), orderBy('date', 'desc'), limit(count))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getSecCoreSundayLeaderEntry(dateStr) {
  if (!db || !dateStr) return null
  const snap = await getDoc(doc(db, SEC_CORE_SUNDAY_LEADER, dateStr))
  return snap.exists() ? snap.data() : null
}

export async function setSecCoreSundayLeaderEntry(dateStr, data, updatedBy) {
  if (!db || !dateStr) return
  await setDoc(doc(db, SEC_CORE_SUNDAY_LEADER, dateStr), {
    date: dateStr,
    ...data,
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

export async function deleteSecCoreSundayLeaderEntry(dateStr) {
  if (!db || !dateStr) return
  await deleteDoc(doc(db, SEC_CORE_SUNDAY_LEADER, dateStr))
}

export async function getSecCoreSundayLeaderPool() {
  if (!db) return {}
  const snap = await getDoc(doc(db, SEC_CORE_COLLECTION, 'sunday_leader_pool'))
  return snap.exists() ? snap.data() : {}
}

export function subscribeToSundayLeaderPool(onChange, onError) {
  if (!db) { onError?.(); return () => {} }
  return onSnapshot(
    doc(db, SEC_CORE_COLLECTION, 'sunday_leader_pool'),
    (snap) => onChange(snap.exists() ? snap.data() : {}),
    (err) => { console.error('subscribeToSundayLeaderPool:', err); onError?.() }
  )
}

export async function setSecCoreSundayLeaderPool(data, updatedBy) {
  if (!db) return
  await setDoc(doc(db, SEC_CORE_COLLECTION, 'sunday_leader_pool'), {
    ...data,
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

// Batch-writes every Sunday's leader/co-leader/notes for a month in one commit —
// backs the "Save Month Schedule" button (replaces per-row saves).
export async function setSecCoreSundayLeaderMonth(entries, updatedBy) {
  if (!db || !entries?.length) return
  const batch = writeBatch(db)
  entries.forEach(({ date, leader, coLeader, notes, psalm, announcements }) => {
    batch.set(doc(db, SEC_CORE_SUNDAY_LEADER, date), {
      date,
      leader: leader || '',
      coLeader: coLeader || '',
      notes: notes || '',
      psalm: psalm || '',
      announcements: announcements || '',
      updatedBy: updatedBy || 'unknown',
      updatedAt: Timestamp.now(),
    }, { merge: true })
  })
  await batch.commit()
}

// Unbounded — every sec_core_sunday_leader doc on record, chronological, for the
// Export Schedule JPEG (deliberately not capped like getSecCoreSundayLeaderEntries,
// since the export should include however many Sundays are actually assigned).
export async function getAllSecCoreSundayLeaderEntries() {
  if (!db) return []
  const q = query(collection(db, SEC_CORE_SUNDAY_LEADER), orderBy('date', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Exact-name lookup — used to resolve a Sunday Leader Pool name or a Director Board
// roster name to an actual app account before sending a workspace notification (most
// names, drawn from the general People Directory / board roster, won't have one).
// Queries user_directory (open to any signed-in user), not `users` directly — the
// `users` collection's rule only allows reading your own doc, so a name-search query
// against it is denied outright for anyone who isn't Founder, silently dropping every
// notification for a non-Founder caller (the original bug behind this fix).
export async function getUserByName(name) {
  if (!db || !name) return null
  const q = query(collection(db, USER_DIRECTORY), where('name', '==', name), limit(1))
  const snap = await getDocs(q)
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// Every user_directory entry with a given app role (e.g. 'Founder', 'Senior Pastor') —
// used to notify church-wide leadership on events like a Board Meeting being scheduled,
// regardless of which department the person who scheduled it belongs to.
export async function getUsersByAppRole(role) {
  if (!db || !role) return []
  const q = query(collection(db, USER_DIRECTORY), where('role', '==', role))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

const SEC_CORE_LEADER_NOTIF_COLLECTION = 'sec_core_leader_assignment_notifications'

export async function createSundayLeaderAssignmentNotification({ uid, date, role, name, createdBy }) {
  if (!db || !uid || !date) return
  await setDoc(doc(db, SEC_CORE_LEADER_NOTIF_COLLECTION, `${uid}_${date}_${role}`), {
    uid,
    date,
    role,
    name: name || '',
    createdBy: createdBy || 'unknown',
    createdAt: Timestamp.now(),
  }, { merge: true })
}

export function subscribeSundayLeaderAssignmentNotifications(uid, onChange) {
  if (!db || !uid) { onChange([]); return () => {} }
  const q = query(collection(db, SEC_CORE_LEADER_NOTIF_COLLECTION), where('uid', '==', uid))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, () => onChange([]))
}

// ─────────────────────────────────────────────────────────────────────────────
// SEC-CORE BOARD MEETINGS — scheduled Director Board meeting instances (Date,
// Time, Venue/Link, Title), distinct from the bare meetingDate string that
// board_meeting_points has always used. Points can carry a meetingId to link
// them to a specific scheduled instance, in addition to their existing
// meetingDate (kept for BoardAgendaTab's date-chip grouping).
// ─────────────────────────────────────────────────────────────────────────────

const SEC_CORE_BOARD_MEETINGS_COLLECTION = 'sec_core_board_meetings'

export async function createBoardMeeting({ title, date, time, venue, createdBy }) {
  if (!db) return null
  const ref = await addDoc(collection(db, SEC_CORE_BOARD_MEETINGS_COLLECTION), {
    title: title || '',
    date: date || '',
    time: time || '',
    venue: venue || '',
    status: 'scheduled',
    createdBy: createdBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export function subscribeToBoardMeetings(onChange, onError) {
  if (!db) { onChange([]); return () => {} }
  const q = query(collection(db, SEC_CORE_BOARD_MEETINGS_COLLECTION), orderBy('date', 'asc'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, (err) => { console.error('subscribeToBoardMeetings:', err); onError?.() })
}

export async function getBoardMeeting(id) {
  if (!db || !id) return null
  const snap = await getDoc(doc(db, SEC_CORE_BOARD_MEETINGS_COLLECTION, id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// Board meeting invitations are surfaced via the workspace banner
// (BoardMeetingWorkspaceWidget reading sec_core_board_meetings directly), not via
// per-user notification docs — so there is no notification collection here.

// Dual-screen presentation sync — "which point is active" and its timer both live
// directly on that point's own board_meeting_points doc (isActive/presentStatus/
// presentStartedAt/presentPausedElapsedSeconds), not as a separate reference on the
// meeting doc. The controller and /board-present already both subscribe to
// subscribeToBoardPoints for everything else, so deriving "the active point" is a
// plain `.find(p => p.isActive)` over data they already have — no cross-document
// join, so it can't disagree with what's actually in the points collection the way
// a stale meeting-doc reference could. See docs/superpowers/specs/
// 2026-08-10-board-agenda-live-point-redesign.md.

const IDLE_PRESENT_STATE = { isActive: false, presentStatus: 'idle', presentStartedAt: null, presentPausedElapsedSeconds: 0 }

/** Accept Point, "Present" (a specific row), and "Next Point" all call this —
 * exactly one atomic batch that clears any previously-active point(s) and stages
 * the target, optionally folding in extra field changes (Accept Point's accepted-
 * point patch) so "accept" and "stage" can never partially succeed. Always
 * overwrites whichever point was previously active — there is no "only if nothing
 * is live" branch; every stage is an explicit, unconditional switch. */
export async function stagePoint(pointId, { extraPatch = {}, previousActiveIds = [] } = {}) {
  if (!db || !pointId) return
  const batch = writeBatch(db)
  previousActiveIds.forEach((id) => {
    if (!id || id === pointId) return
    batch.update(doc(db, BOARD_POINTS_COLLECTION, id), IDLE_PRESENT_STATE)
  })
  batch.update(doc(db, BOARD_POINTS_COLLECTION, pointId), {
    ...IDLE_PRESENT_STATE,
    isActive: true,
    ...extraPatch,
  })
  await batch.commit()
}

/** 'running': starts (or resumes) the clock from now. 'paused': folds the just-
 * elapsed running segment into presentPausedElapsedSeconds and stops the clock.
 * `currentPoint` is the caller's already-loaded point object (from its own
 * subscribeToBoardPoints subscription) — no extra read needed to compute elapsed
 * time, unlike the old meeting-doc version of this function. */
export async function setPresentStatus(pointId, status, currentPoint) {
  if (!db || !pointId) return
  const ref = doc(db, BOARD_POINTS_COLLECTION, pointId)
  if (status === 'running') {
    await updateDoc(ref, { presentStatus: 'running', presentStartedAt: serverTimestamp() })
    return
  }
  const startedAtMs = currentPoint?.presentStartedAt?.toMillis?.() ?? null
  const ranSeconds = currentPoint?.presentStatus === 'running' && startedAtMs ? (Date.now() - startedAtMs) / 1000 : 0
  await updateDoc(ref, {
    presentStatus: 'paused',
    presentStartedAt: null,
    presentPausedElapsedSeconds: (currentPoint?.presentPausedElapsedSeconds || 0) + ranSeconds,
  })
}

// Global "Pastoral Roster" — default Pastors/leadership shown as one-tap, pre-linked
// suggestions on every Sunday report's Pastoral Attendees section (see SundayReport.jsx).
// Single settings doc, same shape as sec_core's sunday_leader_pool: { members: [...] }.
export async function getPastoralRoster() {
  if (!db) return {}
  const snap = await getDoc(doc(db, 'settings', 'pastoral_roster'))
  return snap.exists() ? snap.data() : {}
}

export function subscribeToPastoralRoster(onChange, onError) {
  if (!db) { onError?.(); return () => {} }
  return onSnapshot(
    doc(db, 'settings', 'pastoral_roster'),
    (snap) => onChange(snap.exists() ? snap.data() : {}),
    (err) => { console.error('subscribeToPastoralRoster:', err); onError?.() }
  )
}

export async function savePastoralRoster(data, updatedBy) {
  if (!db) return
  await setDoc(doc(db, 'settings', 'pastoral_roster'), {
    ...data,
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

// Global "Senior Pastor" designation — replaces the hardcoded SENIOR_PASTOR_NAME
// fallback in utils/seniorPastor.js (see useSeniorPastor) once a Founder assigns one
// from a PCS entry (DepartmentHub.jsx's PCS "⋮ More options" menu). Single settings
// doc, same shape/pattern as pastoral_roster above.
export function subscribeToSeniorPastor(onChange, onError) {
  if (!db) { onError?.(); return () => {} }
  return onSnapshot(
    doc(db, 'settings', 'senior_pastor'),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    (err) => { console.error('subscribeToSeniorPastor:', err); onError?.() }
  )
}

// Assigns `pcsEntry` as the new Senior Pastor, replacing whoever held it before, and
// keeps ROLES.SENIOR_PASTOR login permissions in sync with whichever `users` account
// (if any) matches by email — the outgoing holder's role reverts to whatever their real
// positions[] derive to, the incoming holder's role becomes Senior Pastor. A PCS entry
// with no email, or no matching `users` doc, still gets the name-badge everywhere; there
// is simply nothing to sync permissions to until they have a matching account.
export async function assignSeniorPastor(pcsEntry, actorName) {
  if (!db) return
  const email = String(pcsEntry?.email || '').trim()

  let incomingUid = null
  if (email) {
    const q = query(collection(db, 'users'), where('email', '==', email), limit(1))
    const snap = await getDocs(q)
    if (!snap.empty) incomingUid = snap.docs[0].id
  }

  const currentSnap = await getDoc(doc(db, 'settings', 'senior_pastor'))
  const outgoingUid = currentSnap.exists() ? (currentSnap.data().linkedUid || null) : null

  const batch = writeBatch(db)

  if (outgoingUid && outgoingUid !== incomingUid) {
    const outgoingUserSnap = await getDoc(doc(db, 'users', outgoingUid))
    if (outgoingUserSnap.exists()) {
      const positions = outgoingUserSnap.data().positions || []
      batch.update(doc(db, 'users', outgoingUid), { role: deriveRoleFromPositions(positions) })
    }
  }

  if (incomingUid) {
    batch.update(doc(db, 'users', incomingUid), { role: ROLES.SENIOR_PASTOR })
  }

  batch.set(doc(db, 'settings', 'senior_pastor'), {
    pcsEntryId: pcsEntry.id,
    visitorId: pcsEntry.visitorId || null,
    name: pcsEntry.name,
    email,
    linkedUid: incomingUid,
    updatedAt: Timestamp.now(),
    updatedBy: actorName || 'unknown',
  })

  await batch.commit()
}

// Expense department options (Accounts → Operations → Add Departments)
const EXPENSE_DEPARTMENTS_COLLECTION = 'expense_departments'

export async function getExpenseDepartments() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, EXPENSE_DEPARTMENTS_COLLECTION), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, name: String(d.data().name || '') }))
}

export async function addExpenseDepartment(name) {
  if (!db || !name) return null
  const ref = await addDoc(collection(db, EXPENSE_DEPARTMENTS_COLLECTION), {
    name: String(name).trim(),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteExpenseDepartment(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, EXPENSE_DEPARTMENTS_COLLECTION, id))
}

// D Light – master member database (dlight_members)
const DLIGHT_MEMBERS_COLLECTION = 'dlight_members'

export async function getDlightMembers(year) {
  if (!db) return []
  // Filter by year server-side; sort client-side to avoid needing a composite index.
  const constraints = year ? [where('year', '==', Number(year))] : [orderBy('createdAt', 'asc')]
  const q = query(collection(db, DLIGHT_MEMBERS_COLLECTION), ...constraints)
  const snap = await getDocs(q)
  const rows = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name || '',
      dob: data.dob || '',
      phone: data.phone || '',
      email: data.email || '',
      nativity: data.nativity || '',
      currentPlace: data.currentPlace || '',
      serviceAttended: data.serviceAttended || '',
      attendedDate: data.attendedDate || '',
      howKnown: data.howKnown || '',
      year: data.year || null,
      createdAt: toDate(data.createdAt),
    }
  })
  if (year) rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  return rows
}

export async function addDlightMember(data, createdBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, DLIGHT_MEMBERS_COLLECTION), {
    name: String(data.name || '').trim(),
    dob: data.dob ? String(data.dob).slice(0, 10) : '',
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim(),
    nativity: String(data.nativity || '').trim(),
    currentPlace: String(data.currentPlace || '').trim(),
    serviceAttended: String(data.serviceAttended || '').trim(),
    attendedDate: data.attendedDate ? String(data.attendedDate).slice(0, 10) : '',
    howKnown: String(data.howKnown || '').trim(),
    year: data.year ? Number(data.year) : null,
    createdAt: serverTimestamp(),
    createdBy: createdBy || 'unknown',
  })
  return ref.id
}

export async function updateDlightMember(id, data) {
  if (!db || !id) return
  const payload = {
    name: data.name !== undefined ? String(data.name).trim() : undefined,
    dob: data.dob !== undefined ? String(data.dob).slice(0, 10) : undefined,
    phone: data.phone !== undefined ? String(data.phone).trim() : undefined,
    email: data.email !== undefined ? String(data.email).trim() : undefined,
    nativity: data.nativity !== undefined ? String(data.nativity).trim() : undefined,
    currentPlace: data.currentPlace !== undefined ? String(data.currentPlace).trim() : undefined,
    serviceAttended: data.serviceAttended !== undefined ? String(data.serviceAttended).trim() : undefined,
    attendedDate: data.attendedDate !== undefined ? String(data.attendedDate).slice(0, 10) : undefined,
    howKnown: data.howKnown !== undefined ? String(data.howKnown).trim() : undefined,
    year: data.year !== undefined ? (data.year ? Number(data.year) : null) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, DLIGHT_MEMBERS_COLLECTION, id), clean)
}

export async function deleteDlightMember(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, DLIGHT_MEMBERS_COLLECTION, id))
}

export async function deleteAllDlightMembersByYear(year) {
  if (!db || !year) return 0
  const q = query(collection(db, DLIGHT_MEMBERS_COLLECTION), where('year', '==', Number(year)))
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.docs.length
}

export async function bulkAddDlightMembers(rows, createdBy) {
  if (!db || !rows?.length) return { imported: 0, failed: 0 }
  let imported = 0
  let failed = 0
  for (const row of rows) {
    try {
      await addDoc(collection(db, DLIGHT_MEMBERS_COLLECTION), {
        name: String(row.name || '').trim(),
        dob: row.dob ? String(row.dob).slice(0, 10) : '',
        phone: String(row.phone || '').trim(),
        email: String(row.email || '').trim(),
        nativity: String(row.nativity || '').trim(),
        currentPlace: String(row.currentPlace || '').trim(),
        serviceAttended: String(row.serviceAttended || '').trim(),
        attendedDate: row.attendedDate ? String(row.attendedDate).slice(0, 10) : '',
        howKnown: String(row.howKnown || '').trim(),
        year: row.year ? Number(row.year) : null,
        createdAt: serverTimestamp(),
        createdBy: createdBy || 'unknown',
      })
      imported++
    } catch {
      failed++
    }
  }
  return { imported, failed }
}

// Director Board Meeting Points
const BOARD_POINTS_COLLECTION = 'board_meeting_points'

function mapBoardPoint(d) {
  const data = d.data()
  return {
    id: d.id,
    department: data.department || '',
    slNo: data.slNo || '',
    point: data.point || '',
    timeNeeded: data.timeNeeded || '',
    meetingDate: data.meetingDate || '',
    meetingId: data.meetingId || '',
    status: data.status || 'pending',
    allottedTime: data.allottedTime || '',
    approvedBy: data.approvedBy || '',
    durationMinutes: data.durationMinutes ?? null,
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy || '',
    isActive: data.isActive === true,
    presentStatus: data.presentStatus || 'idle',
    presentStartedAt: data.presentStartedAt || null,
    presentPausedElapsedSeconds: data.presentPausedElapsedSeconds || 0,
  }
}

export async function getBoardPoints(department) {
  if (!db || !department) return []
  const q = query(
    collection(db, BOARD_POINTS_COLLECTION),
    where('department', '==', department),
    orderBy('createdAt', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(mapBoardPoint)
}

export async function getAllBoardPoints() {
  if (!db) return []
  const q = query(collection(db, BOARD_POINTS_COLLECTION), orderBy('createdAt', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(mapBoardPoint)
}

// Real-time listener — returns an unsubscribe function
export function subscribeToBoardPoints(onChange) {
  if (!db) return () => {}
  const q = query(collection(db, BOARD_POINTS_COLLECTION), orderBy('createdAt', 'asc'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(mapBoardPoint))
  }, () => {})
}

export async function addBoardPoint(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, BOARD_POINTS_COLLECTION), {
    department: data.department || '',
    slNo: data.slNo || '',
    point: data.point || '',
    timeNeeded: data.timeNeeded || '',
    meetingDate: data.meetingDate || '',
    meetingId: data.meetingId || '',
    status: 'pending',
    createdAt: Timestamp.now(),
    createdBy: data.createdBy || 'unknown',
    // Additive audit fields alongside the existing email-string createdBy —
    // authenticated uid + display name, so a submission can be traced back to a
    // specific account even if their email changes later.
    createdByUid: data.createdByUid || '',
    authorName: data.authorName || '',
  })
  return ref.id
}

export async function updateBoardPoint(id, data) {
  if (!db || !id) return
  const payload = {}
  if (data.slNo !== undefined) payload.slNo = String(data.slNo)
  if (data.point !== undefined) payload.point = String(data.point)
  if (data.timeNeeded !== undefined) payload.timeNeeded = String(data.timeNeeded)
  if (data.meetingDate !== undefined) payload.meetingDate = String(data.meetingDate)
  if (data.meetingId !== undefined) payload.meetingId = String(data.meetingId)
  if (data.status !== undefined) payload.status = String(data.status)
  if (data.allottedTime !== undefined) payload.allottedTime = String(data.allottedTime)
  if (data.approvedBy !== undefined) payload.approvedBy = String(data.approvedBy)
  if (data.durationMinutes !== undefined) payload.durationMinutes = data.durationMinutes === null ? null : Number(data.durationMinutes)
  if (data.isActive !== undefined) payload.isActive = !!data.isActive
  if (data.presentStatus !== undefined) payload.presentStatus = String(data.presentStatus)
  if (data.presentStartedAt !== undefined) payload.presentStartedAt = data.presentStartedAt
  if (data.presentPausedElapsedSeconds !== undefined) payload.presentPausedElapsedSeconds = Number(data.presentPausedElapsedSeconds)
  if (Object.keys(payload).length) await updateDoc(doc(db, BOARD_POINTS_COLLECTION, id), payload)
}

export async function deleteBoardPoint(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, BOARD_POINTS_COLLECTION, id))
}

// Board Agenda's per-Sunday meeting Start Time — one small doc per date in the shared
// `sec_core` collection (same single-doc-per-key pattern as sec_core/director_board),
// covered by the existing sec_core/{docId} security rule, no new rules needed. Fixed
// point time windows are then computed live from this + each point's durationMinutes,
// never persisted per-point, so changing the start time recalculates everything.
export async function getSecCoreBoardMeetingStartTime(dateStr) {
  if (!db || !dateStr) return ''
  const snap = await getDoc(doc(db, SEC_CORE_COLLECTION, `board_agenda_${dateStr}`))
  return snap.exists() ? (snap.data().startTime || '') : ''
}

export async function setSecCoreBoardMeetingStartTime(dateStr, startTime, updatedBy) {
  if (!db || !dateStr) return
  await setDoc(doc(db, SEC_CORE_COLLECTION, `board_agenda_${dateStr}`), {
    date: dateStr,
    startTime: startTime || '',
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

// ─── Cross-collection sync (visitorId as the key) ─────────────────────────────

/** Find all cell group members across ALL cell groups that share a visitorId. */
export async function getCellMembersByVisitorId(visitorId) {
  if (!db || !visitorId) return []
  const q = query(collectionGroup(db, 'members'), where('visitorId', '==', visitorId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }))
}

/** Update name/phone on all cell members that share this visitorId. */
export async function updateCellMembersByVisitorId(visitorId, data) {
  if (!db || !visitorId) return
  const docs = await getCellMembersByVisitorId(visitorId)
  const payload = {}
  if (data.name  !== undefined) payload.name  = String(data.name)
  if (data.phone !== undefined) payload.phone = String(data.phone)
  if (data.birthday !== undefined) payload.birthday = data.birthday ? String(data.birthday).slice(0, 10) : ''
  if (data.displayName !== undefined) payload.displayName = String(data.displayName).trim()
  if (!Object.keys(payload).length) return
  await Promise.all(docs.map(d => updateDoc(d.ref, payload)))
}

/** Update name/phone on all caring_pcs entries that share this visitorId (and keep pcs_lookup in step). */
export async function updatePCSEntriesByVisitorId(visitorId, data) {
  if (!db || !visitorId) return
  const q = query(collection(db, CARING_PCS_COLLECTION), where('visitorId', '==', visitorId))
  const snap = await getDocs(q)
  const payload = {}
  if (data.name  !== undefined) payload.name  = String(data.name)
  if (data.phone !== undefined) payload.phone = String(data.phone)
  if (!Object.keys(payload).length) return
  await Promise.all(snap.docs.flatMap(d => [
    updateDoc(doc(db, CARING_PCS_COLLECTION, d.id), payload),
    setDoc(doc(db, PCS_LOOKUP_COLLECTION, d.id), payload, { merge: true }).catch(() => {}),
  ]))
}

/** Update name/phone on all department_team_members entries that share this visitorId. */
export async function updateDeptTeamMembersByVisitorId(visitorId, data) {
  if (!db || !visitorId) return
  const q = query(collection(db, 'department_team_members'), where('visitorId', '==', visitorId))
  const snap = await getDocs(q)
  const payload = {}
  if (data.name  !== undefined) payload.name  = String(data.name)
  if (data.phone !== undefined) payload.phone = String(data.phone)
  if (data.displayName !== undefined) payload.displayName = String(data.displayName).trim()
  if (!Object.keys(payload).length) return
  await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'department_team_members', d.id), payload)))
}

/** Update name/phone on all worship_team_members entries that share this visitorId. */
export async function updateWorshipTeamMembersByVisitorId(visitorId, data) {
  if (!db || !visitorId) return
  const q = query(collection(db, 'worship_team_members'), where('visitorId', '==', visitorId))
  const snap = await getDocs(q)
  const payload = {}
  if (data.name  !== undefined) payload.name  = String(data.name)
  if (data.phone !== undefined) payload.phone = String(data.phone)
  if (data.displayName !== undefined) payload.displayName = String(data.displayName).trim()
  if (!Object.keys(payload).length) return
  await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'worship_team_members', d.id), payload)))
}

/**
 * Single call to push a name/phone/dob change from any source to ALL linked records.
 * Call this whenever the canonical data changes in visitor entry, PCS, cell member,
 * or a department/worship team roster entry — keeps every denormalized copy in step
 * regardless of which screen the edit was made from.
 */
export async function syncVisitorDataEverywhere(visitorId, { name, phone, dob } = {}) {
  if (!db || !visitorId) return
  await Promise.all([
    name || phone || dob ? updateDelightVisitor(visitorId, { ...(name !== undefined && { name }), ...(phone !== undefined && { phone }), ...(dob !== undefined && { dob }) }) : Promise.resolve(),
    updateCellMembersByVisitorId(visitorId, { ...(name !== undefined && { name }), ...(phone !== undefined && { phone }), ...(dob !== undefined && { birthday: dob }) }),
    updatePCSEntriesByVisitorId(visitorId, { ...(name !== undefined && { name }), ...(phone !== undefined && { phone }) }),
    updateDeptTeamMembersByVisitorId(visitorId, { ...(name !== undefined && { name }), ...(phone !== undefined && { phone }) }),
    updateWorshipTeamMembersByVisitorId(visitorId, { ...(name !== undefined && { name }), ...(phone !== undefined && { phone }) }),
    // People's Directory records aren't keyed by visitorId (they predate that model), so the
    // only way to find a matching one from here is by phone — the same lookup the People's
    // Directory page itself uses to merge a visitor into a person row.
    name !== undefined && phone ? updatePeopleByPhone(phone, { name }) : Promise.resolve(),
  ])
}

/** Update the name on any People's Directory record sharing this phone number. Used when a
 *  name is corrected from somewhere OTHER than People's Directory (e.g. editing a cell
 *  member directly) — people/ docs have no visitorId field to look them up by otherwise. */
export async function updatePeopleByPhone(phone, data) {
  if (!db) return
  const cleanPhone = String(phone || '').replace(/\s+/g, '')
  if (!cleanPhone) return
  const payload = {}
  if (data.name !== undefined) payload.name = String(data.name)
  if (!Object.keys(payload).length) return
  const q = query(collection(db, PEOPLE_COLLECTION), where('phone', '==', cleanPhone))
  const snap = await getDocs(q)
  await Promise.all(snap.docs.map((d) => updateDoc(doc(db, PEOPLE_COLLECTION, d.id), payload)))
}

// ─── Member Profiles ─────────────────────────────────────────────────────────
// Document ID = visitorId for instant lookup without extra query.
// Stores fields that don't live in any other collection: baptism, marriage, director.
// phone/email/dob/nativity/currentPlace are mirrored here too (in addition to
// caring_pcs/people) because this is the only collection a Cell Leader can write to
// via a profile-fill invitation grant (see pcs_profile_grants in firestore.rules) —
// caring_pcs and people are gated to the Caring department.

const MEMBER_PROFILES_COLLECTION = 'member_profiles'

export async function getMemberProfile(visitorId) {
  if (!db || !visitorId) return null
  const snap = await getDoc(doc(db, MEMBER_PROFILES_COLLECTION, visitorId))
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    visitorId,
    phone:            d.phone            || '',
    email:            d.email            || '',
    dob:              d.dob              || '',
    nativity:         d.nativity         || '',
    currentPlace:     d.currentPlace     || '',
    gender:           d.gender           || '',
    baptised:         d.baptised         || '',
    baptismDate:      d.baptismDate      || '',
    baptismPlace:     d.baptismPlace     || '',
    baptismChurch:    d.baptismChurch    || '',
    // Written by a Caring Events baptism record (not edited on the PCS form).
    baptismBatch:     d.baptismBatch     || '',
    baptismSerialNo:  d.baptismSerialNo  || '',
    baptismOfficiant: d.baptismOfficiant || '',
    maritalStatus:    d.maritalStatus    || '',
    marriageDate:     d.marriageDate     || '',
    spouseName:       d.spouseName       || '',
    spouseVisitorId:  d.spouseVisitorId  || '',
    hasKids:          d.hasKids          || '',
    children:         Array.isArray(d.children) ? d.children : [],
    // Reverse side of an adult-child link: parents who listed this person as a
    // linked Adult Son/Daughter — [{ pcsEntryId, visitorId, name }].
    parents:          Array.isArray(d.parents) ? d.parents : [],
    // 'yes' | 'no' | '' — "Is this the first church they are attending?"; the two
    // previous-church fields only apply when 'no'.
    isFirstChurch:       d.isFirstChurch       || '',
    previousChurchName:  d.previousChurchName  || '',
    previousChurchPlace: d.previousChurchPlace || '',
    isDirector:       d.isDirector       || false,
    directorOf:       d.directorOf       || '',
    directorSince:    d.directorSince    || '',
    leaderSince:      d.leaderSince      || '',
    leaderUntil:      d.leaderUntil      || '',
    ministryNotes:    d.ministryNotes    || '',
    ministryHistory:  Array.isArray(d.ministryHistory) ? d.ministryHistory : [],
    membershipStatus: d.membershipStatus || '',
    membershipDocs:   Array.isArray(d.membershipDocs) ? d.membershipDocs : [],
    permanentAddress: d.permanentAddress || '',
    photoUrl:         d.photoUrl         || '',
    updatedAt:        toDate(d.updatedAt),
    updatedBy:        d.updatedBy        || '',
  }
}

// Lightweight bulk read for Family View grouping (First Lady hub) — just the
// relationship fields, not getMemberProfile()'s full per-person shape, since
// this reads every profile in the collection at once.
export async function getAllFamilyLinks() {
  if (!db) return new Map()
  const snap = await getDocs(collection(db, MEMBER_PROFILES_COLLECTION))
  const map = new Map()
  snap.docs.forEach((d) => {
    const data = d.data()
    map.set(d.id, {
      spouseVisitorId: data.spouseVisitorId || '',
      children: Array.isArray(data.children) ? data.children.filter((c) => c?.name) : [],
      gender: data.gender || '',
    })
  })
  return map
}

export async function upsertMemberProfile(visitorId, data, updatedBy = '') {
  if (!db || !visitorId) return
  const payload = {}
  const allowed = [
    'phone','email','dob','nativity','currentPlace','gender',
    'baptised','baptismDate','baptismPlace','baptismChurch','maritalStatus','marriageDate','spouseName','spouseVisitorId',
    'isDirector','directorOf','directorSince','leaderSince','leaderUntil','ministryNotes',
    'ministryHistory','membershipStatus','membershipDocs','permanentAddress','photoUrl',
    'hasKids','children','parents','isFirstChurch','previousChurchName','previousChurchPlace',
  ]
  for (const k of allowed) {
    if (data[k] !== undefined) payload[k] = data[k]
  }
  payload.updatedAt = Timestamp.now()
  payload.updatedBy = updatedBy
  await setDoc(doc(db, MEMBER_PROFILES_COLLECTION, visitorId), payload, { merge: true })
}

// Mirror (or undo) a parent → adult-child link onto the child's own member_profiles
// doc, so the child's profile shows "Parent: …". Read-modify-write on `parents`,
// keyed by the parent's PCS entry id so a later rename doesn't leave a stale twin.
export async function setParentLinkOnChild(childVisitorId, parent, linked, updatedBy = '') {
  if (!db || !childVisitorId || !parent?.pcsEntryId) return
  const ref = doc(db, MEMBER_PROFILES_COLLECTION, childVisitorId)
  const snap = await getDoc(ref)
  const current = snap.exists() && Array.isArray(snap.data().parents) ? snap.data().parents : []
  const others = current.filter((p) => p?.pcsEntryId !== parent.pcsEntryId)
  const next = linked
    ? [...others, { pcsEntryId: parent.pcsEntryId, visitorId: parent.visitorId || '', name: parent.name || '' }]
    : others
  if (!linked && next.length === current.length) return
  await setDoc(ref, { parents: next, updatedAt: Timestamp.now(), updatedBy }, { merge: true })
}

export async function uploadMemberPhoto(visitorId, file) {
  if (!storage || !visitorId || !file) return null
  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const storageRef = ref(storage, `member_photos/${visitorId}.${ext}`)
  const snap = await uploadBytes(storageRef, file, { contentType: file.type })
  return getDownloadURL(snap.ref)
}

// ─── People Directory (central people collection) ────────────────────────────
// Single source of truth for all personal data. PCS is the gatekeeper.

const PEOPLE_COLLECTION = 'people'

const PERSON_FIELDS = [
  'name', 'phone', 'email', 'dob', 'nativity', 'currentPlace', 'photoUrl',
  'firstVisitDate', 'serviceAttended', 'howKnown',
  'baptised', 'baptismDate', 'baptismPlace', 'baptismChurch',
  'maritalStatus', 'marriageDate', 'spouseName', 'spousePersonId',
  'membershipStatus', 'membershipNumber', 'permanentAddress',
  'leadershipPosition', 'ministries', 'stage',
]

export async function addPerson(data, addedBy = '') {
  if (!db) return null
  const payload = {
    addedAt: serverTimestamp(),
    addedBy,
    createdSource: data.createdSource || 'pcs_direct',
    lastUpdatedAt: serverTimestamp(),
    lastUpdatedBy: addedBy,
  }
  PERSON_FIELDS.forEach(f => {
    if (data[f] !== undefined) payload[f] = data[f]
    else if (f === 'ministries') payload[f] = []
    else if (f === 'stage') payload[f] = 'visitor'
    else payload[f] = ''
  })
  const ref = await addDoc(collection(db, PEOPLE_COLLECTION), payload)
  return ref.id
}

export async function updatePerson(personId, data, updatedBy = '') {
  if (!db || !personId) return
  const payload = { lastUpdatedAt: serverTimestamp(), lastUpdatedBy: updatedBy }
  PERSON_FIELDS.forEach(f => { if (data[f] !== undefined) payload[f] = data[f] })
  await updateDoc(doc(db, PEOPLE_COLLECTION, personId), payload)
}

export async function getPerson(personId) {
  if (!db || !personId) return null
  const snap = await getDoc(doc(db, PEOPLE_COLLECTION, personId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function getPeople() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, PEOPLE_COLLECTION), orderBy('name')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllDepartmentTeamMembers() {
  if (!db) return []
  const snap = await getDocs(collection(db, 'department_team_members'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllWorshipTeamMembers() {
  if (!db) return []
  const snap = await getDocs(collection(db, 'worship_team_members'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Merged People Directory ───────────────────────────────────────────────────
// "Everybody" in this app isn't just the `people` collection — most members only
// ever show up as a cell_members row, a department/worship team row, or a legacy
// PCS/D-Light-visitor record. This merges all of those (deduped by phone/personId/
// visitorId, same as PeopleDirectory.jsx's own list) into one searchable roster,
// so any "search the People Directory" picker sees the same "everybody" the
// People Directory page does instead of just the sparse `people` collection.
// Every source below is read with a fallback to [] so one unavailable collection can't
// blank the whole directory. But a *silent* fallback is how a permission-denied rule
// turned into "those people just don't exist in search" with nothing in the console to
// explain it — the D Light visitor-entry outage that made people unfindable for any
// department outside the old delight_visitors allow-list. Log loudly instead: the
// directory still degrades gracefully, but the reason is visible in the console.
function directorySource(label, promise) {
  return promise.catch((err) => {
    console.error(
      `[PeopleDirectory] Source "${label}" failed to load — these people will be MISSING ` +
      `from directory search. Usually a Firestore rules permission-denied for this user's ` +
      `department; see the read rule for this collection in firestore.rules.`,
      err
    )
    return []
  })
}

export async function getMergedPeopleDirectory() {
  const [people, cellMembers, pcsEntries, deptTeams, worshipTeams, cellGroups, visitors, sundayAttendance] = await Promise.all([
    directorySource('people', getPeople()),
    directorySource('cell members', getAllCellGroupMembers()),
    // Active + inactive (soft-deleted) PCS entries both — this is the "everybody in
    // the church's records" directory (see comment at its call sites), so someone
    // removed from active pastoral care tracking should still be findable here, not
    // silently dropped the way getPCSEntries() alone drops them for the PCS list view.
    Promise.all([
      directorySource('PCS entries (active)', getPCSEntries()),
      directorySource('PCS entries (inactive)', getInactivePCSEntries()),
    ]).then(([active, inactive]) => [...active, ...inactive]),
    directorySource('department team members', getAllDepartmentTeamMembers()),
    directorySource('worship team members', getAllWorshipTeamMembers()),
    directorySource('cell groups', getCellGroups('Cell')),
    directorySource('D Light visitor entries', getDelightVisitors()),
    directorySource('Sunday attendance', getAllPersonSundayAttendance()),
  ])

  const cellById = {}
  cellGroups.forEach(c => { cellById[c.id] = c })

  const nameKey = (n) => String(n || '').trim().toLowerCase()

  // Build from people collection (primary source — written by PCS)
  const byId = {}
  // Also index by phone for visitor merging (phone is the best legacy key)
  const byPhone = {}
  // Last-resort match for records with no personId/visitorId/phone at all (e.g. a
  // cell member added by typing just a name) — better than silently dropping them.
  const byName = {}
  people.forEach(p => {
    const entry = {
      _key: p.id,
      personId: p.id,
      name: p.name || '',
      phone: p.phone || '',
      email: p.email || '',
      dob: p.dob || '',
      attendedDate: p.firstVisitDate || '',
      serviceAttended: p.serviceAttended || '',
      howKnown: p.howKnown || '',
      nativity: p.nativity || '',
      currentPlace: p.currentPlace || '',
      baptised: p.baptised || '',
      maritalStatus: p.maritalStatus || '',
      membershipStatus: p.membershipStatus || '',
      membershipNumber: p.membershipNumber || '',
      leadershipPosition: p.leadershipPosition || '',
      ministries: p.ministries || [],
      stage: p.stage || 'visitor',
      cells: [],
      pcs: null,
      deptTeams: [],
      worshipTeams: [],
      source: 'people',
      _origin: p,
      _visitorIds: [],
      sundayAttendance: [],
    }
    byId[p.id] = entry
    if (p.phone) byPhone[p.phone.replace(/\s+/g, '')] = entry
    const nk = nameKey(entry.name)
    if (nk && !byName[nk]) byName[nk] = entry
  })

  // Attach PCS entries (match by personId, fall back to unlinked)
  const unlinked = []
  pcsEntries.forEach(p => {
    if (p.personId && byId[p.personId]) {
      byId[p.personId].pcs = p
    } else if (!p.personId) {
      unlinked.push(p)
    }
  })

  // Start merged from people collection entries
  const merged = Object.values(byId)

  // Unlinked PCS entries (no personId yet — legacy records)
  unlinked.forEach(p => {
    const phone = (p.phone || '').replace(/\s+/g, '')
    if (phone && byPhone[phone]) {
      byPhone[phone].pcs = p
      return
    }
    const entry = {
      _key: 'pcs-' + p.id,
      personId: null,
      name: p.name || '',
      phone: p.phone || '',
      email: '',
      dob: '',
      attendedDate: p.attendedDate || '',
      serviceAttended: p.serviceAttended || '',
      howKnown: '',
      nativity: '',
      currentPlace: '',
      baptised: '',
      maritalStatus: '',
      membershipStatus: p.membershipStatus || '',
      membershipNumber: p.membershipNumber || '',
      leadershipPosition: p.leadershipPosition || '',
      ministries: p.ministries || [],
      stage: 'pcs',
      cells: [],
      pcs: p,
      deptTeams: [],
      worshipTeams: [],
      source: 'pcs-legacy',
      _origin: p,
      _visitorIds: [],
      sundayAttendance: [],
    }
    merged.push(entry)
    if (phone) byPhone[phone] = entry
    const nk = nameKey(entry.name)
    if (nk && !byName[nk]) byName[nk] = entry
  })

  // D-Light visitors — process BEFORE cell/dept/worship attachment so we can build byVisitorId
  const byVisitorId = {}
  visitors.forEach(v => {
    const phone = (v.phone || '').replace(/\s+/g, '')
    if (phone && byPhone[phone]) {
      const existing = byPhone[phone]
      if (!existing.attendedDate && v.attendedDate) existing.attendedDate = v.attendedDate
      if (!existing.serviceAttended && v.serviceAttended) existing.serviceAttended = v.serviceAttended
      if (!existing.howKnown && v.howKnown) existing.howKnown = v.howKnown
      existing._visitorIds.push(v.id)
      byVisitorId[v.id] = existing
      return
    }
    const entry = {
      _key: 'vis-' + v.id,
      personId: null,
      name: v.name || '',
      phone: v.phone || '',
      email: v.email || '',
      dob: v.dob || '',
      attendedDate: v.attendedDate || '',
      serviceAttended: v.serviceAttended || '',
      howKnown: v.howKnown || '',
      nativity: v.nativity || '',
      currentPlace: v.currentPlace || '',
      baptised: '',
      maritalStatus: '',
      membershipStatus: '',
      membershipNumber: '',
      leadershipPosition: '',
      ministries: [],
      stage: 'visitor',
      cells: [],
      pcs: null,
      deptTeams: [],
      worshipTeams: [],
      source: 'visitor',
      _origin: v,
      _visitorIds: [v.id],
      sundayAttendance: [],
    }
    merged.push(entry)
    if (phone) byPhone[phone] = entry
    byVisitorId[v.id] = entry
    const nk = nameKey(entry.name)
    if (nk && !byName[nk]) byName[nk] = entry
  })

  // Match a cell/dept/worship team record to an existing merged entry (personId →
  // visitorId → phone → name, in order of reliability) or, failing all of those,
  // create a standalone entry from the record's own name/phone. Team rosters are
  // very often filled in by typing a name directly (no personId/visitorId link at
  // all — cell_members rows in particular never carry a personId, and
  // worship_team_members never persists a visitorId), so without this fallback
  // those people were silently missing from the directory entirely instead of
  // just missing their team tag.
  function attachTeamRecord(record, { source }) {
    const phone = (record.phone || '').replace(/\s+/g, '')
    let entry = (record.personId && byId[record.personId]) || (record.visitorId && byVisitorId[record.visitorId])
    if (!entry && phone) entry = byPhone[phone]
    if (!entry) {
      const nk = nameKey(record.name)
      if (nk) entry = byName[nk]
    }
    if (!entry && record.name) {
      entry = {
        _key: `${source}-${record.id}`,
        personId: null,
        name: record.name || '',
        phone: record.phone || '',
        email: '',
        dob: '',
        attendedDate: '',
        serviceAttended: '',
        howKnown: '',
        nativity: '',
        currentPlace: '',
        baptised: '',
        maritalStatus: '',
        membershipStatus: '',
        membershipNumber: '',
        leadershipPosition: '',
        ministries: [],
        stage: 'visitor',
        cells: [],
        pcs: null,
        deptTeams: [],
        worshipTeams: [],
        source,
        _origin: record,
        _visitorIds: [],
        sundayAttendance: [],
      }
      merged.push(entry)
      if (phone) byPhone[phone] = entry
      const nk = nameKey(entry.name)
      if (nk && !byName[nk]) byName[nk] = entry
    }
    return entry
  }

  // Attach cell memberships
  cellMembers.forEach(m => {
    const entry = attachTeamRecord(m, { source: 'cell-member' })
    if (!entry) return
    const cell = cellById[m.cellId]
    entry.cells.push({ ...m, cellName: cell?.cellName || m.cellId, leader: cell?.leader || '', leaderPersonId: cell?.leaderPersonId || '' })
  })

  // Attach dept teams
  deptTeams.forEach(t => {
    const entry = attachTeamRecord(t, { source: 'dept-team' })
    if (!entry) return
    entry.deptTeams.push(t)
  })

  // Attach worship teams
  worshipTeams.forEach(t => {
    const entry = attachTeamRecord(t, { source: 'worship-team' })
    if (!entry) return
    entry.worshipTeams.push(t)
  })

  // Attach Sunday attendance records (linked from Live Control's "Others" section)
  sundayAttendance.forEach(a => {
    const entry = (a.personId && byId[a.personId]) || (a.visitorId && byVisitorId[a.visitorId])
    if (!entry) return
    entry.sundayAttendance.push(a.date)
  })

  // Visitor-first audit: does this person have a D-Light visitor record at all?
  // Linked via a matched visitor, their PCS entry, or any roster row's visitorId.
  merged.forEach(e => {
    e.hasVisitorRecord = e._visitorIds.length > 0 || !!e.pcs?.visitorId ||
      e.cells.some(c => c.visitorId) || e.deptTeams.some(t => t.visitorId) || e.worshipTeams.some(t => t.visitorId)
  })

  // Sort final merged list by date descending
  merged.sort((a, b) => {
    const da = a.attendedDate ? new Date(a.attendedDate).getTime() : 0
    const db2 = b.attendedDate ? new Date(b.attendedDate).getTime() : 0
    return db2 - da
  })

  return {
    people: merged,
    cellGroups,
    sourceCounts: {
      people: people.length,
      cellMembers: cellMembers.length,
      pcsEntries: pcsEntries.length,
      deptTeams: deptTeams.length,
      worshipTeams: worshipTeams.length,
      visitors: visitors.length,
    },
  }
}

/**
 * Former Worship members whose leaving date was never stamped (`formerSince` — the
 * Worship module's "date moved to Former") get `lastWorshipActivityDate`: the most
 * recent rehearsal they were marked present at. PCS uses it as the end of their
 * Worship tenure instead of "end not recorded". Mutates the given team docs.
 */
async function attachLastWorshipActivity(worshipTeams) {
  const needs = worshipTeams.filter(t => (t.isFormer || t.status === 'former') && !t.formerSince && !t.formerDate)
  if (!needs.length) return
  const departments = [...new Set(needs.map(t => t.department || 'Worship'))]
  const rehearsalsByDept = new Map(await Promise.all(departments.map(async (dept) => [dept, await getWorshipRehearsals(dept).catch(() => [])])))
  needs.forEach(t => {
    const nm = String(t.name || '').trim().toLowerCase()
    let last = ''
    for (const r of rehearsalsByDept.get(t.department || 'Worship') || []) {
      const a = r.attendance?.[t.id]
      const present = a?.present || Object.values(r.attendance || {}).some(x => x?.present && nm && String(x.memberName || '').trim().toLowerCase() === nm)
      const date = String(r.date || '').slice(0, 10)
      if (present && date > last) last = date
    }
    if (last) t.lastWorshipActivityDate = last
  })
}

export async function getMemberProfileWithContext(visitorId, phone, personId, name) {
  if (!db || !visitorId) return null
  const safe = (p) => p.catch(() => null)
  const normalPhone = (phone || '').replace(/\s+/g, '')

  const queries = [
    safe(getMemberProfile(visitorId)),
    safe(getDocs(query(collection(db, 'department_team_members'), where('visitorId', '==', visitorId)))),
    safe(getDocs(query(collection(db, 'worship_team_members'),    where('visitorId', '==', visitorId)))),
    normalPhone ? safe(getDocs(query(collection(db, 'department_team_members'), where('phone', '==', normalPhone)))) : Promise.resolve(null),
    normalPhone ? safe(getDocs(query(collection(db, 'worship_team_members'),    where('phone', '==', normalPhone)))) : Promise.resolve(null),
    safe(getDoc(doc(db, SEC_CORE_COLLECTION, 'director_board'))),
  ]
  const [profile, deptById, worshipById, deptByPhone, worshipByPhone, boardSnap] = await Promise.all(queries)

  // Merge visitorId results + phone results, deduplicate by doc id
  const mergeDocs = (snapA, snapB) => {
    const seen = new Set()
    const out = []
    for (const snap of [snapA, snapB]) {
      if (!snap) continue
      for (const d of snap.docs) {
        if (!seen.has(d.id)) { seen.add(d.id); out.push({ id: d.id, ...d.data() }) }
      }
    }
    return out
  }

  // Find this person's entries in the Sec Core director board
  const boardMembers = boardSnap?.exists() ? (boardSnap.data().members || []) : []
  const nameLower = (name || '').toLowerCase().trim()
  const secCoreRoles = boardMembers.filter(m =>
    (personId && m.personId && m.personId === personId) ||
    (nameLower && m.name?.toLowerCase().trim() === nameLower)
  )

  const worshipTeams = mergeDocs(worshipById, worshipByPhone)
  await attachLastWorshipActivity(worshipTeams)

  return {
    profile:      profile || {},
    deptTeams:    mergeDocs(deptById, deptByPhone),
    worshipTeams,
    secCoreRoles,
  }
}

// ─── PCS Fill Invitations ─────────────────────────────────────────────────────
// Caring Director sends a profile-fill invitation to the Cell Leader of a PCS person.

const PCS_FILL_INVITATIONS = 'pcs_fill_invitations'
const PCS_PROFILE_GRANTS = 'pcs_profile_grants'

export async function sendPCSFillInvitation({ pcsEntryId, visitorId, personName, cellId, cellName, cellLeaderName, sentBy }) {
  if (!db || !pcsEntryId || !cellId) return null
  const ref = await addDoc(collection(db, PCS_FILL_INVITATIONS), {
    pcsEntryId,
    visitorId:       visitorId       || '',
    personName:      personName      || '',
    cellId,
    cellName:        cellName        || '',
    cellLeaderName:  cellLeaderName  || '',
    sentBy:          sentBy          || '',
    sentAt:          Timestamp.now(),
    status:          'pending',
  })
  // Create a write-grant so the cell leader can write to member_profiles/{visitorId}
  if (visitorId) {
    await setDoc(doc(db, PCS_PROFILE_GRANTS, visitorId), {
      cellId,
      grantedAt: Timestamp.now(),
      invitationId: ref.id,
    })
  }
  return ref.id
}

export async function getPCSFillInvitationByEntry(pcsEntryId) {
  if (!db || !pcsEntryId) return null
  // Check for any invitation (pending or completed) for this entry
  const q = query(collection(db, PCS_FILL_INVITATIONS), where('pcsEntryId', '==', pcsEntryId), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  const data = d.data()
  return { id: d.id, ...data, sentAt: toDate(data.sentAt), completedAt: toDate(data.completedAt) }
}

// Direct by-id fetch, independent of the viewer's own cellId — used for the To-Do
// List's deep link (?openFillInvite=), which any Cell-department-visible user
// (Director, Founder) can click even though the cell-scoped subscription below only
// ever returns invitations for the *viewer's own* cell (i.e. only ever populated for
// the specific Cell Leader it was addressed to).
export async function getPCSFillInvitationById(id) {
  if (!db || !id) return null
  const snap = await getDoc(doc(db, PCS_FILL_INVITATIONS, id))
  if (!snap.exists()) return null
  const data = snap.data()
  return { id: snap.id, ...data, sentAt: toDate(data.sentAt), completedAt: toDate(data.completedAt) }
}

export function subscribePCSFillInvitationsByCellId(cellId, onChange) {
  if (!db || !cellId) return () => {}
  const q = query(
    collection(db, PCS_FILL_INVITATIONS),
    where('cellId', '==', cellId),
    where('status', '==', 'pending')
  )
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(d => {
      const data = d.data()
      return { id: d.id, ...data, sentAt: toDate(data.sentAt) }
    }))
  }, () => {})
}

// ─── PCS removal notices (Caring → Cell Leader) ──────────────────────────────
// Written when Caring removes someone from PCS who is on an active cell roster, so
// that cell's leader is told (bell item) and the roster card shows "Removed from
// PCS" with a one-tap "Remove from Cell". status: 'pending' → 'resolved' once the
// leader acts on it (removed / requested removal from the cell).
const PCS_REMOVAL_NOTICES = 'pcs_removal_notices'

export async function createPCSRemovalNotice({ pcsEntryId, visitorId, personName, phone, cellId, cellName, cellMemberId, removedBy }) {
  if (!db || !cellId) return null
  const ref = await addDoc(collection(db, PCS_REMOVAL_NOTICES), {
    pcsEntryId: pcsEntryId || '',
    visitorId: visitorId || '',
    personName: personName || '',
    phone: phone || '',
    cellId,
    cellName: cellName || '',
    cellMemberId: cellMemberId || '',
    removedBy: removedBy || '',
    status: 'pending',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

/** Every notice for one cell (pending + resolved) — the roster tag uses both. */
export function subscribePCSRemovalNoticesByCellId(cellId, onChange) {
  if (!db || !cellId) { onChange([]); return () => {} }
  const q = query(collection(db, PCS_REMOVAL_NOTICES), where('cellId', '==', cellId))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, createdAt: toDate(data.createdAt) }
    }))
  }, (err) => { console.error('subscribePCSRemovalNoticesByCellId:', err); onChange([]) })
}

export async function resolvePCSRemovalNotice(id, resolvedBy = '') {
  if (!db || !id) return
  await updateDoc(doc(db, PCS_REMOVAL_NOTICES, id), {
    status: 'resolved',
    resolvedBy: resolvedBy || '',
    resolvedAt: Timestamp.now(),
  })
}

export async function completePCSFillInvitation(id, filledBy = '', visitorId = '') {
  if (!db || !id) return
  await updateDoc(doc(db, PCS_FILL_INVITATIONS, id), {
    status:      'completed',
    completedAt: Timestamp.now(),
    filledBy,
  })
  // Revoke the write-grant so the cell leader can no longer write to member_profiles
  if (visitorId) {
    await deleteDoc(doc(db, PCS_PROFILE_GRANTS, visitorId))
  }
}

// ─── Cell Report Reminders (Director → Cell Leader, in-app) ───────────────────
const CELL_REPORT_REMINDERS = 'cell_report_reminders'

export async function createCellReportReminder({ cellId, cellName, expectedDate, leaderName, sentBy, sentByName }) {
  if (!db || !cellId) return null
  const ref = await addDoc(collection(db, CELL_REPORT_REMINDERS), {
    cellId,
    cellName:     cellName     || '',
    expectedDate: expectedDate || '',
    leaderName:   leaderName   || '',
    sentBy:       sentBy       || '',
    sentByName:   sentByName   || '',
    sentAt:       Timestamp.now(),
    status:       'unread',
  })
  return ref.id
}

export function subscribeCellReportRemindersByCellId(cellId, onChange) {
  if (!db || !cellId) return () => {}
  const q = query(
    collection(db, CELL_REPORT_REMINDERS),
    where('cellId', '==', cellId),
    where('status', '==', 'unread')
  )
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(d => {
      const data = d.data()
      return { id: d.id, ...data, sentAt: toDate(data.sentAt) }
    }))
  }, () => {})
}

export async function dismissCellReportReminder(id) {
  if (!db || !id) return
  await updateDoc(doc(db, CELL_REPORT_REMINDERS, id), { status: 'read', readAt: Timestamp.now() })
}

// ─── PCS Add Notifications (Cell → Caring) ────────────────────────────────────
const PCS_ADD_NOTIFICATIONS = 'pcs_add_notifications'

export async function createPCSAddNotification({ visitorId, memberName, memberPhone, cellId, cellName, sentBy, sentByName }) {
  if (!db) return
  return addDoc(collection(db, PCS_ADD_NOTIFICATIONS), {
    visitorId:   visitorId   || '',
    memberName:  memberName  || '',
    memberPhone: memberPhone || '',
    cellId:      cellId      || '',
    cellName:    cellName    || '',
    sentBy:      sentBy      || '',
    sentByName:  sentByName  || '',
    sentAt:      Timestamp.now(),
    status:      'pending',
  })
}

export function subscribePCSAddNotifications(onChange) {
  if (!db) return () => {}
  const q = query(collection(db, PCS_ADD_NOTIFICATIONS), where('status', '==', 'pending'))
  return onSnapshot(q, snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
}

export async function completePCSAddNotification(id) {
  if (!db || !id) return
  await updateDoc(doc(db, PCS_ADD_NOTIFICATIONS, id), { status: 'added', completedAt: Timestamp.now() })
}

export async function dismissPCSAddNotification(id) {
  if (!db || !id) return
  await updateDoc(doc(db, PCS_ADD_NOTIFICATIONS, id), { status: 'dismissed' })
}

// Records that Caring asked D-Light to register this person — the notification stays
// 'pending' (still shown, still actionable) until they're actually added to PCS; this
// only flips the status message shown in the meantime.
export async function markPCSAddNotificationForwarded(id) {
  if (!db || !id) return
  await updateDoc(doc(db, PCS_ADD_NOTIFICATIONS, id), { forwardedToDLight: true, forwardedAt: Timestamp.now() })
}

// ─── Cell Leader Notes to Director (Cell Leader → Cell Director, per-member) ──
const CELL_LEADER_DIRECTOR_NOTES = 'cell_leader_director_notes'

export async function createCellLeaderDirectorNote({ cellId, cellName, memberId, memberName, memberPhone, tags, message, sentBy, sentByName }) {
  if (!db) return null
  const ref = await addDoc(collection(db, CELL_LEADER_DIRECTOR_NOTES), {
    cellId:      cellId      || '',
    cellName:    cellName    || '',
    memberId:    memberId    || '',
    memberName:  memberName  || '',
    memberPhone: memberPhone || '',
    tags:        Array.isArray(tags) ? tags : [],
    message:     String(message || '').trim(),
    sentBy:      sentBy      || '',
    sentByName:  sentByName  || '',
    sentAt:      Timestamp.now(),
    status:      'unread',
  })
  return ref.id
}

export function subscribeCellLeaderDirectorNotes(onChange) {
  if (!db) return () => {}
  const q = query(collection(db, CELL_LEADER_DIRECTOR_NOTES), where('status', '==', 'unread'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, sentAt: toDate(data.sentAt) }
    }))
  }, () => {})
}

export async function markCellLeaderDirectorNoteRead(id) {
  if (!db || !id) return
  await updateDoc(doc(db, CELL_LEADER_DIRECTOR_NOTES, id), { status: 'read', readAt: Timestamp.now() })
}

// ─── Cell Visitor Proposals (Cell → D-Light) ──────────────────────────────────
const CELL_VISITOR_PROPOSALS = 'cell_visitor_proposals'

export async function createCellVisitorProposal({ visitorName, phone, cellId, cellName, reportId, reportDate, sentBy, sentByName }) {
  if (!db) return
  return addDoc(collection(db, CELL_VISITOR_PROPOSALS), {
    visitorName:  visitorName  || '',
    phone:        phone        || '',
    cellId:       cellId       || '',
    cellName:     cellName     || '',
    reportId:     reportId     || '',
    reportDate:   reportDate   || '',
    sentBy:       sentBy       || '',
    sentByName:   sentByName   || '',
    status:       'pending',
    createdAt:    Timestamp.now(),
  })
}

export function subscribeCellVisitorProposals(onChange) {
  if (!db) return () => {}
  const q = query(collection(db, CELL_VISITOR_PROPOSALS), where('status', '==', 'pending'))
  return onSnapshot(q, snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
}

export async function completeCellVisitorProposal(id) {
  if (!db || !id) return
  await updateDoc(doc(db, CELL_VISITOR_PROPOSALS, id), { status: 'completed', completedAt: Timestamp.now() })
}

export async function dismissCellVisitorProposal(id) {
  if (!db || !id) return
  await updateDoc(doc(db, CELL_VISITOR_PROPOSALS, id), { status: 'dismissed' })
}

export async function getCellVisitorProposalsByReport(reportId) {
  if (!db || !reportId) return []
  const q = query(collection(db, CELL_VISITOR_PROPOSALS), where('reportId', '==', reportId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ─── Direct Messaging ───────────────────────────────────────────────────────
// Lightweight 1-to-1 chat between any two signed-in users. `user_directory` is a
// denormalized, publicly-readable subset of `users` (name/email/role/department —
// no phone/membershipNumber) so any user can search for who to message without
// the /users read restriction getting in the way. See firestore.rules.

const USER_DIRECTORY = 'user_directory'
const CONVERSATIONS = 'conversations'

export async function upsertUserDirectoryEntry(uid, { name, email, role, department, departments, status } = {}) {
  if (!db || !uid) return
  await setDoc(doc(db, USER_DIRECTORY, uid), {
    uid,
    name: name || '',
    email: (email || '').toLowerCase(),
    role: role || '',
    department: department || '',
    departments: Array.isArray(departments) ? departments : [],
    status: status || 'active',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

export function subscribeUserDirectory(onChange) {
  if (!db) return () => {}
  return onSnapshot(collection(db, USER_DIRECTORY), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, () => {})
}

// Backfills user_directory from the full `users` collection. Only succeeds for
// callers with Firestore-level full access (Founder — see isFullAccess() in
// firestore.rules); getAllUsers() throws permission-denied for everyone else,
// which callers should catch and ignore. Used to auto-populate the directory
// (on Founder login, and again defensively when the "new message" picker is
// opened) so the search list isn't stuck empty just because `user_directory`
// hasn't caught up with `users` yet. Returns the synced rows for callers that
// want to render them immediately without waiting on the user_directory listener.
export async function syncAllUsersToDirectory() {
  if (!db || !functions) return []
  // Runs server-side via Admin SDK (Cloud Function), so it works for any signed-in
  // caller — including Cell Leaders/Directors who can't list the full `users`
  // collection themselves under firestore.rules. See functions/index.js.
  await httpsCallable(functions, 'syncUserDirectory')()
  const snap = await getDocs(collection(db, USER_DIRECTORY))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

function directConversationId(uidA, uidB) {
  return [uidA, uidB].sort().join('_')
}

export async function getOrCreateDirectConversation(uidA, nameA, uidB, nameB) {
  if (!db || !uidA || !uidB) return null
  const conversationId = directConversationId(uidA, uidB)
  await setDoc(doc(db, CONVERSATIONS, conversationId), {
    participantIds: [uidA, uidB],
    participantNames: { [uidA]: nameA || '', [uidB]: nameB || '' },
    unreadCounts: { [uidA]: 0, [uidB]: 0 },
    createdAt: Timestamp.now(),
  }, { merge: true })
  return conversationId
}

export function subscribeUserConversations(uid, onChange) {
  if (!db || !uid) return () => {}
  const q = query(collection(db, CONVERSATIONS), where('participantIds', 'array-contains', uid))
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, lastMessageAt: toDate(data.lastMessageAt) }
    })
    rows.sort((a, b) => (b.lastMessageAt?.getTime?.() || 0) - (a.lastMessageAt?.getTime?.() || 0))
    onChange(rows)
  }, () => {})
}

export function subscribeConversationMessages(conversationId, onChange) {
  if (!db || !conversationId) return () => {}
  const q = query(collection(db, CONVERSATIONS, conversationId, 'messages'), orderBy('createdAt', 'asc'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, createdAt: toDate(data.createdAt) }
    }))
  }, () => {})
}

export async function sendDirectMessage(conversationId, { senderId, senderName, text }) {
  if (!db || !conversationId || !senderId || !text?.trim()) return
  const convoRef = doc(db, CONVERSATIONS, conversationId)
  const convoSnap = await getDoc(convoRef)
  const participantIds = convoSnap.exists() ? (convoSnap.data().participantIds || []) : []
  const otherId = participantIds.find((id) => id !== senderId)

  await addDoc(collection(db, CONVERSATIONS, conversationId, 'messages'), {
    senderId,
    senderName: senderName || '',
    text: text.trim(),
    createdAt: Timestamp.now(),
  })

  const update = {
    lastMessageText: text.trim(),
    lastMessageAt: Timestamp.now(),
    lastMessageSenderId: senderId,
  }
  if (otherId) update[`unreadCounts.${otherId}`] = increment(1)
  await updateDoc(convoRef, update)
}

export async function markConversationRead(conversationId, uid) {
  if (!db || !conversationId || !uid) return
  await updateDoc(doc(db, CONVERSATIONS, conversationId), { [`unreadCounts.${uid}`]: 0 })
}

// ─── Dismissed Notifications (per-user "Ignore" on the bell dropdown) ─────────
// Notifications are synthesized client-side from several source collections
// (pcs_fill_invitations, cell visitor proposals, D-Light consult tasks). Dismissing
// one from the bell must not touch that underlying business record — it only hides
// the alert from this user's own feed, so this is a small independent overlay collection.
const DISMISSED_NOTIFICATIONS = 'dismissed_notifications'

export async function dismissNotification(uid, notificationId) {
  if (!db || !uid || !notificationId) return
  await setDoc(doc(db, DISMISSED_NOTIFICATIONS, `${uid}_${notificationId}`), {
    uid,
    notificationId,
    dismissedAt: Timestamp.now(),
  })
}

export function subscribeDismissedNotificationIds(uid, onChange) {
  if (!db || !uid) return () => {}
  const q = query(collection(db, DISMISSED_NOTIFICATIONS), where('uid', '==', uid))
  return onSnapshot(q, (snap) => {
    onChange(new Set(snap.docs.map((d) => d.data().notificationId)))
  }, () => {})
}

// Per-user "already added to To-Do" flag — separate from dismissal. Adding a
// notification to the To-Do list does NOT remove it from the bell (only Ignore does);
// this just persists which ones already have a task so the button can permanently
// switch to a disabled "✓ Added" state (survives dropdown close/reopen and reload,
// and prevents creating duplicate task docs from repeated clicks).
const NOTIFICATION_TODO_ADDITIONS = 'notification_todo_additions'

export async function markNotificationAddedToTodo(uid, notificationId) {
  if (!db || !uid || !notificationId) return
  await setDoc(doc(db, NOTIFICATION_TODO_ADDITIONS, `${uid}_${notificationId}`), {
    uid,
    notificationId,
    addedAt: Timestamp.now(),
  })
}

export function subscribeNotificationTodoAdditionIds(uid, onChange) {
  if (!db || !uid) return () => {}
  const q = query(collection(db, NOTIFICATION_TODO_ADDITIONS), where('uid', '==', uid))
  return onSnapshot(q, (snap) => {
    onChange(new Set(snap.docs.map((d) => d.data().notificationId)))
  }, () => {})
}

// ─── Cell Director Cockpit: "Unassigned" card dismissal ───────────────────────
// The Sunday-attendance-derived Unassigned cards have no task/member doc of their
// own — they're just a name diffed out of Sunday attendance vs. cell rosters — so
// dismissing one needs its own small durable record, shared across all Cell
// Directors (doc id = normalized lowercase name).
const CELL_UNASSIGNED_DISMISSALS = 'cell_unassigned_dismissals'

export async function dismissUnassignedPerson(nameKey, dismissedBy = '') {
  if (!db || !nameKey) return
  await setDoc(doc(db, CELL_UNASSIGNED_DISMISSALS, nameKey), {
    nameKey,
    dismissedBy,
    dismissedAt: Timestamp.now(),
  })
}

/** Undo a dismissUnassignedPerson() call — removes the durable dismissal record. */
export async function undismissUnassignedPerson(nameKey) {
  if (!db || !nameKey) return
  await deleteDoc(doc(db, CELL_UNASSIGNED_DISMISSALS, nameKey))
}

export function subscribeCellUnassignedDismissals(onChange) {
  if (!db) return () => {}
  return onSnapshot(collection(db, CELL_UNASSIGNED_DISMISSALS), (snap) => {
    onChange(new Set(snap.docs.map((d) => d.id)))
  }, () => {})
}

// ─── Founder Worklist Sheet ─────────────────────────────────────────────────
// Digitized version of the Founder's handwritten Worklist Sheet: each doc is one
// "page" of up to WORKLIST_ROWS_PER_SHEET rows (No/Date/Work/RMRK). Pages fill
// automatically — see the auto-page-creation effect in WorklistSheet.jsx — so
// there's no manual "add page" step. Shared across all Founder accounts — not
// per-user. See docs/superpowers/specs/2026-08-20-founder-worklist-sheet-design.md
// for the full design.
const WORKLIST_SHEETS = 'worklist_sheets'
export const WORKLIST_ROWS_PER_SHEET = 30

function makeWorklistRows() {
  return Array.from({ length: WORKLIST_ROWS_PER_SHEET }, (_, i) => ({
    no: i + 1,
    date: '',
    work: '',
    doneDate: '',
    department: '',
  }))
}

export function subscribeWorklistSheets(onChange) {
  if (!db) return () => {}
  const q = query(collection(db, WORKLIST_SHEETS), orderBy('order'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, () => {})
}

export async function createWorklistSheet(order, label) {
  const ref = await addDoc(collection(db, WORKLIST_SHEETS), {
    order,
    label,
    rows: makeWorklistRows(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

// Firestore's dotted-path update syntax (`updateDoc(ref, {'a.b.c': v})`) only descends
// through nested MAPS — it can't index into an array element. `rows` is an array, so a
// path like `rows.5.work` doesn't reach into it; Firestore instead writes a literal map
// key named "5" onto the `rows` field, silently turning it from an array into a map and
// breaking every reader that expects `rows.forEach` to exist. The fix is a normal
// read-modify-write on the whole `rows` array — callers pass the current `rows` array
// (already in hand from the live subscription) and get back the array with one row
// replaced, which is then written back as a single whole-array field.
function replaceWorklistRow(rows, rowIndex, updateRow) {
  return rows.map((row, ri) => (ri !== rowIndex ? row : updateRow(row)))
}

export async function updateWorklistCell(sheetId, rows, rowIndex, field, value) {
  const newRows = replaceWorklistRow(rows, rowIndex, (row) => ({ ...row, [field]: value }))
  await updateDoc(doc(db, WORKLIST_SHEETS, sheetId), { rows: newRows, updatedAt: serverTimestamp() })
}

// A row's Date column is its entry date, not something the Founder should have to fill
// in by hand every time — so the first time Work is typed into a still-blank row, Date
// auto-populates with today. `hadDate` tells us whether the row already carried a Date
// (manually entered or previously auto-set) so re-editing Work never overwrites it.
export async function updateWorklistWork(sheetId, rows, rowIndex, work, hadDate) {
  const newRows = replaceWorklistRow(rows, rowIndex, (row) => ({
    ...row,
    work,
    date: work && !hadDate ? new Date().toISOString().slice(0, 10) : row.date,
  }))
  await updateDoc(doc(db, WORKLIST_SHEETS, sheetId), { rows: newRows, updatedAt: serverTimestamp() })
}

export async function clearWorklistRow(sheetId, rows, rowIndex) {
  const newRows = replaceWorklistRow(rows, rowIndex, (row) => ({ no: row.no, date: '', work: '', doneDate: '', department: '' }))
  await updateDoc(doc(db, WORKLIST_SHEETS, sheetId), { rows: newRows, updatedAt: serverTimestamp() })
}

export async function deleteWorklistSheet(sheetId) {
  await deleteDoc(doc(db, WORKLIST_SHEETS, sheetId))
}

// Repairs a sheet whose `rows` field was corrupted by the old dot-path array-update bug
// (see replaceWorklistRow above), or that still carries the old blocks[4]x10 shape from
// before rows were flattened — overwrites it with a fresh, empty skeleton.
export async function resetWorklistSheetRows(sheetId) {
  await updateDoc(doc(db, WORKLIST_SHEETS, sheetId), {
    rows: makeWorklistRows(),
    updatedAt: serverTimestamp(),
  })
}

// ── RFF (school program) ────────────────────────────────────────────────────
// Two collections, deliberately not shared with any other department's data —
// see docs/superpowers/specs/2026-08-26-rff-department-design.md. Kept
// self-contained so a future standalone RFF app can be connected to this data
// without untangling it from the rest of the church's records.

const RFF_PROGRAMS_COLLECTION = 'rff_programs'
const RFF_STUDENTS_COLLECTION = 'rff_students'

export async function getRFFPrograms() {
  if (!db) return []
  const snap = await getDocs(query(collection(db, RFF_PROGRAMS_COLLECTION), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, name: String(d.data().name || '') }))
}

export async function createRFFProgram(name) {
  if (!db || !name) return null
  const ref = await addDoc(collection(db, RFF_PROGRAMS_COLLECTION), {
    name: String(name).trim(),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateRFFProgram(id, name) {
  if (!db || !id) return
  await updateDoc(doc(db, RFF_PROGRAMS_COLLECTION, id), { name: String(name || '').trim() })
}

export async function deleteRFFProgram(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, RFF_PROGRAMS_COLLECTION, id))
}

export function listenRFFStudents(callback, onError) {
  const q = query(collection(db, RFF_STUDENTS_COLLECTION), orderBy('name'))
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      admissionDate: toDate(d.data().admissionDate),
      feePaidDate: toDate(d.data().feePaidDate),
    }))),
    onError,
  )
}

export async function createRFFStudent(data) {
  const ref = await addDoc(collection(db, RFF_STUDENTS_COLLECTION), {
    name: data.name || '',
    programId: data.programId || '',
    ageOrClass: data.ageOrClass || '',
    guardianName: data.guardianName || '',
    guardianPhone: data.guardianPhone || '',
    admissionDate: data.admissionDate ? Timestamp.fromDate(new Date(data.admissionDate)) : null,
    feeAmount: Number(data.feeAmount) || 0,
    feePaid: !!data.feePaid,
    feePaidDate: data.feePaid && data.feePaidDate ? Timestamp.fromDate(new Date(data.feePaidDate)) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateRFFStudent(id, data) {
  await updateDoc(doc(db, RFF_STUDENTS_COLLECTION, id), {
    name: data.name || '',
    programId: data.programId || '',
    ageOrClass: data.ageOrClass || '',
    guardianName: data.guardianName || '',
    guardianPhone: data.guardianPhone || '',
    admissionDate: data.admissionDate ? Timestamp.fromDate(new Date(data.admissionDate)) : null,
    feeAmount: Number(data.feeAmount) || 0,
    feePaid: !!data.feePaid,
    feePaidDate: data.feePaid && data.feePaidDate ? Timestamp.fromDate(new Date(data.feePaidDate)) : null,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteRFFStudent(id) {
  await deleteDoc(doc(db, RFF_STUDENTS_COLLECTION, id))
}

// ── Founder File Manager (office file registry) ─────────────────────────────
// Digitized version of the church office's physical project-file tracking log:
// each doc is one file record (SL No / name / status / closing date) with an
// append-only activity ledger that prints as the file's cover sheet. See
// docs/superpowers/specs/2026-08-26-file-manager-design.md.
const PROJECT_FILES = 'project_files'

// `onChange` is guaranteed to fire at least once — with `[]` if Firestore isn't
// configured or the listener errors (e.g. a permission-denied because the
// project_files rules block hasn't been deployed yet) — so a caller's `loading`
// flag can never hang forever waiting on a callback that never comes. The error
// itself is still surfaced via console.error and the optional `onError`, rather
// than swallowed, so a rules gap like that is visible instead of just "stuck".
export function subscribeProjectFiles(onChange, onError) {
  if (!db) { onChange([]); return () => {} }
  const q = query(collection(db, PROJECT_FILES), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, (err) => {
    console.error('subscribeProjectFiles failed:', err)
    onChange([])
    onError?.(err)
  })
}

export async function createProjectFile(data, createdBy) {
  const ref = await addDoc(collection(db, PROJECT_FILES), {
    slNo: data.slNo || '',
    fileName: data.fileName || '',
    remarks: data.remarks || 'Active',
    closingDate: data.closingDate || null,
    activities: [],
    createdAt: serverTimestamp(),
    createdBy: createdBy || null,
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateProjectFile(id, data) {
  await updateDoc(doc(db, PROJECT_FILES, id), {
    slNo: data.slNo || '',
    fileName: data.fileName || '',
    remarks: data.remarks || 'Active',
    closingDate: data.closingDate || null,
    updatedAt: serverTimestamp(),
  })
}

// Whole-array read-modify-write, same reasoning as replaceWorklistRow above —
// Firestore's dotted-path update can't append into an array field safely, so
// callers pass the doc's current `activities` array (already in hand from the
// live subscription) and this writes it back with the new entry appended.
// Targeted status change from the File Detail view — a partial update, so it
// never rewrites slNo / fileName. `extra` lets the caller also set closingDate
// (e.g. auto-fill "today" when a file is marked Project Completed).
export async function setProjectFileRemarks(id, remarks, extra = {}) {
  await updateDoc(doc(db, PROJECT_FILES, id), {
    remarks,
    ...extra,
    updatedAt: serverTimestamp(),
  })
}

export async function addProjectFileActivity(id, activities, entry) {
  await updateDoc(doc(db, PROJECT_FILES, id), {
    activities: [...(activities || []), entry],
    updatedAt: serverTimestamp(),
  })
}

export async function deleteProjectFile(id) {
  await deleteDoc(doc(db, PROJECT_FILES, id))
}

// Bulk-create from an imported Excel sheet (digitizing the office's existing
// paper/spreadsheet ledger) — same sequential add-with-per-row-error-count
// pattern as bulkAddDlightMembers, so one bad row doesn't abort the rest.
export async function bulkCreateProjectFiles(rows, createdBy) {
  if (!db || !rows?.length) return { imported: 0, failed: 0 }
  let imported = 0
  let failed = 0
  for (const row of rows) {
    try {
      await addDoc(collection(db, PROJECT_FILES), {
        slNo: String(row.slNo || '').trim(),
        fileName: String(row.fileName || '').trim(),
        remarks: row.remarks || 'Active',
        closingDate: row.closingDate || null,
        activities: [],
        createdAt: serverTimestamp(),
        createdBy: createdBy || null,
        updatedAt: serverTimestamp(),
      })
      imported++
    } catch {
      failed++
    }
  }
  return { imported, failed }
}

// ─── Baptism Applications ─────────────────────────────────────────────────────
// One doc per application, keyed by an unguessable random token that doubles as
// the public QR link (/baptism-apply?token=…). Firestore rules let anyone *get*
// (never list) an unexpired doc by its token and submit the applicant's part
// once; everything else is Caring-only. See firestore.rules → baptism_applications.

const BAPTISM_APPLICATIONS = 'baptism_applications'
const BAPTISM_LINK_DAYS = 30

function randomToken() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function mapBaptismApplication(d) {
  const data = d.data()
  return {
    id: d.id,
    ...data,
    createdAt: toDate(data.createdAt),
    expiresAt: toDate(data.expiresAt),
    submittedAt: toDate(data.submittedAt),
  }
}

/** Create an application for a PCS entry; returns the new doc (its id is the token). */
/** Create an application for a PCS entry in one click; returns the new doc (its id is
 *  the token). Batch No. / Serial No. (the Form ID) are assigned later by Caring when
 *  reviewing (assignBaptismBatch); the applicant gives their preferred baptism place
 *  and batch / service date on the form itself. */
export async function createBaptismApplication({ pcsEntryId, visitorId, personId, prefill }, createdBy = '') {
  if (!db || !pcsEntryId) throw new Error('Missing PCS entry')
  const token = randomToken()
  const payload = {
    pcsEntryId, visitorId: visitorId || '', personId: personId || '',
    batch: '', seq: null, formId: '',
    place: '',
    prefill: prefill || {},
    applicant: {},
    photoDataUrl: '', signatureDataUrl: '', declarationAccepted: false,
    status: 'pending', officeNotes: '',
    createdAt: Timestamp.now(), createdBy,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + BAPTISM_LINK_DAYS * 24 * 60 * 60 * 1000)),
    submittedAt: null,
  }
  await setDoc(doc(db, BAPTISM_APPLICATIONS, token), payload)
  return { id: token, ...payload, createdAt: new Date(), expiresAt: payload.expiresAt.toDate() }
}

/** Next free Serial No. — one more than the highest assigned across all applications. */
export async function getNextBaptismSerial() {
  if (!db) return 1
  const all = await getDocs(collection(db, BAPTISM_APPLICATIONS))
  return all.docs.reduce((max, d) => Math.max(max, Number(d.data().seq) || 0), 0) + 1
}

/** Caring: assign the formal Batch No. + Serial No. → Form ID "B-<batch> / <serial>". */
export async function assignBaptismBatch(token, { batch, seq, place }) {
  if (!db || !token) return null
  const batchStr = String(batch || '').trim()
  const serial = Number(seq) || null
  const formId = batchStr && serial ? `B-${batchStr} / ${serial}` : ''
  await updateDoc(doc(db, BAPTISM_APPLICATIONS, token), {
    batch: batchStr, seq: serial, formId,
    ...(place !== undefined ? { place: String(place || '').trim() } : {}),
  })
  return formId
}

/** Public read by token (works signed-out while the link is unexpired). */
export async function getBaptismApplicationByToken(token) {
  if (!db || !token) return null
  const snap = await getDoc(doc(db, BAPTISM_APPLICATIONS, token))
  return snap.exists() ? mapBaptismApplication(snap) : null
}

/** Caring: live list of applications for one PCS entry, newest first. */
export function subscribeBaptismApplicationsForEntry(pcsEntryId, onChange, onError) {
  if (!db || !pcsEntryId) { onChange([]); return () => {} }
  return onSnapshot(
    query(collection(db, BAPTISM_APPLICATIONS), where('pcsEntryId', '==', pcsEntryId)),
    (snap) => onChange(snap.docs.map(mapBaptismApplication).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))),
    (err) => { console.error('subscribeBaptismApplicationsForEntry:', err); onError?.(err) }
  )
}

/** Applicant submission from the public page — the only update rules allow signed-out. */
export async function submitBaptismApplication(token, { applicant, photoDataUrl, signatureDataUrl }) {
  if (!db || !token) throw new Error('Missing link')
  await updateDoc(doc(db, BAPTISM_APPLICATIONS, token), {
    applicant: applicant || {},
    photoDataUrl: photoDataUrl || '',
    signatureDataUrl: signatureDataUrl || '',
    declarationAccepted: true,
    status: 'submitted',
    submittedAt: Timestamp.now(),
  })
}

/** Caring: office notes / status changes / extending the link. */
export async function updateBaptismApplication(token, data) {
  if (!db || !token) return
  await updateDoc(doc(db, BAPTISM_APPLICATIONS, token), data)
}

export async function deleteBaptismApplication(token) {
  if (!db || !token) return
  await deleteDoc(doc(db, BAPTISM_APPLICATIONS, token))
}

// ─── Membership Applications ──────────────────────────────────────────────────
// Same shape as Baptism Applications: one doc per application, keyed by an
// unguessable token that is also the public QR link (/membership-apply?token=…).
// Signed-out, anyone holding the link can read it while unexpired and submit the
// applicant's part once (status pending → submitted); everything else — creating,
// listing, the office decision — is Caring-only. See firestore.rules →
// membership_applications. Photo, signature and document scans are stored as
// compressed data URLs inside the doc (no Storage upload from a signed-out page).

const MEMBERSHIP_APPLICATIONS = 'membership_applications'
const MEMBERSHIP_LINK_DAYS = 30

function mapMembershipApplication(d) {
  const data = d.data()
  return {
    id: d.id,
    ...data,
    createdAt: toDate(data.createdAt),
    expiresAt: toDate(data.expiresAt),
    submittedAt: toDate(data.submittedAt),
    decidedAt: toDate(data.decidedAt),
  }
}

/** Caring: create a pre-filled application for a PCS entry; returns it (id = token). */
export async function createMembershipApplication({ pcsEntryId, visitorId, personId, prefill }, createdBy = '') {
  if (!db || !pcsEntryId) throw new Error('Missing PCS entry')
  const token = randomToken()
  const payload = {
    pcsEntryId, visitorId: visitorId || '', personId: personId || '',
    prefill: prefill || {},
    applicant: {},
    photoDataUrl: '', signatureDataUrl: '', documents: {},
    status: 'pending', officeNotes: '',
    createdAt: Timestamp.now(), createdBy,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + MEMBERSHIP_LINK_DAYS * 24 * 60 * 60 * 1000)),
    submittedAt: null,
  }
  await setDoc(doc(db, MEMBERSHIP_APPLICATIONS, token), payload)
  return { id: token, ...payload, createdAt: new Date(), expiresAt: payload.expiresAt.toDate() }
}

/** Public read by token (works signed-out while the link is unexpired). */
export async function getMembershipApplicationByToken(token) {
  if (!db || !token) return null
  const snap = await getDoc(doc(db, MEMBERSHIP_APPLICATIONS, token))
  return snap.exists() ? mapMembershipApplication(snap) : null
}

/** Caring: live list of applications for one PCS entry, newest first. */
export function subscribeMembershipApplicationsForEntry(pcsEntryId, onChange, onError) {
  if (!db || !pcsEntryId) { onChange([]); return () => {} }
  return onSnapshot(
    query(collection(db, MEMBERSHIP_APPLICATIONS), where('pcsEntryId', '==', pcsEntryId)),
    (snap) => onChange(snap.docs.map(mapMembershipApplication).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))),
    (err) => { console.error('subscribeMembershipApplicationsForEntry:', err); onError?.(err) }
  )
}

/** Applicant submission from the public page — the only update rules allow signed-out. */
export async function submitMembershipApplication(token, { applicant, photoDataUrl, signatureDataUrl, documents }) {
  if (!db || !token) throw new Error('Missing link')
  await updateDoc(doc(db, MEMBERSHIP_APPLICATIONS, token), {
    applicant: applicant || {},
    photoDataUrl: photoDataUrl || '',
    signatureDataUrl: signatureDataUrl || '',
    documents: documents || {},
    status: 'submitted',
    submittedAt: Timestamp.now(),
  })
}

/** Caring: office notes, decision (approved / rejected), extending the link. */
export async function updateMembershipApplication(token, data) {
  if (!db || !token) return
  await updateDoc(doc(db, MEMBERSHIP_APPLICATIONS, token), data)
}

export async function deleteMembershipApplication(token) {
  if (!db || !token) return
  await deleteDoc(doc(db, MEMBERSHIP_APPLICATIONS, token))
}

// ─── Caring Events (pastoral lifecycle registry) ──────────────────────────────
// Baptism / Marriage / Baby Dedication / Burial events with linked PCS
// participants. Saving an event writes its details into each participant's
// profile (member_profiles by visitorId, people by personId, caring_pcs for
// burial). Every write is logged on the event (`syncLog`) with the value it
// replaced, so removing a participant or deleting the event can undo it — but
// only for fields that still hold the event's value, so a later manual
// correction in PCS is never overwritten.

const CARING_EVENTS = 'caring_events'
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const plain = (v) => JSON.parse(JSON.stringify(v ?? null))

function mapCaringEvent(d) {
  const data = d.data()
  return { id: d.id, ...data, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt), syncedAt: toDate(data.syncedAt) }
}

/** Caring: live list of events, newest event date first. */
export function subscribeCaringEvents(onChange, onError) {
  if (!db) { onChange([]); return () => {} }
  return onSnapshot(collection(db, CARING_EVENTS), (snap) => {
    onChange(snap.docs.map(mapCaringEvent).sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) || String(b.batchCode || '').localeCompare(String(a.batchCode || ''))))
  }, (err) => { console.error('subscribeCaringEvents:', err); onError?.(err) })
}

// Plain field writes an event makes, one per profile doc it touches.
function caringEventFieldWrites(event) {
  const writes = []
  const add = (participantKey, coll, id, mode, fields) => { if (id) writes.push({ participantKey, coll, id, mode, fields }) }
  for (const p of event.participants || []) {
    if (event.type === 'baptism') {
      add(p.key, MEMBER_PROFILES_COLLECTION, p.visitorId, 'merge', {
        baptised: 'yes', baptismDate: event.date, baptismChurch: event.venue || '',
        baptismBatch: event.batchCode || '', baptismSerialNo: p.serialNo, baptismOfficiant: event.officiant || '',
        baptismEventId: event.id,
      })
      add(p.key, PEOPLE_COLLECTION, p.personId, 'update', { baptised: 'yes', baptismDate: event.date, baptismChurch: event.venue || '' })
    } else if (event.type === 'marriage') {
      const pair = [[p, p.spouse || {}], [p.spouse || {}, p]]
      for (const [me, other] of pair) {
        add(p.key, MEMBER_PROFILES_COLLECTION, me.visitorId, 'merge', {
          maritalStatus: 'Married', marriageDate: event.date, spouseName: other.name || '',
          spouseVisitorId: other.visitorId || '', marriageEventId: event.id,
        })
        add(p.key, PEOPLE_COLLECTION, me.personId, 'update', {
          maritalStatus: 'Married', marriageDate: event.date, spouseName: other.name || '', spousePersonId: other.personId || '',
        })
      }
    } else if (event.type === 'burial') {
      add(p.key, CARING_PCS_COLLECTION, p.pcsEntryId, 'update', { departed: true, departedDate: event.date, departedEventId: event.id })
    }
  }
  return writes
}

async function applyCaringFieldWrite(w) {
  const ref = doc(db, w.coll, w.id)
  const snap = await getDoc(ref)
  if (w.mode === 'update' && !snap.exists()) return null
  const cur = snap.exists() ? snap.data() : {}
  const keys = Object.keys(w.fields)
  const before = Object.fromEntries(keys.map((k) => [k, k in cur ? plain(cur[k]) : null]))
  const missing = keys.filter((k) => !(k in cur))
  await setDoc(ref, w.fields, { merge: true })
  return { kind: 'field', participantKey: w.participantKey, coll: w.coll, id: w.id, fields: plain(w.fields), before, missing }
}

// Baby dedication: recorded on the child's entry inside each parent's
// member_profiles.children list (added there if the child isn't listed yet).
async function applyDedication(event, p, parent) {
  const ref = doc(db, MEMBER_PROFILES_COLLECTION, parent.visitorId)
  const snap = await getDoc(ref)
  const cur = snap.exists() ? snap.data() : {}
  const children = Array.isArray(cur.children) ? plain(cur.children) : []
  const norm = (s) => String(s || '').trim().toLowerCase()
  let idx = children.findIndex((c) => (p.riverKidsChildId && c.riverKidsChildId === p.riverKidsChildId) || norm(c.name) === norm(p.childName))
  const after = { dedicationDate: event.date, dedicationOfficiant: event.officiant || '', dedicationEventId: event.id }
  const added = idx === -1
  if (added) {
    children.push({ id: `ev_${event.id}_${p.key}`, name: p.childName, ...(p.riverKidsChildId ? { riverKidsChildId: p.riverKidsChildId, inRiverKids: 'yes' } : {}), addedByEventId: event.id })
    idx = children.length - 1
  }
  const child = children[idx]
  const before = Object.fromEntries(Object.keys(after).map((k) => [k, k in child ? child[k] : null]))
  children[idx] = { ...child, ...after }
  await setDoc(ref, { children, hasKids: 'yes' }, { merge: true })
  return {
    kind: 'child', participantKey: p.key, coll: MEMBER_PROFILES_COLLECTION, id: parent.visitorId,
    childId: children[idx].id || '', childName: children[idx].name || '', added, before, after,
    hasKidsBefore: cur.hasKids ?? null,
  }
}

async function syncCaringEvent(event) {
  const log = []
  const warnings = []
  for (const w of caringEventFieldWrites(event)) {
    const rec = await applyCaringFieldWrite(w)
    if (rec) log.push(rec)
  }
  if (event.type === 'dedication') {
    for (const p of event.participants || []) {
      for (const parent of p.parents || []) {
        if (parent.visitorId) log.push(await applyDedication(event, p, parent))
      }
    }
  }
  // Participants nothing could be written for (no linked profile record).
  for (const p of event.participants || []) {
    if (!log.some((r) => r.participantKey === p.key)) warnings.push(p.key)
  }
  return { log, warnings }
}

async function undoCaringLogRecord(rec, eventId) {
  const ref = doc(db, rec.coll, rec.id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const cur = snap.data()
  if (rec.kind === 'field') {
    const patch = {}
    for (const [k, v] of Object.entries(rec.fields || {})) {
      if (!sameValue(cur[k], v)) continue
      const prev = rec.before?.[k]
      patch[k] = (rec.missing || []).includes(k) || prev === null || prev === undefined ? deleteField() : prev
    }
    if (Object.keys(patch).length) await updateDoc(ref, patch)
    return
  }
  // Dedication child record
  const children = Array.isArray(cur.children) ? plain(cur.children) : []
  const idx = children.findIndex((c) => c.dedicationEventId === eventId && (rec.childId ? c.id === rec.childId : c.name === rec.childName))
  if (idx === -1) return
  if (rec.added && children[idx].addedByEventId === eventId) {
    children.splice(idx, 1)
  } else {
    const c = { ...children[idx] }
    for (const k of Object.keys(rec.after || {})) {
      if (rec.before?.[k] === null || rec.before?.[k] === undefined) delete c[k]
      else c[k] = rec.before[k]
    }
    children[idx] = c
  }
  const patch = { children }
  if (rec.added && children.length === 0 && rec.hasKidsBefore !== 'yes') patch.hasKids = rec.hasKidsBefore ?? deleteField()
  await updateDoc(ref, patch)
}

/** Undo everything an event wrote (newest write first). */
async function undoCaringEventSync(event) {
  const log = Array.isArray(event?.syncLog) ? event.syncLog : []
  for (const rec of [...log].reverse()) {
    try { await undoCaringLogRecord(rec, event.id) } catch (err) { console.error('undo caring event write failed:', rec, err) }
  }
}

/**
 * Create or update an event and sync its participants into PCS. On an update the
 * previous version's writes are undone first, then the new version is applied, so
 * removed participants are cleaned up and changed dates/codes are rewritten.
 * Returns { id, warnings } — warnings are participant keys with no profile record.
 */
export async function saveCaringEvent(event, { previous = null, savedBy = '' } = {}) {
  if (!db) throw new Error('No database')
  if (previous) await undoCaringEventSync(previous)
  const ref = event.id ? doc(db, CARING_EVENTS, event.id) : doc(collection(db, CARING_EVENTS))
  const full = plain({ ...event, id: ref.id })
  const { log, warnings } = await syncCaringEvent(full)
  delete full.id
  await setDoc(ref, {
    ...full,
    syncLog: log, syncWarnings: warnings, syncedAt: Timestamp.now(),
    updatedAt: Timestamp.now(), updatedBy: savedBy,
    createdAt: previous?.createdAt || Timestamp.now(),
    createdBy: previous ? (previous.createdBy || '') : savedBy,
  })
  return { id: ref.id, warnings }
}

/** Delete an event after undoing what it wrote into PCS profiles. */
export async function deleteCaringEvent(event) {
  if (!db || !event?.id) return
  await undoCaringEventSync(event)
  await deleteDoc(doc(db, CARING_EVENTS, event.id))
}

/** Set a Caring event's status ('scheduled' | 'completed') without re-syncing PCS. */
export async function setCaringEventStatus(eventId, status, by = '') {
  if (!db || !eventId) return
  await updateDoc(doc(db, CARING_EVENTS, eventId), {
    status, ...(status === 'completed' ? { completedAt: Timestamp.now(), completedBy: by } : { completedAt: null, completedBy: '' }),
  })
}

// ─── Baby Dedication Applications ─────────────────────────────────────────────
// Same token/QR model as baptism_applications. A "surprise" child name is never
// written to the application doc: it goes to dedication_secret_names/{token},
// readable only by Founder / Senior Pastor / Admin — and by Caring once the
// application is `revealed`, which rules only allow after its dedication event is
// marked Completed. See firestore.rules → dedication_applications.

const DEDICATION_APPLICATIONS = 'dedication_applications'
const DEDICATION_SECRET_NAMES = 'dedication_secret_names'
const DEDICATION_LINK_DAYS = 30

function mapDedicationApplication(d) {
  const data = d.data()
  return {
    id: d.id, ...data,
    createdAt: toDate(data.createdAt), expiresAt: toDate(data.expiresAt),
    submittedAt: toDate(data.submittedAt), revealedAt: toDate(data.revealedAt),
  }
}

export async function createDedicationApplication({ pcsEntryId, visitorId, personId, prefill }, createdBy = '') {
  if (!db || !pcsEntryId) throw new Error('Missing PCS entry')
  const token = randomToken()
  const payload = {
    pcsEntryId, visitorId: visitorId || '', personId: personId || '',
    prefill: prefill || {}, applicant: {},
    isSurpriseName: false, childName: '', publicDisplayName: '',
    revealed: false, revealEventId: '',
    status: 'pending', officeNotes: '',
    createdAt: Timestamp.now(), createdBy,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + DEDICATION_LINK_DAYS * 24 * 60 * 60 * 1000)),
    submittedAt: null,
  }
  await setDoc(doc(db, DEDICATION_APPLICATIONS, token), payload)
  return { id: token, ...payload, createdAt: new Date(), expiresAt: payload.expiresAt.toDate() }
}

export async function getDedicationApplicationByToken(token) {
  if (!db || !token) return null
  const snap = await getDoc(doc(db, DEDICATION_APPLICATIONS, token))
  return snap.exists() ? mapDedicationApplication(snap) : null
}

const sortNewest = (list) => list.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))

export function subscribeDedicationApplicationsForEntry(pcsEntryId, onChange, onError) {
  if (!db || !pcsEntryId) { onChange([]); return () => {} }
  return onSnapshot(query(collection(db, DEDICATION_APPLICATIONS), where('pcsEntryId', '==', pcsEntryId)),
    (snap) => onChange(sortNewest(snap.docs.map(mapDedicationApplication))),
    (err) => { console.error('subscribeDedicationApplicationsForEntry:', err); onError?.(err) })
}

/** Caring Events: submitted applications, for adding children to a dedication event. */
export function subscribeSubmittedDedicationApplications(onChange, onError) {
  if (!db) { onChange([]); return () => {} }
  return onSnapshot(query(collection(db, DEDICATION_APPLICATIONS), where('status', '==', 'submitted')),
    (snap) => onChange(sortNewest(snap.docs.map(mapDedicationApplication))),
    (err) => { console.error('subscribeSubmittedDedicationApplications:', err); onError?.(err) })
}

/** Parents' submission from the public page (signed-out). */
export async function submitDedicationApplication(token, { applicant, childNameParts, isSurpriseName, publicDisplayName }) {
  if (!db || !token) throw new Error('Missing link')
  const parts = childNameParts || {}
  const childName = parts.legalFullName || ''
  // Legal name parts travel with the name: on the application, or in the secret doc.
  const partFields = { firstName: parts.firstName || '', middleName: parts.middleName || '', lastName: parts.lastName || '' }
  const batch = writeBatch(db)
  batch.update(doc(db, DEDICATION_APPLICATIONS, token), {
    applicant: isSurpriseName ? (applicant || {}) : { ...(applicant || {}), childFirstName: partFields.firstName, childMiddleName: partFields.middleName, childLastName: partFields.lastName },
    isSurpriseName: !!isSurpriseName,
    publicDisplayName: publicDisplayName || '',
    childName: isSurpriseName ? '' : String(childName || '').trim(),
    status: 'submitted',
    submittedAt: Timestamp.now(),
  })
  if (isSurpriseName) {
    batch.set(doc(db, DEDICATION_SECRET_NAMES, token), { name: childName, ...partFields, createdAt: Timestamp.now() })
  }
  await batch.commit()
}

/** Founder / Senior Pastor / Admin: read a surprise name. null when not allowed / none. */
export async function getDedicationSecretName(token) {
  if (!db || !token) return null
  try {
    const snap = await getDoc(doc(db, DEDICATION_SECRET_NAMES, token))
    return snap.exists() ? (snap.data().name || '') : null
  } catch (err) {
    if (err?.code === 'permission-denied') return null
    throw err
  }
}

/**
 * Reveal a surprise name after its dedication event is completed: marks the
 * application revealed (rules require `eventId` to be a completed dedication
 * event), then copies the secret name onto the application. Returns the name.
 */
export async function revealDedicationApplication(token, eventId, by = '') {
  if (!db || !token) return ''
  await updateDoc(doc(db, DEDICATION_APPLICATIONS, token), {
    revealed: true, revealEventId: eventId || '', revealedAt: Timestamp.now(), revealedBy: by,
  })
  const name = (await getDedicationSecretName(token)) || ''
  if (name) await updateDoc(doc(db, DEDICATION_APPLICATIONS, token), { childName: name })
  return name
}

export async function updateDedicationApplication(token, data) {
  if (!db || !token) return
  await updateDoc(doc(db, DEDICATION_APPLICATIONS, token), data)
}

export async function deleteDedicationApplication(token) {
  if (!db || !token) return
  await deleteDoc(doc(db, DEDICATION_SECRET_NAMES, token)).catch(() => {})
  await deleteDoc(doc(db, DEDICATION_APPLICATIONS, token))
}

// ─── Pastoral applications: cross-type queue (Caring Hub) ─────────────────────
// Live list of baptism / membership / dedication applications in the given
// statuses — the "Applications & Form Requests" card and PCS profile list.
// ─── Marriage (Holy Matrimony) Applications ───────────────────────────────────
// Same token model as baptism / membership: the doc id is the unguessable QR
// token (/marriage-apply?token=…); signed-out holders of the link may read an
// unexpired doc and submit the applicant's part once. See firestore.rules →
// marriage_applications. Wording / fields: constants/marriageForm.js.

const MARRIAGE_APPLICATIONS = 'marriage_applications'
const MARRIAGE_LINK_DAYS = 30

function mapMarriageApplication(d) {
  const data = d.data()
  return {
    id: d.id, ...data,
    createdAt: toDate(data.createdAt), expiresAt: toDate(data.expiresAt),
    submittedAt: toDate(data.submittedAt), decidedAt: toDate(data.decidedAt),
  }
}

export async function createMarriageApplication({ pcsEntryId, visitorId, personId, prefill }, createdBy = '') {
  if (!db || !pcsEntryId) throw new Error('Missing PCS entry')
  const token = randomToken()
  const payload = {
    pcsEntryId, visitorId: visitorId || '', personId: personId || '',
    prefill: prefill || {}, applicant: {},
    photoDataUrl: '', signatureDataUrl: '', declarationAccepted: false,
    status: 'pending', officeNotes: '',
    createdAt: Timestamp.now(), createdBy,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + MARRIAGE_LINK_DAYS * 24 * 60 * 60 * 1000)),
    submittedAt: null,
  }
  await setDoc(doc(db, MARRIAGE_APPLICATIONS, token), payload)
  return { id: token, ...payload, createdAt: new Date(), expiresAt: payload.expiresAt.toDate() }
}

export async function getMarriageApplicationByToken(token) {
  if (!db || !token) return null
  const snap = await getDoc(doc(db, MARRIAGE_APPLICATIONS, token))
  return snap.exists() ? mapMarriageApplication(snap) : null
}

export function subscribeMarriageApplicationsForEntry(pcsEntryId, onChange, onError) {
  if (!db || !pcsEntryId) { onChange([]); return () => {} }
  return onSnapshot(query(collection(db, MARRIAGE_APPLICATIONS), where('pcsEntryId', '==', pcsEntryId)),
    (snap) => onChange(sortNewest(snap.docs.map(mapMarriageApplication))),
    (err) => { console.error('subscribeMarriageApplicationsForEntry:', err); onError?.(err) })
}

/** Applicant submission from the public page (signed-out). */
export async function submitMarriageApplication(token, { applicant, photoDataUrl, signatureDataUrl }) {
  if (!db || !token) throw new Error('Missing link')
  await updateDoc(doc(db, MARRIAGE_APPLICATIONS, token), {
    applicant: applicant || {},
    photoDataUrl: photoDataUrl || '',
    signatureDataUrl: signatureDataUrl || '',
    declarationAccepted: true,
    status: 'submitted',
    submittedAt: Timestamp.now(),
  })
}

export async function updateMarriageApplication(token, data) {
  if (!db || !token) return
  await updateDoc(doc(db, MARRIAGE_APPLICATIONS, token), data)
}

export async function deleteMarriageApplication(token) {
  if (!db || !token) return
  await deleteDoc(doc(db, MARRIAGE_APPLICATIONS, token))
}

const APPLICATION_COLLECTIONS = {
  marriage: [MARRIAGE_APPLICATIONS, mapMarriageApplication],
  baptism: [BAPTISM_APPLICATIONS, mapBaptismApplication],
  membership: [MEMBERSHIP_APPLICATIONS, (d) => {
    const data = d.data()
    return { id: d.id, ...data, createdAt: toDate(data.createdAt), expiresAt: toDate(data.expiresAt), submittedAt: toDate(data.submittedAt), decidedAt: toDate(data.decidedAt) }
  }],
  dedication: [DEDICATION_APPLICATIONS, mapDedicationApplication],
}

export function subscribeApplicationsByStatus(type, statuses, onChange, onError) {
  const cfg = APPLICATION_COLLECTIONS[type]
  if (!db || !cfg) { onChange([]); return () => {} }
  const [name, map] = cfg
  return onSnapshot(query(collection(db, name), where('status', 'in', statuses)),
    (snap) => onChange(snap.docs.map(map).sort((a, b) => (b.submittedAt?.getTime?.() || 0) - (a.submittedAt?.getTime?.() || 0))),
    (err) => { console.error(`subscribeApplicationsByStatus(${type}):`, err); onError?.(err) })
}

/** Office decision on any application type (status, notes, linked event, …).
 *  Approving also syncs the applicant's Family Details back to their profile. */
export async function updateApplication(type, token, data) {
  const cfg = APPLICATION_COLLECTIONS[type]
  if (!db || !cfg || !token) return
  await updateDoc(doc(db, cfg[0], token), data)
  if (data?.status === 'approved') await syncApplicationFamilyToProfile(type, token)
}

/**
 * On approval: merge the applicant's submitted spouse / children (applicant.family,
 * see utils/familyDetails.js) into member_profiles/{visitorId}. Marriage
 * applications sync children only — the partner becomes the spouse when the
 * wedding is recorded as a Caring > Events marriage, not at approval. Best-effort:
 * a failure is recorded on the application (familySyncError), never thrown, so it
 * can't undo or block the approval itself.
 */
async function syncApplicationFamilyToProfile(type, token) {
  const ref = doc(db, APPLICATION_COLLECTIONS[type][0], token)
  try {
    const snap = await getDoc(ref)
    const app = snap.exists() ? snap.data() : null
    const family = app?.applicant?.family
    if (!family || !app.visitorId) return
    const profile = await getMemberProfile(app.visitorId)
    const patch = mergeFamilyIntoProfile(profile || {}, family, { includeSpouse: type !== 'marriage' })
    if (!patch) return
    await upsertMemberProfile(app.visitorId, patch, 'application-approval')
    await updateDoc(ref, { familySyncedAt: Timestamp.now(), familySyncError: '' })
  } catch (err) {
    console.error('syncApplicationFamilyToProfile:', err)
    updateDoc(ref, { familySyncError: String(err?.message || err) }).catch(() => {})
  }
}

/** One PCS person's applications of a type, newest first (any status). */
export function subscribeApplicationsForEntry(type, pcsEntryId, onChange, onError) {
  const cfg = APPLICATION_COLLECTIONS[type]
  if (!db || !cfg || !pcsEntryId) { onChange([]); return () => {} }
  const [name, map] = cfg
  return onSnapshot(query(collection(db, name), where('pcsEntryId', '==', pcsEntryId)),
    (snap) => onChange(snap.docs.map(map).sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))),
    (err) => { console.error(`subscribeApplicationsForEntry(${type}):`, err); onError?.(err) })
}

// ─── PCS duplicate merge ──────────────────────────────────────────────────────
// Folds duplicate PCS entries into one master profile (see utils/pcsDedupe.js):
//  • blank master fields are filled from the duplicates; follow-ups, Away
//    periods and manual ministries are combined;
//  • Baptism / Membership / Dedication applications and Caring Events participant
//    rows that pointed at a duplicate now point at the master;
//  • the duplicate's member_profiles details fill blanks on the master's;
//  • the duplicate is archived (status inactive, mergedInto = master id) — never
//    hard-deleted — and its visitorId is kept on the master (mergedVisitorIds).
// Attendance is recorded by name / visitor id on the attendance sheets, so it is
// not moved; the master's own records carry on as before.
const PCS_MERGE_FILL_FIELDS = ['phone', 'email', 'dob', 'nativity', 'currentPlace', 'serviceAttended', 'howKnown',
  'attendedDate', 'membershipNumber', 'leadershipPosition', 'displayName', 'personId', 'year']
const MEMBER_PROFILE_FILL_FIELDS = ['phone', 'email', 'dob', 'nativity', 'currentPlace', 'gender', 'baptised', 'baptismDate',
  'baptismPlace', 'baptismChurch', 'maritalStatus', 'marriageDate', 'spouseName', 'spouseVisitorId', 'previousChurchName',
  'previousChurchPlace', 'membershipStatus', 'permanentAddress', 'photoUrl', 'hasKids']

export async function mergePCSEntries(masterId, duplicateIds, mergedBy = '') {
  if (!db || !masterId || !duplicateIds?.length) return { moved: 0 }
  const load = async (id) => { const s = await getDoc(doc(db, CARING_PCS_COLLECTION, id)); return s.exists() ? { id: s.id, raw: s.data() } : null }
  const master = await load(masterId)
  if (!master) throw new Error('Master profile not found')
  const dups = (await Promise.all(duplicateIds.filter((id) => id !== masterId).map(load))).filter(Boolean)
  const blank = (v) => v === undefined || v === null || String(v).trim() === ''

  // 1. Master fields + combined lists
  const patch = {}
  const followUps = [...(master.raw.followUps || [])]
  const awayPeriods = [...(master.raw.awayPeriods || [])]
  const ministries = [...(master.raw.ministries || [])]
  const mergedVisitorIds = new Set(master.raw.mergedVisitorIds || [])
  dups.forEach(({ raw }) => {
    PCS_MERGE_FILL_FIELDS.forEach((k) => { if (blank(patch[k] ?? master.raw[k]) && !blank(raw[k])) patch[k] = raw[k] })
    ;(raw.followUps || []).forEach((f) => { if (!followUps.some((x) => x.at === f.at && x.note === f.note)) followUps.push(f) })
    ;(raw.awayPeriods || []).forEach((a) => { if (!awayPeriods.some((x) => x.from === a.from && x.to === a.to)) awayPeriods.push(a) })
    ;(raw.ministries || []).forEach((m) => {
      const key = String(m?.ministry || '').toLowerCase()
      if (key && !ministries.some((x) => String(x?.ministry || '').toLowerCase() === key)) ministries.push(m)
    })
    if (raw.visitorId && raw.visitorId !== master.raw.visitorId) mergedVisitorIds.add(raw.visitorId)
  })
  followUps.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
  await updateDoc(doc(db, CARING_PCS_COLLECTION, masterId), {
    ...plain({ ...patch, followUps, awayPeriods, ministries, mergedVisitorIds: [...mergedVisitorIds] }),
    updatedAt: Timestamp.now(),
  })

  // 2. Applications → master
  let moved = 0
  const dupIds = dups.map((d) => d.id)
  for (const coll of [BAPTISM_APPLICATIONS, MEMBERSHIP_APPLICATIONS, DEDICATION_APPLICATIONS, MARRIAGE_APPLICATIONS]) {
    for (const id of dupIds) {
      const snap = await getDocs(query(collection(db, coll), where('pcsEntryId', '==', id))).catch(() => null)
      for (const d of snap?.docs || []) {
        await updateDoc(d.ref, { pcsEntryId: masterId, visitorId: master.raw.visitorId || '', personId: master.raw.personId || '' })
        moved++
      }
    }
  }

  // 3. Caring Events participant references → master
  const evSnap = await getDocs(collection(db, CARING_EVENTS)).catch(() => null)
  const swap = (p) => (p && dupIds.includes(p.pcsEntryId) ? { ...p, pcsEntryId: masterId, visitorId: master.raw.visitorId || p.visitorId || '' } : p)
  for (const d of evSnap?.docs || []) {
    const parts = d.data().participants || []
    const touched = parts.some((p) => dupIds.includes(p.pcsEntryId) || dupIds.includes(p.spouse?.pcsEntryId) || (p.parents || []).some((x) => dupIds.includes(x.pcsEntryId)))
    if (!touched) continue
    const next = parts.map((p) => ({ ...swap(p), ...(p.spouse ? { spouse: swap(p.spouse) } : {}), ...(p.parents ? { parents: p.parents.map(swap) } : {}) }))
    await updateDoc(d.ref, { participants: plain(next) })
    moved++
  }

  // 4. member_profiles: duplicate's details fill blanks on the master's
  if (master.raw.visitorId) {
    const masterProfile = (await getMemberProfile(master.raw.visitorId).catch(() => null)) || {}
    const fill = {}
    for (const { raw } of dups) {
      if (!raw.visitorId || raw.visitorId === master.raw.visitorId) continue
      const p = await getMemberProfile(raw.visitorId).catch(() => null)
      if (!p) continue
      MEMBER_PROFILE_FILL_FIELDS.forEach((k) => { if (blank(fill[k] ?? masterProfile[k]) && !blank(p[k])) fill[k] = p[k] })
      if (!(masterProfile.children || []).length && (p.children || []).length && !fill.children) fill.children = p.children
    }
    if (Object.keys(fill).length) await upsertMemberProfile(master.raw.visitorId, fill, mergedBy)
  }

  // 5. Archive the duplicates
  for (const id of dupIds) {
    await updateDoc(doc(db, CARING_PCS_COLLECTION, id), {
      status: 'inactive', mergedInto: masterId, removedAt: Timestamp.now(), removedBy: `merge: ${mergedBy || 'unknown'}`,
    })
    deleteDoc(doc(db, PCS_LOOKUP_COLLECTION, id)).catch(() => {})
  }
  return { moved, archived: dupIds.length }
}
