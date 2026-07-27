import { createPortal } from 'react-dom'
import { ChevronLeft, SquarePen, Send, MessageCircle } from 'lucide-react'

export default function MessagesPanel({
  isDay, posStyle, conversations, currentUid, directory, directorySearch, setDirectorySearch,
  showNewMessage, setShowNewMessage, activeConversation, threadMessages,
  messageDraft, setMessageDraft, onOpenConversation, onStartConversation, onSend, onBack,
}) {
  const fmtTime = (d) => {
    if (!d) return ''
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return '' }
  }
  const borderClass = isDay ? 'border-slate-100' : 'border-slate-700/60'
  const inputClass = `w-full text-sm px-3 py-2 rounded-xl outline-none ${isDay ? 'bg-slate-100 text-slate-800 placeholder-slate-400' : 'bg-slate-800 text-slate-100 placeholder-slate-500'}`

  const searchTerm = directorySearch.trim().toLowerCase()
  const filteredDirectory = directory
    .filter((p) => p.uid !== currentUid)
    .filter((p) => {
      if (!searchTerm) return true
      return (p.name || '').toLowerCase().includes(searchTerm)
        || (p.email || '').toLowerCase().includes(searchTerm)
        || (p.role || '').toLowerCase().includes(searchTerm)
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  return createPortal(
    <div
      className="w-80 rounded-2xl overflow-hidden flex flex-col"
      style={{
        position: 'fixed',
        zIndex: 100,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '70vh',
        // Glossy glass, not matte frosted-white — same recipe as NotifPanel: a
        // top-to-bottom translucency gradient instead of a flat near-opaque fill, a
        // lighter backdrop blur, and a bright hairline + inset top highlight for sheen.
        background: isDay
          ? 'linear-gradient(to bottom, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.62) 100%)'
          : 'linear-gradient(to bottom, rgba(30,41,59,0.82) 0%, rgba(15,23,42,0.62) 100%)',
        backdropFilter: 'blur(12px) saturate(180%)',
        WebkitBackdropFilter: 'blur(12px) saturate(180%)',
        border: isDay ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.14)',
        boxShadow: isDay
          ? '0 16px 48px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.7)'
          : '0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
        ...posStyle,
      }}
    >
      <div className={`px-4 py-2.5 flex items-center justify-between border-b flex-shrink-0 ${borderClass}`}>
        {activeConversation ? (
          <button type="button" onClick={onBack} className={`flex items-center gap-1 text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>
            <ChevronLeft size={16} /> {activeConversation.otherName}
          </button>
        ) : (
          <p className={`text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>Messages</p>
        )}
        {!activeConversation && (
          <button
            type="button"
            onClick={() => setShowNewMessage((v) => !v)}
            className={`p-1 rounded-lg ${isDay ? 'text-violet-600 hover:bg-violet-50' : 'text-violet-400 hover:bg-slate-800/50'}`}
            aria-label="New message"
          >
            <SquarePen size={16} />
          </button>
        )}
      </div>

      {activeConversation ? (
        <>
          <div className="overflow-y-auto flex-1 px-3 py-3 space-y-2" style={{ minHeight: 220 }}>
            {threadMessages.length === 0 ? (
              <p className={`text-xs text-center mt-6 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>Say hello 👋</p>
            ) : threadMessages.map((m) => {
              const mine = m.senderId === currentUid
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] px-3 py-1.5 rounded-2xl text-sm break-words ${
                      mine
                        ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white'
                        : isDay ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              )
            })}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); onSend() }}
            className={`flex items-center gap-2 px-3 py-2.5 border-t flex-shrink-0 ${borderClass}`}
          >
            <input
              type="text"
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              placeholder="Type a message…"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={!messageDraft.trim()}
              className="p-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white disabled:opacity-40 flex-shrink-0"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </form>
        </>
      ) : showNewMessage ? (
        <div className="flex-1 overflow-y-auto">
          <div className={`px-3 py-2 border-b ${borderClass}`}>
            <input
              type="text"
              value={directorySearch}
              onChange={(e) => setDirectorySearch(e.target.value)}
              placeholder="Search name, email, or role…"
              autoFocus
              className={inputClass}
            />
          </div>
          {filteredDirectory.length === 0 ? (
            <p className={`text-xs text-center py-6 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>No matches</p>
          ) : (
            <div className={`divide-y ${isDay ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
              {filteredDirectory.map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => onStartConversation(p)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${isDay ? 'text-slate-700 hover:bg-violet-50' : 'text-slate-200 hover:bg-slate-800/50'}`}
                >
                  <p className="truncate">{p.name || p.email || 'Unnamed user'}</p>
                  {(p.role || p.department || p.email) && (
                    <p className={`text-xs truncate ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>
                      {[p.role, p.department, p.email].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : conversations.length === 0 ? (
        <div className={`px-4 py-6 text-center ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>
          <MessageCircle size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No conversations yet</p>
        </div>
      ) : (
        <div className={`overflow-y-auto divide-y flex-1 ${isDay ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
          {conversations.map((c) => {
            const otherId = (c.participantIds || []).find((id) => id !== currentUid)
            const otherName = c.participantNames?.[otherId] || 'User'
            const unread = c.unreadCounts?.[currentUid] || 0
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenConversation(c)}
                className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-2 ${isDay ? 'hover:bg-violet-50' : 'hover:bg-slate-800/50'}`}
              >
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>{otherName}</p>
                  <p className={`text-xs truncate ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>{c.lastMessageText || 'No messages yet'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[10px] ${isDay ? 'text-slate-300' : 'text-slate-600'}`}>{fmtTime(c.lastMessageAt)}</span>
                  {unread > 0 && (
                    <span className="min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none px-0.5">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>,
    document.body
  )
}
