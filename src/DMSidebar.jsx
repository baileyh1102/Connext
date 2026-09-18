import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// DMSidebar lists the current user's DM conversations (most recent first),
// with a picker to start a new one. Mirrors ChannelSidebar's slot in the layout.
function DMSidebar({ currentUserId, selectedConversation, onSelectConversation, onStartDM }) {
  const [conversations, setConversations] = useState([]) // [{ ...conversation, otherProfile }]
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
      return
    }

    const otherIds = convoRows.map((c) => (c.user_a === currentUserId ? c.user_b : c.user_a))
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', otherIds)

    const profileMap = {}
    profileRows?.forEach((p) => { profileMap[p.user_id] = p })

    setConversations(
      convoRows.map((c) => ({
        ...c,
        otherProfile: profileMap[c.user_a === currentUserId ? c.user_b : c.user_a],
      }))
    )
  }

  useEffect(() => {
    fetchConversations()

    // Broad subscriptions (no filter) since Postgres RLS filters here would need
    // an OR across two columns, which realtime filters don't support directly —
    // simplest reliable approach is to refetch on any change, same pattern used
    // elsewhere in this app for smaller tables.
    const channel = supabase
      .channel('dm-sidebar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_conversations' }, fetchConversations)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, fetchConversations)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [currentUserId])

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
        {conversations.length === 0 && (
          <p className="text-sm text-gray-500 px-2 mt-2">No conversations yet.</p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelectConversation(c)}
            className={`w-full flex items-center gap-2 p-2 rounded text-left ${
              selectedConversation?.id === c.id ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'
            }`}
          >
            {c.otherProfile?.avatar_url ? (
              <img src={c.otherProfile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-500" />
            )}
            <span className="text-sm truncate">{c.otherProfile?.display_name || 'A member'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default DMSidebar