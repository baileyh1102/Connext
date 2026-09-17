import { useState, useRef, useEffect } from 'react'
import ReactionPicker from './ReactionPicker'
import attachIcon from './assets/icons8-add-file-50.png'

// Renders a message's attachment according to its type — an image, a video/audio
// player, or a document link for PDFs.
function Attachment({ url, type, name }) {
  if (type === 'image') {
    return <img src={url} alt={name} className="max-w-xs rounded mt-1" />
  }
  if (type === 'video') {
    return <video src={url} controls className="max-w-xs rounded mt-1" />
  }
  if (type === 'audio') {
    return <audio src={url} controls className="mt-1" />
  }
  if (type === 'pdf') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded p-2 mt-1 text-sm text-blue-600 w-fit"
      >
        📄 {name}
      </a>
    )
  }
  return null
}

// ChatView displays the message list for the currently selected channel,
// plus the input bar for sending new messages (text or file attachments).
function ChatView({ messages, profilesMap, newMessage, setNewMessage, handleSendMessage, handleSendAttachment, handleEditMessage, handleDeleteMessage, formatTime, formatDateLabel, isNewDay, currentUserId, replyCounts, onOpenThread, reactionsMap, onToggleReaction }) {
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const bottomRef = useRef(null) // an invisible marker at the end of the message list we scroll to
  const fileInputRef = useRef(null)

  const [pendingFile, setPendingFile] = useState(null) // a file selected but not yet sent
  const [previewUrl, setPreviewUrl] = useState(null) // an object URL for showing an image/video preview

  // Scrolls to the bottom marker whenever the message list changes (new message sent or received)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Builds (and cleans up) a temporary local preview URL whenever a file is staged
  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

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

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPendingFile(file)
    }
    e.target.value = '' // reset so selecting the same file again still triggers onChange
  }

  // Handles the composer's Send button / Enter key: sends the staged file (with
  // whatever caption is typed) if one exists, otherwise falls back to a plain text message
  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (pendingFile) {
      await handleSendAttachment(pendingFile, newMessage.trim())
      setPendingFile(null)
      setNewMessage('')
    } else {
      handleSendMessage(e)
    }
  }

  // Enter alone sends; Shift+Enter inserts a newline (default textarea behavior)
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleFormSubmit(e)
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
                  <img src={senderProfile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-300 flex-shrink-0" />
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
                    <div className="flex flex-col items-start mt-1 peer">
                      {msg.content && (
                        <div className="bg-white p-2 rounded shadow-sm">
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        </div>
                      )}
                      {msg.attachment_url && (
                        <Attachment url={msg.attachment_url} type={msg.attachment_type} name={msg.attachment_name} />
                      )}

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
      <div className="bg-white">
        {/* ---- STAGED FILE PREVIEW (shown above the input row once a file is selected) ---- */}
        {pendingFile && (
          <div className="px-4 pt-3 flex items-center gap-2">
            <div className="relative bg-gray-100 rounded-lg p-2 flex items-center gap-2 w-fit">
              {pendingFile.type.startsWith('image/') ? (
                <img src={previewUrl} alt={pendingFile.name} className="w-12 h-12 object-cover rounded" />
              ) : pendingFile.type.startsWith('video/') ? (
                <video src={previewUrl} className="w-12 h-12 object-cover rounded" />
              ) : (
                <div className="w-12 h-12 flex items-center justify-center bg-gray-200 rounded text-xl">
                  {pendingFile.type.startsWith('audio/') ? '🎵' : '📄'}
                </div>
              )}
              <span className="text-sm text-gray-600 max-w-[10rem] truncate">{pendingFile.name}</span>
              <button
                onClick={() => setPendingFile(null)}
                className="text-gray-400 hover:text-red-500 text-sm ml-1"
                title="Remove"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="p-4 flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.mp4,.mp3,.wav"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current.click()}
            className="pb-2 opacity-60 hover:opacity-100 transition-opacity"
            title="Attach a file"
          >
            <img src={attachIcon} alt="Attach file" className="w-6 h-6" />
          </button>
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={pendingFile ? 'Add a caption...' : 'Type a message...'}
            rows={Math.min(newMessage.split('\n').length, 6)}
            className="flex-1 border rounded p-2 resize-none"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-600/90">
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default ChatView