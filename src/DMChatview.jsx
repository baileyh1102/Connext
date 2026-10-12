import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import attachIcon from './assets/icons8-add-file-50.png'
import { linkify } from './linkify'
import ImageLightbox from './ImageLightbox'
import ReactionPicker from './ReactionPicker'
import ReactorList from './ReactorList'
import GifPicker from './GifPicker'
import PollCreator from './PollCreator'
import DMPollMessage from './DMPollMessage'
import ChecklistCreator from './ChecklistCreator'
import DMChecklistMessage from './DMChecklistMessage'
import ScheduleMessagePicker from './ScheduleMessagePicker'

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

function DMChatView({ conversation, currentUserId, currentUserEmail, otherProfile, myProfile }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [editingMessage, setEditingMessage] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [expandedAttachment, setExpandedAttachment] = useState(null)
  const [reactionsMap, setReactionsMap] = useState({})
  const [openReactorList, setOpenReactorList] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [showActions, setShowActions] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [showChecklistCreator, setShowChecklistCreator] = useState(false)
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)

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

  useEffect(() => {
    if (!conversation) return

    const fetchReactions = async () => {
      const { data } = await supabase.from('dm_message_reactions').select('message_id, emoji, user_id')
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

  const handleSendGif = async (gifUrl) => {
    setShowGifPicker(false)
    setShowActions(false)
    await supabase.from('dm_messages').insert({
      conversation_id: conversation.id,
      sender_id: currentUserId,
      content: '',
      attachment_url: gifUrl,
      attachment_type: 'gif',
      attachment_name: 'GIF',
    })
    touchConversation()
  }

  const handleCreatePoll = async ({ question, options, allowMultiple }) => {
    const { data: messageRow, error: msgError } = await supabase
      .from('dm_messages')
      .insert({ conversation_id: conversation.id, sender_id: currentUserId, content: '' })
      .select()
      .single()
    if (msgError || !messageRow) return

    const { data: pollRow, error: pollError } = await supabase
      .from('dm_polls')
      .insert({ message_id: messageRow.id, question, allow_multiple: allowMultiple, created_by: currentUserId })
      .select()
      .single()
    if (pollError || !pollRow) return

    await supabase.from('dm_poll_options').insert(
      options.map((text, index) => ({ poll_id: pollRow.id, option_text: text, position: index }))
    )
    touchConversation()
  }

  const handleCreateChecklist = async ({ title, items }) => {
    const { data: messageRow, error: msgError } = await supabase
      .from('dm_messages')
      .insert({ conversation_id: conversation.id, sender_id: currentUserId, content: '' })
      .select()
      .single()
    if (msgError || !messageRow) return

    const { data: checklistRow, error: checklistError } = await supabase
      .from('dm_checklists')
      .insert({ message_id: messageRow.id, title, created_by: currentUserId })
      .select()
      .single()
    if (checklistError || !checklistRow) return

    await supabase.from('dm_checklist_items').insert(
      items.map((text, index) => ({ checklist_id: checklistRow.id, item_text: text, position: index }))
    )
    touchConversation()
  }

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

  const handleCopy = (id, content) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
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
    const names = userIds.map((id) => (id === currentUserId ? 'You' : (otherProfile?.display_name || 'Someone')))
    if (names.length <= 3) return names.join(', ')
    return `${names.slice(0, 3).join(', ')}, and ${names.length - 3} more`
  }

  const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100">
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
                    <DMPollMessage messageId={msg.id} currentUserId={currentUserId} />
                    <DMChecklistMessage messageId={msg.id} currentUserId={currentUserId} myProfile={myProfile} otherProfile={otherProfile} />

                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity bg-white shadow-md rounded-full px-3 py-1.5 whitespace-nowrap z-10">
                      <ReactionPicker onSelect={(emoji) => handleToggleReaction(msg.id, emoji)} />
                      <div className="relative">
                        <button onClick={() => handleCopy(msg.id, msg.content)} className="text-gray-400 hover:text-gray-600" title="Copy">
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
                          <button onClick={() => startEditing(msg)} className="text-gray-400 hover:text-gray-600" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(msg.id)} className="text-red-400 hover:text-red-600" title="Delete">
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
                            reactedByMe ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
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

      <div className="bg-white">
        {editingMessage && (
          <div className="px-4 pt-3 flex items-center justify-between text-sm text-blue-600 bg-blue-50">
            <span>Editing message</span>
            <button onClick={cancelEditing} className="text-blue-400 hover:text-blue-600" title="Cancel edit">✕</button>
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
              <button onClick={() => setPendingFile(null)} className="text-gray-400 hover:text-red-500 text-sm ml-1" title="Remove">✕</button>
            </div>
          </div>
        )}

        <form onSubmit={handleSend} className="p-4 flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.mp4,.mp3,.wav"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="relative">
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

            {showGifPicker && (
              <GifPicker onSelect={handleSendGif} onClose={() => setShowGifPicker(false)} />
            )}
            {showPollCreator && (
              <PollCreator
                onCreate={(pollData) => {
                  handleCreatePoll(pollData)
                  setShowPollCreator(false)
                  setShowActions(false)
                }}
                onClose={() => setShowPollCreator(false)}
              />
            )}
            {showChecklistCreator && (
              <ChecklistCreator
                onCreate={(checklistData) => {
                  handleCreateChecklist(checklistData)
                  setShowChecklistCreator(false)
                  setShowActions(false)
                }}
                onClose={() => setShowChecklistCreator(false)}
              />
            )}
            {showSchedulePicker && (
              <ScheduleMessagePicker
                messageText={newMessage}
                conversationId={conversation.id}
                currentUserId={currentUserId}
                currentUserEmail={currentUserEmail}
                onScheduled={() => {
                  setNewMessage('')
                  setShowActions(false)
                }}
                onClose={() => setShowSchedulePicker(false)}
              />
            )}
          </div>

          <div
            className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out ${
              showActions ? 'max-w-[240px] opacity-100' : 'max-w-0 opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={() => { fileInputRef.current.click(); setShowActions(false) }}
              className="mb-1 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              title="Attach a file"
            >
              <img src={attachIcon} alt="Attach file" className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => setShowGifPicker(!showGifPicker)}
              className="mb-1 text-xs font-bold border border-gray-300 rounded px-1.5 py-1 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
              title="Send a GIF"
            >
              GIF
            </button>
            <button
              type="button"
              onClick={() => setShowPollCreator(!showPollCreator)}
              className="mb-1 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
              title="Create a poll"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowChecklistCreator(!showChecklistCreator)}
              className="mb-1 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
              title="Create a checklist"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowSchedulePicker(!showSchedulePicker)}
              className="mb-1 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
              title="Schedule a message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={pendingFile ? 'Add a caption...' : `Message ${otherProfile?.display_name || 'member'}...`}
            rows={Math.min(newMessage.split('\n').length, 6)}
            className="block w-full border rounded px-2 py-1.5 resize-none"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-[7px] rounded hover:bg-blue-600/90">
            {editingMessage ? 'Save' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default DMChatView