import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

/**
 * Best-effort audit logging. Must NEVER block main actions.
 */
export async function logAction({
  action,
  user,
  targetId,
  targetType,
  department = null,
  details = {},
}) {
  try {
    if (!action || !user?.uid || !targetId || !targetType) return
    await addDoc(collection(db, 'audit_logs'), {
      action: String(action),
      performedBy: user.uid,
      performedByName: user.displayName || '',
      targetId: String(targetId),
      targetType: String(targetType),
      department: department ? String(department) : null,
      details: details && typeof details === 'object' ? details : { value: details },
      timestamp: serverTimestamp(),
    })
  } catch (err) {
    // Swallow errors by design
    console.warn('Audit log write failed:', err)
  }
}

