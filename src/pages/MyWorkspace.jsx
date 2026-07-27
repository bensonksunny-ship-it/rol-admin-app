import { useAuth } from '../context/AuthContext'
import useActionNotifications from '../hooks/useActionNotifications'
import WorkspaceHeader from '../components/workspace/WorkspaceHeader'
import ToDoListCard from '../components/workspace/ToDoListCard'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Universal landing page ('/') for every signed-in user — the single home base for
// someone who manages one or several departments/ministries. Department navigation
// lives in the global bottom dock (rendered once from MainLayout, not this page).
// WorkspaceHeader keeps notifications/messages (top bar) — only the sidebar rail was
// simplified down to just the My Workspace shortcut + profile avatar.
//
// Visual language ("Modern Soft Warmth"): a warm cream canvas with a soft twin-hue
// wash (violet-indigo + amber, never a flat gradient) behind a serif greeting — see
// the design review at /workspace-design-concepts for the other two directions this
// was chosen over. Kept scoped to this one page/component tree rather than touched
// globally, so the rest of the app's cooler slate palette is untouched.
export default function MyWorkspace() {
  const { user, userProfile, isFounder } = useAuth()
  const {
    notifications, handleNotifAction, dismissNotification, addNotificationToTodo,
  } = useActionNotifications(userProfile, isFounder, user?.uid)

  return (
    <div className="relative rounded-[28px] border border-[#e9e2d6] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 15% 0%, rgba(99,87,201,0.10), transparent 60%)',
            'radial-gradient(ellipse 55% 45% at 100% 10%, rgba(217,139,43,0.14), transparent 55%)',
            '#f6f3ee',
          ].join(', '),
        }}
      />
      <div className="relative p-5 sm:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: '#8a8377' }}>{greeting()}</p>
            <h1
              className="text-[26px] sm:text-[30px] mt-1 leading-tight"
              style={{
                fontFamily: 'Constantia, "Iowan Old Style", "Palatino Linotype", Georgia, serif',
                color: '#2b2620',
                letterSpacing: '-0.005em',
              }}
            >
              Welcome back, {userProfile?.displayName?.split(' ')[0] || 'there'}{' '}
              <span className="inline-block animate-greeting-wave" style={{ transformOrigin: '70% 70%' }}>👋</span>
            </h1>
          </div>
          <WorkspaceHeader
            notifications={notifications}
            onNotifAction={handleNotifAction}
            onDismissNotification={dismissNotification}
            onAddNotificationToTodo={addNotificationToTodo}
          />
        </div>

        <ToDoListCard />
      </div>
    </div>
  )
}
