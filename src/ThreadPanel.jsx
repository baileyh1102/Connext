import { useState, useRef } from 'react'
import ReactionPicker from './ReactionPicker'
import { linkify } from './linkify'

// ThreadPanel is a slide-out panel showing a parent message and all its
// replies, with its own input box for adding more replies. Editing a reply
// populates that same input bar (Discord-style) instead of turning the
// reply bubble into a textarea in place — same pattern as ChatView.
function ThreadPanel({ parentMessage, replies, profilesMap, onClose, onSendReply, formatTime, currentUserId, handleEditMessage, handleDeleteMessage, reactionsMap, onToggleReaction, canManageMessages }) {
  const [replyText, setReplyText] = useState('')
  const [editingReply, setEditingReply] = useState(null) // the reply object currently being edited, or null
  const [copiedId, setCopiedId] = useState(null)
  const textareaRef = useRef(null)

  const parentProfile = profilesMap[parentMessage.user_id]

  const startEditing = (reply) => {
    setEditingReply(reply)
    setReplyText(reply.content)
    textareaRef.current?.focus()
  }

  const cancelEditing = () => {
    setEditingReply(null)
    setReplyText('')
  }

  
  const handleCopy = (id, content) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (editingReply) {
      if (replyText.trim()) {
        handleEditMessage(editingReply.id, replyText.trim())
      }
      setEditingReply(null)
      setReplyText('')
      return
    }

    if (!replyText.trim()) return
    onSendReply(replyText.trim())
    setReplyText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
    if (e.key === 'Escape' && editingReply) {
      cancelEditing()
    }
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
              <span className="whitespace-pre-wrap">{linkify(parentMessage.content)}</span>
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
          const isBeingEdited = editingReply?.id === reply.id
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
                  {isBeingEdited && <span className="text-xs text-blue-500">(editing...)</span>}
                </div>

                <div className="flex flex-col items-start mt-1">
                  <div className="relative inline-block group">
                    <div className={`bg-gray-100 p-2 rounded ${isBeingEdited ? 'ring-2 ring-blue-400' : ''}`}>
                      <span className="whitespace-pre-wrap">{linkify(reply.content)}</span>
                    </div>

                    {/* ---- HOVER ACTIONS: React / Edit / Delete (no Reply-to-reply — threads stay one level deep) ---- */}
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity bg-white shadow-md rounded-full px-3 py-1.5 whitespace-nowrap z-10">
                      <ReactionPicker onSelect={(emoji) => onToggleReaction(reply.id, emoji)} />
                      <div className="relative">
                        <button
                          onClick={() => handleCopy(reply.id, reply.content)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Copy"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="translate-y-0.5"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                        {copiedId === reply.id && (
                          <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                            Copied!
                          </span>
                        )}
                      </div>
                      {(isOwnMessage || canManageMessages) && (
                        <>
                          <button
                            onClick={() => startEditing(reply)}
                            className="text-gray-400 hover:text-gray-600"
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Delete this reply?')) {
                                handleDeleteMessage(reply.id, parentMessage.id)
                              }
                            }}
                            className="text-red-400 hover:text-red-600"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
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
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ---- REPLY INPUT ---- */}
      <div>
        {editingReply && (
          <div className="px-4 pt-3 flex items-center justify-between text-sm text-blue-600 bg-blue-50">
            <span>Editing reply</span>
            <button onClick={cancelEditing} className="text-blue-400 hover:text-blue-600" title="Cancel edit">
              ✕
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            rows={Math.min(replyText.split('\n').length, 4)}
            className="flex-1 border rounded p-2 resize-none text-sm"
          />
          <button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-600/90 text-sm">
            {editingReply ? 'Save' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ThreadPanel