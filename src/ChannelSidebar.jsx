import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ChannelSettings from './ChannelSettings'
import CategorySettings from './CategorySettings'

const UNCATEGORIZED = 'uncategorized'

function ChannelItem({ ch, isSelected, onSelect, onOpenSettings, canManageChannels, isUnread }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.id, data: { type: 'channel' } })

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
        onOpenSettings(ch)
      }}
      className={`group relative flex items-center justify-between px-3 py-2 rounded cursor-pointer text-sm ${
        isSelected ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'
      }`}
    >
      <span className="flex items-center gap-2">
        {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
        # {ch.name}
      </span>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onOpenSettings(ch)
        }}
        className="text-gray-400 hover:text-white px-1 opacity-0 group-hover:opacity-100"
      >
        ⋮
      </button>
    </div>
  )
}

// A category section: draggable header (to reorder categories) + a droppable
// body (to accept channels dragged into it) + collapsible.
function CategorySection({ category, channels, selectedChannel, onSelectChannel, onOpenChannelSettings, onOpenCategorySettings, canManageChannels, unreadChannelIds, collapsed, onToggleCollapse }) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, transition, isDragging } = useSortable({ id: category.id, data: { type: 'category' } })
  const { setNodeRef: setDropRef } = useDroppable({ id: category.id, data: { type: 'category' } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setDragRef} style={style} className="mb-2">
      <div
        {...attributes}
        {...listeners}
        onClick={() => onToggleCollapse(category.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          if (canManageChannels) onOpenCategorySettings(category)
        }}
        className="group/cat flex items-center justify-between px-2 py-1 cursor-pointer"
      >
        <span className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase hover:text-gray-200">
          <span className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}>▾</span>
          {category.name}
        </span>
        {canManageChannels && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenCategorySettings(category)
            }}
            className="text-gray-500 hover:text-white opacity-0 group-hover/cat:opacity-100 px-1"
          >
            ⋮
          </button>
        )}
      </div>

      {!collapsed && (
        <div ref={setDropRef} className="min-h-[4px]">
          <SortableContext items={channels.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {channels.map((ch) => (
              <ChannelItem
                key={ch.id}
                ch={ch}
                isSelected={selectedChannel?.id === ch.id}
                onSelect={() => onSelectChannel(ch)}
                onOpenSettings={onOpenChannelSettings}
                canManageChannels={canManageChannels}
                isUnread={unreadChannelIds.has(ch.id)}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

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

function ChannelSidebar({ selectedChannel, setSelectedChannel, selectedServer, onOpenServerSettings, currentUserId }) {
  const [channels, setChannels] = useState([])
  const [categories, setCategories] = useState([])
  const [collapsedCategories, setCollapsedCategories] = useState(new Set())
  const [canManageChannels, setCanManageChannels] = useState(false)
  const [editingChannel, setEditingChannel] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [unreadChannelIds, setUnreadChannelIds] = useState(new Set())

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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

  const [mutedChannelIds, setMutedChannelIds] = useState(new Set())

  const refreshUnreadStatus = async (channelList) => {
    if (!channelList || channelList.length === 0) return
    const channelIds = channelList.map((c) => c.id)

    const { data: muteRows } = await supabase
      .from('channel_mutes')
      .select('channel_id')
      .eq('user_id', currentUserId)
      .in('channel_id', channelIds)
    const muted = new Set((muteRows || []).map((m) => m.channel_id))
    setMutedChannelIds(muted)

    const { data: readRows } = await supabase
      .from('channel_reads')
      .select('channel_id, last_read_at')
      .eq('user_id', currentUserId)
      .in('channel_id', channelIds)

    const readMap = {}
    readRows?.forEach((r) => { readMap[r.channel_id] = r.last_read_at })

    const unread = new Set()
    for (const ch of channelList) {
      if (muted.has(ch.id)) continue

      const { data: latestMessage } = await supabase
        .from('messages')
        .select('created_at, user_id')
        .eq('channel_id', ch.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!latestMessage) continue
      if (latestMessage.user_id === currentUserId) continue

      const lastRead = readMap[ch.id]
      if (!lastRead || new Date(latestMessage.created_at) > new Date(lastRead)) {
        unread.add(ch.id)
      }
    }
    setUnreadChannelIds(unread)
  }

  const markChannelRead = async (channelId) => {
    setUnreadChannelIds((current) => {
      const updated = new Set(current)
      updated.delete(channelId)
      return updated
    })
    await supabase
      .from('channel_reads')
      .upsert({ user_id: currentUserId, channel_id: channelId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,channel_id' })
  }

  useEffect(() => {
    if (!selectedServer) return

    const fetchAll = async () => {
      const { data: categoryRows } = await supabase
        .from('channel_categories')
        .select('*')
        .eq('server_id', selectedServer.id)
        .order('position', { ascending: true })
      setCategories(categoryRows || [])

      const { data: channelRows } = await supabase
        .from('channels')
        .select('*')
        .eq('server_id', selectedServer.id)
        .order('position', { ascending: true })
      setChannels(channelRows || [])
      refreshUnreadStatus(channelRows || [])

      if (channelRows && channelRows.length > 0) {
        const currentIsStillValid = channelRows.some((c) => c.id === selectedChannel?.id)
        if (!currentIsStillValid) {
          setSelectedChannel(channelRows[0])
          markChannelRead(channelRows[0].id)
        }
      } else {
        setSelectedChannel(null)
      }
    }
    fetchAll()

    const channelSub = supabase
      .channel(`channels-list-${selectedServer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `server_id=eq.${selectedServer.id}` }, fetchAll)
      .subscribe()

    const categorySub = supabase
      .channel(`categories-list-${selectedServer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_categories', filter: `server_id=eq.${selectedServer.id}` }, fetchAll)
      .subscribe()

    return () => {
      supabase.removeChannel(channelSub)
      supabase.removeChannel(categorySub)
    }
  }, [selectedServer])

  useEffect(() => {
    if (channels.length === 0) return

    const channel = supabase
      .channel(`unread-watch-${selectedServer?.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new
        if (msg.user_id === currentUserId) return
        if (!channels.some((c) => c.id === msg.channel_id)) return
        if (mutedChannelIds.has(msg.channel_id)) return
        setUnreadChannelIds((current) => new Set(current).add(msg.channel_id))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [channels, selectedServer, currentUserId, mutedChannelIds])

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

  const handleCategoryDeleted = async (categoryId) => {
    await supabase.from('channel_categories').delete().eq('id', categoryId)
    setCategories((current) => current.filter((c) => c.id !== categoryId))
  }

  const handleCategoryUpdated = (updates) => {
    setCategories((current) =>
      current.map((c) => (c.id === editingCategory.id ? { ...c, ...updates } : c))
    )
  }

  const handleToggleCollapse = (categoryId) => {
    setCollapsedCategories((current) => {
      const updated = new Set(current)
      if (updated.has(categoryId)) updated.delete(categoryId)
      else updated.add(categoryId)
      return updated
    })
  }

  const getGroupedChannels = () => {
    const groups = { [UNCATEGORIZED]: [] }
    categories.forEach((cat) => { groups[cat.id] = [] })
    channels.forEach((ch) => {
      const key = ch.category_id ?? UNCATEGORIZED
      if (!groups[key]) groups[key] = []
      groups[key].push(ch)
    })
    return groups
  }

  const findContainer = (id, groups) => {
    if (id === UNCATEGORIZED || categories.some((c) => c.id === id)) return id
    return Object.keys(groups).find((key) =>
      groups[key].some((ch) => ch.id === id)
    )
  }

  // Handles BOTH kinds of drag: reordering categories themselves, and moving/
  // reordering channels within or across categories — branches based on
  // which type of item was picked up.
  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over) return

    if (active.data.current?.type === 'category') {
      if (active.id === over.id) return
      const oldIndex = categories.findIndex((c) => c.id === active.id)
      const newIndex = categories.findIndex((c) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(categories, oldIndex, newIndex)
      setCategories(reordered)
      await Promise.all(
        reordered.map((cat, index) => supabase.from('channel_categories').update({ position: index + 1 }).eq('id', cat.id))
      )
      return
    }

    // Otherwise, it's a channel being dragged
    const groups = getGroupedChannels()
    const normalizeKey = (key) => (key === UNCATEGORIZED ? UNCATEGORIZED : Number(key))

    const sourceContainer = normalizeKey(findContainer(active.id, groups))
    const destContainer = normalizeKey(findContainer(over.id, groups))
    if (sourceContainer === undefined || destContainer === undefined) return

    const sourceList = [...groups[sourceContainer]]
    const destList = sourceContainer === destContainer ? sourceList : [...groups[destContainer]]

    const activeIndex = sourceList.findIndex((ch) => ch.id === active.id)
    if (activeIndex === -1) return
    const [movedChannel] = sourceList.splice(activeIndex, 1)

    let destIndex = destList.findIndex((ch) => ch.id === over.id)
    if (destIndex === -1) destIndex = destList.length

    destList.splice(destIndex, 0, movedChannel)

    const newCategoryId = destContainer === UNCATEGORIZED ? null : destContainer
    setChannels((current) =>
      current.map((ch) => (ch.id === movedChannel.id ? { ...ch, category_id: newCategoryId } : ch))
    )

    await supabase.from('channels').update({ category_id: newCategoryId }).eq('id', movedChannel.id)

    const listsToPersist = sourceContainer === destContainer ? [destList] : [sourceList, destList]
    for (const list of listsToPersist) {
      await Promise.all(
        list.map((ch, index) => supabase.from('channels').update({ position: index + 1 }).eq('id', ch.id))
      )
    }
  }

  const grouped = getGroupedChannels()

  return (
    <div className="w-56 h-full bg-gray-800 text-gray-300 flex flex-col">
      <div className="h-[65px] px-4 font-bold text-white border-b border-gray-700 flex items-center justify-between">
        <span className="truncate">{selectedServer?.name || 'Connext'}</span>
        {selectedServer && <ServerMenu onOpenSettings={onOpenServerSettings} />}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={grouped[UNCATEGORIZED].map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <UncategorizedDroppable>
              {grouped[UNCATEGORIZED].map((ch) => (
                <ChannelItem
                  key={ch.id}
                  ch={ch}
                  isSelected={selectedChannel?.id === ch.id}
                  onSelect={() => { setSelectedChannel(ch); markChannelRead(ch.id) }}
                  onOpenSettings={setEditingChannel}
                  canManageChannels={canManageChannels}
                  isUnread={unreadChannelIds.has(ch.id)}
                />
              ))}
            </UncategorizedDroppable>
          </SortableContext>

          <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {categories
              .filter((cat) => canManageChannels || (grouped[cat.id] || []).length > 0)
              .map((cat) => (
              <CategorySection
                key={cat.id}
                category={cat}
                channels={grouped[cat.id] || []}
                selectedChannel={selectedChannel}
                onSelectChannel={(ch) => { setSelectedChannel(ch); markChannelRead(ch.id) }}
                onOpenChannelSettings={setEditingChannel}
                onOpenCategorySettings={setEditingCategory}
                canManageChannels={canManageChannels}
                unreadChannelIds={unreadChannelIds}
                collapsed={collapsedCategories.has(cat.id)}
                onToggleCollapse={handleToggleCollapse}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {editingChannel && (
        <ChannelSettings
          channel={editingChannel}
          server={selectedServer}
          canManageChannels={canManageChannels}
          onClose={() => {
            setEditingChannel(null)
            refreshUnreadStatus(channels) // picks up any mute change made while the modal was open
          }}
          onDeleted={handleChannelDeleted}
          onUpdated={handleChannelUpdated}
        />
      )}

      {editingCategory && (
        <CategorySettings
          category={editingCategory}
          server={selectedServer}
          onClose={() => setEditingCategory(null)}
          onDeleted={handleCategoryDeleted}
          onUpdated={handleCategoryUpdated}
        />
      )}
    </div>
  )
}

function UncategorizedDroppable({ children }) {
  const { setNodeRef } = useDroppable({ id: UNCATEGORIZED, data: { type: 'category' } })
  return <div ref={setNodeRef} className="min-h-[4px] mb-2">{children}</div>
}

export default ChannelSidebar
