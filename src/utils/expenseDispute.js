// A finance_expense the department has disapproved: either its own bill marked
// Disapproved (status 'disapproved'), or a Finance Assistant bill it rejected
// (deptConfirmation 'rejected'). It stays disputed — shown as Disapproved in
// Accounts and escalated to the Accounts Director's My Workspace ribbon — until
// the department approves/confirms it or Accounts removes it.
export function isExpenseDisputed(e) {
  return e?.status === 'disapproved' || e?.deptConfirmation === 'rejected'
}

export function disputeReason(e) {
  return e?.deptConfirmation === 'rejected' ? (e.deptRejectReason || '') : (e?.disapproveReason || '')
}
