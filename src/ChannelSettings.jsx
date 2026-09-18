import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'permissions', label: 'Permissions' },
]

const PERMISSIONS = [
  { key: 'can_view', label: 'View Channel', description: 'Allows the role to see this channel exists and read its messages.' },
  { key: 'can_send_messages', label: 'Send Messages', description: 'Allows the role to post new messages in this channel.' },
  { key: 'can_react', label: 'React to Messages', description: 'Allows the role to add emoji reactions to messages.' },
  { key: 'can_reply', label: 'Reply to Messages', description: 'Allows the role to start or add to message threads.' },
  { key: 'can_edit_delete_own', label: 'Edit/Delete Own Messages', description: 'Allows the role to edit or delete messages they sent in this channel.' },
]

const DEFAULT_PERMS = PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {})

// Pill-shaped on/off switch — matches the one used in ServerSettings' role editor
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

// ChannelSettings is a Discord-style modal for one channel: General info
// (name/description) and Permissions (per-role control over viewing and
// interacting with the channel). Styled to match ServerSettings.
function ChannelSettings({ channel, server, onClose, onDeleted, onUpdated }) {
  const [activeTab, setActiveTab] = useState('general')

  // ---- GENERAL TAB STATE ----
  const [name, setName] = useState(channel.name || '')
  const [description, setDescription] = useState(channel.description || '')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // ---- PERMISSIONS TAB STATE ----
  const [roles, setRoles] = useState([])
  const [selectedRoleKey, setSelectedRoleKey] = useState('default') // 'default' or a role id
  const [permissionsByRole, setPermissionsByRole] = useState({})

  const DEFAULT_KEY = 'default'

  useEffect(() => {
    if (activeTab !== 'permissions') return

    const fetchData = async () => {
      const { data: roleRows } = await supabase.from('roles').select('*').eq('server_id', server.id)
      setRoles(roleRows || [])

      const { data: permRows } = await supabase.from('channel_permissions').select('*').eq('channel_id', channel.id)

      const map = {}
      const allKeys = [DEFAULT_KEY, ...(roleRows || []).map((r) => r.id)]
      allKeys.forEach((key) => { map[key] = { ...DEFAULT_PERMS } })
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

  const togglePermission = async (permKey) => {
    const current = permissionsByRole[selectedRoleKey]
    const updated = { ...current, [permKey]: !current[permKey] }
    setPermissionsByRole((prev) => ({ ...prev, [selectedRoleKey]: updated }))

    const roleIdForDb = selectedRoleKey === DEFAULT_KEY ? null : selectedRoleKey

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

  const currentPerms = permissionsByRole[selectedRoleKey] || DEFAULT_PERMS

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-gray-900">
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
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-1">Role</h3>
                <select
                  value={selectedRoleKey}
                  onChange={(e) => setSelectedRoleKey(e.target.value === DEFAULT_KEY ? DEFAULT_KEY : Number(e.target.value))}
                  className="w-full text-sm border rounded p-1.5 mb-6"
                >
                  <option value={DEFAULT_KEY}>Default (no role)</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>

                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Permissions</h3>
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChannelSettings