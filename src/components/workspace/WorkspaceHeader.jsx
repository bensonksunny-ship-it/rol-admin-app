import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, MessageSquare, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentRole } from '../../utils/access'
import useDirectMessages from '../../hooks/useDirectMessages'
import NotifPanel from '../NotifPanel'
import MessagesPanel from '../MessagesPanel'
import SundayPlanBubble from '../SundayPlanBubble'

// True if the user directs any department they belong to, or is Founder/Admin.
function isDirectorOrAdmin(userProfile, isFounder, isAdmin) {
  if (isFounder || isAdmin) return true
  const departments = userProfile?.departments || (userProfile?.department ? [userProfile.department] : [])
  return departments.some((d) => getDepartmentRole(userProfile, d) === 'DIRECTOR')
}

// Top-right action row for My Workspace: Sunday Plan preview, notifications, direct
// messages, and (Director/Admin only) a shortcut into the church-wide Analytics view.
// Notifications reuse the same feed as the collapsed sidebar rail (passed down from
// MyWorkspace, which already subscribes via useActionNotifications); messages get
// their own independent useDirectMessages instance, same pattern as the rail.
export default function WorkspaceHeader({ notifications, onNotifAction, onDismissNotification, onAddNotificationToTodo }) {
  const { user, userProfile, isFounder, isAdmin } = useAuth()
  const navigate = useNavigate()
  const showDirectorBoard = isDirectorOrAdmin(userProfile, isFounder, isAdmin)

  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)

  const [messagesOpen, setMessagesOpen] = useState(false)
  const msgRef = useRef(null)
  const {
    conversations, directory, directorySearch, setDirectorySearch,
    showNewMessage, setShowNewMessage, activeConversation, setActiveConversation,
    threadMessages, messageDraft, setMessageDraft, unreadMessagesCount,
    openConversation, startConversationWith, handleSendMessage, resetPanel,
  } = useDirectMessages(user, userProfile, { directoryEnabled: messagesOpen })

  const closeMessages = () => {
    setMessagesOpen(false)
    resetPanel()
  }

  useEffect(() => {
    if (!notifOpen) return
    const close = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [notifOpen])

  useEffect(() => {
    if (!messagesOpen) return
    const close = (e) => { if (msgRef.current && !msgRef.current.contains(e.target)) closeMessages() }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesOpen])

  const iconBtnClass = 'relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors'

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <SundayPlanBubble isDay />

      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={() => { setMessagesOpen(false); setNotifOpen((v) => !v) }}
          className={iconBtnClass}
          aria-label="Notifications"
        >
          <Bell size={18} strokeWidth={1.75} />
          {notifications.length > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </button>
        {notifOpen && (() => {
          const r = notifRef.current?.getBoundingClientRect()
          return <NotifPanel isDay notifications={notifications} onAction={(n) => { setNotifOpen(false); onNotifAction(n) }}
            onAddToTodo={onAddNotificationToTodo} onDismiss={onDismissNotification}
            posStyle={{ top: (r?.bottom ?? 60) + 8, left: Math.min(r?.left ?? 0, window.innerWidth - 300) }} />
        })()}
      </div>

      <div className="relative" ref={msgRef}>
        <button
          type="button"
          onClick={() => { setNotifOpen(false); setMessagesOpen((v) => !v) }}
          className={iconBtnClass}
          aria-label="Messages"
        >
          <MessageSquare size={18} strokeWidth={1.75} />
          {unreadMessagesCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
              {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
            </span>
          )}
        </button>
        {messagesOpen && (() => {
          const r = msgRef.current?.getBoundingClientRect()
          return <MessagesPanel
            isDay currentUid={user?.uid}
            conversations={conversations} directory={directory}
            directorySearch={directorySearch} setDirectorySearch={setDirectorySearch}
            showNewMessage={showNewMessage} setShowNewMessage={setShowNewMessage}
            activeConversation={activeConversation} threadMessages={threadMessages}
            messageDraft={messageDraft} setMessageDraft={setMessageDraft}
            onOpenConversation={openConversation} onStartConversation={startConversationWith}
            onSend={handleSendMessage} onBack={() => setActiveConversation(null)}
            posStyle={{ top: (r?.bottom ?? 60) + 8, left: Math.min(r?.left ?? 0, window.innerWidth - 336) }}
          />
        })()}
      </div>

      {showDirectorBoard && (
        <button
          type="button"
          onClick={() => navigate('/analytics')}
          title="Director Board"
          aria-label="Director Board"
          className={iconBtnClass}
        >
          <LayoutDashboard size={18} strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}
