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
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage, functions, httpsCallable } from '../lib/firebase'
import { deriveRoleFromPositions } from '../constants/roles'
import { categorizeMemberByAttendance } from '../utils/cellMemberCategory'

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

export function subscribeTasksByDepartment(department, onChange) {
  if (!db || !department) return () => {}
  const q = query(collection(db, 'tasks'), where('department', '==', department), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, deadline: toDate(data.deadline) }
    }))
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
    onChange(snap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, deadline: toDate(data.deadline) }
    }))
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
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateWorshipTeamMember(id, data) {
  if (!db) return
  await updateDoc(doc(db, 'worship_team_members', id), data)
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
      role: rolePosition,
      rolePosition,
      subDepartment: subDepts[0] || '',
      subDepartments: subDepts,
      phone: data.phone || '',
      status: data.status || 'active',
      memberSince: data.memberSince || '',
      notes: data.notes || '',
      isFormer: data.isFormer ?? false,
      visitorId: data.visitorId || '',
      createdAt: toDate(data.createdAt),
    }
  })
  list.sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))
  return list
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
        role: rolePosition,
        rolePosition,
        subDepartment: subDepts[0] || '',
        subDepartments: subDepts,
        phone: data.phone || '',
        status: data.status || 'active',
        memberSince: data.memberSince || '',
        notes: data.notes || '',
        isFormer: data.isFormer ?? false,
        visitorId: data.visitorId || '',
        createdAt: toDate(data.createdAt),
      }
    })
    list.sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))
    onChange(list)
  }, () => {})
}

export async function addDepartmentTeamMember(department, data, addedBy) {
  if (!db) return null
  const subDepts = Array.isArray(data.subDepartments) ? data.subDepartments.filter(Boolean) : (data.subDepartment ? [data.subDepartment] : [])
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
    addedBy: addedBy || 'unknown',
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
    visitorId: data.visitorId !== undefined ? String(data.visitorId) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, 'department_team_members', id), clean)
}

export async function deleteDepartmentTeamMember(id) {
  if (!db) return
  await deleteDoc(doc(db, 'department_team_members', id))
}

// Department sub-departments (all departments except Cell & Worship use this)
const DEPARTMENT_SUBDEPARTMENTS_COLLECTION = 'department_sub_departments'

export async function getDepartmentSubDepartments(department) {
  if (!db || !department) return []
  const q = query(
    collection(db, DEPARTMENT_SUBDEPARTMENTS_COLLECTION),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => ({
    id: d.id,
    department,
    name: d.data().name || '',
    servingArea: d.data().servingArea || '',
    createdAt: toDate(d.data().createdAt),
  }))
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  return list
}

export async function addDepartmentSubDepartment(department, name, addedBy, servingArea = '') {
  if (!db || !department || !name) return null
  const ref = await addDoc(collection(db, DEPARTMENT_SUBDEPARTMENTS_COLLECTION), {
    department,
    name,
    servingArea: String(servingArea || '').trim(),
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
  const ref = await addDoc(collection(db, DEPARTMENT_CHILDREN_COLLECTION), {
    department,
    name: String(childData.name).trim(),
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
  return ref.id
}

export async function updateDepartmentChild(id, data) {
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
}

export async function deleteDepartmentChild(id) {
  if (!db || !id) return
  await updateDoc(doc(db, DEPARTMENT_CHILDREN_COLLECTION, id), { active: false })
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

export async function setWorshipScheduleByDate(department, date, assignments, updatedBy, extra = {}) {
  if (!db) return null
  const q = query(
    collection(db, 'worship_schedule'),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const existing = snap.docs.find((doc) => doc.data().date === date)
  const payload = stripUndefinedDeep({
    department, date, assignments, updatedBy: updatedBy || '', updatedAt: Timestamp.now(), ...extra,
  })
  if (existing) {
    await updateDoc(doc(db, 'worship_schedule', existing.id), payload)
    return existing.id
  }
  const ref = await addDoc(collection(db, 'worship_schedule'), payload)
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
  if (filters.month != null && filters.year != null) {
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

export async function updateFinanceIncome(id, data) {
  const [y, m, d] = String(data.date).split('-').map(Number)
  await updateDoc(doc(db, 'finance_income', id), {
    date: Timestamp.fromDate(new Date(y, m - 1, d)),
    category: data.category,
    amount: Number(data.amount) || 0,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteFinanceIncome(id) {
  await deleteDoc(doc(db, 'finance_income', id))
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
  const ref = await addDoc(collection(db, 'finance_expense'), {
    ...data,
    date: Timestamp.fromDate(new Date(data.date)),
    amount: Number(data.amount) || 0,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateFinanceExpense(id, data) {
  await updateDoc(doc(db, 'finance_expense', id), {
    date: Timestamp.fromDate(new Date(data.date)),
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
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateFinanceBudgetItem(id, data) {
  if (!db) return
  await updateDoc(doc(db, FINANCE_BUDGET_COLLECTION, id), financeBudgetPayload(data))
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
    phone: d.data().phone || '',
    visitorId: d.data().visitorId || '',
    since: d.data().since || '',
    leftDate: d.data().leftDate || '',
    status: d.data().status === 'inactive' ? 'inactive' : 'active',
    memberCategory: d.data().memberCategory || '',
    attendanceCountAtExit: Number.isFinite(d.data().attendanceCountAtExit) ? d.data().attendanceCountAtExit : null,
  }))
}

export async function addCellGroupMember(cellId, data) {
  if (!db || !cellId) return null
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
    createdAt: Timestamp.now(),
  })
  const members = await getCellGroupMembers(cellId)
  await updateDoc(doc(db, CELL_GROUPS_COLLECTION, cellId), { memberCount: members.length })
  return ref.id
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
        createdAt: toDate(data.createdAt),
        createdBy: data.createdBy || '',
      }
    }))
  }, () => {})
}

export async function addDelightVisitor(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, DELIGHT_VISITORS_COLLECTION), {
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
  }
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
  return snap.docs.map(mapPCSDoc).filter(e => e.status === 'inactive')
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

export async function addPCSEntry(data) {
  if (!db) return null
  // A PCS entry must be linked to a D-Light visitor record — no freeform/unlinked adds.
  if (!data.visitorId) throw new Error('A linked visitor record is required to add someone to PCS.')
  const ref = await addDoc(collection(db, CARING_PCS_COLLECTION), {
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
  if (Object.keys(payload).length) await updateDoc(doc(db, CARING_PCS_COLLECTION, id), payload)
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

// Sunday Ministry – pre-service team config (sunday_program / pre_service doc)
const SUNDAY_PRE_SERVICE_DOC_ID = 'pre_service'
const SUNDAY_PRE_SERVICE_COLLECTION = 'sunday_pre_service'

export async function getSundayPreServiceTeam() {
  if (!db) return []
  const ref = doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_PRE_SERVICE_DOC_ID)
  const snap = await getDoc(ref)
  if (!snap.exists()) return []
  const data = snap.data()
  return Array.isArray(data.team) ? data.team.map((n) => String(n).trim()).filter(Boolean) : []
}

export async function setSundayPreServiceTeam(team, updatedBy) {
  if (!db) return
  const ref = doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_PRE_SERVICE_DOC_ID)
  const clean = (Array.isArray(team) ? team : []).map((n) => String(n).trim()).filter(Boolean)
  await setDoc(ref, { team: clean, updatedBy: String(updatedBy || ''), updatedAt: Timestamp.now() }, { merge: true })
}

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
  }
}

export async function setSundayPreServiceEntry(dateStr, { speakers, topics }, updatedBy) {
  if (!db || !dateStr) return
  const id = String(dateStr).slice(0, 10)
  await setDoc(
    doc(db, SUNDAY_PRE_SERVICE_COLLECTION, id),
    {
      date: id,
      speakers: (Array.isArray(speakers) ? speakers : []).map((n) => String(n).trim()).filter(Boolean),
      topics: (Array.isArray(topics) ? topics : []).map((t) => String(t).trim()).filter(Boolean),
      updatedBy: String(updatedBy || ''),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  )
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
  return {
    date: data.date || '',
    filed: !!data.filed,
    sundayMinistryTeam: Array.isArray(data.sundayMinistryTeam) ? data.sundayMinistryTeam : [],
    pastoralAttendees: Array.isArray(data.pastoralAttendees) ? data.pastoralAttendees : [],
    sundayCellAttendance,
    olive: Array.isArray(data.olive) ? data.olive : [],
    jordan: Array.isArray(data.jordan) ? data.jordan : [],
    bethany: Array.isArray(data.bethany) ? data.bethany : [],
    edenStream: Array.isArray(data.edenStream) ? data.edenStream : [],
    bethel: Array.isArray(data.bethel) ? data.bethel : [],
    newCell1: Array.isArray(data.newCell1) ? data.newCell1 : [],
    children: Array.isArray(data.children) ? data.children : [],
    newComers: Array.isArray(data.newComers) ? data.newComers : [],
    others: Array.isArray(data.others) ? data.others : [],
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
 * Most recent Sunday reports, each reduced to the full set of lowercased names
 * present that week (pastoral, cells, non-cell, others, new comers, river kids,
 * 2nd/3rd/4th week attendees) — used to work out how many consecutive Sundays
 * a given name has been absent. Sorted most-recent-first.
 */
export async function getRecentSundayAttendanceWeeks(numWeeks = 20) {
  if (!db) return []
  const q = query(collection(db, SUNDAY_REPORTS_COLLECTION), orderBy('date', 'desc'), limit(numWeeks))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => {
      const data = d.data()
      const names = new Set()
      const addAll = (arr) => {
        if (!Array.isArray(arr)) return
        arr.forEach((n) => {
          const norm = String(n).trim().toLowerCase()
          if (norm) names.add(norm)
        })
      }
      addAll(data.nonCell)
      addAll(data.others)
      addAll(data.newComers)
      addAll(data.pastoralAttendees)
      addAll(data.riverKids)
      addAll(data.secondWeekAttendeesNames)
      addAll(data.thirdWeekAttendeesNames)
      addAll(data.fourthWeekAttendeesNames)
      const sca = data.sundayCellAttendance
      if (sca && typeof sca === 'object') Object.values(sca).forEach((arr) => addAll(arr))
      return { date: d.id, names }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Count how many distinct Sunday reports (weeks) each name appears in, across
 * nonCell, others, newComers, secondWeekAttendeesNames, and every cell's
 * sundayCellAttendance list. Name-based matching (lowercased, trimmed), same
 * approach as the rest of the Sunday attendance code.
 * Returns a Map<normalizedName, count>.
 */
export async function getSundayAttendanceCountsByName() {
  const counts = new Map()
  if (!db) return counts
  const snap = await getDocs(collection(db, SUNDAY_REPORTS_COLLECTION))
  snap.docs.forEach((d) => {
    const data = d.data()
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
    namesThisWeek.forEach((norm) => {
      counts.set(norm, (counts.get(norm) || 0) + 1)
    })
  })
  return counts
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
    // "New Comers" is never saved as a real names array from Live Control (it's derived live from
    // D-Light visitors each session, so normalizeReport always writes newComers as []) — only bulk
    // Excel imports populate that array for real. Prefer whichever source is actually non-zero.
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
    sundayCellAttendance: data.sundayCellAttendance || {},
    olive: data.olive,
    jordan: data.jordan,
    bethany: data.bethany,
    edenStream: data.edenStream,
    bethel: data.bethel,
    newCell1: data.newCell1,
    children: data.children,
    newComers: data.newComers,
    others: data.others,
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
      return { reportId: d.id, reportDate: d.data().reportDate || '', attendeeNames }
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
 * Save the full session summary (segment timings + attendee IDs) when meeting ends.
 */
export async function saveMidweekSessionSummary(cellId, dateStr, { segmentTimings, presentIds, updatedBy }) {
  if (!db || !cellId || !dateStr) return
  const d = String(dateStr).slice(0, 10)
  const id = `${cellId}_${d}`
  await setDoc(doc(db, MIDWEEK_SESSIONS, id), {
    cellId,
    date: d,
    segmentTimings: Array.isArray(segmentTimings) ? segmentTimings : [],
    presentIds: Array.isArray(presentIds) ? presentIds : [],
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

/**
 * After a midweek meeting ends, sync attendance into cell_reports so it
 * appears in the reports history immediately (without waiting for the Sunday Cloud Function).
 * Creates a minimal cell_reports doc if none exists for the given cell + date.
 * Adds present members to the attendees subcollection (skipping any already recorded).
 */
export async function syncMidweekAttendanceToCellReport(cellId, cellName, dateStr, presentMembers, updatedBy, visitors = []) {
  if (!db || !cellId || !dateStr || !Array.isArray(presentMembers)) return
  const d = String(dateStr).slice(0, 10)
  const visitorNames = Array.isArray(visitors) ? visitors.map((v) => v.name).filter(Boolean) : []

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
  if (snap.empty && presentMembers.length === 0) return

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
 * @param {string} [payload.updatedBy]
 * @returns {Promise<{membersAttended:number, visitors:number, children:number, meetingDurationMinutes:number, programList:Array}>}
 */
export async function updateCellReportFull(row, { attendees, segmentTimings, shepherdNotes, visitors, children, updatedBy }) {
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

  // 2. Update counts on cell_reports doc
  await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId), {
    membersAttended: attendees.length,
    visitors: Number(visitors) || 0,
    children: Number(children) || 0,
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
    status: data.status || 'pending',
    allottedTime: data.allottedTime || '',
    approvedBy: data.approvedBy || '',
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy || '',
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
    status: 'pending',
    createdAt: Timestamp.now(),
    createdBy: data.createdBy || 'unknown',
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
  if (data.status !== undefined) payload.status = String(data.status)
  if (data.allottedTime !== undefined) payload.allottedTime = String(data.allottedTime)
  if (data.approvedBy !== undefined) payload.approvedBy = String(data.approvedBy)
  if (Object.keys(payload).length) await updateDoc(doc(db, BOARD_POINTS_COLLECTION, id), payload)
}

export async function deleteBoardPoint(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, BOARD_POINTS_COLLECTION, id))
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
    baptised:         d.baptised         || '',
    baptismDate:      d.baptismDate      || '',
    baptismPlace:     d.baptismPlace     || '',
    baptismChurch:    d.baptismChurch    || '',
    maritalStatus:    d.maritalStatus    || '',
    marriageDate:     d.marriageDate     || '',
    spouseName:       d.spouseName       || '',
    spouseVisitorId:  d.spouseVisitorId  || '',
    hasKids:          d.hasKids          || '',
    children:         Array.isArray(d.children) ? d.children : [],
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

export async function upsertMemberProfile(visitorId, data, updatedBy = '') {
  if (!db || !visitorId) return
  const payload = {}
  const allowed = [
    'phone','email','dob','nativity','currentPlace',
    'baptised','baptismDate','baptismPlace','baptismChurch','maritalStatus','marriageDate','spouseName','spouseVisitorId',
    'isDirector','directorOf','directorSince','leaderSince','leaderUntil','ministryNotes',
    'ministryHistory','membershipStatus','membershipDocs','permanentAddress','photoUrl',
    'hasKids','children','previousChurchName','previousChurchPlace',
  ]
  for (const k of allowed) {
    if (data[k] !== undefined) payload[k] = data[k]
  }
  payload.updatedAt = Timestamp.now()
  payload.updatedBy = updatedBy
  await setDoc(doc(db, MEMBER_PROFILES_COLLECTION, visitorId), payload, { merge: true })
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
export async function getMergedPeopleDirectory() {
  const [people, cellMembers, pcsEntries, deptTeams, worshipTeams, cellGroups, visitors, sundayAttendance] = await Promise.all([
    getPeople().catch(() => []),
    getAllCellGroupMembers().catch(() => []),
    getPCSEntries().catch(() => []),
    getAllDepartmentTeamMembers().catch(() => []),
    getAllWorshipTeamMembers().catch(() => []),
    getCellGroups('Cell').catch(() => []),
    getDelightVisitors().catch(() => []),
    getAllPersonSundayAttendance().catch(() => []),
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

  return {
    profile:      profile || {},
    deptTeams:    mergeDocs(deptById, deptByPhone),
    worshipTeams: mergeDocs(worshipById, worshipByPhone),
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

export function subscribeCellUnassignedDismissals(onChange) {
  if (!db) return () => {}
  return onSnapshot(collection(db, CELL_UNASSIGNED_DISMISSALS), (snap) => {
    onChange(new Set(snap.docs.map((d) => d.id)))
  }, () => {})
}
