import {
  collection,
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
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { deriveRoleFromPositions } from '../constants/roles'

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
    .slice(0, 4)
    .map((p) => ({
      department: String(p.department || ''),
      // new schema
      role: p.role != null ? String(p.role) : undefined,
      // legacy schema
      position: p.position != null ? String(p.position) : undefined,
    }))
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
  if (options.former === true) list = list.filter((m) => m.isFormer)
  if (options.former === false) list = list.filter((m) => !m.isFormer)
  return list
}

export async function addWorshipTeamMember(department, data, addedBy) {
  if (!db) return null
  const ref = await addDoc(collection(db, 'worship_team_members'), {
    department,
    name: data.name,
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

export async function deleteWorshipTeamMember(id) {
  if (!db) return
  await deleteDoc(doc(db, 'worship_team_members', id))
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
      createdAt: toDate(data.createdAt),
    }
  })
  list.sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))
  return list
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
    rolePosition: (data.rolePosition ?? data.role ?? '') !== undefined ? (data.rolePosition ?? data.role ?? '') : undefined,
    subDepartment: subDepts !== undefined ? (subDepts[0] || '') : (data.subDepartment != null ? String(data.subDepartment) : undefined),
    subDepartments: subDepts,
    phone: data.phone != null ? String(data.phone) : undefined,
    status: data.status != null ? String(data.status) : undefined,
    memberSince: data.memberSince != null ? String(data.memberSince).slice(0, 10) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    isFormer: data.isFormer !== undefined ? !!data.isFormer : undefined,
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
    active: d.data().active !== false,
    createdAt: toDate(d.data().createdAt),
  }))
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  return list
}

export async function addDepartmentChild(department, name, addedBy) {
  if (!db || !department || !String(name || '').trim()) return null
  const ref = await addDoc(collection(db, DEPARTMENT_CHILDREN_COLLECTION), {
    department,
    name: String(name).trim(),
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
  if (Object.keys(payload).length) await updateDoc(doc(db, DEPARTMENT_CHILDREN_COLLECTION, id), payload)
}

// Daily attendance: present[childId] = true/false
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

export async function setDepartmentChildAttendance(department, dateStr, present, updatedBy) {
  if (!db || !department || !dateStr) return
  const date = String(dateStr).slice(0, 10)
  const existing = await getDepartmentChildAttendance(department, date)
  const payload = {
    department,
    date,
    present: present && typeof present === 'object' ? present : {},
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
      program: x.program || '',
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
  if (data.budget !== undefined) payload.budget = String(data.budget || '')
  if (data.team !== undefined) payload.team = String(data.team || '')
  payload.updatedAt = Timestamp.now()
  await updateDoc(doc(db, DEPARTMENT_EVENTS_COLLECTION, id), payload)
}

export async function deleteDepartmentEvent(id) {
  if (!db || !id) return
  await deleteDoc(doc(db, DEPARTMENT_EVENTS_COLLECTION, id))
}

// Worship schedule by date: one doc per date, assignments = [{ role, memberId, memberName }]
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

export async function setWorshipScheduleByDate(department, date, assignments, updatedBy, extra = {}) {
  if (!db) return null
  const q = query(
    collection(db, 'worship_schedule'),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const existing = snap.docs.find((doc) => doc.data().date === date)
  const payload = { department, date, assignments, updatedBy, updatedAt: Timestamp.now(), ...extra }
  if (existing) {
    await updateDoc(doc(db, 'worship_schedule', existing.id), payload)
    return existing.id
  }
  const ref = await addDoc(collection(db, 'worship_schedule'), payload)
  return ref.id
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
  if (constraints.length) q = query(q, ...constraints, orderBy('date', 'desc'))
  else q = query(q, orderBy('date', 'desc'), limit(200))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, date: toDate(data.date) }
  })
}

export async function createFinanceIncome(data) {
  const ref = await addDoc(collection(db, 'finance_income'), {
    ...data,
    date: Timestamp.fromDate(new Date(data.date)),
    amount: Number(data.amount) || 0,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

// Finance Expense
export async function getFinanceExpense(filters = {}) {
  let q = collection(db, 'finance_expense')
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
  if (constraints.length) q = query(q, ...constraints, orderBy('date', 'desc'))
  else q = query(q, orderBy('date', 'desc'), limit(200))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, date: toDate(data.date) }
  })
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
      status: data.status === 'inactive' ? 'inactive' : 'active',
      createdAt: toDate(data.createdAt),
    }
  })
}

export async function addCellGroupMember(cellId, data) {
  if (!db || !cellId) return null
  const ref = await addDoc(cellGroupMembersRef(cellId), {
    name: data.name || '',
    birthday: data.birthday ? String(data.birthday).slice(0, 10) : '',
    anniversary: data.anniversary ? String(data.anniversary).slice(0, 10) : '',
    phone: data.phone || '',
    locality: data.locality || '',
    since: data.since ? String(data.since).slice(0, 10) : '',
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
    name: data.name !== undefined ? String(data.name) : undefined,
    birthday: data.birthday !== undefined ? String(data.birthday).slice(0, 10) : undefined,
    anniversary: data.anniversary !== undefined ? String(data.anniversary).slice(0, 10) : undefined,
    phone: data.phone !== undefined ? String(data.phone) : undefined,
    email: data.email !== undefined ? String(data.email) : undefined,
    role: data.role !== undefined ? String(data.role) : undefined,
    locality: data.locality !== undefined ? String(data.locality) : undefined,
    since: data.since !== undefined ? String(data.since).slice(0, 10) : undefined,
    status: data.status !== undefined ? (data.status === 'inactive' ? 'inactive' : 'active') : undefined,
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

function cellReportAttendeesRef(reportId) {
  return collection(db, CELL_REPORTS_COLLECTION, reportId, 'attendees')
}

export async function getCellReportByCellAndDate(cellId, reportDate) {
  if (!db || !cellId || !reportDate) return null
  const dateStr = String(reportDate).slice(0, 10)
  const q = query(
    collection(db, CELL_REPORTS_COLLECTION),
    where('cellId', '==', cellId),
    where('reportDate', '==', dateStr)
  )
  const snap = await getDocs(q)
  const doc = snap.docs[0]
  if (!doc) return null
  const data = doc.data()
  return {
    id: doc.id,
    cellId: data.cellId || '',
    cellName: data.cellName || '',
    meetingDay: data.meetingDay || '',
    membersAttended: Number(data.membersAttended) || 0,
    visitors: Number(data.visitors) || 0,
    children: Number(data.children) || 0,
    visitorsList: Array.isArray(data.visitorsList) ? data.visitorsList : [],
    childrenList: Array.isArray(data.childrenList) ? data.childrenList : [],
    reportDate: data.reportDate || '',
    createdBy: data.createdBy || '',
    createdAt: toDate(data.createdAt),
  }
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
      createdBy: data.createdBy || '',
      createdAt: toDate(data.createdAt),
    }
  })
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

export async function updateCellReport(reportId, data) {
  if (!db || !reportId) return
  const payload = {
    membersAttended: data.membersAttended !== undefined ? Number(data.membersAttended) : undefined,
    visitors: data.visitors !== undefined ? Number(data.visitors) : undefined,
    children: data.children !== undefined ? Number(data.children) : undefined,
    visitorsList: data.visitorsList !== undefined ? (Array.isArray(data.visitorsList) ? data.visitorsList : []) : undefined,
    childrenList: data.childrenList !== undefined ? (Array.isArray(data.childrenList) ? data.childrenList : []) : undefined,
  }
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId), clean)
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

export async function getDelightVisitors() {
  if (!db) return []
  const q = query(
    collection(db, DELIGHT_VISITORS_COLLECTION),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
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
      createdAt: toDate(data.createdAt),
      createdBy: data.createdBy || '',
    }
  })
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
  if (!db) return { items: [] }
  const ref = doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_PROGRAM_DEFAULT_DOC_ID)
  const snap = await getDoc(ref)
  if (!snap.exists()) return { items: [] }
  const data = snap.data()
  const items = Array.isArray(data.items)
    ? data.items.map((x, i) => ({
        programName: x.programName || x.name || '',
        order: typeof x.order === 'number' ? x.order : i,
      }))
    : []
  items.sort((a, b) => a.order - b.order)
  return {
    items,
    updatedAt: toDate(data.updatedAt),
    updatedBy: data.updatedBy || '',
  }
}

export async function setSundayProgramDefault(items, updatedBy) {
  if (!db) return
  const ref = doc(db, SUNDAY_PROGRAM_COLLECTION, SUNDAY_PROGRAM_DEFAULT_DOC_ID)
  const clean = (Array.isArray(items) ? items : [])
    .map((x, i) => ({
      programName: String(x.programName || x.name || '').trim(),
      order: typeof x.order === 'number' ? x.order : i,
    }))
    .filter((x) => x.programName)
  await setDoc(
    ref,
    {
      items: clean,
      updatedBy: updatedBy || 'unknown',
      updatedAt: serverTimestamp(),
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
  secondWeekAttendeesNames: [],
  programList: [],
  preservice: { lead1: '', lead2: '' },
  summary: {
    totalVolunteers: '',
    cellAttendance: '',
    newcomers: '',
    secondWeekAttendees: '',
    riverKids: '',
    englishServiceAttendance: '',
    tamilServiceAttendance: '',
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
    secondWeekAttendeesNames: Array.isArray(data.secondWeekAttendeesNames) ? data.secondWeekAttendeesNames : [],
    programList: Array.isArray(data.programList) ? data.programList : [],
    preservice: data.preservice && typeof data.preservice === 'object' ? { lead1: data.preservice.lead1 || '', lead2: data.preservice.lead2 || '' } : { lead1: '', lead2: '' },
    summary: data.summary && typeof data.summary === 'object'
      ? {
          totalVolunteers: data.summary.totalVolunteers ?? '',
          cellAttendance: data.summary.cellAttendance ?? '',
          newcomers: data.summary.newcomers ?? '',
          secondWeekAttendees: data.summary.secondWeekAttendees ?? '',
          riverKids: data.summary.riverKids ?? '',
          englishServiceAttendance: data.summary.englishServiceAttendance ?? '',
          tamilServiceAttendance: data.summary.tamilServiceAttendance ?? '',
          totalAdults: data.summary.totalAdults ?? '',
          totalAttendance: data.summary.totalAttendance ?? '',
        }
      : { ...DEFAULT_SUNDAY_REPORT.summary },
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function getSundayReport(dateStr) {
  if (!db || !dateStr) return null
  const id = String(dateStr).slice(0, 10)
  const ref = doc(db, SUNDAY_REPORTS_COLLECTION, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return { id, date: id, ...DEFAULT_SUNDAY_REPORT }
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
    secondWeekAttendeesNames: data.secondWeekAttendeesNames,
    programList: data.programList,
    preservice: data.preservice,
    summary: data.summary,
    updatedBy: updatedBy || 'unknown',
    updatedAt: now,
  }, { merge: true })
  return ref.id
}
