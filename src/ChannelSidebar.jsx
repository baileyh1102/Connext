import { useState, useEffect, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import ChannelSettings from './ChannelSettings'
import ChannelIcon from './ChannelIcon'
import CategorySettings from './CategorySettings'

const UNCATEGORIZED = 'uncategorized'

// Tells every row where the green "drop here" line should currently be drawn
const DropContext = createContext(null)

function DropLine({ className = '' }) {
  return (
    <span className={`pointer-events-none absolute left-1 right-1 z-20 h-[3px] rounded-full bg-green-500 ${className}`} />
  )
}

function ChannelItem({ ch, isSelected, onSelect, onOpenSettings, canManageChannels, isUnread }) {
  const drop = useContext(DropContext)
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `ch-${ch.id}`,
    data: { type: 'channel', channelId: ch.id },
    disabled: !canManageChannels,
  })

  const lineBefore = drop?.kind === 'channel' && drop.overId === ch.id && drop.pos === 'before'
  const lineAfter = drop?.kind === 'channel' && drop.overId === ch.id && drop.pos === 'after'

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
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
      {lineBefore && <DropLine className="-top-[2px]" />}
      {lineAfter && <DropLine className="-bottom-[2px]" />}

      <span className="flex items-center gap-2">
        {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
        <ChannelIcon locked={ch.isPrivate} className="opacity-80" /> {ch.name}
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
  const drop = useContext(DropContext)
  const { attributes, listeners, setNodeRef: setSectionRef, isDragging } = useSortable({
    id: `cat-${category.id}`,
    data: { type: 'category', categoryId: category.id },
    disabled: !canManageChannels,
  })
  const { setNodeRef: setHeadRef } = useDroppable({
    id: `head-${category.id}`,
    data: { type: 'categoryBody', categoryId: category.id, zone: 'header' },
  })
  const { setNodeRef: setBodyRef } = useDroppable({
    id: `body-${category.id}`,
    data: { type: 'categoryBody', categoryId: category.id, zone: 'body' },
  })

  const lineBefore = drop?.kind === 'category' && drop.overId === category.id && drop.pos === 'before'
  const lineAfter = drop?.kind === 'category' && drop.overId === category.id && drop.pos === 'after'
  const lineInside = drop?.kind === 'inside' && drop.containerId === category.id

  return (
    <div ref={setSectionRef} style={{ opacity: isDragging ? 0.4 : 1 }} className="relative mb-2">
      {lineBefore && <DropLine className="-top-[3px]" />}
      {lineAfter && <DropLine className="-bottom-[5px]" />}
      {lineInside && collapsed && <DropLine className="bottom-0" />}

      <div
        ref={setHeadRef}
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
        <div ref={setBodyRef} className="relative min-h-[8px]">
          {lineInside && <DropLine className={drop.at === 'top' ? 'top-0' : 'bottom-0'} />}
          <SortableContext items={channels.map((c) => `ch-${c.id}`)} strategy={verticalListSortingStrategy}>
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
      <div className="flex flex-col gap-[4px]">
        <span className="block w-5 h-[3px] bg-current rounded-full"></span>
        <span className="block w-5 h-[3px] bg-current rounded-full"></span>
        <span className="block w-5 h-[3px] bg-current rounded-full"></span>
      </div>
    </button>
  )
}

function UncategorizedDroppable({ children }) {
  const drop = useContext(DropContext)
  const { setNodeRef } = useDroppable({
    id: 'body-uncategorized',
    data: { type: 'categoryBody', categoryId: UNCATEGORIZED, zone: 'body' },
  })
  const lineInside = drop?.kind === 'inside' && drop.containerId === UNCATEGORIZED
  return (
    <div ref={setNodeRef} className="relative min-h-[8px] mb-2">
      {lineInside && <DropLine className="bottom-0" />}
      {children}
    </div>
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
  const [drop, setDrop] = useState(null) // where the green line is shown
  const [activeDrag, setActiveDrag] = useState(null) // what is being dragged

  // Mouse: drag after moving 5px. Touch: press and hold briefly, so normal scrolling still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  )

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
      const { data: privRows } = await supabase.rpc('private_channel_ids', { p_server_id: selectedServer.id })
      const privSet = new Set((privRows || []).map((r) => r.channel_id))
      setChannels((channelRows || []).map((c) => ({ ...c, isPrivate: privSet.has(c.id) })))
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

  // ---------- drag and drop ----------

  // Categories can only land among categories. Channels can land on other
  // channels or on a category (its header or its body).
  const collisionDetection = (args) => {
    const activeType = args.active.data.current?.type
    const containers = args.droppableContainers.filter((c) => {
      const t = c.data.current?.type
      if (activeType === 'category') return t === 'category'
      return t === 'channel' || t === 'categoryBody'
    })
    return closestCenter({ ...args, droppableContainers: containers })
  }

  // Works out where the dragged item would land, based on how close the TOP
  // edge of the dragged item is to the gap above or below the item under it.
  const getDrop = ({ active, over }) => {
    if (!over) return null
    const activeData = active.data.current
    const overData = over.data.current
    const translated = active.rect.current.translated
    if (!activeData || !overData || !translated) return null

    if (activeData.type === 'category') {
      if (overData.type !== 'category' || overData.categoryId === activeData.categoryId) return null
      const mid = over.rect.top + over.rect.height / 2
      return { kind: 'category', overId: overData.categoryId, pos: translated.top < mid ? 'before' : 'after' }
    }

    if (overData.type === 'channel') {
      if (overData.channelId === activeData.channelId) return null
      const mid = over.rect.top + over.rect.height / 2
      return { kind: 'channel', overId: overData.channelId, pos: translated.top < mid ? 'before' : 'after' }
    }

    if (overData.type === 'categoryBody') {
      return { kind: 'inside', containerId: overData.categoryId, at: overData.zone === 'header' ? 'top' : 'end' }
    }
    return null
  }

  const handleDragStart = ({ active }) => {
    const d = active.data.current
    if (d?.type === 'channel') setActiveDrag({ type: 'channel', item: channels.find((c) => c.id === d.channelId) })
    else if (d?.type === 'category') setActiveDrag({ type: 'category', item: categories.find((c) => c.id === d.categoryId) })
  }

  const handleDragMove = (event) => {
    const next = getDrop(event)
    setDrop((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }

  const handleDragCancel = () => {
    setDrop(null)
    setActiveDrag(null)
  }

  const handleDragEnd = async (event) => {
    const dropInfo = getDrop(event)
    setDrop(null)
    setActiveDrag(null)
    if (!dropInfo || !canManageChannels) return

    const activeData = event.active.data.current

    // ----- reordering a category -----
    if (activeData.type === 'category') {
      const moved = categories.find((c) => c.id === activeData.categoryId)
      const list = categories.filter((c) => c.id !== activeData.categoryId)
      let idx = list.findIndex((c) => c.id === dropInfo.overId)
      if (!moved || idx === -1) return
      if (dropInfo.pos === 'after') idx += 1
      list.splice(idx, 0, moved)
      setCategories(list)
      await Promise.all(
        list.map((cat, index) => supabase.from('channel_categories').update({ position: index + 1 }).eq('id', cat.id))
      )
      return
    }

    // ----- moving or reordering a channel -----
    const activeId = activeData.channelId
    const groups = getGroupedChannels()
    const keyOfChannel = (id) => Object.keys(groups).find((k) => groups[k].some((c) => c.id === id))

    const sourceKey = keyOfChannel(activeId)
    const destKey = dropInfo.kind === 'channel' ? keyOfChannel(dropInfo.overId) : String(dropInfo.containerId)
    if (sourceKey === undefined || destKey === undefined || !groups[destKey]) return

    const sourceList = [...groups[sourceKey]]
    const destList = sourceKey === destKey ? sourceList : [...groups[destKey]]

    const activeIndex = sourceList.findIndex((c) => c.id === activeId)
    if (activeIndex === -1) return
    const [moved] = sourceList.splice(activeIndex, 1)

    let destIndex = destList.length
    if (dropInfo.kind === 'channel') {
      destIndex = destList.findIndex((c) => c.id === dropInfo.overId)
      if (destIndex === -1) return
      if (dropInfo.pos === 'after') destIndex += 1
    } else if (dropInfo.at === 'top') {
      destIndex = 0
    }

    const newCategoryId = destKey === UNCATEGORIZED ? null : Number(destKey)
    destList.splice(destIndex, 0, { ...moved, category_id: newCategoryId })

    // Nothing actually changed? Then do nothing.
    const sameSpot =
      sourceKey === destKey &&
      destList.map((c) => c.id).join() === groups[sourceKey].map((c) => c.id).join()
    if (sameSpot) return

    // Update the screen right away
    const newGroups = { ...groups, [sourceKey]: sourceList, [destKey]: destList }
    const order = [...new Set([UNCATEGORIZED, ...categories.map((c) => String(c.id)), ...Object.keys(newGroups)])]
    const nextChannels = []
    order.forEach((k) => {
      ;(newGroups[k] || []).forEach((c, i) => nextChannels.push({ ...c, position: i + 1 }))
    })
    setChannels(nextChannels)

    // Save to the database
    const listsToPersist = sourceKey === destKey ? [destList] : [sourceList, destList]
    for (const list of listsToPersist) {
      await Promise.all(
        list.map((c, index) =>
          supabase
            .from('channels')
            .update(c.id === moved.id ? { position: index + 1, category_id: newCategoryId } : { position: index + 1 })
            .eq('id', c.id)
        )
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
        <DropContext.Provider value={drop}>
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={grouped[UNCATEGORIZED].map((c) => `ch-${c.id}`)} strategy={verticalListSortingStrategy}>
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

            <SortableContext items={categories.map((c) => `cat-${c.id}`)} strategy={verticalListSortingStrategy}>
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

            {createPortal(
              <DragOverlay dropAnimation={null}>
                {activeDrag?.type === 'channel' && activeDrag.item && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded bg-gray-700 text-white text-sm shadow-lg w-52 opacity-95">
                    <ChannelIcon locked={activeDrag.item.isPrivate} className="opacity-80" /> {activeDrag.item.name}
                  </div>
                )}
                {activeDrag?.type === 'category' && activeDrag.item && (
                  <div className="px-3 py-1.5 rounded bg-gray-700 text-xs font-semibold text-gray-200 uppercase shadow-lg w-52 opacity-95">
                    ▾ {activeDrag.item.name}
                  </div>
                )}
              </DragOverlay>,
              document.body
            )}
          </DndContext>
        </DropContext.Provider>
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

export default ChannelSidebar