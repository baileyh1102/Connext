import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'

const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = Number(h)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}
const fmtRange = (s, e) => (s && e ? `${fmtTime(s)} – ${fmtTime(e)}` : s ? fmtTime(s) : '')
const fmtShortDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null)
// Missing end time = assume one hour. Missing start time = can't tell, so no overlap.
const overlaps = (a, b) => {
  const aS = toMin(a.start_time)
  const bS = toMin(b.start_time)
  if (aS == null || bS == null) return false
  const aE = toMin(a.end_time) ?? aS + 60
  const bE = toMin(b.end_time) ?? bS + 60
  return aS < bE && bS < aE
}

const STATUS = {
  pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-600' },
  confirmed: { label: 'Confirmed', cls: 'bg-green-100 text-green-700' },
  declined: { label: "Can't make it", cls: 'bg-red-100 text-red-700' },
}

function RosterBuilder({ page, slots, members, nameOf, isLeader, onChanged, onDeletePage }) {
  const [pickSlot, setPickSlot] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [newSpot, setNewSpot] = useState({ name: '', start: '', end: '' })

  const onThisPage = new Set(slots.filter((s) => s.user_id).map((s) => s.user_id))

  const assign = async (slot, uid) => {
    setError('')
    if (slot.user_id === uid && slot.status !== 'declined') return

    // Anything else this person already has that day (any ministry, any page)
    const { data: others } = await supabase
      .from('ministry_slots')
      .select('id, name, start_time, end_time, ministry_pages!inner(service_date, ministries(name))')
      .eq('user_id', uid)
      .eq('ministry_pages.service_date', page.service_date)
      .neq('id', slot.id)
    const conflicts = (others || []).filter((o) => overlaps(slot, o))
    if (conflicts.length) {
      const lines = conflicts
        .map((c) => `• ${c.name} (${fmtRange(c.start_time, c.end_time) || 'no time'}) – ${c.ministry_pages?.ministries?.name || 'another ministry'}`)
        .join('\n')
      const ok = window.confirm(
        `${nameOf(uid)} is already scheduled at an overlapping time on ${fmtShortDate(page.service_date)}:\n\n${lines}\n\nSchedule them here anyway?`
      )
      if (!ok) return
    }

    const { data, error: err } = await supabase
      .from('ministry_slots')
      .update({ user_id: uid, status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', slot.id)
      .select()
    if (err || !data?.length) return setError(err?.message || 'Could not assign.')
    onChanged()
  }

  const clearSlot = async (slot) => {
    const { error: err } = await supabase
      .from('ministry_slots')
      .update({ user_id: null, status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', slot.id)
    if (err) setError(err.message)
    onChanged()
  }

  const removeSpot = async (slot) => {
    if (!window.confirm(`Remove "${slot.name}" from this page?`)) return
    await supabase.from('ministry_slots').delete().eq('id', slot.id)
    onChanged()
  }

  const addSpot = async (e) => {
    e.preventDefault()
    if (!newSpot.name.trim()) return
    const nextOrder = slots.length ? Math.max(...slots.map((s) => s.sort_order)) + 1 : 0
    const { error: err } = await supabase.from('ministry_slots').insert({
      page_id: page.id,
      name: newSpot.name.trim(),
      start_time: newSpot.start || null,
      end_time: newSpot.end || null,
      sort_order: nextOrder,
    })
    if (err) return setError(err.message)
    setNewSpot({ name: '', start: '', end: '' })
    setAdding(false)
    onChanged()
  }

  const sorted = [...slots].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="px-3 pb-3">
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="md:flex md:gap-4">
        {isLeader && (
          <div className="hidden md:block w-56 shrink-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Drag a name</div>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', m.user_id)}
                  className="border border-gray-200 rounded-md px-2 py-1.5 cursor-grab bg-white select-none"
                >
                  <div className="text-sm font-medium truncate">
                    {nameOf(m.user_id)}
                    {onThisPage.has(m.user_id) && <span className="ml-1 text-xs text-blue-600">on this page</span>}
                  </div>
                  <div className="text-xs text-gray-500">
                    {m.last ? `Last: ${fmtShortDate(m.last)}` : 'Never served'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-2">
          {sorted.length === 0 && (
            <p className="text-sm text-gray-400">No positions yet. Add some on the Positions tab or add one below.</p>
          )}
          {sorted.map((s) => {
            const st = STATUS[s.status] || STATUS.pending
            return (
              <div
                key={s.id}
                onDragOver={(e) => { if (isLeader) { e.preventDefault(); setDragOver(s.id) } }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(null)
                  const uid = e.dataTransfer.getData('text/plain')
                  if (isLeader && uid) assign(s, uid)
                }}
                className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
                  dragOver === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                } ${s.status === 'declined' ? 'bg-red-50' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => isLeader && setPickSlot(s)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-medium">
                    {s.name}{' '}
                    <span className="text-gray-400 font-normal">{fmtRange(s.start_time, s.end_time)}</span>
                  </div>
                  <div className="text-sm">
                    {s.user_id ? (
                      <>
                        {nameOf(s.user_id)}{' '}
                        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                        {s.status === 'declined' && isLeader && (
                          <span className="ml-1 text-xs text-red-600">needs a replacement</span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">{isLeader ? 'Tap or drop a name here' : 'Open'}</span>
                    )}
                  </div>
                </button>
                {isLeader && (
                  <div className="flex flex-col items-end gap-1 text-xs shrink-0">
                    {s.user_id && (
                      <button onClick={() => clearSlot(s)} className="text-gray-500">Clear</button>
                    )}
                    <button onClick={() => removeSpot(s)} className="text-red-600">Remove spot</button>
                  </div>
                )}
              </div>
            )
          })}

          {isLeader && (
            adding ? (
              <form onSubmit={addSpot} className="border border-dashed border-gray-300 rounded-lg p-2 space-y-2">
                <input
                  value={newSpot.name}
                  onChange={(e) => setNewSpot({ ...newSpot, name: e.target.value })}
                  placeholder="Spot name"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-base"
                />
                <div className="flex items-center gap-2">
                  <input type="time" value={newSpot.start} onChange={(e) => setNewSpot({ ...newSpot, start: e.target.value })}
                    className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-2 text-base" />
                  <span className="text-gray-400">to</span>
                  <input type="time" value={newSpot.end} onChange={(e) => setNewSpot({ ...newSpot, end: e.target.value })}
                    className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-2 text-base" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-sm">Add</button>
                  <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-md border border-gray-300 text-sm">Cancel</button>
                </div>
              </form>
            ) : (
              <button onClick={() => setAdding(true)} className="text-sm text-blue-600">+ Add a spot to this page only</button>
            )
          )}

          {isLeader && (
            <button onClick={onDeletePage} className="block text-sm text-red-600 pt-2">Delete this page</button>
          )}
        </div>
      </div>

      {pickSlot &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center"
            onClick={() => setPickSlot(null)}
          >
            <div
              className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[75vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-gray-200">
                <div className="font-semibold">{pickSlot.name}</div>
                <div className="text-xs text-gray-500">
                  Longest since serving is at the top
                  {fmtRange(pickSlot.start_time, pickSlot.end_time) && ` · ${fmtRange(pickSlot.start_time, pickSlot.end_time)}`}
                </div>
              </div>
              <div className="overflow-y-auto p-2">
                {members.map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => { const slot = pickSlot; setPickSlot(null); assign(slot, m.user_id) }}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{nameOf(m.user_id)}</span>
                      <span className="block text-xs text-gray-500">
                        {m.last ? `Last served ${fmtShortDate(m.last)}` : 'Never served'}
                      </span>
                    </span>
                    {onThisPage.has(m.user_id) && <span className="text-xs text-blue-600 shrink-0">on this page</span>}
                  </button>
                ))}
                {members.length === 0 && <p className="p-3 text-sm text-gray-400">No members yet. Invite people on the Members tab.</p>}
              </div>
              <button onClick={() => setPickSlot(null)} className="p-3 text-sm text-gray-500 border-t border-gray-200">Cancel</button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

export default RosterBuilder