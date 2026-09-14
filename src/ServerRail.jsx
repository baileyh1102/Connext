import { useState } from 'react'

// ServerRail shows the servers passed in via props, lets the user switch
// between them, and create new ones. Server data and deletion now live in
// App.jsx so ChannelSidebar can also trigger deletion (via its hamburger menu).
function ServerRail({ servers, selectedServer, setSelectedServer, onAddServer, onDeleteServer }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newServerName, setNewServerName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onAddServer(newServerName)
    setNewServerName('')
    setShowAddForm(false)
  }

  return (
    <div className="w-16 bg-indigo-900 flex flex-col items-center py-3 gap-2 overflow-y-auto">
      {servers.map((srv) => (
        <div
          key={srv.id}
          onClick={() => setSelectedServer(srv)}
          onContextMenu={(e) => {
            e.preventDefault()
            if (window.confirm(`Delete "${srv.name}"? This will also delete all its channels and messages.`)) {
              onDeleteServer(srv.id)
            }
          }}
          title={srv.name}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold cursor-pointer transition-all flex-shrink-0 ${
            selectedServer?.id === srv.id ? 'bg-indigo-500 rounded-xl' : 'bg-indigo-600 hover:rounded-xl hover:bg-indigo-500'
          }`}
        >
          {srv.icon_text || srv.name?.[0]}
        </div>
      ))}

      <div className="w-8 h-px bg-indigo-700 my-1 flex-shrink-0" />

      {showAddForm ? (
        <form onSubmit={handleSubmit} className="px-1">
          <input
            type="text"
            autoFocus
            value={newServerName}
            onChange={(e) => setNewServerName(e.target.value)}
            onBlur={() => !newServerName && setShowAddForm(false)}
            placeholder="Name"
            className="w-12 bg-indigo-950 text-white text-xs p-1 rounded outline-none text-center"
          />
        </form>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-12 h-12 rounded-2xl bg-indigo-800 flex items-center justify-center text-indigo-300 text-2xl hover:bg-indigo-700 hover:text-white hover:rounded-xl transition-all flex-shrink-0"
        >
          +
        </button>
      )}
    </div>
  )
}

export default ServerRail