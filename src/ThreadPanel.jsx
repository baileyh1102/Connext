import { useState } from 'react'
import ReactionPicker from './ReactionPicker'

// ThreadPanel is a slide-out panel showing a parent message and all its
// replies, with its own input box for adding more replies. Replies support
// the same react/edit/delete actions as top-level messages.
function ThreadPanel({ parentMessage, replies, profilesMap, onClose, onSendReply, formatTime, currentUserId, handleEditMessage, handleDeleteMessage, reactionsMap, onToggleReaction }) {
  const [replyText, setReplyText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  const parentProfile = profilesMap[parentMessage.user_id]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    onSendReply(replyText.trim())
    setReplyText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

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

  // Groups a message's raw reaction rows into { emoji: { count, reactedByMe } },
  // same logic as ChatView, so reply reactions render as pills too
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
    <div className="w-96 bg-white border-l flex flex-col h-full">
      {/* ---- HEADER ---- */}
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="font-semibold">Thread</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {/* ---- ORIGINAL MESSAGE + REPLIES ---- */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* The original message being replied to */}
        <div className="flex items-start gap-3 pb-4 border-b">
          {parentProfile?.avatar_url ? (
            <img src={parentProfile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-300 shrink-0" />
          )}
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">
                {parentProfile?.display_name || parentMessage.user_email}
              </span>
              <span className="text-xs text-gray-400">{formatTime(parentMessage.created_at)}</span>
            </div>
            <div className="mt-1">
              <span className="whitespace-pre-wrap">{parentMessage.content}</span>
            </div>
          </div>
        </div>

        {/* The replies */}
        {replies.length === 0 && (
          <p className="text-sm text-gray-400 text-center">No replies yet</p>
        )}
        {replies.map((reply) => {
          const replyProfile = profilesMap[reply.user_id]
          const isOwnMessage = reply.user_id === currentUserId
          const isEditing = editingId === reply.id
          const groupedReactions = getGroupedReactions(reply.id)

          return (
            <div key={reply.id} className="flex items-start gap-3">
              {replyProfile?.avatar_url ? (
                <img src={replyProfile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-300 shrink-0" />
              )}
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">
                    {replyProfile?.display_name || reply.user_email}
                  </span>
                  <span className="text-xs text-gray-400">{formatTime(reply.created_at)}</span>
                  {reply.edited && <span className="text-xs text-gray-400">(edited)</span>}
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
                          submitEdit(reply.id)
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
                    <div className="bg-gray-100 p-2 rounded peer">
                      <span className="whitespace-pre-wrap">{reply.content}</span>
                    </div>

                    {/* ---- REACTION PILLS ---- */}
                    {Object.keys(groupedReactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(groupedReactions).map(([emoji, { count, reactedByMe }]) => (
                          <button
                            key={emoji}
                            onClick={() => onToggleReaction(reply.id, emoji)}
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

                    {/* ---- HOVER ACTIONS: React / Edit / Delete (no Reply-to-reply — threads stay one level deep) ---- */}
                    <div className="flex items-center gap-3 opacity-0 peer-hover:opacity-100 hover:opacity-100 transition-opacity mt-2 bg-white shadow-md rounded-full px-3 py-1.5 w-fit">
                      <ReactionPicker onSelect={(emoji) => onToggleReaction(reply.id, emoji)} />
                      {isOwnMessage && (
                        <>
                          <button
                            onClick={() => startEditing(reply)}
                            className="text-base text-gray-400 hover:text-gray-600"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Delete this reply?')) {
                                handleDeleteMessage(reply.id, parentMessage.id)
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
          )
        })}
      </div>

      {/* ---- REPLY INPUT ---- */}
      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2 items-end">
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Reply..."
          rows={Math.min(replyText.split('\n').length, 4)}
          className="flex-1 border rounded p-2 resize-none text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-600/90 text-sm">
          Send
        </button>
      </form>
    </div>
  )
}

export default ThreadPanel