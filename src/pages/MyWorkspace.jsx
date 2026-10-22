import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import WorkspaceHeader from '../components/workspace/WorkspaceHeader'
import ToDoListCard from '../components/workspace/ToDoListCard'
import EdenGardenGrid from '../components/workspace/EdenGardenGrid'
import FounderInsightsPanel from '../components/workspace/FounderInsightsPanel'
import WorshipWorkspaceWidget from '../components/workspace/WorshipWorkspaceWidget'
import BoardMeetingWorkspaceWidget from '../components/workspace/BoardMeetingWorkspaceWidget'
import ApprovalsCard from '../components/workspace/ApprovalsCard'
import MembershipPipelineWidget from '../components/caring/MembershipPipelineWidget'
import DeaconInterviewRibbon from '../components/workspace/DeaconInterviewRibbon'
import DeclarationRequestRibbon from '../components/workspace/DeclarationRequestRibbon'
import CellLeaderApprovalRibbon from '../components/workspace/CellLeaderApprovalRibbon'
import ExpenseDisputeRibbon from '../components/workspace/ExpenseDisputeRibbon'
import QuickActionsWidget from '../components/workspace/QuickActionsWidget'
import DepartmentAlertRibbons from '../components/workspace/DepartmentAlertRibbons'

function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Re-reads the local time every minute so a tab left open rolls over from
// "Good morning" to "Good afternoon" without a reload.
function useGreeting() {
  const [text, setText] = useState(() => greeting())
  useEffect(() => {
    const id = setInterval(() => setText(greeting()), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return text
}

// First name for "Welcome back, …": profile display name, then the profile/auth
// name, then the email's local part — "there" only when all of them are empty.
function firstNameOf(userProfile, user) {
  const full = [userProfile?.displayName, userProfile?.name, userProfile?.fullName, user?.displayName]
    .map((v) => String(v || '').trim()).find(Boolean)
  if (full) return full.split(/\s+/)[0]
  const local = String(userProfile?.email || user?.email || '').split('@')[0].replace(/[._\d]+/g, ' ').trim().split(/\s+/)[0]
  return local ? local[0].toUpperCase() + local.slice(1) : ''
}

// Universal landing page ('/') for every signed-in user — the single home base for
// someone who manages one or several departments/ministries. Department navigation
// lives in the global bottom dock (rendered once from MainLayout, not this page).
// On mobile, the bell/messages/board icons WorkspaceHeader renders now live inline in
// Sidebar's top bar (next to the logo/menu) instead of in the greeting row below — so
// this page only shows its own WorkspaceHeader copy at lg+ (`hidden lg:flex`), reading
// the same lifted notifications data via Outlet context (see MainLayout) rather than
// subscribing a second time.
//
// Visual language: the app's Inter sans-serif greeting (the earlier warm serif was
// dropped to match the rest of the dashboard) over the plain background, no boxed container around it — see the design review at
// /workspace-design-concepts for the other two directions this was chosen over.
// Previously this page (and ToDoListCard inside it) each had their own rounded/
// bordered wrapper, which nested a card inside a card; both were flattened to a
// single unified surface (ToDoListCard's own soft glass panel) with no outer box,
// so content rests directly on the page background instead.
export default function MyWorkspace() {
  const { user, userProfile, isFounder, isSeniorPastor, isCellDirector, canManageDepartment } = useAuth()
  // Membership Onboarding Pipeline: Caring staff + Founder / Senior Pastor manage it;
  // the First Lady (anyone holding a First Lady department position) signs off the
  // pastoral-oversight stages — Membership Interview + Pastoral Approval; Cell
  // Directors follow it read-only (PCS records are Caring-written).
  const canCaring = isFounder || canManageDepartment('Caring')
  const canPastor = isFounder || isSeniorPastor
  const isFirstLady = (userProfile?.positions || []).some(p => p?.department === 'First Lady')
    || (userProfile?.departments || []).includes('First Lady')
  const showPipeline = canCaring || canPastor || isFirstLady || isCellDirector
  const {
    notifications, handleNotifAction, dismissNotification, addNotificationToTodo,
  } = useOutletContext()
  const hello = useGreeting()
  const firstName = firstNameOf(userProfile, user)
  const ids = {
    uid: user?.uid || userProfile?.id || '',
    email: userProfile?.email || user?.email || '',
    myName: userProfile?.displayName || userProfile?.email || '',
  }
  // Request ribbons addressed to this account (each renders nothing when empty):
  // department-disapproved expenses (Accounts Director), Stage 5 cell leader
  // reviews, Deacon interview invitations, and applicants' Baptism Self-Declaration requests.
  const addressedRibbons = (
    <>
      <ExpenseDisputeRibbon {...ids} />
      <CellLeaderApprovalRibbon {...ids} />
      <DeaconInterviewRibbon {...ids} />
      <DeclarationRequestRibbon {...ids} />
    </>
  )
  const pipeline = showPipeline && (
    <MembershipPipelineWidget
      canCaring={canCaring}
      canPastor={canPastor}
      canFirstLady={isFirstLady}
      by={userProfile?.displayName || userProfile?.email || ''}
    />
  )

  return (
    <div className="w-full space-y-3 sm:space-y-6 pb-24 sm:pb-8">
      <div className="flex items-center justify-between gap-4 w-full">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">{hello}</p>
          <h1 className="font-sans text-xl sm:text-2xl font-bold tracking-tight leading-tight text-slate-900 dark:text-slate-50 truncate">
            {isFounder ? 'Eden Garden' : (
              <>
                Welcome back, {firstName || 'there'}{' '}
                <span className="inline-block animate-greeting-wave" style={{ transformOrigin: '70% 70%' }}>👋</span>
              </>
            )}
          </h1>
        </div>
        <div className="hidden lg:flex flex-shrink-0">
          <WorkspaceHeader
            notifications={notifications}
            onNotifAction={handleNotifAction}
            onDismissNotification={dismissNotification}
            onAddNotificationToTodo={addNotificationToTodo}
          />
        </div>
      </div>

      {/* Department notification ribbons (same blue ribbons as each department page),
          each opening its alert in a popup: right under the welcome header on Eden
          Garden, and under the Quick Actions box everywhere else. */}
      {isFounder ? (
        // Eden Garden: metrics first, then every status / action ribbon in one stack
        // (Upcoming Worship → Membership Pipeline → other alerts), then departments.
        <>
          <DepartmentAlertRibbons />
          <FounderInsightsPanel />
          <div className="space-y-3">
            <WorshipWorkspaceWidget />
            {pipeline}
            <ApprovalsCard />
            <ToDoListCard />
            {addressedRibbons}
            <BoardMeetingWorkspaceWidget />
          </div>
          <EdenGardenGrid />
        </>
      ) : (
        <>
          {/* Quick-action button row directly under the welcome header. */}
          <QuickActionsWidget />
          <DepartmentAlertRibbons />
          {/* Then things addressed to me: To-Do pill (only when tasks are open) and the
              request / assignment ribbons (each renders nothing when it has nothing). */}
          <ToDoListCard />
          {addressedRibbons}
          <WorshipWorkspaceWidget />
          <BoardMeetingWorkspaceWidget />
          {pipeline}
        </>
      )}
    </div>
  )
}
