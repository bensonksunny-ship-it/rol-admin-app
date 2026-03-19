const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

// Debug helper: confirms callable receives auth context
exports.whoAmI = onCall(async (request) => {
  const uid = request.auth?.uid || null
  return { uid }
})

/**
 * Admin-only user creation.
 * - Creates Firebase Auth user (email + password=membershipNumber)
 * - Creates matching Firestore profile at users/{uid}
 */
exports.adminCreateUser = onCall(async (request) => {
  const callerUid = request.auth && request.auth.uid
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Must be signed in')
  }

  const db = admin.firestore()
  const callerSnap = await db.collection('users').doc(callerUid).get()
  const caller = callerSnap.exists ? callerSnap.data() : null
  const callerRole = caller && caller.role
  const callerGlobalRole = caller && caller.globalRole

  // Only FOUNDER may create users (backward compatible with legacy role Founder)
  if (callerGlobalRole !== 'FOUNDER' && callerRole !== 'Founder' && request.auth?.token?.globalRole !== 'FOUNDER') {
    throw new HttpsError('permission-denied', 'Only Founder can create users')
  }

  const {
    name,
    email,
    phone,
    membershipNumber, // used as password
    role,
    globalRole,
    department,
    departments,
    positions,
    cellGroup,
    cellId,
    status,
  } = request.data || {}

  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanMembershipNumber = String(membershipNumber || '').trim()

  if (!cleanEmail || !cleanMembershipNumber) {
    throw new HttpsError('invalid-argument', 'Email and Membership Number are required')
  }

  // Derive role/departments from positions if provided
  let finalRole = role || ''
  let finalDepartments = Array.isArray(departments) ? departments : (department ? [department] : [])
  let finalDepartment = finalDepartments[0] || department || ''
  const finalPositions = Array.isArray(positions) && positions.length
    ? positions.filter((p) => p && (p.department || p.position || p.role)).slice(0, 4)
    : []

  if (finalPositions.length) {
    const deptSet = new Set(finalPositions.map((p) => p.department).filter(Boolean))
    finalDepartments = Array.from(deptSet)
    finalDepartment = finalDepartments[0] || ''
    const hasDirector = finalPositions.some((p) => p.position === 'Director')
    const hasCoordinator = finalPositions.some((p) => p.position === 'Coordinator' || p.position === 'Cell Leader')
    if (hasDirector) finalRole = 'Director'
    else if (hasCoordinator) finalRole = 'Coordinator'
    else finalRole = 'Viewer'
  }

  // Ensure email + membershipNumber uniqueness at Firestore level
  const emailSnap = await db
    .collection('users')
    .where('email', '==', cleanEmail)
    .limit(1)
    .get()
  if (!emailSnap.empty) {
    throw new HttpsError('already-exists', 'Email already exists')
  }

  const memSnap = await db
    .collection('users')
    .where('membershipNumber', '==', cleanMembershipNumber)
    .limit(1)
    .get()
  if (!memSnap.empty) {
    throw new HttpsError('already-exists', 'Membership Number already exists')
  }

  // 1) Create Auth user
  const userRecord = await admin.auth().createUser({
    email: cleanEmail,
    password: cleanMembershipNumber,
    displayName: name || '',
    disabled: status === 'inactive',
  })

  const uid = userRecord.uid

  // 2) Create Firestore profile under users/{uid}
  await db.collection('users').doc(uid).set({
    name: name || '',
    email: cleanEmail,
    phone: phone || '',
    membershipNumber: cleanMembershipNumber,
    role: finalRole,
    globalRole: globalRole === 'FOUNDER' ? 'FOUNDER' : null,
    department: finalDepartment,
    departments: finalDepartments,
    positions: finalPositions,
    cellGroup: cellGroup || '',
    cellId: cellId || '',
    status: status || 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: callerUid,
  })

  // Keep Auth custom claims in sync for Founder users
  if (globalRole === 'FOUNDER') {
    await admin.auth().setCustomUserClaims(uid, { globalRole: 'FOUNDER' })
  }

  // Best-effort audit log (must not fail user creation)
  try {
    await db.collection('audit_logs').add({
      action: 'CREATE_USER',
      performedBy: callerUid,
      performedByName: caller?.name || caller?.displayName || caller?.email || '',
      targetId: uid,
      targetType: 'USER',
      department: finalDepartment || null,
      details: {
        email: cleanEmail,
        departments: finalDepartments,
        role: finalRole,
        globalRole: globalRole === 'FOUNDER' ? 'FOUNDER' : null,
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.warn('Audit log failed (CREATE_USER):', err)
  }

  return { uid }
})

// Founder-only: assign/remove globalRole=FOUNDER and set matching Auth custom claim
exports.setGlobalRole = onCall(async (request) => {
  const callerUid = request.auth?.uid
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const db = admin.firestore()
  const callerSnap = await db.collection('users').doc(callerUid).get()
  const caller = callerSnap.exists ? callerSnap.data() : null
  const callerIsFounder =
    request.auth?.token?.globalRole === 'FOUNDER' ||
    caller?.globalRole === 'FOUNDER' ||
    caller?.role === 'Founder'

  // Break-glass: if there is no Founder at all, allow legacy Admin to self-promote ONLY (to avoid permanent lockout).
  let breakGlassAllowed = false
  if (!callerIsFounder && caller?.role === 'Admin') {
    const founders = await db.collection('users').where('globalRole', '==', 'FOUNDER').limit(1).get()
    const legacyFounders = await db.collection('users').where('role', '==', 'Founder').limit(1).get()
    breakGlassAllowed = founders.empty && legacyFounders.empty
  }

  if (!callerIsFounder && !breakGlassAllowed) {
    throw new HttpsError('permission-denied', 'Only Founder can set global roles')
  }

  const { uid, globalRole } = request.data || {}
  const targetUid = String(uid || '').trim()
  if (!targetUid) throw new HttpsError('invalid-argument', 'uid is required')

  if (breakGlassAllowed && targetUid !== callerUid) {
    throw new HttpsError('permission-denied', 'Admin may only self-promote when no Founder exists')
  }

  // Prevent self-removal
  if (targetUid === callerUid && globalRole !== 'FOUNDER') {
    throw new HttpsError('failed-precondition', 'Founder cannot remove their own Founder role')
  }

  const next = globalRole === 'FOUNDER' ? 'FOUNDER' : null
  await db.collection('users').doc(targetUid).set({ globalRole: next }, { merge: true })
  await admin.auth().setCustomUserClaims(targetUid, next ? { globalRole: 'FOUNDER' } : {})

  // Best-effort audit log
  try {
    await db.collection('audit_logs').add({
      action: 'ASSIGN_ROLE',
      performedBy: callerUid,
      performedByName: caller?.name || caller?.displayName || caller?.email || '',
      targetId: targetUid,
      targetType: 'USER',
      department: null,
      details: { globalRole: next },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.warn('Audit log failed (ASSIGN_ROLE):', err)
  }

  return { uid: targetUid, globalRole: next }
})

/**
 * One-time migration: backfill departments[] and positions[] for legacy users.
 * Only Founder (or break-glass Admin when no Founder exists) may run this.
 */
exports.migrateUserDepartmentsAndPositions = onCall(async (request) => {
  const callerUid = request.auth?.uid
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const db = admin.firestore()
  const callerSnap = await db.collection('users').doc(callerUid).get()
  const caller = callerSnap.exists ? callerSnap.data() : null

  const callerIsFounder =
    request.auth?.token?.globalRole === 'FOUNDER' ||
    caller?.globalRole === 'FOUNDER' ||
    caller?.role === 'Founder'

  if (!callerIsFounder) {
    throw new HttpsError('permission-denied', 'Only Founder can run migration')
  }

  const updated = []
  let lastDoc = null

  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(200)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    const batch = db.batch()

    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {}
      const id = docSnap.id

      const positions = Array.isArray(data.positions) ? data.positions.filter(Boolean) : []
      const departments = Array.isArray(data.departments) ? data.departments.filter(Boolean) : []
      const primaryDept = data.department || null
      const role = data.role || ''

      let nextPositions = positions.slice(0, 4)
      let nextDepartments = departments.slice()

      const hasPositions = nextPositions.length > 0
      const hasDepartments = nextDepartments.length > 0

      // Derive departments from positions if missing
      if (!hasDepartments && hasPositions) {
        const set = new Set(nextPositions.map((p) => p.department).filter(Boolean))
        nextDepartments = Array.from(set)
      }

      // Legacy users: have department/role but no positions[]/departments[]
      const isLegacyLike = primaryDept && (!hasPositions || !hasDepartments)
      if (isLegacyLike) {
        if (!hasPositions) {
          // Create a single position based on legacy role
          let position = 'Associate'
          if (role === 'Director' || role === 'FOUNDERR' || role === 'FOUNDER') position = 'Director'
          else if (role === 'Coordinator' || role === 'COORDINATOR') position = 'Coordinator'
          else if (role === 'Cell Leader') position = 'Cell Leader'

          nextPositions.push({
            department: primaryDept,
            position,
          })
        }
        if (!nextDepartments.length) {
          nextDepartments = [primaryDept]
        }
      }

      // Nothing to change
      const samePositions =
        JSON.stringify(positions) === JSON.stringify(nextPositions)
      const sameDepartments =
        JSON.stringify(departments) === JSON.stringify(nextDepartments)
      if (samePositions && sameDepartments) continue

      batch.update(docSnap.ref, {
        positions: nextPositions,
        departments: nextDepartments,
      })
      updated.push(id)
    }

    if (!updated.length) {
      lastDoc = snap.docs[snap.docs.length - 1]
      if (snap.size < 200) break
      continue
    }

    await batch.commit()
    lastDoc = snap.docs[snap.docs.length - 1]
    if (snap.size < 200) break
  }

  return { updatedCount: updated.length }
})

