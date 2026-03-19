import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { auth, db, functions, httpsCallable } from '../lib/firebase'
import { ROLES, ROLE_PERMISSIONS } from '../constants/roles'
import { getDepartmentBySlug } from '../constants/departments'
import { GLOBAL_ROLES, hasAccess, getDepartmentRole, isFounder as isFounderGlobal } from '../utils/access'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bootstrappedFounder, setBootstrappedFounder] = useState(false)
  const [syncedDepartments, setSyncedDepartments] = useState(false)

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
  }, [bootstrappedFounder, syncedDepartments])

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

  const isDepartmentHead = (departmentName) => {
    if (!departmentName || !userProfile) return false
    if (isFounder || isSeniorPastor) return true
    const deptRole = getDepartmentRole(userProfile, departmentName)
    return deptRole === 'DIRECTOR' || deptRole === 'COORDINATOR'
  }

  const canManageDepartment = (departmentName) => {
    if (!departmentName) return false
    if (isFounder || isSeniorPastor) return true
    // Department Directors can manage their own department
    return hasAccess(userProfile, departmentName, 'DIRECTOR')
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
