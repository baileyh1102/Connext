import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// ChecklistMessage renders a shared checklist attached to a chat message.
// Anyone can check/uncheck items (showing who checked each one) and add or
// remove items — this is a fully collaborative task list, not personal.
function ChecklistMessage({ messageId, currentUserId, profilesMap }) {
  const [checklist, setChecklist] = useState(null)
  const [items, setItems] = useState([])
  const [checkerProfiles, setCheckerProfiles] = useState({})
  const [newItemText, setNewItemText] = useState('')
  const [showAddInput, setShowAddInput] = useState(false)

  const fetchItems = async (checklistId) => {
    const { data: itemRows } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('position', { ascending: true })
    setItems(itemRows || [])

    const checkerIds = [...new Set((itemRows || []).map((i) => i.checked_by).filter(Boolean))]
    const unknownIds = checkerIds.filter((id) => !profilesMap?.[id])
    if (unknownIds.length > 0) {
      const { data: profileRows } = await supabase.from('profiles').select('user_id, display_name').in('user_id', unknownIds)
      const map = {}
      profileRows?.forEach((p) => { map[p.user_id] = p })
      setCheckerProfiles((current) => ({ ...current, ...map }))
    }
  }

  useEffect(() => {
    const fetchChecklist = async () => {
      const { data: checklistRow } = await supabase.from('checklists').select('*').eq('message_id', messageId).maybeSingle()
      if (!checklistRow) return
      setChecklist(checklistRow)
      fetchItems(checklistRow.id)
    }
    fetchChecklist()
  }, [messageId])

  useEffect(() => {
    if (!checklist) return

    const channel = supabase
      .channel(`checklist-items-${checklist.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter: `checklist_id=eq.${checklist.id}` }, () => {
        fetchItems(checklist.id)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [checklist])

  if (!checklist) return null

  const getCheckerName = (userId) => {
    return profilesMap?.[userId]?.display_name || checkerProfiles[userId]?.display_name || 'Someone'
  }

  const handleToggleItem = async (item) => {
    if (item.is_checked) {
      await supabase.from('checklist_items').update({ is_checked: false, checked_by: null }).eq('id', item.id)
    } else {
      await supabase.from('checklist_items').update({ is_checked: true, checked_by: currentUserId }).eq('id', item.id)
    }
  }

  const handleAddItem = async (e) => {
    e.preventDefault()
    if (!newItemText.trim()) return

    const nextPosition = items.length > 0 ? Math.max(...items.map((i) => i.position || 0)) + 1 : 1
    await supabase.from('checklist_items').insert({
      checklist_id: checklist.id,
      item_text: newItemText.trim(),
      position: nextPosition,
    })
    setNewItemText('')
    setShowAddInput(false)
  }

  const handleRemoveItem = async (itemId) => {
    await supabase.from('checklist_items').delete().eq('id', itemId)
  }

  const checkedCount = items.filter((i) => i.is_checked).length

  return (
    <div className="bg-white border rounded-lg p-3 mt-1 w-72">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Checklist</p>
      <p className="text-sm font-semibold mb-2">{checklist.title}</p>

      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="group flex items-start gap-2">
            <button
              onClick={() => handleToggleItem(item)}
              className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${
                item.is_checked ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}
            >
              {item.is_checked && (
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${item.is_checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {item.item_text}
              </p>
              {item.is_checked && item.checked_by && (
                <p className="text-[10px] text-gray-400">Checked by {getCheckerName(item.checked_by)}</p>
              )}
            </div>
            <button
              onClick={() => handleRemoveItem(item.id)}
              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="Remove item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {showAddInput ? (
        <form onSubmit={handleAddItem} className="flex gap-1 mt-2">
          <input
            type="text"
            autoFocus
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onBlur={() => !newItemText && setShowAddInput(false)}
            placeholder="New item..."
            className="flex-1 border rounded p-1 text-sm"
          />
          <button type="submit" className="text-sm text-blue-600 hover:underline">Add</button>
        </form>
      ) : (
        <button
          onClick={() => setShowAddInput(true)}
          className="text-sm text-blue-600 hover:underline mt-2"
        >
          + Add item
        </button>
      )}

      <p className="text-xs text-gray-400 mt-2">{checkedCount}/{items.length} done</p>
    </div>
  )
}

export default ChecklistMessage