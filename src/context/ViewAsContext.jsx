import { createContext, useContext, useState } from 'react'

// ─── Role definitions shown in the switcher bar ───────────────────────────────

export const VIEW_AS_ROLES = [
  { key: 'founder',   label: 'Founder'   },
  { key: 'director',  label: 'Director'  },
  { key: 'leader',    label: 'Leader'    },
  { key: 'admin',     label: 'Admin'     },
  { key: 'associate', label: 'Associate' },
]

// ─── Capability map per role ──────────────────────────────────────────────────
// Pages import this to conditionally show/hide features.

export const VIEW_AS_CAPABILITIES = {
  founder: {
    label: 'Full access — all cells, all data',
    canEditContent:     true,
    canTransferMembers: true,
    canSeeAllCells:     true,
    canPublishPlans:    true,
    canManageUsers:     true,
    canSeeFinance:      true,
    canUseLiveControl:  true,
    canSeePrayerPoints: true,
    canSeeSundayPlan:   true,
  },
  director: {
    label: 'Department only — can push content to leaders',
    canEditContent:     true,
    canTransferMembers: true,
    canSeeAllCells:     true,
    canPublishPlans:    true,
    canManageUsers:     false,
    canSeeFinance:      true,
    canUseLiveControl:  true,
    canSeePrayerPoints: true,
    canSeeSundayPlan:   true,
  },
  leader: {
    label: 'Own cell only — no other cells visible',
    canEditContent:     false,
    canTransferMembers: true,
    canSeeAllCells:     false,
    canPublishPlans:    false,
    canManageUsers:     false,
    canSeeFinance:      false,
    canUseLiveControl:  true,
    canSeePrayerPoints: true,
    canSeeSundayPlan:   true,
  },
  admin: {
    label: 'Records & member management only',
    canEditContent:     false,
    canTransferMembers: true,
    canSeeAllCells:     true,
    canPublishPlans:    false,
    canManageUsers:     true,
    canSeeFinance:      false,
    canUseLiveControl:  false,
    canSeePrayerPoints: false,
    canSeeSundayPlan:   false,
  },
  associate: {
    label: 'View only — own cell info & updates',
    canEditContent:     false,
    canTransferMembers: false,
    canSeeAllCells:     false,
    canPublishPlans:    false,
    canManageUsers:     false,
    canSeeFinance:      false,
    canUseLiveControl:  false,
    canSeePrayerPoints: true,
    canSeeSundayPlan:   true,
  },
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ViewAsContext = createContext({
  viewAsRole: 'founder',
  setViewAsRole: () => {},
  capabilities: VIEW_AS_CAPABILITIES.founder,
})

export function ViewAsProvider({ children }) {
  const [viewAsRole, setViewAsRole] = useState('founder')
  const capabilities = VIEW_AS_CAPABILITIES[viewAsRole] ?? VIEW_AS_CAPABILITIES.founder

  return (
    <ViewAsContext.Provider value={{ viewAsRole, setViewAsRole, capabilities }}>
      {children}
    </ViewAsContext.Provider>
  )
}

export function useViewAs() {
  return useContext(ViewAsContext)
}
