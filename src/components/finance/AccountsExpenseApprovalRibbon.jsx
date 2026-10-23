import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { subscribePendingFinanceExpenses } from '../../services/firestore'
import { getDepartmentRole } from '../../utils/access'
import { canAccessWeeklyEntryOnly } from '../../utils/accountsEntryAccess'
import { normalizeDepartmentName } from '../../constants/roles'
import { monthKeyOf } from '../../utils/financeEntryLock'
import useFinanceMonthLocks from '../../hooks/useFinanceMonthLocks'
import { getDepartmentIcon } from '../../constants/departments'
import DepartmentNotificationRibbon from '../DepartmentNotificationRibbon'

// The Accounts team (Accounts Director / Coordinator and the Finance Assistant) —
// never the Founder, whose dashboard stays free of expense-approval ribbons.
function isAccountsTeam(userProfile, isFounder) {
  if (isFounder || !userProfile) return false
  if (canAccessWeeklyEntryOnly(userProfile)) return true
  const role = getDepartmentRole(userProfile, 'Accounts')
  return role === 'DIRECTOR' || role === 'COORDINATOR'
}

const billLabel = (e) => `₹${Number(e.amount || 0).toLocaleString('en-IN')}${e.item ? ` · ${e.item}` : ''}${e.date ? ` (${format(e.date, 'd MMM')})` : ''}`

/**
 * Accounts team only, on My Workspace: one amber "Expense to approve" ribbon for
 * bills still waiting on their department's approval, across all departments, in
 * months still open for finance. Supports "Remind me later" (24h, saved per user).
 * "Open expenses" goes to the Accounts page's Expense tab.
 */
export default function AccountsExpenseApprovalRibbon() {
  const navigate = useNavigate()
  const onOpen = () => navigate('/department/accounts?tab=expense')
  const { userProfile, isFounder } = useAuth()
  const show = isAccountsTeam(userProfile, isFounder)
  const [bills, setBills] = useState([])
  useEffect(() => (show ? subscribePendingFinanceExpenses(setBills) : undefined), [show])
  const { isLocked } = useFinanceMonthLocks(false)
  if (!show) return null

  const open = bills.filter((e) => !e.deptConfirmation && e.date && !isLocked(monthKeyOf(e.date)))
  if (!open.length) return null
  const byDept = {}
  open.forEach((e) => {
    const d = normalizeDepartmentName(e.department || e.category || 'Other')
    byDept[d] = (byDept[d] || 0) + 1
  })
  const n = open.length
  const alerts = [{
    id: 'accounts-expense-approval',
    category: 'expense_approval',
    kind: 'action',
    tone: 'amber',
    count: n,
    title: n === 1 ? `Expense to approve: ${billLabel(open[0])}` : `${n} expenses awaiting department approval`,
    detail: 'Waiting for the department Director / Coordinator to approve.',
    items: Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([d, c]) => `${d} · ${c}`),
    actions: [{ label: 'Open expenses', onClick: onOpen, primary: true }],
  }]
  return <DepartmentNotificationRibbon asModal icon={getDepartmentIcon('Accounts')} departmentName="Accounts" storageKey="accounts" alerts={alerts} />
}
