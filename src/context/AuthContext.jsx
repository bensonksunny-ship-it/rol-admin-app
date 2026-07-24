import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { auth, db, functions, httpsCallable } from '../lib/firebase'
import { ROLES, ROLE_PERMISSIONS, deriveRoleFromPositions } from '../constants/roles'
import { getDepartmentBySlug } from '../constants/departments'
import { GLOBAL_ROLES, hasAccess, getDepartmentRole, isFounder as isFounderGlobal } from '../utils/access'
import { upsertUserDirectoryEntry, syncAllUsersToDirectory } from '../services/firestore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bootstrappedFounder, setBootstrappedFounder] = useState(false)
  const [syncedDepartments, setSyncedDepartments] = useState(false)
  const [syncedDirectory, setSyncedDirectory] = useState(false)
  const [syncedFullDirectory, setSyncedFullDirectory] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        // Read custom claims (preferred for rules/Founder access)
        let tokenGlobalRole = null
        try {
          const tokenRes = await firebaseUser.getIdTokenResult(true)
          tokenGlobalRole = tokenRes?.claims?.globalRole || null
        } catch (e) {
          tokenGlobalRole = null
        }

        const profileRef = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(profileRef)
        const data = snap.exists() ? { id: snap.id, ...snap.data() } : null
        if (data) {
          const positionsDepts = Array.isArray(data.positions)
            ? data.positions.map((p) => p?.department).filter(Boolean)
            : []
          const derivedFromPositions = Array.from(new Set(positionsDepts))

          // Support multiple departments: use "departments" array if set, else single "department"
          const departments = Array.isArray(data.departments) && data.departments.length
            ? data.departments
            : (data.department ? [data.department] : [])
          const merged = {
            ...data,
            departments: Array.from(new Set([...(departments || []), ...(derivedFromPositions || [])])),
            // If claim says Founder but Firestore isn't updated yet, treat as Founder in UI immediately.
            globalRole: tokenGlobalRole === 'FOUNDER' ? 'FOUNDER' : (data.globalRole || null),
          }

          // Ensure `role` exists for permission checks (some legacy users may lack it).
          // Derive permissions from positions[] when missing/empty.
          if (!merged.role) {
            merged.role = deriveRoleFromPositions(Array.isArray(merged.positions) ? merged.positions : [])
          }
          setUserProfile(merged)

          // Best-effort: ensure departments[] exists for rules (derived from positions[]).
          // This is critical for multi-department users like Cell Directors whose primary department isn't Cell.
          if (!syncedDepartments && derivedFromPositions.length) {
            const existing = Array.isArray(data.departments) ? data.departments.filter(Boolean) : []
            const next = Array.from(new Set([...existing, ...derivedFromPositions]))
            const changed = next.length !== existing.length
            if (changed) {
              setSyncedDepartments(true)
              try {
                await updateDoc(profileRef, { departments: next })
              } catch (e) {
                console.warn('Failed to sync departments from positions:', e)
              }
            }
          }

          // Best-effort: keep the public user_directory entry (used for the "message a
          // user" picker) fresh, once per session — see services/firestore.js.
          if (!syncedDirectory) {
            setSyncedDirectory(true)
            upsertUserDirectoryEntry(firebaseUser.uid, {
              name: merged.name || '',
              email: merged.email || '',
              role: merged.role || '',
              department: merged.department || '',
              departments: merged.departments || [],
              status: merged.status || 'active',
            }).catch((e) => console.warn('Failed to sync user_directory entry:', e))
          }

          // Once per session: backfill user_directory from the full `users` collection so
          // every existing user/leader/director is searchable in Messages right away, not
          // just people who happen to log in after this feature shipped. This runs via a
          // Cloud Function (Admin SDK), so it works for any signed-in user — not just
          // Founder — even though a plain client-side `users` list query would be denied
          // for everyone else under firestore.rules. See functions/index.js#syncUserDirectory.
          if (!syncedFullDirectory) {
            setSyncedFullDirectory(true)
            syncAllUsersToDirectory().catch((e) => console.warn('Failed to backfill user_directory:', e))
          }

          // Auto-bootstrap legacy Founder into globalRole+custom claim (best-effort, once per session)
          if (
            !bootstrappedFounder &&
            tokenGlobalRole !== 'FOUNDER' &&
            merged.globalRole !== 'FOUNDER' &&
            merged.role === ROLES.FOUNDER &&
            functions
          ) {
            setBootstrappedFounder(true)
            try {
              const setGlobalRole = httpsCallable(functions, 'setGlobalRole')
              await setGlobalRole({ uid: firebaseUser.uid, globalRole: 'FOUNDER' })
              // Refresh token + profile to reflect claim/Firestore changes
              await firebaseUser.getIdToken(true)
              const snap2 = await getDoc(profileRef)
              const data2 = snap2.exists() ? { id: snap2.id, ...snap2.data() } : null
              if (data2) {
                const depts2 = Array.isArray(data2.departments) && data2.departments.length
                  ? data2.departments
                  : (data2.department ? [data2.department] : [])
                setUserProfile({ ...data2, departments: depts2, globalRole: 'FOUNDER' })
              } else {
                setUserProfile({ ...merged, globalRole: 'FOUNDER' })
              }
            } catch (e) {
              // Ignore bootstrap failures; user can still be fixed from User Management when accessible.
              console.warn('Founder bootstrap failed:', e)
            }
          }
        } else {
          setUserProfile(null)
        }
      } else {
        setUserProfile(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [bootstrappedFounder, syncedDepartments, syncedDirectory, syncedFullDirectory])

  const signIn = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const signOut = () => firebaseSignOut(auth)

  const hasPermission = (permission) => {
    // SUPER ADMIN override: all menu permissions
    if (userProfile?.globalRole === GLOBAL_ROLES.FOUNDER) return true
    if (!userProfile?.role) return false
    return ROLE_PERMISSIONS[userProfile.role]?.[permission] ?? false
  }

  const isFounder = isFounderGlobal(userProfile) || userProfile?.role === ROLES.FOUNDER
  const isSeniorPastor = userProfile?.role === ROLES.SENIOR_PASTOR
  const isAdmin = userProfile?.role === ROLES.ADMIN
  const isCellDirector = getDepartmentRole(userProfile, 'Cell') === 'DIRECTOR'

  const isSundayMinistryDirector = isFounder || isSeniorPastor || getDepartmentRole(userProfile, 'Sunday Ministry') === 'DIRECTOR'

  const isDepartmentHead = (departmentName) => {
    if (!departmentName || !userProfile) return false
    if (isFounder || isSeniorPastor) return true
    const deptRole = getDepartmentRole(userProfile, departmentName)
    return deptRole === 'DIRECTOR' || deptRole === 'COORDINATOR'
  }

  const canManageDepartment = (departmentName) => {
    if (!departmentName) return false
    if (isFounder || isSeniorPastor) return true
    // Directors and Coordinators can manage their own department
    const role = getDepartmentRole(userProfile, departmentName)
    return role === 'DIRECTOR' || role === 'COORDINATOR'
  }

  /** True if user may access the department page for this slug (role-based). */
  const canAccessDepartment = (departmentSlug) => {
    if (!departmentSlug || !userProfile) return false
    const dept = getDepartmentBySlug(departmentSlug)
    return !!(dept && hasAccess(userProfile, dept.name))
  }

  /** True if sidebar should show all departments (Super admin only; legacy Founder supported). */
  const canSeeAllDepartments = isFounder

  const canEditSundaySection = (sectionKey) => {
    if (hasPermission('editSundayPlanFull')) return true
    return userProfile?.sundaySection === sectionKey
  }

  const value = {
    user,
    userProfile,
    loading,
    signIn,
    signOut,
    hasPermission,
    canEditSundaySection,
    isFounder,
    isSeniorPastor,
    isAdmin,
    isCellDirector,
    isSundayMinistryDirector,
    isDepartmentHead,
    canManageDepartment,
    canAccessDepartment,
    canSeeAllDepartments,
    hasAccess,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
