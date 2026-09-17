import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ChannelSettings from './ChannelSettings'

// A single draggable, clickable channel row with a three-dot settings menu
function ChannelItem({ ch, isSelected, onSelect, onOpenSettings }) {
  const [showMenu, setShowMenu] = useState(false)

  const menuRef = useRef(null)

  // Closes the menu whenever a click happens anywhere outside of it
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }


  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault()
        setShowMenu(true)
      }}
      className={`group relative flex items-center justify-between px-3 py-2 rounded cursor-pointer text-sm ${
        isSelected ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'
      }`}
    >
      <span># {ch.name}</span>

      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowMenu(!showMenu)
        }}
        className={`text-gray-400 hover:text-white px-1 ${showMenu ? '' : 'opacity-0 group-hover:opacity-100'}`}
      >
        ⋮
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-8 bg-gray-900 border border-gray-700 rounded shadow-lg z-10 w-40"
        >
          <button
            onClick={() => { onOpenSettings(ch); setShowMenu(false) }}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            Channel Settings
          </button>
        </div>
      )}
    </div>
  )
}

// The hamburger menu next to the server name — the "menu hub" for
// server-level actions: rename and delete, with room for more later.
// The hamburger button next to the server name — opens the full ServerSettings modal
function ServerMenu({ onOpenSettings }) {
  return (
    <button
      onClick={onOpenSettings}
      className="text-gray-400 hover:text-white p-1"
      aria-label="Server settings"
    >
      <div className="flex flex-col gap-[3px]">
        <span className="block w-4 h-0.5 bg-current"></span>
        <span className="block w-4 h-0.5 bg-current"></span>
        <span className="block w-4 h-0.5 bg-current"></span>
      </div>
    </button>
  )
}

// ChannelSidebar fetches real channels for the SELECTED SERVER, supports
// selecting, creating, renaming, deleting, and drag-and-drop reordering.
// The header also holds the hamburger menu for server-level actions.
function ChannelSidebar({ selectedChannel, setSelectedChannel, selectedServer, onOpenServerSettings }) {
  const [channels, setChannels] = useState([])
  const [newChannelName, setNewChannelName] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Always holds the CURRENT selectedChannel, so the realtime callback below
  // (created once per effect run) doesn't act on a stale/outdated value
  const selectedChannelRef = useRef(selectedChannel)
  useEffect(() => {
    selectedChannelRef.current = selectedChannel
  }, [selectedChannel])

  useEffect(() => {
    if (!selectedServer) return

    const fetchChannels = async () => {
      const { data } = await supabase
        .from('channels')
        .select('*')
        .eq('server_id', selectedServer.id)
        .order('position', { ascending: true })
      setChannels(data || [])

      if (data && data.length > 0) {
        // Keep whatever channel was already selected (e.g. returning from another
        // page) as long as it still belongs to this server. Only fall back to the
        // first channel if there's no valid current selection.
        const currentIsStillValid = data.some((c) => c.id === selectedChannelRef.current?.id)
        if (!currentIsStillValid) {
          setSelectedChannel(data[0])
        }
      } else {
        setSelectedChannel(null)
      }
    }
    fetchChannels()

    const channel = supabase
      .channel(`channels-list-${selectedServer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `server_id=eq.${selectedServer.id}` }, () => {
        fetchChannels()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [selectedServer])

  const handleAddChannel = async (e) => {
    e.preventDefault()
    if (!newChannelName.trim() || !selectedServer) return

    const { data: { user } } = await supabase.auth.getUser()
    const nextPosition = channels.length > 0 ? Math.max(...channels.map((c) => c.position)) + 1 : 1

    await supabase.from('channels').insert({
      name: newChannelName.trim().toLowerCase().replace(/\s+/g, '-'),
      created_by: user.id,
      position: nextPosition,
      server_id: selectedServer.id,
    })
    setNewChannelName('')
    setShowAddForm(false)
  }

  const [editingChannel, setEditingChannel] = useState(null) // the channel currently open in ChannelSettings

  const handleChannelDeleted = async (channelId) => {
    await supabase.from('messages').delete().eq('channel_id', channelId)
    await supabase.from('channels').delete().eq('id', channelId)
    if (selectedChannel?.id === channelId) {
      setSelectedChannel(null)
    }
  }

  const handleChannelUpdated = (updates) => {
    setChannels((current) =>
      current.map((c) => (c.id === editingChannel.id ? { ...c, ...updates } : c))
    )
    if (selectedChannel?.id === editingChannel.id) {
      setSelectedChannel((prev) => ({ ...prev, ...updates }))
    }
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = channels.findIndex((c) => c.id === active.id)
    const newIndex = channels.findIndex((c) => c.id === over.id)
    const reordered = arrayMove(channels, oldIndex, newIndex)
    setChannels(reordered)

    await Promise.all(
      reordered.map((ch, index) =>
        supabase.from('channels').update({ position: index + 1 }).eq('id', ch.id)
      )
    )
  }

  return (
    <div className="w-56 bg-gray-800 text-gray-300 flex flex-col">
      <div className="p-4 font-bold text-white border-b border-gray-700 flex items-center justify-between">
        <span className="truncate">{selectedServer?.name || 'Connext'}</span>
        {selectedServer && <ServerMenu onOpenSettings={onOpenServerSettings} />}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={channels.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {channels.map((ch) => (
              <ChannelItem
                key={ch.id}
                ch={ch}
                isSelected={selectedChannel?.id === ch.id}
                onSelect={() => setSelectedChannel(ch)}
                onOpenSettings={setEditingChannel}
              />
            ))}
          </SortableContext>
        </DndContext>

        {showAddForm ? (
          <form onSubmit={handleAddChannel} className="mt-2 px-1">
            <input
              type="text"
              autoFocus
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onBlur={() => !newChannelName && setShowAddForm(false)}
              placeholder="channel-name"
              className="w-full bg-gray-900 text-white text-sm p-2 rounded outline-none"
            />
          </form>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 text-sm text-gray-500 mt-2"
          >
            + Add Channel
          </button>
        )}
      </div>

      {editingChannel && (
        <ChannelSettings
          channel={editingChannel}
          server={selectedServer}
          onClose={() => setEditingChannel(null)}
          onDeleted={handleChannelDeleted}
          onUpdated={handleChannelUpdated}
        />
      )}
    </div>
  )
}

export default ChannelSidebar