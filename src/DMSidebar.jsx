import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import StatusDot from './StatusDot'
import { usePresence, getEffectiveStatus } from './usePresence'

// DMSidebar lists the current user's DM conversations (most recent first),
// with a picker to start a new one, and a blue unread dot for conversations
// with new messages since this user last opened them.
function DMSidebar({ currentUserId, selectedConversation, onSelectConversation, onStartDM }) {
  const onlineUserIds = usePresence()
  const [conversations, setConversations] = useState([])
  const [unreadConversationIds, setUnreadConversationIds] = useState(new Set())
  const [archivedConversationIds, setArchivedConversationIds] = useState(new Set())
  const [openMenuId, setOpenMenuId] = useState(null)
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState([])

  const fetchConversations = async () => {
    const { data: convoRows } = await supabase
      .from('dm_conversations')
      .select('*')
      .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`)
      .order('last_message_at', { ascending: false })

    if (!convoRows || convoRows.length === 0) {
      setConversations([])
      setUnreadConversationIds(new Set())
      return
    }

    const otherIds = convoRows.map((c) => (c.user_a === currentUserId ? c.user_b : c.user_a))
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url, status')
      .in('user_id', otherIds)

    const profileMap = {}
    profileRows?.forEach((p) => { profileMap[p.user_id] = p })

    setConversations(
      convoRows.map((c) => ({
        ...c,
        otherProfile: profileMap[c.user_a === currentUserId ? c.user_b : c.user_a],
      }))
    )

    const convoIds = convoRows.map((c) => c.id)
    const { data: readRows } = await supabase
      .from('dm_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', currentUserId)
      .in('conversation_id', convoIds)

    const readMap = {}
    readRows?.forEach((r) => { readMap[r.conversation_id] = r.last_read_at })

    const unread = new Set()
    for (const convo of convoRows) {
      const { data: latestMessage } = await supabase
        .from('dm_messages')
        .select('created_at, sender_id')
        .eq('conversation_id', convo.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!latestMessage) continue
      if (latestMessage.sender_id === currentUserId) continue

      const lastRead = readMap[convo.id]
      if (!lastRead || new Date(latestMessage.created_at) > new Date(lastRead)) {
        unread.add(convo.id)
      }
    }
    setUnreadConversationIds(unread)
  }

  const fetchArchived = async () => {
    const { data } = await supabase
      .from('dm_conversation_archives')
      .select('conversation_id')
      .eq('user_id', currentUserId)
    setArchivedConversationIds(new Set((data || []).map((a) => a.conversation_id)))
  }

  useEffect(() => {
    fetchConversations()
    fetchArchived()

    const channel = supabase
      .channel('dm-sidebar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_conversations' }, fetchConversations)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => {
        fetchConversations()
        fetchArchived() // new activity should "un-archive" a conversation for the recipient
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [currentUserId])

    const handleArchive = async (conversationId) => {
    await supabase.from('dm_conversation_archives').upsert(
      { user_id: currentUserId, conversation_id: conversationId },
      { onConflict: 'user_id,conversation_id' }
    )
    setArchivedConversationIds((current) => new Set(current).add(conversationId))
    setOpenMenuId(null)
  }

  const handleUnarchive = async (conversationId) => {
    await supabase.from('dm_conversation_archives').delete().eq('user_id', currentUserId).eq('conversation_id', conversationId)
    setArchivedConversationIds((current) => {
      const updated = new Set(current)
      updated.delete(conversationId)
      return updated
    })
    setOpenMenuId(null)
  }

  const handleDeleteConversation = async (conversationId) => {
    if (!window.confirm('Permanently delete this conversation? This deletes it for both people and cannot be undone.')) return
    await supabase.from('dm_conversations').delete().eq('id', conversationId)
    setConversations((current) => current.filter((c) => c.id !== conversationId))
    if (selectedConversation?.id === conversationId) {
      onSelectConversation(null)
    }
    setOpenMenuId(null)
  }

  const markConversationRead = async (conversationId) => {
    setUnreadConversationIds((current) => {
      const updated = new Set(current)
      updated.delete(conversationId)
      return updated
    })
    await supabase
      .from('dm_reads')
      .upsert({ user_id: currentUserId, conversation_id: conversationId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,conversation_id' })
  }

  useEffect(() => {
    if (!showNewMessage || !searchText.trim()) {
      setSearchResults([])
      return
    }
    const search = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .ilike('display_name', `%${searchText}%`)
        .neq('user_id', currentUserId)
        .limit(10)
      setSearchResults(data || [])
    }
    search()
  }, [searchText, showNewMessage, currentUserId])

  const handlePick = async (profile) => {
    await onStartDM(profile.user_id)
    setShowNewMessage(false)
    setSearchText('')
  }

  return (
    <div className="w-56 h-full bg-gray-800 text-gray-300 flex flex-col">
      <div className="p-4 font-bold text-white border-b border-gray-700 flex items-center justify-between">
        <span>Direct Messages</span>
        <button
          onClick={() => setShowNewMessage(!showNewMessage)}
          className="text-gray-400 hover:text-white text-lg leading-none"
          title="New message"
        >
          +
        </button>
      </div>

      {showNewMessage && (
        <div className="p-2 border-b border-gray-700">
          <input
            type="text"
            autoFocus
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search members..."
            className="w-full bg-gray-900 text-white text-sm p-2 rounded outline-none mb-1"
          />
          {searchResults.map((p) => (
            <button
              key={p.user_id}
              onClick={() => handlePick(p)}
              className="w-full flex items-center gap-2 p-2 rounded hover:bg-gray-700 text-left"
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="Avatar" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-500" />
              )}
              <span className="text-sm">{p.display_name || 'A member'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.filter((c) => !archivedConversationIds.has(c.id)).length === 0 && (
          <p className="text-sm text-gray-500 px-2 mt-2">No conversations yet.</p>
        )}
        {conversations.filter((c) => !archivedConversationIds.has(c.id)).map((c) => (
          <div key={c.id} className="group relative">
            <button
              onClick={() => { onSelectConversation(c); markConversationRead(c.id) }}
              className={`w-full flex items-center gap-2 p-2 rounded text-left ${
                selectedConversation?.id === c.id ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'
              }`}
            >
              <div className="relative flex-shrink-0">
                {c.otherProfile?.avatar_url ? (
                  <img src={c.otherProfile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-500" />
                )}
                <StatusDot status={getEffectiveStatus(c.otherProfile?.user_id, c.otherProfile?.status, onlineUserIds)} size="w-2.5 h-2.5" />
              </div>
              <span className="text-sm truncate flex-1">{c.otherProfile?.display_name || 'A member'}</span>
              {unreadConversationIds.has(c.id) && (
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              )}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === c.id ? null : c.id) }}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white px-1 opacity-0 group-hover:opacity-100"
            >
              ⋮
            </button>

            {openMenuId === c.id && (
              <div className="absolute right-0 top-9 bg-gray-900 border border-gray-700 rounded shadow-lg z-20 w-32">
                <button
                  onClick={() => handleArchive(c.id)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                >
                  Archive
                </button>
                <button
                  onClick={() => handleDeleteConversation(c.id)}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-800"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}

        {conversations.some((c) => archivedConversationIds.has(c.id)) && (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase mt-4 mb-1 px-2">Archived</p>
            {conversations.filter((c) => archivedConversationIds.has(c.id)).map((c) => (
              <div key={c.id} className="group relative opacity-60">
                <button
                  onClick={() => { onSelectConversation(c); markConversationRead(c.id) }}
                  className={`w-full flex items-center gap-2 p-2 rounded text-left ${
                    selectedConversation?.id === c.id ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'
                  }`}
                >
                  {c.otherProfile?.avatar_url ? (
                    <img src={c.otherProfile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-500" />
                  )}
                  <span className="text-sm truncate flex-1">{c.otherProfile?.display_name || 'A member'}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnarchive(c.id) }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 px-1"
                >
                  Unarchive
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default DMSidebar