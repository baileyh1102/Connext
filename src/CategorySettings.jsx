import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'permissions', label: 'Permissions' },
]

const PERMISSIONS = [
  { key: 'can_view', label: 'View Channels', description: 'Allows seeing channels in this category and reading their messages.' },
  { key: 'can_send_messages', label: 'Send Messages', description: 'Allows posting new messages in channels in this category.' },
  { key: 'can_react', label: 'React to Messages', description: 'Allows adding emoji reactions to messages.' },
  { key: 'can_reply', label: 'Reply to Messages', description: 'Allows starting or adding to message threads.' },
  { key: 'can_edit_delete_own', label: 'Edit/Delete Own Messages', description: 'Allows editing or deleting messages they sent.' },
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

// CategorySettings is a Discord-style modal for a channel CATEGORY: General
// (name + delete) and Permissions (Default + per-member overrides). Any
// channel inside this category inherits these permissions UNTIL that channel
// gets its own explicit setting — at that point it becomes independent
// (this is enforced at the database level via a COALESCE fallback chain:
// channel-specific -> category-specific -> allowed).
function CategorySettings({ category, server, onClose, onDeleted, onUpdated }) {
  const [activeTab, setActiveTab] = useState('general')

  const [name, setName] = useState(category.name || '')
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

      const { data: permRows } = await supabase.from('category_permissions').select('*').eq('category_id', category.id)

      const defaultRow = permRows?.find((r) => r.member_user_id === null)
      setDefaultPerms(defaultRow || DEFAULT_PERMS)
      setOverrides(permRows?.filter((r) => r.member_user_id !== null) || [])
    }
    fetchData()
  }, [activeTab, category.id, server.id])

  const handleSaveGeneral = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveMessage('')

    const { error } = await supabase
      .from('channel_categories')
      .update({ name: name.trim() })
      .eq('id', category.id)

    if (error) {
      setSaveMessage(`Error: ${error.message}`)
    } else {
      setSaveMessage('Saved!')
      onUpdated({ name: name.trim() })
    }
    setSaving(false)
  }

  const currentPerms = selectedKey === DEFAULT_KEY
    ? defaultPerms
    : overrides.find((o) => o.member_user_id === selectedKey) || DEFAULT_PERMS

  // Manual "update, then insert if nothing existed" — .upsert()'s onConflict
  // can't target our partial unique indexes (they only apply WHERE
  // member_user_id IS NULL / IS NOT NULL), so this sidesteps that entirely.
  const savePermissionRow = async (memberUserId, updated) => {
    let query = supabase.from('category_permissions').update(updated).eq('category_id', category.id)
    query = memberUserId === null ? query.is('member_user_id', null) : query.eq('member_user_id', memberUserId)
    const { data: updatedRows } = await query.select()

    if (!updatedRows || updatedRows.length === 0) {
      await supabase.from('category_permissions').insert({ category_id: category.id, member_user_id: memberUserId, ...updated })
    }
  }

  const togglePermission = async (permKey) => {
    const updated = { ...currentPerms, [permKey]: !currentPerms[permKey] }

    if (selectedKey === DEFAULT_KEY) {
      setDefaultPerms(updated)
      await savePermissionRow(null, updated)
    } else {
      setOverrides((current) =>
        current.map((o) => (o.member_user_id === selectedKey ? { ...o, ...updated } : o))
      )
      await savePermissionRow(selectedKey, updated)
    }
  }

  const handleAddOverride = async (userId) => {
    await savePermissionRow(userId, DEFAULT_PERMS)
    setOverrides((current) => [...current, { category_id: category.id, member_user_id: userId, ...DEFAULT_PERMS }])
    setSelectedKey(userId)
    setShowAddOverride(false)
  }

  const handleRemoveOverride = async (userId) => {
    await supabase.from('category_permissions').delete().eq('category_id', category.id).eq('member_user_id', userId)
    setOverrides((current) => current.filter((o) => o.member_user_id !== userId))
    setSelectedKey(DEFAULT_KEY)
  }

  const handleDelete = () => {
    if (window.confirm(`Delete "${category.name}"? Channels inside will become uncategorized. This cannot be undone.`)) {
      onDeleted(category.id)
      onClose()
    }
  }

  const membersWithoutOverride = members.filter((m) => !overrides.some((o) => o.member_user_id === m.user_id))
  const selectedMemberProfile = members.find((m) => m.user_id === selectedKey)

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-gray-900">
      <div className="bg-white rounded-lg shadow-lg w-[700px] h-[80vh] flex overflow-hidden">
        <div className="w-48 bg-gray-100 p-4 flex flex-col">
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 truncate">{category.name}</h2>
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
                <label className="block text-sm font-medium mb-1">Category Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 mb-4 border rounded"
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
                    Delete Category
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
                    Any channel in this category uses these settings by default.
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

export default CategorySettings