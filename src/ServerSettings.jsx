import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  { id: 'roles', label: 'Roles' },
  { id: 'invites', label: 'Invites' },
]

const PERMISSIONS = [
  { key: 'can_manage_server', label: 'Manage Server', description: 'Allows members to change the server name, icon, and description.' },
  { key: 'can_manage_channels', label: 'Manage Channels', description: 'Allows members to create, edit, and delete channels.' },
  { key: 'can_manage_messages', label: 'Manage Messages', description: 'Allows members to delete or pin messages from other members.' },
  { key: 'can_manage_roles', label: 'Manage Roles', description: 'Allows members to create, edit, and delete roles.' },
  { key: 'can_kick_members', label: 'Kick Members', description: 'Allows members to remove other members from the server.' },
]

const DEFAULT_ROLE_PERMS = PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: false }), {})

// Pill-shaped on/off switch (Discord-style) used throughout the role editor
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

// ServerSettings is a full-screen modal (Discord-style) for managing a server:
// General info (name/icon/description), the member list (with kick + role
// assignment), and role creation. The server's CREATOR always has every
// permission; beyond that, what a person can do here depends on their
// assigned role's permission flags (can_manage_server, can_manage_roles,
// can_kick_members) rather than a single "admin" flag.
function ServerSettings({ server, currentUserId, onClose, onDeleteServer, onServerUpdated }) {
  const [activeTab, setActiveTab] = useState('general')
  const isCreator = server.created_by === currentUserId

  // The current viewer's own role in this server, used to compute their permissions
  const [myRole, setMyRole] = useState(null)
  const canManageServer = isCreator || !!myRole?.can_manage_server
  const canManageRoles = isCreator || !!myRole?.can_manage_roles
  const canKickMembers = isCreator || !!myRole?.can_kick_members

  // ---- GENERAL TAB STATE ----
  const [name, setName] = useState(server.name || '')
  const [description, setDescription] = useState(server.description || '')
  const [iconUrl, setIconUrl] = useState(server.icon_url || '')
  const [iconFile, setIconFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const fileInputRef = useRef(null)

  // ---- MEMBERS TAB STATE ----
  const [members, setMembers] = useState([]) // [{ user_id, role_id, profile, role }]
  const [openMemberMenu, setOpenMemberMenu] = useState(null) // user_id of the member whose action menu is open

  // ---- ROLES TAB STATE ----
  const [roles, setRoles] = useState([])
  const [roleSearch, setRoleSearch] = useState('')
  const [roleView, setRoleView] = useState('list') // 'list' | 'edit'
  const [editingRole, setEditingRole] = useState(null) // role being edited, or null when creating
  const [roleName, setRoleName] = useState('')
  const [rolePerms, setRolePerms] = useState(DEFAULT_ROLE_PERMS)
  const filteredRoles = roles.filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase()))
  
  
  // ---- INVITES TAB STATE ----
  const [invites, setInvites] = useState([])
  const [newInviteRoleId, setNewInviteRoleId] = useState('') // '' = no role / public
  // Look up the viewer's own role in this server (skip entirely if they're the creator — creator already has everything)
  useEffect(() => {
    if (isCreator) return

    const fetchMyRole = async () => {
      const { data: memberRow } = await supabase
        .from('server_members')
        .select('role_id')
        .eq('server_id', server.id)
        .eq('user_id', currentUserId)
        .single()

      if (memberRow?.role_id) {
        const { data: roleRow } = await supabase.from('roles').select('*').eq('id', memberRow.role_id).single()
        setMyRole(roleRow)
      }
    }
    fetchMyRole()
  }, [server.id, currentUserId, isCreator])

  // Load members (with their profile + role info) whenever the Members tab is opened
  const fetchMembers = async () => {
    const { data: memberRows } = await supabase
      .from('server_members')
      .select('user_id, role_id')
      .eq('server_id', server.id)

    if (!memberRows) return

    const userIds = memberRows.map((m) => m.user_id)
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds)

    const roleIds = memberRows.map((m) => m.role_id).filter(Boolean)
    const { data: roleRows } = roleIds.length
      ? await supabase.from('roles').select('*').in('id', roleIds)
      : { data: [] }

    const profileMap = {}
    profileRows?.forEach((p) => { profileMap[p.user_id] = p })
    const roleMap = {}
    roleRows?.forEach((r) => { roleMap[r.id] = r })

    setMembers(
      memberRows.map((m) => ({
        ...m,
        profile: profileMap[m.user_id],
        role: roleMap[m.role_id],
      }))
    )
  }

  useEffect(() => {
    if (activeTab !== 'members') return
    fetchMembers()
  }, [activeTab, server.id])

  // Load roles whenever the Roles tab is opened (or Members tab, since it needs role names for assignment)
  useEffect(() => {
    if (activeTab !== 'roles' && activeTab !== 'members') return

    const fetchRoles = async () => {
      const { data } = await supabase.from('roles').select('*').eq('server_id', server.id)
      setRoles(data || [])
    }
    fetchRoles()
  }, [activeTab, server.id])

  
  // Load invites whenever the Invites tab is opened (also ensures `roles` is populated for the create-invite dropdown)
  useEffect(() => {
    if (activeTab !== 'invites') return

    const fetchInvites = async () => {
      const { data: roleRows } = await supabase.from('roles').select('*').eq('server_id', server.id)
      setRoles(roleRows || [])

      const { data } = await supabase
        .from('invites')
        .select('*')
        .eq('server_id', server.id)
        .order('created_at', { ascending: false })
      setInvites(data || [])
    }
    fetchInvites()
  }, [activeTab, server.id])

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0 or I/1, avoids confusion
    let code = ''
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
  }

  const handleCreateInvite = async () => {
    const { data, error } = await supabase
      .from('invites')
      .insert({
        server_id: server.id,
        code: generateInviteCode(),
        role_id: newInviteRoleId || null,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (!error && data) {
      setInvites((current) => [data, ...current])
      setNewInviteRoleId('')
    }
  }

  const handleToggleInviteActive = async (invite) => {
    await supabase.from('invites').update({ active: !invite.active }).eq('id', invite.id)
    setInvites((current) => current.map((i) => (i.id === invite.id ? { ...i, active: !i.active } : i)))
  }

  const copyInviteCode = (code) => {
    navigator.clipboard.writeText(code)
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

  const openRoleCreator = () => {
    setEditingRole(null)
    setRoleName('')
    setRolePerms(DEFAULT_ROLE_PERMS)
    setRoleView('edit')
  }

  const openRoleEditor = (role) => {
    setEditingRole(role)
    setRoleName(role.name)
    setRolePerms(PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: !!role[p.key] }), {}))
    setRoleView('edit')
  }

  const handleSaveRole = async (e) => {
    e.preventDefault()
    if (!roleName.trim()) return

    if (editingRole) {
      const { data, error } = await supabase
        .from('roles')
        .update({ name: roleName.trim(), ...rolePerms })
        .eq('id', editingRole.id)
        .select()
        .single()

      if (!error && data) {
        setRoles((current) => current.map((r) => (r.id === data.id ? data : r)))
        setRoleView('list')
      }
    } else {
      const { data, error } = await supabase
        .from('roles')
        .insert({ server_id: server.id, name: roleName.trim(), ...rolePerms })
        .select()
        .single()

      if (!error && data) {
        setRoles((current) => [...current, data])
        setRoleView('list')
      }
    }
  }

  const handleDeleteRole = async (roleId) => {
    if (window.confirm('Delete this role? Members with this role will lose it.')) {
      await supabase.from('roles').delete().eq('id', roleId)
      setRoles((current) => current.filter((r) => r.id !== roleId))
      setRoleView('list')
    }
  }

  const handleAssignRole = async (userId, roleId) => {
    await supabase
      .from('server_members')
      .update({ role_id: roleId || null })
      .eq('server_id', server.id)
      .eq('user_id', userId)

    setMembers((current) =>
      current.map((m) => (m.user_id === userId ? { ...m, role_id: roleId, role: roles.find((r) => r.id === roleId) } : m))
    )
    setOpenMemberMenu(null)
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[700px] h-[80vh] flex overflow-hidden">
        {/* ---- LEFT NAV ---- */}
        <div className="w-48 bg-gray-100 p-4 flex flex-col">
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 truncate">{server.name}</h2>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-left px-3 py-2 rounded text-sm mb-1 ${
                activeTab === tab.id ? 'bg-gray-300 font-medium' : 'hover:bg-gray-200 text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ---- RIGHT CONTENT ---- */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center p-4 border-b">
            <h2 className="font-bold">{TABS.find((t) => t.id === activeTab)?.label}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* ---- GENERAL TAB ---- */}
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
              </div>
            )}

            {/* ---- MEMBERS TAB ---- */}
            {activeTab === 'members' && (
              <div>
                <p className="text-sm text-gray-500 mb-4">{members.length} member{members.length === 1 ? '' : 's'}</p>
                <div className="space-y-1">
                  {members.map((m) => {
                    const isOwner = m.user_id === server.created_by
                    const isSelf = m.user_id === currentUserId
                    const canAssignRoleToThisMember = canManageRoles
                    const canKickThisMember = canKickMembers && !isOwner && !isSelf
                    const canActOnThisMember = canAssignRoleToThisMember || canKickThisMember

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
                          </div>
                          {m.role && <span className="text-xs text-gray-500">{m.role.name}</span>}
                        </button>

                        {openMemberMenu === m.user_id && (
                          <div className="absolute right-0 top-10 bg-white border rounded-lg shadow-lg z-10 w-52 p-2">
                            {canAssignRoleToThisMember && (
                              <div className="mb-2">
                                <label className="block text-xs text-gray-400 mb-1 px-1">Assign role</label>
                                <select
                                  value={m.role_id || ''}
                                  onChange={(e) => handleAssignRole(m.user_id, e.target.value ? Number(e.target.value) : null)}
                                  className="w-full text-sm border rounded p-1.5"
                                >
                                  <option value="">No role</option>
                                  {roles.map((r) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {canKickThisMember && (
                              <button
                                onClick={() => handleKickMember(m.user_id, m.profile?.display_name)}
                                className="w-full text-left text-sm text-red-500 hover:bg-red-50 rounded p-1.5"
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

            {/* ---- ROLES TAB ---- */}
            {activeTab === 'roles' && roleView === 'list' && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="text"
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    placeholder="Search roles"
                    className="flex-1 p-2 border rounded text-sm"
                  />
                  {canManageRoles && (
                    <button
                      type="button"
                      onClick={openRoleCreator}
                      className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
                    >
                      Create Role
                    </button>
                  )}
                </div>

                {roles.length === 0 && (
                  <p className="text-sm text-gray-400">No roles have been created yet.</p>
                )}
                {roles.length > 0 && filteredRoles.length === 0 && (
                  <p className="text-sm text-gray-400">No roles match "{roleSearch}".</p>
                )}

                <div className="space-y-1">
                  {filteredRoles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => canManageRoles && openRoleEditor(role)}
                      className={`w-full flex justify-between items-center p-2 rounded text-left ${
                        canManageRoles ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium">{role.name}</p>
                        <p className="text-xs text-gray-400">
                          {PERMISSIONS.filter((p) => role[p.key]).map((p) => p.label).join(', ') || 'No permissions'}
                        </p>
                      </div>
                      {canManageRoles && <span className="text-gray-300">›</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---- ROLES TAB: create/edit screen ---- */}
            {activeTab === 'roles' && roleView === 'edit' && (
              <form onSubmit={handleSaveRole}>
                <button
                  type="button"
                  onClick={() => setRoleView('list')}
                  className="text-sm text-gray-500 hover:text-gray-700 mb-4"
                >
                  ← Back to Roles
                </button>

                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-1">Role Name</h3>
                <input
                  type="text"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. Leader"
                  className="w-full p-2 mb-6 border rounded text-sm"
                  autoFocus
                />

                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Permissions</h3>
                <div className="divide-y">
                  {PERMISSIONS.map((p) => (
                    <div key={p.key} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{p.label}</p>
                        <p className="text-xs text-gray-400">{p.description}</p>
                      </div>
                      <ToggleSwitch
                        checked={rolePerms[p.key]}
                        onChange={(value) => setRolePerms((current) => ({ ...current, [p.key]: value }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center mt-6 pt-4 border-t">
                  {editingRole ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteRole(editingRole.id)}
                      className="text-sm text-red-500 hover:text-red-600"
                    >
                      Delete Role
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="submit"
                    disabled={!roleName.trim()}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {/* ---- INVITES TAB ---- */}
            {activeTab === 'invites' && (
              <div>
                {canManageServer ? (
                  <div className="mb-6 bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium mb-1">Role assigned to new members</label>
                    <select
                      value={newInviteRoleId}
                      onChange={(e) => setNewInviteRoleId(e.target.value)}
                      className="w-full p-2 mb-3 border rounded text-sm"
                    >
                      <option value="">Public — no role (default permissions)</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleCreateInvite}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                    >
                      Generate Invite Code
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mb-4">You don't have permission to manage invites.</p>
                )}

                <div className="space-y-2">
                  {invites.length === 0 && <p className="text-sm text-gray-400">No invite codes yet.</p>}
                  {invites.map((invite) => (
                    <div key={invite.id} className={`flex justify-between items-center p-2 rounded ${invite.active ? 'hover:bg-gray-50' : 'opacity-50'}`}>
                      <div>
                        <p className="text-sm font-mono font-medium">{invite.code}</p>
                        <p className="text-xs text-gray-400">
                          {roles.find((r) => r.id === invite.role_id)?.name || 'Public — no role'}
                          {!invite.active && ' · Revoked'}
                        </p>
                      </div>
                      {canManageServer && (
                        <div className="flex gap-3">
                          <button onClick={() => copyInviteCode(invite.code)} className="text-xs text-blue-600 hover:underline">
                            Copy
                          </button>
                          <button onClick={() => handleToggleInviteActive(invite)} className="text-xs text-gray-500 hover:text-gray-700">
                            {invite.active ? 'Revoke' : 'Reactivate'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ServerSettings