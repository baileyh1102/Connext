import { useState } from 'react'
import dmIcon from './assets/Mascot.png'

// ServerRail shows the servers passed in via props, lets the user switch
// between them, create new ones, or join an existing one via invite code.
// The "+" button now opens a small choice menu (Create / Join) rather than
// jumping straight into the create form.
function ServerRail({ servers, selectedServer, setSelectedServer, onSelectServer, onAddServer, onDeleteServer, onJoinServer, onOpenDMs, isDMActive }) {
  const [mode, setMode] = useState(null) // null | 'menu' | 'create' | 'join'
  const [newServerName, setNewServerName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const handleCreateSubmit = (e) => {
    e.preventDefault()
    onAddServer(newServerName)
    setNewServerName('')
    setMode(null)
  }

  const handleJoinSubmit = async (e) => {
    e.preventDefault()
    if (!joinCode.trim()) return
    await onJoinServer(joinCode)
    setJoinCode('')
    setMode(null)
  }

  return (
    <div className="w-16 bg-indigo-900 flex flex-col items-center py-3 gap-2 overflow-y-auto relative">
      <button
        onClick={onOpenDMs}
        title="Direct Messages"
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 overflow-hidden p-1.5 ${
          isDMActive ? 'bg-indigo-500 rounded-xl' : 'bg-indigo-700 hover:rounded-xl hover:bg-indigo-600'
        }`}
      >
        <img src={dmIcon} alt="Direct Messages" className="w-full h-full object-contain" />
      </button>

      <div className="w-8 h-px bg-indigo-700 my-1 flex-shrink-0" />

      {servers.map((srv) => (
        <div
          key={srv.id}
          onClick={() => onSelectServer(srv)}
          onContextMenu={(e) => {
            e.preventDefault()
            if (window.confirm(`Delete "${srv.name}"? This will also delete all its channels and messages.`)) {
              onDeleteServer(srv.id)
            }
          }}
          title={srv.name}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold cursor-pointer transition-all flex-shrink-0 overflow-hidden ${
            selectedServer?.id === srv.id ? 'bg-indigo-500 rounded-xl' : 'bg-indigo-600 hover:rounded-xl hover:bg-indigo-500'
          }`}
        >
          {srv.icon_url ? (
            <img src={srv.icon_url} alt={srv.name} className="w-full h-full object-cover" />
          ) : (
            srv.icon_text || srv.name?.[0]
          )}
        </div>
      ))}

      <div className="w-8 h-px bg-indigo-700 my-1 flex-shrink-0" />

      <button
        onClick={() => setMode(mode ? null : 'menu')}
        className="w-12 h-12 rounded-2xl bg-indigo-800 flex items-center justify-center text-indigo-300 text-2xl leading-none hover:bg-indigo-700 hover:text-white hover:rounded-xl transition-all flex-shrink-0"
      >
        <span className="-translate-y-px">+</span>
      </button>

      {/* ---- CHOICE MENU: Create or Join — full centered overlay, so it's never clipped by the rail's own overflow-y-auto ---- */}
      {mode === 'menu' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setMode(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg shadow-lg w-72 p-2">
            <button
              onClick={() => setMode('create')}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 rounded"
            >
              <span className="font-medium">Create a Server</span>
              <span className="block text-xs text-gray-400">Start a new community</span>
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 rounded"
            >
              <span className="font-medium">Join a Server</span>
              <span className="block text-xs text-gray-400">Enter an invite code</span>
            </button>
          </div>
        </div>
      )}

      {/* ---- CREATE FORM: full centered overlay, matching Profile/ServerSettings ---- */}
      {mode === 'create' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-96 p-6">
            <h3 className="text-lg font-bold mb-4">Create a Server</h3>
            <form onSubmit={handleCreateSubmit}>
              <label className="block text-sm font-medium mb-1">Server Name</label>
              <input
                type="text"
                autoFocus
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                placeholder="e.g. Epic Server"
                className="w-full border rounded p-2 text-sm mb-4"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMode(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
                  Cancel
                </button>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- JOIN FORM: full centered overlay ---- */}
      {mode === 'join' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-96 p-6">
            <h3 className="text-lg font-bold mb-4">Join a Server</h3>
            <form onSubmit={handleJoinSubmit}>
              <label className="block text-sm font-medium mb-1">Invite Code</label>
              <input
                type="text"
                autoFocus
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. X7K9QPLM"
                className="w-full border rounded p-2 text-sm mb-4 font-mono"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMode(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
                  Cancel
                </button>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServerRail