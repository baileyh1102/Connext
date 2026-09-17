import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'permissions', label: 'Permissions' },
]

const PERMISSION_KEYS = [
  { key: 'can_view', label: 'View channel' },
  { key: 'can_send_messages', label: 'Send messages' },
  { key: 'can_react', label: 'React to messages' },
  { key: 'can_reply', label: 'Reply to messages' },
  { key: 'can_edit_delete_own', label: 'Edit/delete own messages' },
]

// ChannelSettings is a Discord-style modal for one channel: General info
// (name/description) and Permissions (per-role control over viewing and
// interacting with the channel). Only someone with the server's
// "Manage channels" permission (or the server creator) can open/edit this —
// gated by ChannelSidebar before this component is even rendered.
function ChannelSettings({ channel, server, onClose, onDeleted, onUpdated }) {
  const [activeTab, setActiveTab] = useState('general')

  // ---- GENERAL TAB STATE ----
  const [name, setName] = useState(channel.name || '')
  const [description, setDescription] = useState(channel.description || '')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // ---- PERMISSIONS TAB STATE ----
  const [roles, setRoles] = useState([])
  const [permissionsByRole, setPermissionsByRole] = useState({}) // { roleKey ('default' or role id): { can_view, ... } }

  const DEFAULT_KEY = 'default' // represents "members with no role assigned"

  useEffect(() => {
    if (activeTab !== 'permissions') return

    const fetchData = async () => {
      const { data: roleRows } = await supabase.from('roles').select('*').eq('server_id', server.id)
      setRoles(roleRows || [])

      const { data: permRows } = await supabase.from('channel_permissions').select('*').eq('channel_id', channel.id)

      const map = {}
      // Start every role (plus "default") with fully-open permissions unless a row overrides it
      const allKeys = [DEFAULT_KEY, ...(roleRows || []).map((r) => r.id)]
      allKeys.forEach((key) => {
        map[key] = { can_view: true, can_send_messages: true, can_react: true, can_reply: true, can_edit_delete_own: true }
      })
      permRows?.forEach((row) => {
        const key = row.role_id === null ? DEFAULT_KEY : row.role_id
        map[key] = row
      })
      setPermissionsByRole(map)
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

  const togglePermission = async (roleKey, permKey) => {
    const current = permissionsByRole[roleKey]
    const updated = { ...current, [permKey]: !current[permKey] }
    setPermissionsByRole((prev) => ({ ...prev, [roleKey]: updated }))

    const roleIdForDb = roleKey === DEFAULT_KEY ? null : roleKey

    // Upsert: create the row if it doesn't exist yet, otherwise update it
    await supabase
      .from('channel_permissions')
      .upsert(
        { channel_id: channel.id, role_id: roleIdForDb, ...updated },
        { onConflict: 'channel_id,role_id' }
      )
  }

  const handleDelete = () => {
    if (window.confirm(`Delete #${channel.name}? This will also delete all its messages. This cannot be undone.`)) {
      onDeleted(channel.id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[700px] h-[80vh] flex overflow-hidden">
        {/* ---- LEFT NAV ---- */}
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

        {/* ---- RIGHT CONTENT ---- */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center p-4 border-b">
            <h2 className="font-bold">{TABS.find((t) => t.id === activeTab)?.label}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* ---- GENERAL TAB ---- */}
            {activeTab === 'general' && (
              <form onSubmit={handleSaveGeneral}>
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

            {/* ---- PERMISSIONS TAB ---- */}
            {activeTab === 'permissions' && (
              <div>
                <p className="text-sm text-gray-500 mb-4">
                  Control what each role can do in this channel. The server creator can always see and manage everything, regardless of these settings.
                </p>

                {/* "Default" row — members with no role assigned */}
                <div className="mb-6 pb-4 border-b">
                  <h3 className="text-sm font-semibold mb-2">Default (no role)</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {PERMISSION_KEYS.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={permissionsByRole[DEFAULT_KEY]?.[key] ?? true}
                          onChange={() => togglePermission(DEFAULT_KEY, key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {roles.length === 0 && (
                  <p className="text-sm text-gray-400">No roles created yet — create roles in Server Settings to give them channel-specific permissions.</p>
                )}

                {roles.map((role) => (
                  <div key={role.id} className="mb-6 pb-4 border-b last:border-b-0">
                    <h3 className="text-sm font-semibold mb-2">{role.name}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {PERMISSION_KEYS.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={permissionsByRole[role.id]?.[key] ?? true}
                            onChange={() => togglePermission(role.id, key)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChannelSettings