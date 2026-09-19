import { useState, useEffect } from 'react'
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

// A single draggable, clickable channel row. Right-click or the three-dot
// button (only shown to those with can_manage_channels) opens the full
// ChannelSettings modal directly — no intermediate dropdown.
function ChannelItem({ ch, isSelected, onSelect, onOpenSettings, canManageChannels }) {
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
        if (canManageChannels) onOpenSettings(ch)
      }}
      className={`group relative flex items-center justify-between px-3 py-2 rounded cursor-pointer text-sm ${
        isSelected ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'
      }`}
    >
      <span># {ch.name}</span>

      {canManageChannels && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpenSettings(ch)
          }}
          className="text-gray-400 hover:text-white px-1 opacity-0 group-hover:opacity-100"
        >
          ⋮
        </button>
      )}
    </div>
  )
}

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
// selecting and drag-and-drop reordering, and opening ChannelSettings
// (rename/description/delete/permissions) for members with can_manage_channels.
// Channel CREATION now lives in Server Settings' Channels tab, not here.
function ChannelSidebar({ selectedChannel, setSelectedChannel, selectedServer, onOpenServerSettings, currentUserId }) {
  const [channels, setChannels] = useState([])
  const [canManageChannels, setCanManageChannels] = useState(false)
  const [editingChannel, setEditingChannel] = useState(null) // the channel currently open in ChannelSettings

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Determine whether the viewer can create/edit/delete channels here:
  // true if they're the server's creator, or their assigned role has can_manage_channels
  useEffect(() => {
    if (!selectedServer) return

    const checkPermission = async () => {
      if (selectedServer.created_by === currentUserId) {
        setCanManageChannels(true)
        return
      }
      const { data: memberRow } = await supabase
        .from('server_members')
        .select('can_manage_channels')
        .eq('server_id', selectedServer.id)
        .eq('user_id', currentUserId)
        .single()

      setCanManageChannels(!!memberRow?.can_manage_channels)
    }
    checkPermission()
  }, [selectedServer, currentUserId])

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
        const currentIsStillValid = data.some((c) => c.id === selectedChannel?.id)
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
    <div className="w-56 h-full bg-gray-800 text-gray-300 flex flex-col">
      <div className="h-[65px] px-4 font-bold text-white border-b border-gray-700 flex items-center justify-between">
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
                canManageChannels={canManageChannels}
              />
            ))}
          </SortableContext>
        </DndContext>
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