import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'permissions', label: 'Permissions' },
]

const PERMISSIONS = [
  { key: 'can_view', label: 'View Channel', description: 'Allows seeing this channel exists and reading its messages.' },
  { key: 'can_send_messages', label: 'Send Messages', description: 'Allows posting new messages in this channel.' },
  { key: 'can_react', label: 'React to Messages', description: 'Allows adding emoji reactions to messages.' },
  { key: 'can_reply', label: 'Reply to Messages', description: 'Allows starting or adding to message threads.' },
  { key: 'can_edit_delete_own', label: 'Edit/Delete Own Messages', description: 'Allows editing or deleting messages they sent in this channel.' },
]

const DEFAULT_PERMS = PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {})

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
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

function ChannelSettings({ channel, server, onClose, onDeleted, onUpdated }) {
  const [activeTab, setActiveTab] = useState('general')
  const [creatorProfile, setCreatorProfile] = useState(null)

  useEffect(() => {
    if (!channel.created_by) return
    const fetchCreator = async () => {
      const { data } = await supabase.from('profiles').select('display_name, avatar_url').eq('user_id', channel.created_by).single()
      setCreatorProfile(data)
    }
    fetchCreator()
  }, [channel.created_by])

  const [name, setName] = useState(channel.name || '')
  const [description, setDescription] = useState(channel.description || '')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const [members, setMembers] = useState([])
  const [overrides, setOverrides] = useState([])
  const [defaultPerms, setDefaultPerms] = useState(DEFAULT_PERMS)
  const [selectedKey, setSelectedKey] = useState('default')
  const [showAddOverride, setShowAddOverride] = useState(false)

  const DEFAULT_KEY = 'default'

  useEffect(() => {
    if (activeTab !== 'permissions') return

    const fetchData = async () => {
      const { data: memberRows } = await supabase
        .from('server_members')
        .select('user_id')
        .eq('server_id', server.id)

      const userIds = memberRows?.map((m) => m.user_id) || []
      const { data: profileRows } = userIds.length
        ? await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds)
        : { data: [] }
      setMembers(profileRows || [])

      const { data: permRows } = await supabase.from('channel_permissions').select('*').eq('channel_id', channel.id)

      const defaultRow = permRows?.find((r) => r.member_user_id === null)
      setDefaultPerms(defaultRow || DEFAULT_PERMS)
      setOverrides(permRows?.filter((r) => r.member_user_id !== null) || [])
    }
    fetchData()
  }, [activeTab, channel.id, server.id])

  const handleSaveGeneral = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveMessage('')

    const { error } = await supabase
      .from('channels')
      .update({ name: name.trim().toLowerCase().replace(/\s+/g, '-'), description: description.trim() })
      .eq('id', channel.id)

    if (error) {
      setSaveMessage(`Error: ${error.message}`)
    } else {
      setSaveMessage('Saved!')
      onUpdated({ name: name.trim().toLowerCase().replace(/\s+/g, '-'), description: description.trim() })
    }
    setSaving(false)
  }

  const currentPerms = selectedKey === DEFAULT_KEY
    ? defaultPerms
    : overrides.find((o) => o.member_user_id === selectedKey) || DEFAULT_PERMS

  const togglePermission = async (permKey) => {
    const updated = { ...currentPerms, [permKey]: !currentPerms[permKey] }

    if (selectedKey === DEFAULT_KEY) {
      setDefaultPerms(updated)
      await supabase
        .from('channel_permissions')
        .upsert({ channel_id: channel.id, member_user_id: null, ...updated }, { onConflict: 'channel_id' })
    } else {
      setOverrides((current) =>
        current.map((o) => (o.member_user_id === selectedKey ? { ...o, ...updated } : o))
      )
      await supabase
        .from('channel_permissions')
        .upsert({ channel_id: channel.id, member_user_id: selectedKey, ...updated }, { onConflict: 'channel_id,member_user_id' })
    }
  }

  const handleAddOverride = async (userId) => {
    const newOverride = { channel_id: channel.id, member_user_id: userId, ...DEFAULT_PERMS }
    await supabase.from('channel_permissions').upsert(newOverride, { onConflict: 'channel_id,member_user_id' })
    setOverrides((current) => [...current, newOverride])
    setSelectedKey(userId)
    setShowAddOverride(false)
  }

  const handleRemoveOverride = async (userId) => {
    await supabase.from('channel_permissions').delete().eq('channel_id', channel.id).eq('member_user_id', userId)
    setOverrides((current) => current.filter((o) => o.member_user_id !== userId))
    setSelectedKey(DEFAULT_KEY)
  }

  const handleDelete = () => {
    if (window.confirm(`Delete #${channel.name}? This will also delete all its messages. This cannot be undone.`)) {
      onDeleted(channel.id)
      onClose()
    }
  }

  const membersWithoutOverride = members.filter((m) => !overrides.some((o) => o.member_user_id === m.user_id))
  const selectedMemberProfile = members.find((m) => m.user_id === selectedKey)

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-gray-900">
      <div className="bg-white rounded-lg shadow-lg w-[700px] h-[80vh] flex overflow-hidden">
        <div className="w-48 bg-gray-100 p-4 flex flex-col">
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 truncate"># {channel.name}</h2>
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

        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center p-4 border-b">
            <h2 className="font-bold">{TABS.find((t) => t.id === activeTab)?.label}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && (
              <form onSubmit={handleSaveGeneral}>
                {creatorProfile && (
                  <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                    {creatorProfile.avatar_url ? (
                      <img src={creatorProfile.avatar_url} alt="Creator" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-300" />
                    )}
                    <span>Created by {creatorProfile.display_name || 'a member'}</span>
                  </div>
                )}

                <label className="block text-sm font-medium mb-1">Channel Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 mb-4 border rounded"
                />

                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full p-2 mb-4 border rounded resize-none"
                  placeholder="What's this channel for?"
                />

                <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                {saveMessage && <p className="text-sm text-gray-500 mt-2">{saveMessage}</p>}

                <div className="mt-8 pt-6 border-t">
                  <h3 className="text-sm font-semibold text-red-600 mb-2">Danger Zone</h3>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
                  >
                    Delete Channel
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'permissions' && (
              <div className="flex gap-6">
                <div className="w-48 flex-shrink-0">
                  <button
                    onClick={() => setSelectedKey(DEFAULT_KEY)}
                    className={`w-full text-left px-3 py-2 rounded text-sm mb-1 ${
                      selectedKey === DEFAULT_KEY ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    Default (everyone)
                  </button>

                  <p className="text-xs font-semibold text-gray-400 uppercase mt-4 mb-1 px-3">Overrides</p>
                  {overrides.map((o) => {
                    const profile = members.find((m) => m.user_id === o.member_user_id)
                    return (
                      <button
                        key={o.member_user_id}
                        onClick={() => setSelectedKey(o.member_user_id)}
                        className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded text-sm mb-1 ${
                          selectedKey === o.member_user_id ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50 text-gray-600'
                        }`}
                      >
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-gray-300" />
                        )}
                        <span className="truncate">{profile?.display_name || 'Member'}</span>
                      </button>
                    )
                  })}

                  {showAddOverride ? (
                    <div className="mt-2 border rounded p-2 max-h-40 overflow-y-auto">
                      {membersWithoutOverride.length === 0 && (
                        <p className="text-xs text-gray-400 px-1">No other members to add.</p>
                      )}
                      {membersWithoutOverride.map((m) => (
                        <button
                          key={m.user_id}
                          onClick={() => handleAddOverride(m.user_id)}
                          className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm"
                        >
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-gray-300" />
                          )}
                          <span className="truncate">{m.display_name || 'Member'}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddOverride(true)}
                      className="text-sm text-blue-600 hover:underline px-3 mt-2"
                    >
                      + Add member override
                    </button>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">
                      {selectedKey === DEFAULT_KEY ? 'Default permissions' : `${selectedMemberProfile?.display_name || 'Member'}'s overrides`}
                    </h3>
                    {selectedKey !== DEFAULT_KEY && (
                      <button
                        onClick={() => handleRemoveOverride(selectedKey)}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        Remove override
                      </button>
                    )}
                  </div>

                  <div className="divide-y">
                    {PERMISSIONS.map((p) => (
                      <div key={p.key} className="flex items-center justify-between gap-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{p.label}</p>
                          <p className="text-xs text-gray-400">{p.description}</p>
                        </div>
                        <ToggleSwitch
                          checked={currentPerms[p.key]}
                          onChange={() => togglePermission(p.key)}
                        />
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-gray-400 mt-6">
                    The server creator can always see and manage everything, regardless of these settings.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ChannelSettings