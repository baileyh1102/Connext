import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import UserProfileCard from './UserProfileCard'

// The name a group shows when nobody has given it one
function defaultGroupName(others) {
  const names = others.map((p) => p.display_name || 'Member')
  if (names.length === 0) return 'Group chat'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

// GroupInfoPanel: rename a group, see who's in it, add people, or leave.
function GroupInfoPanel({ conversation, currentUserId, onClose, onChanged, onLeft }) {
  const [members, setMembers] = useState([])
  const [nameInput, setNameInput] = useState(conversation.name || '')
  const [savingName, setSavingName] = useState(false)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [mutualIds, setMutualIds] = useState([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [picks, setPicks] = useState([])
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState('')

  const loadMembers = async () => {
    const { data: rows } = await supabase
      .from('dm_conversation_members')
      .select('user_id')
      .eq('conversation_id', conversation.id)
    const ids = (rows || []).map((r) => r.user_id)
    if (ids.length === 0) { setMembers([]); return [] }
    const { data: profs } = await supabase.from('profiles').select('*').in('user_id', ids)
    setMembers(profs || [])
    return profs || []
  }

  useEffect(() => {
    loadMembers()
  }, [conversation.id])

  // People who share at least one server with me
  useEffect(() => {
    const loadMutual = async () => {
      const { data: mine } = await supabase.from('server_members').select('server_id').eq('user_id', currentUserId)
      const serverIds = (mine || []).map((m) => m.server_id)
      if (serverIds.length === 0) { setMutualIds([]); return }
      const { data: others } = await supabase.from('server_members').select('user_id').in('server_id', serverIds)
      setMutualIds([...new Set((others || []).map((o) => o.user_id))].filter((id) => id !== currentUserId))
    }
    loadMutual()
  }, [currentUserId])

  // Candidates to add: mutual-server people who aren't already in the group
  useEffect(() => {
    const memberIds = members.map((m) => m.user_id)
    const candidateIds = mutualIds.filter((id) => !memberIds.includes(id))
    if (candidateIds.length === 0) { setResults([]); return }
    const run = async () => {
      let q = supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', candidateIds)
      if (search.trim()) q = q.ilike('display_name', `%${search}%`)
      const { data } = await q.order('display_name').limit(15)
      setResults(data || [])
    }
    run()
  }, [search, mutualIds, members])

  const others = members.filter((m) => m.user_id !== currentUserId)

  const handleSaveName = async () => {
    setSavingName(true)
    setMessage('')
    const newName = nameInput.trim() || null
    const { error } = await supabase.from('dm_conversations').update({ name: newName }).eq('id', conversation.id)
    if (error) {
      console.log('Rename group error:', error)
      setMessage("Couldn't rename the group.")
    } else {
      onChanged({ name: newName, displayName: newName || defaultGroupName(others) })
      setMessage('Name saved.')
    }
    setSavingName(false)
  }

  const togglePick = (p) => {
    setPicks((current) =>
      current.some((x) => x.user_id === p.user_id) ? current.filter((x) => x.user_id !== p.user_id) : [...current, p]
    )
  }

  const handleAdd = async () => {
    if (picks.length === 0 || adding) return
    setAdding(true)
    setMessage('')
    const rows = picks.map((p) => ({ conversation_id: conversation.id, user_id: p.user_id, added_by: currentUserId }))
    const { error } = await supabase.from('dm_conversation_members').insert(rows)
    if (error) {
      console.log('Add members error:', error)
      setMessage("Couldn't add everyone. You can only add people you share a server with.")
    } else {
      const updated = await loadMembers()
      const updatedOthers = updated.filter((m) => m.user_id !== currentUserId)
      onChanged({
        memberProfiles: updatedOthers,
        displayName: conversation.name || defaultGroupName(updatedOthers),
      })
      setPicks([])
      setSearch('')
      setMessage('People added.')
    }
    setAdding(false)
  }

  const handleDeleteGroup = async () => {
    if (!window.confirm('Delete this group for everyone? All messages will be permanently removed for every member. This cannot be undone.')) return
    const { data, error } = await supabase
      .from('dm_conversations')
      .delete()
      .eq('id', conversation.id)
      .select()
    if (error || !data || data.length === 0) {
      console.log('Delete group error:', error)
      setMessage("Couldn't delete the group.")
      return
    }
    window.dispatchEvent(new CustomEvent('dm-conversation-removed', { detail: { id: conversation.id } }))
    onLeft()
  }

  const handleLeave = async () => {
    if (!window.confirm('Leave this group? The others will keep chatting without you.')) return
    const { error } = await supabase.rpc('leave_group', { conv_id: conversation.id })
    if (error) {
      console.log('Leave group error:', error)
      setMessage("Couldn't leave the group.")
      return
    }
    onLeft()
  }

  const avatar = (p, size = 'w-8 h-8') =>
    p.avatar_url ? (
      <img src={p.avatar_url} alt="" className={`${size} rounded-full object-cover flex-shrink-0`} />
    ) : (
      <div className={`${size} rounded-full bg-gray-300 flex-shrink-0`} />
    )

  const panel = (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center md:justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="bg-white w-full md:w-[420px] max-h-[85vh] overflow-y-auto rounded-t-2xl md:rounded-lg shadow-xl pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white">
          <h2 className="font-bold">Group details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Name */}
        <div className="p-4 border-b">
          <label className="text-xs font-semibold text-gray-500 uppercase">Group name</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={defaultGroupName(others)}
              className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-3 rounded"
            >
              Save
            </button>
          </div>
        </div>

        {/* Members */}
        <div className="p-4 border-b">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{members.length} members</p>
          {members.map((m) => (
            <button
              key={m.user_id}
              onClick={() => m.user_id !== currentUserId && setViewingProfile(m)}
              className="w-full flex items-center gap-3 py-1.5 text-left hover:bg-gray-50 rounded"
            >
              {avatar(m)}
              <span className="text-sm">{m.display_name || 'Member'}{m.user_id === currentUserId ? ' (you)' : ''}</span>
            </button>
          ))}
        </div>

        {/* Add people */}
        <div className="p-4 border-b">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Add people</p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people you share a server with..."
            className="w-full border rounded px-2 py-1.5 text-sm mb-2"
          />
          {picks.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {picks.map((p) => (
                <button
                  key={p.user_id}
                  onClick={() => togglePick(p)}
                  className="text-xs bg-indigo-600 text-white rounded-full px-2 py-0.5"
                >
                  {p.display_name || 'Member'} &times;
                </button>
              ))}
            </div>
          )}
          {results
            .filter((p) => !picks.some((x) => x.user_id === p.user_id))
            .map((p) => (
              <button
                key={p.user_id}
                onClick={() => togglePick(p)}
                className="w-full flex items-center gap-3 py-1.5 text-left hover:bg-gray-50 rounded"
              >
                {avatar(p, 'w-7 h-7')}
                <span className="text-sm">{p.display_name || 'A member'}</span>
              </button>
            ))}
          {results.length === 0 && picks.length === 0 && (
            <p className="text-xs text-gray-400">No one else to add right now.</p>
          )}
          <button
            onClick={handleAdd}
            disabled={picks.length === 0 || adding}
            className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm py-2 rounded"
          >
            {adding ? 'Adding...' : picks.length === 0 ? 'Pick people to add' : `Add ${picks.length}`}
          </button>
        </div>

        {message && <p className="px-4 pt-3 text-sm text-gray-600">{message}</p>}

        <div className="p-4">
          <button onClick={handleDeleteGroup} className="w-full bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded mb-2">
            Delete group for everyone
          </button>
          <button onClick={handleLeave} className="w-full text-red-600 border border-red-200 hover:bg-red-50 text-sm py-2 rounded">
            Leave group
          </button>
        </div>
      </div>

      {viewingProfile && (
        <UserProfileCard profile={viewingProfile} email={null} onClose={() => setViewingProfile(null)} />
      )}
    </div>
  )

  return createPortal(panel, document.body)
}

export default GroupInfoPanel