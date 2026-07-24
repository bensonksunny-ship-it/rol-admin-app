import { useEffect, useMemo, useState } from 'react'
import {
  subscribeUserConversations, subscribeUserDirectory, subscribeConversationMessages,
  getOrCreateDirectConversation, sendDirectMessage, markConversationRead, syncAllUsersToDirectory,
} from '../services/firestore'

// Single source of truth for the direct-messaging data/handlers — conversations,
// directory, active thread. Shared by the sidebar's message icon and My Workspace's
// header message icon so each is just an independent open/close toggle over the same
// underlying data, not a third parallel implementation of conversation state.
export default function useDirectMessages(user, userProfile, { directoryEnabled = true } = {}) {
  const [conversations, setConversations] = useState([])
  const [directory, setDirectory] = useState([])
  const [fallbackDirectory, setFallbackDirectory] = useState([])
  const [directorySearch, setDirectorySearch] = useState('')
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [activeConversation, setActiveConversation] = useState(null)
  const [threadMessages, setThreadMessages] = useState([])
  const [messageDraft, setMessageDraft] = useState('')

  const unreadMessagesCount = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCounts?.[user?.uid] || 0), 0),
    [conversations, user?.uid]
  )

  useEffect(() => {
    if (!user?.uid) return
    return subscribeUserConversations(user.uid, setConversations)
  }, [user?.uid])

  useEffect(() => {
    if (!directoryEnabled) return
    return subscribeUserDirectory(setDirectory)
  }, [directoryEnabled])

  // Fallback + auto-populate: if the shared directory looks empty/incomplete (e.g. this
  // session is the first one since the feature shipped, or user_directory just hasn't
  // caught up yet), re-run the server-side backfill (syncUserDirectory Cloud Function —
  // works for any signed-in user) and use its fresh result for an instant, non-empty
  // picker instead of waiting on the user_directory listener to catch up.
  useEffect(() => {
    if (!showNewMessage || directory.length >= 2) return
    syncAllUsersToDirectory()
      .then((rows) => { if (rows.length) setFallbackDirectory(rows) })
      .catch(() => {})
  }, [showNewMessage, directory.length])

  // Real-time user_directory rows win over the one-off fallback fetch once they arrive.
  const combinedDirectory = useMemo(() => {
    const byUid = new Map()
    fallbackDirectory.forEach((p) => byUid.set(p.uid, p))
    directory.forEach((p) => byUid.set(p.uid, p))
    return Array.from(byUid.values())
  }, [directory, fallbackDirectory])

  useEffect(() => {
    if (!activeConversation?.id) { setThreadMessages([]); return }
    return subscribeConversationMessages(activeConversation.id, setThreadMessages)
  }, [activeConversation?.id])

  const resetPanel = () => {
    setActiveConversation(null)
    setShowNewMessage(false)
    setDirectorySearch('')
  }

  const openConversation = (conv) => {
    const otherId = (conv.participantIds || []).find((id) => id !== user.uid)
    setActiveConversation({ id: conv.id, otherId, otherName: conv.participantNames?.[otherId] || 'User' })
    setShowNewMessage(false)
    if (user?.uid) markConversationRead(conv.id, user.uid).catch(() => {})
  }

  const startConversationWith = async (person) => {
    if (!user?.uid) return
    const conversationId = await getOrCreateDirectConversation(
      user.uid, userProfile?.name || user.email || '', person.uid, person.name || ''
    )
    setActiveConversation({ id: conversationId, otherId: person.uid, otherName: person.name || 'User' })
    setShowNewMessage(false)
  }

  const handleSendMessage = async () => {
    if (!messageDraft.trim() || !activeConversation?.id || !user?.uid) return
    const text = messageDraft.trim()
    setMessageDraft('')
    await sendDirectMessage(activeConversation.id, {
      senderId: user.uid,
      senderName: userProfile?.name || user.email || '',
      text,
    })
  }

  return {
    conversations,
    directory: combinedDirectory,
    directorySearch, setDirectorySearch,
    showNewMessage, setShowNewMessage,
    activeConversation, setActiveConversation,
    threadMessages,
    messageDraft, setMessageDraft,
    unreadMessagesCount,
    openConversation,
    startConversationWith,
    handleSendMessage,
    resetPanel,
  }
}
