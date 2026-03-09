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
    addedBy: addedBy || 'unknown',
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateWorshipTeamMember(id, data) {
  if (!db) return
  await updateDoc(doc(db, 'worship_team_members', id), data)
}

// Worship schedule: one doc per week, assignments array (single query, filter in memory to avoid composite index)
export async function getWorshipSchedules(department, weekStarts) {
  if (!db || !weekStarts?.length) return {}
  const weekSet = new Set(weekStarts)
  const q = query(
    collection(db, 'worship_schedule'),
    where('department', '==', department)
  )
  const snap = await getDocs(q)
  const out = {}
  weekStarts.forEach((ws) => { out[ws] = { weekStart: ws, assignments: [] } })
  snap.docs.forEach((d) => {
    const data = d.data()
    if (weekSet.has(data.weekStart)) out[data.weekStart] = { id: d.id, ...data }
  })
  return out
}

export async function setWorshipScheduleWeek(department, weekStart, assignments, updatedBy) {
  if (!db) return null
  const q = query(
    collection(db, 'worship_schedule'),
    where('department', '==', department),
    where('weekStart', '==', weekStart),
    limit(1)
  )
  const snap = await getDocs(q)
  const payload = { department, weekStart, assignments, updatedBy, updatedAt: Timestamp.now() }
  if (snap.docs.length) {
    await updateDoc(doc(db, 'worship_schedule', snap.docs[0].id), payload)
    return snap.docs[0].id
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
