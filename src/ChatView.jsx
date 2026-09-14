import { useState, useRef, useEffect } from 'react'
import ReactionPicker from './ReactionPicker'

// ChatView displays the message list for the currently selected channel,
// plus the input bar for sending new messages.
function ChatView({ messages, profilesMap, newMessage, setNewMessage, handleSendMessage, handleEditMessage, handleDeleteMessage, formatTime, formatDateLabel, isNewDay, currentUserId, replyCounts, onOpenThread, reactionsMap, onToggleReaction }) {
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const bottomRef = useRef(null) // an invisible marker at the end of the message list we scroll to

  // Scrolls to the bottom marker whenever the message list changes (new message sent or received)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startEditing = (msg) => {
    setEditingId(msg.id)
    setEditValue(msg.content)
  }

  const submitEdit = (messageId) => {
    if (editValue.trim()) {
      handleEditMessage(messageId, editValue.trim())
    }
    setEditingId(null)
  }

  // Enter alone sends the message; Shift+Enter inserts a newline (default textarea behavior)
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  // Groups a message's raw reaction rows into { emoji: { count, reactedByMe } }
  // so we can render one pill per distinct emoji instead of one per reaction row
  const getGroupedReactions = (messageId) => {
    const reactions = reactionsMap[messageId] || []
    const grouped = {}
    reactions.forEach((r) => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, reactedByMe: false }
      grouped[r.emoji].count += 1
      if (r.user_id === currentUserId) grouped[r.emoji].reactedByMe = true
    })
    return grouped
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100">
      {/* ---- CHAT MESSAGE LIST ---- */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, index) => {
          const senderProfile = profilesMap[msg.user_id]
          const showDateStamp = isNewDay(msg.created_at, messages[index - 1]?.created_at)
          const isOwnMessage = msg.user_id === currentUserId
          const isEditing = editingId === msg.id
          const groupedReactions = getGroupedReactions(msg.id)

          return (
            <div key={msg.id}>
              {showDateStamp && (
                <div className="flex justify-center my-4">
                  <span className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full">
                    {formatDateLabel(msg.created_at)}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-3">
                {senderProfile?.avatar_url ? (
                  <img src={senderProfile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-300 shrink-0" />
                )}
                <div className="max-w-md flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">
                      {senderProfile?.display_name || msg.user_email}
                    </span>
                    <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
                    {msg.edited && <span className="text-xs text-gray-400">(edited)</span>}
                  </div>

                  {isEditing ? (
                    <div className="mt-1">
                      <textarea
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            submitEdit(msg.id)
                          }
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        rows={Math.min(editValue.split('\n').length, 6)}
                        className="w-full border rounded p-2 text-sm resize-none"
                      />
                      <div className="text-xs text-gray-400 mt-1">
                        "Enter" to save, "Esc" to cancel
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start mt-1">
                      <div className="bg-white p-2 rounded shadow-sm peer">
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </div>

                      {/* ---- REACTION PILLS ---- */}
                      {Object.keys(groupedReactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(groupedReactions).map(([emoji, { count, reactedByMe }]) => (
                            <button
                              key={emoji}
                              onClick={() => onToggleReaction(msg.id, emoji)}
                              className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                reactedByMe
                                  ? 'bg-blue-100 border-blue-400 text-blue-700'
                                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span>{count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {replyCounts[msg.id] > 0 && (
                        <button
                          onClick={() => onOpenThread(msg)}
                          className="text-xs text-blue-600 hover:underline mt-1"
                        >
                          {replyCounts[msg.id]} {replyCounts[msg.id] === 1 ? 'reply' : 'replies'}
                        </button>
                      )}

                       {/* ---- HOVER ACTIONS: React / Reply / Edit / Delete ---- */}
                      <div className="flex items-center gap-3 opacity-0 peer-hover:opacity-100 hover:opacity-100 transition-opacity mt-2 bg-white shadow-md rounded-full px-3 py-1.5 w-fit">
                        <ReactionPicker onSelect={(emoji) => onToggleReaction(msg.id, emoji)} />
                        <button
                          onClick={() => onOpenThread(msg)}
                          className="text-base text-gray-400 hover:text-gray-600"
                        >
                          ↰
                        </button>
                        {isOwnMessage && (
                          <>
                            <button
                              onClick={() => startEditing(msg)}
                              className="text-base text-gray-400 hover:text-gray-600"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('Delete this message?')) {
                                  handleDeleteMessage(msg.id)
                                }
                              }}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ---- MESSAGE INPUT BAR ---- */}
      <form onSubmit={handleSendMessage} className="p-4 bg-white flex gap-2 items-end">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Type a message..."
          rows={Math.min(newMessage.split('\n').length, 6)}
          className="flex-1 border rounded p-2 resize-none"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-600/90">
          Send
        </button>
      </form>
    </div>
  )
}

export default ChatView