import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import attachIcon from './assets/icons8-add-file-50.png'

// Renders a message's attachment according to its type — identical to ChatView's version
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

// DMChatView is a self-contained direct-message conversation, styled to be
// visually identical to ChatView (same bubble layout, same hover action pill,
// same attach icon) — just without reactions/threads in this first pass.
function DMChatView({ conversation, currentUserId, otherProfile, myProfile }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

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

  const handleSend = async (e) => {
    e.preventDefault()

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
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) setPendingFile(file)
    e.target.value = ''
  }

  const startEditing = (msg) => {
    setEditingId(msg.id)
    setEditValue(msg.content)
  }

  const submitEdit = async (id) => {
    if (editValue.trim()) {
      await supabase.from('dm_messages').update({ content: editValue.trim(), edited: true }).eq('id', id)
    }
    setEditingId(null)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Delete this message?')) {
      await supabase.from('dm_messages').delete().eq('id', id)
    }
  }

  const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100">
      {/* ---- MESSAGE LIST ---- */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUserId
          const senderProfile = isOwn ? null : otherProfile
          const isEditing = editingId === msg.id

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
                    <div className="relative inline-block group">
                      {msg.content && (
                        <div className="bg-white p-2 rounded shadow-sm">
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        </div>
                      )}
                      {msg.attachment_url && (
                        <Attachment url={msg.attachment_url} type={msg.attachment_type} name={msg.attachment_name} />
                      )}

                      {/* ---- HOVER ACTIONS: Edit / Delete (own messages only — no reactions/reply yet in DMs) ---- */}
                      {isOwn && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity bg-white shadow-md rounded-full px-3 py-1.5 whitespace-nowrap z-10">
                          <button
                            onClick={() => startEditing(msg)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ---- MESSAGE INPUT BAR ---- */}
      <div className="bg-white">
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
            placeholder={pendingFile ? 'Add a caption...' : `Message ${otherProfile?.display_name || 'member'}...`}
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

export default DMChatView