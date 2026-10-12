import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import ChannelSettings from './ChannelSettings'
import TeamTemplatePicker from './TeamTemplatePicker'
import CategorySettings from './CategorySettings'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  { id: 'invites', label: 'Invites' },
  { id: 'templates', label: 'Templates' },
  { id: 'channels', label: 'Channels' },
  { id: 'categories', label: 'Categories' },
]

const PERMISSIONS = [
  { key: 'can_manage_server', label: 'Manage Server', description: 'Change the server name, icon, and description.' },
  { key: 'can_manage_channels', label: 'Manage Channels', description: 'Create, edit, and delete channels.' },
  { key: 'can_manage_messages', label: 'Manage Messages', description: "Delete or edit other members' messages." },
  { key: 'can_manage_members', label: 'Manage Members', description: "Edit other members' permissions." },
  { key: 'can_kick_members', label: 'Kick Members', description: 'Remove other members from the server.' },
  { key: 'can_manage_calendar', label: 'Manage Calendar', description: 'Connect or update the server calendar link.' },
  { key: 'can_edit_posts', label: 'Edit Posts', description: "Edit other members' Home Wall posts." },
  { key: 'can_delete_posts', label: 'Delete Posts', description: "Delete other members' Home Wall posts." },
]

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-green-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function isAdmin(member) {
  return PERMISSIONS.every((p) => !!member[p.key])
}

function ServerSettings({ server, currentUserId, onClose, onDeleteServer, onLeaveServer, onServerUpdated }) {
  const [activeTab, setActiveTab] = useState('general')
  const isCreator = server.created_by === currentUserId

  const [myPermissions, setMyPermissions] = useState(null)
  const canManageServer = isCreator || !!myPermissions?.can_manage_server
  const canManageMembers = isCreator || !!myPermissions?.can_manage_members
  const canKickMembers = isCreator || !!myPermissions?.can_kick_members
  const canManageChannels = isCreator || !!myPermissions?.can_manage_channels

  const [name, setName] = useState(server.name || '')
  const [description, setDescription] = useState(server.description || '')
  const [iconUrl, setIconUrl] = useState(server.icon_url || '')
  const [iconFile, setIconFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const fileInputRef = useRef(null)

  const [channels, setChannels] = useState([])
  const [newChannelName, setNewChannelName] = useState('')
  const [editingChannel, setEditingChannel] = useState(null)

  const [categories, setCategories] = useState([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategory, setEditingCategory] = useState(null)

  const [members, setMembers] = useState([])
  const [openMemberMenu, setOpenMemberMenu] = useState(null)

  useEffect(() => {
    if (isCreator) return
    const fetchMyPermissions = async () => {
      const { data } = await supabase
        .from('server_members')
        .select('*')
        .eq('server_id', server.id)
        .eq('user_id', currentUserId)
        .single()
      setMyPermissions(data)
    }
    fetchMyPermissions()
  }, [server.id, currentUserId, isCreator])

  useEffect(() => {
    if (activeTab !== 'channels') return
    const fetchChannels = async () => {
      const { data } = await supabase
        .from('channels')
        .select('*')
        .eq('server_id', server.id)
        .order('position', { ascending: true })
      setChannels(data || [])
    }
    fetchChannels()
  }, [activeTab, server.id])

  useEffect(() => {
    if (activeTab !== 'categories') return
    const fetchCategories = async () => {
      const { data } = await supabase
        .from('channel_categories')
        .select('*')
        .eq('server_id', server.id)
        .order('position', { ascending: true })
      setCategories(data || [])
    }
    fetchCategories()
  }, [activeTab, server.id])

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    if (!newCategoryName.trim()) return

    const nextPosition = categories.length > 0 ? Math.max(...categories.map((c) => c.position || 0)) + 1 : 1

    const { data, error } = await supabase
      .from('channel_categories')
      .insert({
        name: newCategoryName.trim(),
        position: nextPosition,
        server_id: server.id,
      })
      .select()
      .single()

    if (!error && data) {
      setCategories((current) => [...current, data])
      setNewCategoryName('')
    }
  }

  const handleCreateChannel = async (e) => {
    e.preventDefault()
    if (!newChannelName.trim()) return

    const nextPosition = channels.length > 0 ? Math.max(...channels.map((c) => c.position || 0)) + 1 : 1

    const { data, error } = await supabase
      .from('channels')
      .insert({
        name: newChannelName.trim().toLowerCase().replace(/\s+/g, '-'),
        created_by: currentUserId,
        position: nextPosition,
        server_id: server.id,
      })
      .select()
      .single()

    if (!error && data) {
      setChannels((current) => [...current, data])
      setNewChannelName('')
    }
  }

  const fetchMembers = async () => {
    const { data: memberRows } = await supabase
      .from('server_members')
      .select('*')
      .eq('server_id', server.id)

    if (!memberRows) return

    const userIds = memberRows.map((m) => m.user_id)
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds)

    const profileMap = {}
    profileRows?.forEach((p) => { profileMap[p.user_id] = p })

    setMembers(memberRows.map((m) => ({ ...m, profile: profileMap[m.user_id] })))
  }

  useEffect(() => {
    if (activeTab !== 'members') return
    fetchMembers()
  }, [activeTab, server.id])

  // ---- INVITES: one link per server; private servers have no link ----
  const [invite, setInvite] = useState(null)
  const [isPublic, setIsPublic] = useState(true)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

  const loadInvite = async () => {
    const [{ data: srv }, { data: inv }] = await Promise.all([
      supabase.from('servers').select('is_public').eq('id', server.id).single(),
      supabase.from('invites').select('*').eq('server_id', server.id).maybeSingle(),
    ])
    setIsPublic(srv?.is_public ?? true)
    setInvite(inv || null)
  }

  useEffect(() => {
    if (activeTab !== 'invites') return
    setInviteMessage('')
    loadInvite()
  }, [activeTab, server.id])

  const handleTogglePublic = async () => {
    if (inviteBusy) return
    setInviteBusy(true)
    setInviteMessage('')
    const next = !isPublic

    // The database trigger deletes the link (private) or makes a brand-new one (public)
    const { data, error } = await supabase
      .from('servers')
      .update({ is_public: next })
      .eq('id', server.id)
      .select()

    if (error || !data || data.length === 0) {
      setInviteMessage("Couldn't change this. Try again.")
    } else {
      await loadInvite()
      setInviteMessage(
        next
          ? 'Server is now public. A new invite link was created, and the old one no longer works.'
          : 'Server is now private. The invite link was deleted.'
      )
    }
    setInviteBusy(false)
  }

  const copyInviteCode = (code) => {
    navigator.clipboard.writeText(code)
    setInviteMessage('Copied!')
  }

  const handleSaveGeneral = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveMessage('')

    let finalIconUrl = iconUrl

    if (iconFile) {
      const filePath = `${server.id}-${Date.now()}-${iconFile.name}`
      const { error: uploadError } = await supabase.storage.from('server-icons').upload(filePath, iconFile)
      if (uploadError) {
        setSaveMessage(`Error uploading icon: ${uploadError.message}`)
        setSaving(false)
        return
      }
      const { data: publicUrlData } = supabase.storage.from('server-icons').getPublicUrl(filePath)
      finalIconUrl = publicUrlData.publicUrl
    }

    const { error } = await supabase
      .from('servers')
      .update({ name: name.trim(), description: description.trim(), icon_url: finalIconUrl })
      .eq('id', server.id)

    if (error) {
      setSaveMessage(`Error: ${error.message}`)
    } else {
      setSaveMessage('Saved!')
      setIconUrl(finalIconUrl)
      onServerUpdated({ name: name.trim(), description: description.trim(), icon_url: finalIconUrl })
    }
    setSaving(false)
  }

  const handleTogglePermission = async (userId, permKey, value) => {
    await supabase
      .from('server_members')
      .update({ [permKey]: value })
      .eq('server_id', server.id)
      .eq('user_id', userId)

    setMembers((current) =>
      current.map((m) => (m.user_id === userId ? { ...m, [permKey]: value } : m))
    )
  }

  const handleToggleAdmin = async (userId, makeAdmin) => {
    const updates = PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: makeAdmin }), {})

    await supabase
      .from('server_members')
      .update(updates)
      .eq('server_id', server.id)
      .eq('user_id', userId)

    setMembers((current) =>
      current.map((m) => (m.user_id === userId ? { ...m, ...updates } : m))
    )
  }

  const handleKickMember = async (userId, displayName) => {
    if (!window.confirm(`Remove ${displayName || 'this member'} from the server?`)) return

    const { error } = await supabase
      .from('server_members')
      .delete()
      .eq('server_id', server.id)
      .eq('user_id', userId)

    if (!error) {
      setMembers((current) => current.filter((m) => m.user_id !== userId))
    }
    setOpenMemberMenu(null)
  }

  const handleDelete = () => {
    if (window.confirm(`Delete "${server.name}"? This will also delete all its channels and messages. This cannot be undone.`)) {
      onDeleteServer(server.id)
      onClose()
    }
  }
    
  const handleLeave = async () => {
    if (window.confirm(`Leave "${server.name}"? You'll lose access to its channels until you're invited again.`)) {
      await onLeaveServer(server.id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 max-md:pt-[env(safe-area-inset-top)] md:p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-[700px] h-[80vh] max-md:h-full max-md:rounded-none flex max-md:flex-col overflow-hidden">
        <div className="md:w-48 shrink-0 bg-gray-100 p-4 max-md:p-2 flex md:flex-col max-md:flex-row max-md:items-center max-md:gap-1 max-md:overflow-x-auto">
          <h2 className="max-md:hidden text-xs font-semibold text-gray-400 uppercase mb-2 truncate">{server.name}</h2>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-left px-3 py-2 rounded text-sm md:mb-1 whitespace-nowrap shrink-0 ${
                activeTab === tab.id ? 'bg-gray-300 font-medium' : 'hover:bg-gray-200 text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex justify-between items-center p-4 border-b">
            <h2 className="font-bold">{TABS.find((t) => t.id === activeTab)?.label}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 min-w-0">
            {activeTab === 'templates' && (
              <TeamTemplatePicker
                server={server}
                currentUserId={currentUserId}
                canManageChannels={canManageChannels}
              />
            )}

            {activeTab === 'general' && (
              <div>
                {!canManageServer && (
                  <p className="text-sm text-gray-400 mb-4">You don't have permission to edit server settings.</p>
                )}
                <fieldset disabled={!canManageServer}>
                  <form onSubmit={handleSaveGeneral}>
                    <div className="flex flex-col items-center mb-4">
                      <button type="button" onClick={() => canManageServer && fileInputRef.current.click()} className="relative group">
                        {iconUrl ? (
                          <img src={iconUrl} alt="Server icon" className="w-20 h-20 rounded-full object-cover" />
                        ) : (
                          <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
                            {server.icon_text || server.name?.[0]}
                          </div>
                        )}
                        {canManageServer && (
                          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
                            Change
                          </div>
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => setIconFile(e.target.files[0])}
                        className="hidden"
                      />
                    </div>

                    <label className="block text-sm font-medium mb-1">Server Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full p-2 mb-4 border rounded disabled:bg-gray-50"
                    />

                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full p-2 mb-4 border rounded resize-none disabled:bg-gray-50"
                      placeholder="What's this server about?"
                    />

                    {canManageServer && (
                      <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    )}
                    {saveMessage && <p className="text-sm text-gray-500 mt-2">{saveMessage}</p>}
                  </form>
                </fieldset>

                {isCreator && (
                  <div className="mt-8 pt-6 border-t">
                    <h3 className="text-sm font-semibold text-red-600 mb-2">Danger Zone</h3>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
                    >
                      Delete Server
                    </button>
                  </div>
                )}

                {!isCreator && (
                  <div className="mt-8 pt-6 border-t">
                    <h3 className="text-sm font-semibold text-red-600 mb-2">Danger Zone</h3>
                    <button
                      type="button"
                      onClick={handleLeave}
                      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
                    >
                      Leave Server
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'channels' && (
              <div>
                {channels.length === 0 && (
                  <p className="text-sm text-gray-400 mb-4">No channels yet.</p>
                )}
                <div className="space-y-1 mb-6">
                  {channels.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => canManageChannels && setEditingChannel(ch)}
                      className={`w-full flex justify-between items-center p-2 rounded text-left ${
                        canManageChannels ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <span className="text-sm font-medium"># {ch.name}</span>
                      {canManageChannels && <span className="text-gray-300">›</span>}
                    </button>
                  ))}
                </div>

                {canManageChannels ? (
                  <form onSubmit={handleCreateChannel} className="flex gap-2 pt-4 border-t">
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="channel-name"
                      className="flex-1 border rounded p-2 text-sm"
                    />
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 whitespace-nowrap">
                      + Channel
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-gray-400">You don't have permission to create channels.</p>
                )}
              </div>
            )}

            {activeTab === 'categories' && (
              <div>
                {categories.length === 0 && (
                  <p className="text-sm text-gray-400 mb-4">No categories yet.</p>
                )}
                <div className="space-y-1 mb-6">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => canManageChannels && setEditingCategory(cat)}
                      className={`w-full flex justify-between items-center p-2 rounded text-left ${
                        canManageChannels ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <span className="text-sm font-medium">{cat.name}</span>
                      {canManageChannels && <span className="text-gray-300">›</span>}
                    </button>
                  ))}
                </div>

                {canManageChannels ? (
                  <form onSubmit={handleCreateCategory} className="flex gap-2 pt-4 border-t">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name"
                      className="flex-1 border rounded p-2 text-sm"
                    />
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 whitespace-nowrap">
                      + Category
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-gray-400">You don't have permission to create categories.</p>
                )}
              </div>
            )}

            {activeTab === 'members' && (
              <div>
                <p className="text-sm text-gray-500 mb-4">{members.length} member{members.length === 1 ? '' : 's'}</p>
                <div className="space-y-1">
                  {members.map((m) => {
                    const isOwner = m.user_id === server.created_by
                    const memberIsAdmin = !isOwner && isAdmin(m)
                    const canActOnThisMember = canManageMembers || (canKickMembers && !isOwner)

                    return (
                      <div key={m.user_id} className="relative">
                        <button
                          onClick={() => canActOnThisMember && setOpenMemberMenu(openMemberMenu === m.user_id ? null : m.user_id)}
                          className={`w-full flex items-center justify-between p-2 rounded ${canActOnThisMember ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                        >
                          <div className="flex items-center gap-3">
                            {m.profile?.avatar_url ? (
                              <img src={m.profile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gray-300" />
                            )}
                            <span className="text-sm font-medium">{m.profile?.display_name || 'A member'}</span>
                            {isOwner && (
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Owner</span>
                            )}
                            {memberIsAdmin && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Admin</span>
                            )}
                          </div>
                        </button>

                        {openMemberMenu === m.user_id && (
                          <div className="absolute right-0 top-10 bg-white border rounded-lg shadow-lg z-10 w-64 p-3">
                            {canManageMembers && (
                              <>
                                <div className="flex items-center justify-between mb-3 pb-3 border-b">
                                  <span className="text-sm font-semibold">Admin (all permissions)</span>
                                  <ToggleSwitch
                                    checked={isAdmin(m)}
                                    onChange={(value) => handleToggleAdmin(m.user_id, value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  {PERMISSIONS.map((p) => (
                                    <div key={p.key} className="flex items-center justify-between">
                                      <span className="text-xs text-gray-600">{p.label}</span>
                                      <ToggleSwitch
                                        checked={!!m[p.key]}
                                        onChange={(value) => handleTogglePermission(m.user_id, p.key, value)}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                            {canKickMembers && !isOwner && (
                              <button
                                onClick={() => handleKickMember(m.user_id, m.profile?.display_name)}
                                className="w-full text-left text-sm text-red-500 hover:bg-red-50 rounded p-1.5 mt-3 pt-3 border-t"
                              >
                                Remove from server
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {activeTab === 'invites' && (
              <div>
                {canManageServer ? (
                  <div>
                    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {isPublic ? 'Public server' : 'Private server'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {isPublic
                            ? 'Anyone with the invite link can join.'
                            : 'The invite link is turned off. Nobody new can join.'}
                        </p>
                      </div>
                      <button
                        onClick={handleTogglePublic}
                        disabled={inviteBusy}
                        className={`relative w-11 h-6 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                          isPublic ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                        title={isPublic ? 'Make private' : 'Make public'}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                            isPublic ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {isPublic && invite ? (
                      <div className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                        <div>
                          <p className="text-xs text-gray-500">Invite code</p>
                          <p className="text-lg font-mono font-semibold text-gray-900">{invite.code}</p>
                        </div>
                        <button
                          onClick={() => copyInviteCode(invite.code)}
                          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      !isPublic && (
                        <p className="text-sm text-gray-400">
                          Switch the server back to public to get a new invite link.
                        </p>
                      )
                    )}

                    {inviteMessage && <p className="text-sm text-gray-600 mt-3">{inviteMessage}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mb-4">You don't have permission to manage invites.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {editingChannel && (
        <ChannelSettings
          channel={editingChannel}
          server={server}
          onClose={() => setEditingChannel(null)}
          onDeleted={async (channelId) => {
            // ChannelSettings only calls this after its own confirm() dialog —
            // it doesn't perform the actual database delete itself, so we do
            // the real delete here (mirrors ChannelSidebar's handleChannelDeleted)
            await supabase.from('messages').delete().eq('channel_id', channelId)
            await supabase.from('channels').delete().eq('id', channelId)
            setChannels((current) => current.filter((c) => c.id !== channelId))
          }}
          onUpdated={(updates) => {
            setChannels((current) =>
              current.map((c) => (c.id === editingChannel.id ? { ...c, ...updates } : c))
            )
          }}
        />
      )}

      {editingCategory && (
        <CategorySettings
          category={editingCategory}
          server={server}
          onClose={() => setEditingCategory(null)}
          onDeleted={async (categoryId) => {
            // Same story — CategorySettings doesn't delete from the DB itself.
            // Channels inside become uncategorized automatically via the
            // ON DELETE SET NULL foreign key, no extra cleanup needed here.
            await supabase.from('channel_categories').delete().eq('id', categoryId)
            setCategories((current) => current.filter((c) => c.id !== categoryId))
          }}
          onUpdated={(updates) => {
            setCategories((current) =>
              current.map((c) => (c.id === editingCategory.id ? { ...c, ...updates } : c))
            )
          }}
        />
      )}
    </div>
  )
}

export default ServerSettings