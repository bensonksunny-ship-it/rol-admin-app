import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccessAccountsEntry, isSundayCashCounter } from '../utils/accountsEntryAccess'
import SundayCashCount from '../components/finance/SundayCashCount'

/**
 * Sunday Cash Count — the Sunday Cash Counter's page (also open to the Accounts
 * team). The same screen opens as a window from the Offering popup.
 */
export default function SundayCashCountPage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const allowed = isSundayCashCounter(userProfile) || canAccessAccountsEntry(userProfile, hasPermission, isFounder)
  if (!allowed) return <Navigate to="/" replace />
  return (
    <div className="mx-auto w-full max-w-4xl pb-12">
      <SundayCashCount />
    </div>
  )
}
