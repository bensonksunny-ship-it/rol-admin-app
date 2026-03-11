import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { ROLES, ROLE_PERMISSIONS } from '../constants/roles'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const profileRef = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(profileRef)
        setUserProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      } else {
        setUserProfile(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const signIn = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const signOut = () => firebaseSignOut(auth)

  const hasPermission = (permission) => {
    if (!userProfile?.role) return false
    return ROLE_PERMISSIONS[userProfile.role]?.[permission] ?? false
  }

  const isFounder = userProfile?.role === ROLES.FOUNDER
  const isSeniorPastor = userProfile?.role === ROLES.SENIOR_PASTOR

  const isDepartmentHead = (departmentName) => {
    if (!departmentName || !userProfile?.department) return false
    const sameDept = userProfile.department === departmentName
    const headRole =
      userProfile.role === ROLES.DIRECTOR ||
      userProfile.role === ROLES.COORDINATOR
    return sameDept && headRole
  }

  const canManageDepartment = (departmentName) => {
    if (!departmentName) return false
    if (isFounder || isSeniorPastor) return true
    return isDepartmentHead(departmentName)
  }

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
    isDepartmentHead,
    canManageDepartment,
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
