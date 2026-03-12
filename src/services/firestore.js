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
} from 'firebase/firestore'
import { db } from '../lib/firebase'

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
// Stored fields: department, name, rolePosition, memberSince, notes (optional), createdAt.
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
    return {
      id: d.id,
      department: data.department,
      name: data.name,
      role: rolePosition,
      rolePosition,
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
  const ref = await addDoc(collection(db, 'department_team_members'), {
    department,
    name: data.name || '',
    rolePosition: data.rolePosition ?? data.role ?? '',
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
  const payload = {
    name: data.name != null ? String(data.name) : undefined,
    rolePosition: (data.rolePosition ?? data.role ?? '') !== undefined ? (data.rolePosition ?? data.role ?? '') : undefined,
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
export async function getUsersByDepartment(departmentName) {
  if (!db || !departmentName) return []
  const q = query(
    collection(db, 'users'),
    where('department', '==', departmentName)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
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

export async function getCellGroups(department) {
  if (!db || !department) return []
  const q = query(
    collection(db, CELL_GROUPS_COLLECTION),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      cellName: data.cellName || '',
      leader: data.leader || '',
      memberCount: Number(data.memberCount) || 0,
      department: data.department || '',
    }
  })
}

export async function addCellGroup(data) {
  if (!db) return null
  const ref = await addDoc(collection(db, CELL_GROUPS_COLLECTION), {
    cellName: data.cellName || '',
    leader: data.leader || '',
    memberCount: 0,
    department: data.department || 'Cell',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateCellGroup(id, data) {
  if (!db) return
  const payload = {}
  if (data.cellName !== undefined) payload.cellName = String(data.cellName)
  if (data.leader !== undefined) payload.leader = String(data.leader)
  if (data.memberCount !== undefined) payload.memberCount = Number(data.memberCount) || 0
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
      locality: data.locality || '',
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
    locality: data.locality !== undefined ? String(data.locality) : undefined,
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
