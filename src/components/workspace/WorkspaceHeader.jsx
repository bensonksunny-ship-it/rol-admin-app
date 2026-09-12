import { useEffect, useRef, useState } from 'react'
import { Bell, MessageSquare } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import useDirectMessages from '../../hooks/useDirectMessages'
import NotifPanel from '../NotifPanel'
import MessagesPanel from '../MessagesPanel'
import SundayPlanBubble from '../SundayPlanBubble'

// Top-right action row for My Workspace: Sunday Plan preview, notifications, and
// direct messages. Notifications reuse the same feed as the collapsed sidebar rail
// (passed down from MyWorkspace, which already subscribes via
// useActionNotifications); messages get their own independent useDirectMessages
// instance, same pattern as the rail. The profile avatar lives in the sidebar rail
// now, not here.
export default function WorkspaceHeader({ notifications, onNotifAction, onDismissNotification, onAddNotificationToTodo }) {
  const { user, userProfile } = useAuth()

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

  // NotifPanel owns its own outside-click-to-close (it renders via createPortal to
  // document.body, so it's never a DOM descendant of notifRef — a listener here
  // checking only notifRef would fire before the portal's own button onClicks get a
  // chance to run, silently swallowing "+ Add to To-Do" / "Ignore").

  useEffect(() => {
    if (!messagesOpen) return
    const close = (e) => { if (msgRef.current && !msgRef.current.contains(e.target)) closeMessages() }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesOpen])

  const iconBtnClass = 'relative w-10 h-10 rounded-xl flex items-center justify-center text-[#8a8377] hover:bg-[#efe9dd] hover:text-[#6357c9] transition-colors'

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
            onAddToTodo={onAddNotificationToTodo} onDismiss={onDismissNotification} onClose={() => setNotifOpen(false)}
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
    </div>
  )
}
