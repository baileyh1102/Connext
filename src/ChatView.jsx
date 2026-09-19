import { useState, useRef, useEffect } from 'react'
import ReactionPicker from './ReactionPicker'
import attachIcon from './assets/icons8-add-file-50.png'
import UserProfileCard from './UserProfileCard'
import { linkify } from './linkify'
import ImageLightbox from './ImageLightbox'
import GifPicker from './GifPicker'

// Renders a message's attachment according to its type — an image, a video/audio
// player, or a document link for PDFs. Images and videos open in a full-screen
// lightbox when clicked.
function Attachment({ url, type, name, onExpand }) {
  if (type === 'image' || type === 'gif') {
    return (
      <img
        src={url}
        alt={name}
        onClick={() => onExpand(url, type)}
        className="max-w-xs rounded mt-1 cursor-pointer hover:opacity-90 transition-opacity"
      />
    )
  }
  if (type === 'video') {
    return (
      <video
        src={url}
        controls
        onClick={() => onExpand(url, type)}
        className="max-w-xs rounded mt-1 cursor-pointer"
      />
    )
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
// Editing a message populates this same input bar (Discord-style) instead
// of turning the message bubble itself into a textarea in place.
function ChatView({ messages, profilesMap, newMessage, setNewMessage, handleSendMessage, handleSendAttachment, handleEditMessage, handleDeleteMessage, formatTime, formatDateLabel, isNewDay, currentUserId, replyCounts, onOpenThread, reactionsMap, onToggleReaction, canManageMessages }) {
  const [editingMessage, setEditingMessage] = useState(null) // the message object currently being edited, or null
  const bottomRef = useRef(null) // an invisible marker at the end of the message list we scroll to
  const scrollContainerRef = useRef(null) // the scrollable message list itself, used to measure scroll position
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const prevMessageCountRef = useRef(messages.length) // tracks the last known count, to detect real additions vs. edits/deletes

  const [pendingFile, setPendingFile] = useState(null) // a file selected but not yet sent
  const [previewUrl, setPreviewUrl] = useState(null) // an object URL for showing an image/video preview
  const [viewingProfile, setViewingProfile] = useState(null) // the profile object currently shown in the popup
  const [showActions, setShowActions] = useState(false) // whether the expandable "+" action row is open
  const [copiedId, setCopiedId] = useState(null) // id of the message whose "Copied!" tooltip is currently showing
  const [expandedAttachment, setExpandedAttachment] = useState(null) // { url, type } currently shown in the lightbox
  const [showGifPicker, setShowGifPicker] = useState(false)

  // Smart auto-scroll: only scrolls down when a message is genuinely ADDED
  // (not edited or deleted — those don't change the message count), and only
  // if the user was already close to the bottom (roughly within 10 messages'
  // worth of scroll distance) — so scrolling up to read history isn't
  // interrupted by new messages arriving elsewhere in the channel.
  useEffect(() => {
    const previousCount = prevMessageCountRef.current
    const currentCount = messages.length
    prevMessageCountRef.current = currentCount

    const wasMessageAdded = currentCount > previousCount
    if (!wasMessageAdded) return // an edit or delete changes content/length differently — never auto-scroll for those

    const container = scrollContainerRef.current
    if (!container) return

    // Roughly estimate "10 messages" as a pixel distance (average bubble height ~70-80px)
    const NEAR_BOTTOM_THRESHOLD_PX = 800
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const wasNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX

    if (wasNearBottom) {
      // scrollIntoView on the marker just after the last message ensures the
      // newest message scrolls fully into view rather than being clipped at the edge
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
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

  // Populates the composer with the message's text and focuses it —
  // this is the entry point into "edit mode"
  const startEditing = (msg) => {
    setEditingMessage(msg)
    setNewMessage(msg.content)
    textareaRef.current?.focus()
  }

  const cancelEditing = () => {
    setEditingMessage(null)
    setNewMessage('')
  }


  const handleCopy = (id, content) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // A GIF is sent as an attachment, same as any image — Giphy's URL is just
  // used directly rather than uploading a file to our own storage
  const handleSendGif = async (gifUrl) => {
    setShowGifPicker(false)
    setShowActions(false)
    await handleSendAttachment({ isGifUrl: true, url: gifUrl }, '')
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPendingFile(file)
    }
    e.target.value = '' // reset so selecting the same file again still triggers onChange
  }

  // Handles the composer's Send button / Enter key. Three cases:
  // 1. Editing an existing message -> save the edit, exit edit mode
  // 2. A file is staged -> upload + send it (with any typed caption)
  // 3. Otherwise -> send a plain text message
  const handleFormSubmit = async (e) => {
    e.preventDefault()

    if (editingMessage) {
      if (newMessage.trim()) {
        handleEditMessage(editingMessage.id, newMessage.trim())
      }
      setEditingMessage(null)
      setNewMessage('')
      return
    }

    if (pendingFile) {
      await handleSendAttachment(pendingFile, newMessage.trim())
      setPendingFile(null)
      setNewMessage('')
    } else {
      handleSendMessage(e)
    }
  }

  // Enter alone submits (send or save-edit); Shift+Enter inserts a newline;
  // Escape exits edit mode without saving
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleFormSubmit(e)
    }
    if (e.key === 'Escape' && editingMessage) {
      cancelEditing()
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, index) => {
          const senderProfile = profilesMap[msg.user_id]
          const showDateStamp = isNewDay(msg.created_at, messages[index - 1]?.created_at)
          const isOwnMessage = msg.user_id === currentUserId
          const isBeingEdited = editingMessage?.id === msg.id
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
                <button onClick={() => setViewingProfile({ profile: senderProfile, email: msg.user_email })} className="flex-shrink-0">
                  {senderProfile?.avatar_url ? (
                    <img src={senderProfile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-300" />
                  )}
                </button>
                <div className="max-w-md flex-1">
                  <div className="flex items-baseline gap-2">
                    <button
                      onClick={() => setViewingProfile({ profile: senderProfile, email: msg.user_email })}
                      className="text-sm font-semibold hover:underline"
                    >
                      {senderProfile?.display_name || msg.user_email}
                    </button>
                    <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
                    {msg.edited && <span className="text-xs text-gray-400">(edited)</span>}
                    {isBeingEdited && <span className="text-xs text-blue-500">(editing...)</span>}
                  </div>

                  <div className="flex flex-col items-start mt-1">
                    <div className="relative inline-block group">
                      {msg.content && (
                        <div className={`bg-white p-2 rounded shadow-sm ${isBeingEdited ? 'ring-2 ring-blue-400' : ''}`}>
                          <span className="whitespace-pre-wrap">{linkify(msg.content)}</span>
                        </div>
                      )}
                      {msg.attachment_url && (
                        <Attachment
                          url={msg.attachment_url}
                          type={msg.attachment_type}
                          name={msg.attachment_name}
                          onExpand={(url, type) => setExpandedAttachment({ url, type })}
                        />
                      )}

                      {/* ---- HOVER ACTIONS: React / Reply / Edit / Delete — positioned to the RIGHT of the bubble ---- */}
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity bg-white shadow-md rounded-full px-3 py-1.5 whitespace-nowrap z-10">
                        <ReactionPicker onSelect={(emoji) => onToggleReaction(msg.id, emoji)} />
                        <button
                          onClick={() => onOpenThread(msg)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Reply"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 14 4 9 9 4" />
                            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                          </svg>
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
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
                          {copiedId === msg.id && (
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                              Copied!
                            </span>
                          )}
                        </div>
                        {(isOwnMessage || canManageMessages) && (
                          <>
                            <button
                              onClick={() => startEditing(msg)}
                              className="text-gray-400 hover:text-gray-600"
                              title="Edit"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('Delete this message?')) {
                                  handleDeleteMessage(msg.id)
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
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {viewingProfile && (
        <UserProfileCard
          profile={viewingProfile.profile}
          email={viewingProfile.email}
          onClose={() => setViewingProfile(null)}
        />
      )}

      
      {expandedAttachment && (
        <ImageLightbox
          url={expandedAttachment.url}
          type={expandedAttachment.type}
          onClose={() => setExpandedAttachment(null)}
        />
      )}

      {/* ---- MESSAGE INPUT BAR ---- */}
      <div className="bg-white">
        {/* ---- EDITING INDICATOR ---- */}
        {editingMessage && (
          <div className="px-4 pt-3 flex items-center justify-between text-sm text-blue-600 bg-blue-50">
            <span>Editing message</span>
            <button onClick={cancelEditing} className="text-blue-400 hover:text-blue-600" title="Cancel edit">
              ✕
            </button>
          </div>
        )}

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

          {/* ---- EXPANDABLE ACTIONS: a plus-in-circle that rotates into an X, revealing more buttons ---- */}
          <button
            type="button"
            onClick={() => setShowActions(!showActions)}
            className="mb-1 w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
            title={showActions ? 'Close' : 'More options'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${showActions ? 'rotate-45' : 'rotate-0'}`}
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {showActions && (
            <>
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current.click()
                  setShowActions(false)
                }}
                className="mb-1 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
                title="Attach a file"
              >
                <img src={attachIcon} alt="Attach file" className="w-6 h-6" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowGifPicker(!showGifPicker)}
                  className="mb-1 text-xs font-bold border border-gray-300 rounded px-1.5 py-1 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
                  title="Send a GIF"
                >
                  GIF
                </button>
                {showGifPicker && (
                  <GifPicker onSelect={handleSendGif} onClose={() => setShowGifPicker(false)} />
                )}
              </div>
            </>
          )}

          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={pendingFile ? 'Add a caption...' : 'Type a message...'}
            rows={Math.min(newMessage.split('\n').length, 6)}
            className="flex-1 border rounded p-2 resize-none"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-600/90">
            {editingMessage ? 'Save' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ChatView