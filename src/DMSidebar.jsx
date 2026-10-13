import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import StatusDot from './StatusDot'
import { usePresence, getEffectiveStatus } from './usePresence'

// A group's name: its custom name if it has one, otherwise the members' names
function groupDisplayName(c) {
  if (c.name) return c.name
  const names = (c.memberProfiles || []).map((p) => p.display_name || 'Member')
  if (names.length === 0) return 'Group chat'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

function GroupIcon({ className = 'w-8 h-8' }) {
  return (
    <div className={`${className} rounded-full bg-indigo-500 flex items-center justify-center text-white flex-shrink-0`}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </div>
  )
}

// DMSidebar lists the current user's DM and group conversations (most recent
// first), with a picker to start a new message or group, and a blue unread dot
// for conversations with new messages since this user last opened them.
function DMSidebar({ currentUserId, selectedConversation, onSelectConversation, onStartDM }) {
  const onlineUserIds = usePresence()
  const [conversations, setConversations] = useState([])
  const [unreadConversationIds, setUnreadConversationIds] = useState(new Set())
  const [archivedConversationIds, setArchivedConversationIds] = useState(new Set())
  const [openMenuId, setOpenMenuId] = useState(null)

  // null | 'menu' | 'dm' | 'group'
  const [newMode, setNewMode] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState([])

  const [mutualIds, setMutualIds] = useState([])
  const [groupSearch, setGroupSearch] = useState('')
  const [groupResults, setGroupResults] = useState([])
  const [groupPicks, setGroupPicks] = useState([])
  const [groupName, setGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)

  const fetchConversations = async () => {
    const { data: convoRows } = await supabase
      .from('dm_conversations')
      .select('*')
      .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId},is_group.eq.true`)
      .order('last_message_at', { ascending: false })

    if (!convoRows || convoRows.length === 0) {
      setConversations([])
      setUnreadConversationIds(new Set())
      return
    }

    // Members of each group
    const groupIds = convoRows.filter((c) => c.is_group).map((c) => c.id)
    const membersByConvo = {}
    if (groupIds.length > 0) {
      const { data: memberRows } = await supabase
        .from('dm_conversation_members')
        .select('conversation_id, user_id')
        .in('conversation_id', groupIds)
      memberRows?.forEach((m) => {
        if (!membersByConvo[m.conversation_id]) membersByConvo[m.conversation_id] = []
        membersByConvo[m.conversation_id].push(m.user_id)
      })
    }

    // One profile lookup for everyone we need to show
    const profileIds = new Set()
    convoRows.forEach((c) => {
      if (c.is_group) {
        ;(membersByConvo[c.id] || []).forEach((id) => { if (id !== currentUserId) profileIds.add(id) })
      } else {
        profileIds.add(c.user_a === currentUserId ? c.user_b : c.user_a)
      }
    })
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url, status')
      .in('user_id', [...profileIds])

    const profileMap = {}
    profileRows?.forEach((p) => { profileMap[p.user_id] = p })

    setConversations(
      convoRows.map((c) => {
        if (c.is_group) {
          const memberProfiles = (membersByConvo[c.id] || [])
            .filter((id) => id !== currentUserId)
            .map((id) => profileMap[id])
            .filter(Boolean)
          const enriched = { ...c, memberProfiles }
          enriched.displayName = groupDisplayName(enriched)
          return enriched
        }
        return { ...c, otherProfile: profileMap[c.user_a === currentUserId ? c.user_b : c.user_a] }
      })
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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_conversations' }, (payload) => removeConversation(payload.old?.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_conversation_members' }, fetchConversations)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => {
        fetchConversations()
        fetchArchived() // new activity should "un-archive" a conversation for the recipient
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [currentUserId])

  // Take a deleted or left conversation out of the list, and close it if it's open
  const selectedIdRef = useRef(null)
  selectedIdRef.current = selectedConversation?.id
  const removeConversation = (id) => {
    if (!id) return
    setConversations((current) => current.filter((c) => c.id !== id))
    if (selectedIdRef.current === id) onSelectConversation(null)
  }

  useEffect(() => {
    const handler = (e) => removeConversation(e.detail?.id)
    window.addEventListener('dm-conversation-removed', handler)
    return () => window.removeEventListener('dm-conversation-removed', handler)
  }, [])

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

  // DMs: delete for both people. Groups: just leave (the group continues without you).
  const handleDeleteConversation = async (c) => {
    if (c.is_group) {
      if (!window.confirm('Leave this group? The others will keep chatting without you.')) return
      await supabase.rpc('leave_group', { conv_id: c.id })
    } else {
      if (!window.confirm('Permanently delete this conversation? This deletes it for both people and cannot be undone.')) return
      await supabase.from('dm_conversations').delete().eq('id', c.id)
    }
    setConversations((current) => current.filter((x) => x.id !== c.id))
    if (selectedConversation?.id === c.id) {
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

  // ---- New message (1:1) search ----
  useEffect(() => {
    if (newMode !== 'dm' || !searchText.trim()) {
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
  }, [searchText, newMode, currentUserId])

  // ---- New group: only people who share a server with you ----
  useEffect(() => {
    if (newMode !== 'group') return
    const loadMutual = async () => {
      const { data: mine } = await supabase.from('server_members').select('server_id').eq('user_id', currentUserId)
      const serverIds = (mine || []).map((m) => m.server_id)
      if (serverIds.length === 0) { setMutualIds([]); return }
      const { data: others } = await supabase.from('server_members').select('user_id').in('server_id', serverIds)
      setMutualIds([...new Set((others || []).map((o) => o.user_id))].filter((id) => id !== currentUserId))
    }
    loadMutual()
  }, [newMode, currentUserId])

  useEffect(() => {
    if (newMode !== 'group' || mutualIds.length === 0) {
      setGroupResults([])
      return
    }
    const search = async () => {
      let q = supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', mutualIds)
      if (groupSearch.trim()) q = q.ilike('display_name', `%${groupSearch}%`)
      const { data } = await q.order('display_name').limit(15)
      setGroupResults(data || [])
    }
    search()
  }, [groupSearch, mutualIds, newMode])

  const closeNew = () => {
    setNewMode(null)
    setSearchText('')
    setGroupSearch('')
    setGroupPicks([])
    setGroupName('')
  }

  const handlePick = async (profile) => {
    await onStartDM(profile.user_id)
    closeNew()
  }

  const togglePick = (profile) => {
    setGroupPicks((current) =>
      current.some((p) => p.user_id === profile.user_id)
        ? current.filter((p) => p.user_id !== profile.user_id)
        : [...current, profile]
    )
  }

  const handleCreateGroup = async () => {
    if (groupPicks.length < 2 || creatingGroup) return
    setCreatingGroup(true)

    const { data: convo, error } = await supabase
      .from('dm_conversations')
      .insert({
        is_group: true,
        name: groupName.trim() || null,
        created_by: currentUserId,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error || !convo) {
      console.log('Create group error:', error)
      alert("Couldn't create the group. Please try again.")
      setCreatingGroup(false)
      return
    }

    const rows = [currentUserId, ...groupPicks.map((p) => p.user_id)].map((uid) => ({
      conversation_id: convo.id,
      user_id: uid,
      added_by: currentUserId,
    }))
    const { error: memberError } = await supabase.from('dm_conversation_members').insert(rows)

    if (memberError) {
      console.log('Add group members error:', memberError)
      await supabase.from('dm_conversations').delete().eq('id', convo.id)
      alert("Couldn't add everyone to the group. Nothing was created.")
      setCreatingGroup(false)
      return
    }

    const enriched = { ...convo, memberProfiles: groupPicks }
    enriched.displayName = groupDisplayName(enriched)
    onSelectConversation(enriched)
    closeNew()
    setCreatingGroup(false)
    fetchConversations()
  }

  const convoName = (c) => (c.is_group ? c.displayName : (c.otherProfile?.display_name || 'A member'))

  const renderAvatar = (c, withStatus) => {
    if (c.is_group) return <GroupIcon />
    return (
      <div className="relative flex-shrink-0">
        {c.otherProfile?.avatar_url ? (
          <img src={c.otherProfile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-500" />
        )}
        {withStatus && (
          <StatusDot status={getEffectiveStatus(c.otherProfile?.user_id, c.otherProfile?.status, onlineUserIds)} size="w-2.5 h-2.5" />
        )}
      </div>
    )
  }

  return (
    <div className="w-56 h-full bg-gray-800 text-gray-300 flex flex-col">
      <div className="p-4 font-bold text-white border-b border-gray-700 flex items-center justify-between">
        <span>Direct Messages</span>
        <button
          onClick={() => (newMode ? closeNew() : setNewMode('menu'))}
          className="text-gray-400 hover:text-white text-lg leading-none"
          title="New message"
        >
          {newMode ? '×' : '+'}
        </button>
      </div>

      {newMode === 'menu' && (
        <div className="p-2 border-b border-gray-700 space-y-1">
          <button onClick={() => setNewMode('dm')} className="w-full text-left text-sm p-2 rounded hover:bg-gray-700">
            New message
          </button>
          <button onClick={() => setNewMode('group')} className="w-full text-left text-sm p-2 rounded hover:bg-gray-700">
            New group
          </button>
        </div>
      )}

      {newMode === 'dm' && (
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

      {newMode === 'group' && (
        <div className="p-2 border-b border-gray-700 max-h-[60%] overflow-y-auto">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (optional)"
            className="w-full bg-gray-900 text-white text-sm p-2 rounded outline-none mb-1"
          />
          <input
            type="text"
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            placeholder="Search people you share a server with..."
            className="w-full bg-gray-900 text-white text-sm p-2 rounded outline-none mb-1"
          />

          {groupPicks.length > 0 && (
            <div className="flex flex-wrap gap-1 my-1">
              {groupPicks.map((p) => (
                <button
                  key={p.user_id}
                  onClick={() => togglePick(p)}
                  className="text-xs bg-indigo-600 text-white rounded-full px-2 py-0.5"
                  title="Remove"
                >
                  {p.display_name || 'Member'} ×
                </button>
              ))}
            </div>
          )}

          {groupResults
            .filter((p) => !groupPicks.some((g) => g.user_id === p.user_id))
            .map((p) => (
              <button
                key={p.user_id}
                onClick={() => togglePick(p)}
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

          {mutualIds.length === 0 && (
            <p className="text-xs text-gray-500 px-1 py-2">No people found yet.</p>
          )}

          <button
            onClick={handleCreateGroup}
            disabled={groupPicks.length < 2 || creatingGroup}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm py-2 rounded"
          >
            {creatingGroup ? 'Creating...' : groupPicks.length < 2 ? 'Pick at least 2 people' : `Create group (${groupPicks.length + 1})`}
          </button>
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
              {renderAvatar(c, true)}
              <span className="text-sm truncate flex-1">{convoName(c)}</span>
              {unreadConversationIds.has(c.id) && (
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              )}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === c.id ? null : c.id) }}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white px-1 opacity-0 group-hover:opacity-100 max-md:opacity-100"
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
                  onClick={() => handleDeleteConversation(c)}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-800"
                >
                  {c.is_group ? 'Leave group' : 'Delete'}
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
                  {renderAvatar(c, false)}
                  <span className="text-sm truncate flex-1">{convoName(c)}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnarchive(c.id) }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 max-md:opacity-100 px-1"
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