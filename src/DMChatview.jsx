import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import attachIcon from './assets/icons8-add-file-50.png'
import { linkify } from './linkify'
import ImageLightbox from './ImageLightbox'
import ReactionPicker from './ReactionPicker'
import ReactorList from './ReactorList'

// Renders a message's attachment according to its type — identical to ChatView's version
function Attachment({ url, type, name, onExpand }) {
  if (type === 'image') {
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

// DMChatView is a self-contained direct-message conversation, styled to be
// visually identical to ChatView. Editing a message populates the composer
// bar at the bottom instead of turning the bubble into a textarea in place.
function DMChatView({ conversation, currentUserId, otherProfile, myProfile }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [editingMessage, setEditingMessage] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [expandedAttachment, setExpandedAttachment] = useState(null)
  const [reactionsMap, setReactionsMap] = useState({}) // { messageId: [{ emoji, user_id }, ...] }
  const [openReactorList, setOpenReactorList] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!conversation) return

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('dm_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
      setMessages(data || [])
    }
    fetchMessages()

    const channel = supabase
      .channel(`dm-messages-${conversation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${conversation.id}` }, () => {
        fetchMessages()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [conversation])

  // Load reactions for this conversation's messages, kept live via realtime
  useEffect(() => {
    if (!conversation) return

    const fetchReactions = async () => {
      const { data } = await supabase
        .from('dm_message_reactions')
        .select('message_id, emoji, user_id')
      // Fetches all rows (same lightweight pattern used for channel reactions) —
      // RLS already restricts this to reactions on messages in conversations this user is part of
      const map = {}
      data?.forEach((r) => {
        if (!map[r.message_id]) map[r.message_id] = []
        map[r.message_id].push(r)
      })
      setReactionsMap(map)
    }
    fetchReactions()

    const reactionChannel = supabase
      .channel(`dm-reactions-${conversation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_message_reactions' }, fetchReactions)
      .subscribe()

    return () => supabase.removeChannel(reactionChannel)
  }, [conversation])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  const getAttachmentType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase()
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image'
    if (ext === 'mp4') return 'video'
    if (ext === 'mp3' || ext === 'wav') return 'audio'
    if (ext === 'pdf') return 'pdf'
    return null
  }

  const touchConversation = async () => {
    await supabase.from('dm_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id)
  }

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

  const handleSend = async (e) => {
    e.preventDefault()

    if (editingMessage) {
      if (newMessage.trim()) {
        await supabase.from('dm_messages').update({ content: newMessage.trim(), edited: true }).eq('id', editingMessage.id)
      }
      setEditingMessage(null)
      setNewMessage('')
      return
    }

    if (pendingFile) {
      const type = getAttachmentType(pendingFile.name)
      if (!type) {
        alert('Unsupported file type. Please use PDF, PNG, MP4, MP3, or WAV.')
        return
      }
      const filePath = `dm-${conversation.id}/${Date.now()}-${pendingFile.name}`
      const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, pendingFile)
      if (uploadError) {
        console.log('DM attachment upload error:', uploadError)
        return
      }
      const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(filePath)

      await supabase.from('dm_messages').insert({
        conversation_id: conversation.id,
        sender_id: currentUserId,
        content: newMessage.trim(),
        attachment_url: publicUrlData.publicUrl,
        attachment_type: type,
        attachment_name: pendingFile.name,
      })
      setPendingFile(null)
    } else {
      if (!newMessage.trim()) return
      await supabase.from('dm_messages').insert({
        conversation_id: conversation.id,
        sender_id: currentUserId,
        content: newMessage.trim(),
      })
    }
    setNewMessage('')
    touchConversation()
  }

  const handleFormSubmit = (e) => handleSend(e)

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
    if (e.key === 'Escape' && editingMessage) {
      cancelEditing()
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) setPendingFile(file)
    e.target.value = ''
  }

  const handleDelete = async (id) => {
    if (window.confirm('Delete this message?')) {
      await supabase.from('dm_messages').delete().eq('id', id)
    }
  }

  
  const handleToggleReaction = async (messageId, emoji) => {
    const existing = reactionsMap[messageId]?.find((r) => r.emoji === emoji && r.user_id === currentUserId)

    if (existing) {
      await supabase.from('dm_message_reactions').delete().eq('message_id', messageId).eq('user_id', currentUserId).eq('emoji', emoji)
    } else {
      await supabase.from('dm_message_reactions').insert({ message_id: messageId, user_id: currentUserId, emoji })
    }
  }

  const getGroupedReactions = (messageId) => {
    const reactions = reactionsMap[messageId] || []
    const grouped = {}
    reactions.forEach((r) => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, reactedByMe: false, userIds: [] }
      grouped[r.emoji].count += 1
      grouped[r.emoji].userIds.push(r.user_id)
      if (r.user_id === currentUserId) grouped[r.emoji].reactedByMe = true
    })
    return grouped
  }

  const getReactorNames = (userIds) => {
    const names = userIds.map((id) => {
      if (id === currentUserId) return 'You'
      return otherProfile?.display_name || 'Someone' // only one other person in a DM
    })
    if (names.length <= 3) return names.join(', ')
    return `${names.slice(0, 3).join(', ')}, and ${names.length - 3} more`
  }

  const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100">
      {/* ---- MESSAGE LIST ---- */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUserId
          const senderProfile = isOwn ? null : otherProfile
          const isBeingEdited = editingMessage?.id === msg.id
          const groupedReactions = getGroupedReactions(msg.id)

          return (
            <div key={msg.id} className="flex items-start gap-3">
              {isOwn ? (
                myProfile?.avatar_url ? (
                  <img src={myProfile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-300 flex-shrink-0" />
                )
              ) : senderProfile?.avatar_url ? (
                <img src={senderProfile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-300 flex-shrink-0" />
              )}
              <div className="max-w-md flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">
                    {isOwn ? 'You' : (senderProfile?.display_name || 'Member')}
                  </span>
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

                    {/* ---- HOVER ACTIONS: React (everyone) / Edit / Delete (own messages only) ---- */}
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity bg-white shadow-md rounded-full px-3 py-1.5 whitespace-nowrap z-10">
                      <ReactionPicker onSelect={(emoji) => handleToggleReaction(msg.id, emoji)} />
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
                      {isOwn && (
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
                            onClick={() => handleDelete(msg.id)}
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
                      {Object.entries(groupedReactions).map(([emoji, { count, reactedByMe, userIds }]) => (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(msg.id, emoji)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setOpenReactorList({
                              emoji,
                              names: userIds.map((id) => (id === currentUserId ? 'You' : (otherProfile?.display_name || 'Someone'))),
                              anchorPosition: { x: e.clientX, y: e.clientY },
                            })
                          }}
                          title={getReactorNames(userIds)}
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
        <div ref={bottomRef} />
      </div>

      {expandedAttachment && (
        <ImageLightbox
          url={expandedAttachment.url}
          type={expandedAttachment.type}
          onClose={() => setExpandedAttachment(null)}
        />
      )}

      
      {openReactorList && (
        <ReactorList
          emoji={openReactorList.emoji}
          names={openReactorList.names}
          anchorPosition={openReactorList.anchorPosition}
          onClose={() => setOpenReactorList(null)}
        />
      )}

      {/* ---- MESSAGE INPUT BAR ---- */}
      <div className="bg-white">
        {editingMessage && (
          <div className="px-4 pt-3 flex items-center justify-between text-sm text-blue-600 bg-blue-50">
            <span>Editing message</span>
            <button onClick={cancelEditing} className="text-blue-400 hover:text-blue-600" title="Cancel edit">
              ✕
            </button>
          </div>
        )}

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
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={pendingFile ? 'Add a caption...' : `Message ${otherProfile?.display_name || 'member'}...`}
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

export default DMChatView