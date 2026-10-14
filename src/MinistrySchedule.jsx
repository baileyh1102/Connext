import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = Number(h)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}
const fmtRange = (s, e) => (s && e ? `${fmtTime(s)} – ${fmtTime(e)}` : s ? fmtTime(s) : '')
const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

const STATUS = {
  pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-600' },
  confirmed: { label: 'Confirmed', cls: 'bg-green-100 text-green-700' },
  declined: { label: "Can't make it", cls: 'bg-red-100 text-red-700' },
}

const todayStr = () => new Date().toLocaleDateString('en-CA')
const nextSundayStr = () => {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return d.toLocaleDateString('en-CA')
}

// Re-run `load` whenever any slot visible to this user changes
function useSlotsRealtime(key, load) {
  useEffect(() => {
    const channel = supabase
      .channel(`ministry-slots-${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ministry_slots' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [key, load])
}

export function MySchedule({ currentUserId, serverId, ministryId }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_slots')
      .select('id, name, start_time, end_time, status, ministry_pages!inner(service_date, title, ministry_id, ministries!inner(name, server_id))')
      .eq('user_id', currentUserId)
      .eq('ministry_pages.ministries.server_id', serverId)
      .gte('ministry_pages.service_date', todayStr())
      .eq('status', 'pending')
    const rows = (data || []).filter((r) => !ministryId || r.ministry_pages.ministry_id === ministryId).sort(
      (a, b) =>
        a.ministry_pages.service_date.localeCompare(b.ministry_pages.service_date) ||
        (a.start_time || '').localeCompare(b.start_time || '')
    )
    setItems(rows)
  }, [currentUserId, serverId, ministryId])

  useEffect(() => { load() }, [load])
  useSlotsRealtime(`mine-${currentUserId}-${serverId}`, load)

  const respond = async (id, status) => {
    setError('')
    const { error: err } = await supabase.rpc('respond_to_slot', { slot_id: id, new_status: status })
    if (err) return setError(err.message)
    load()
  }

  if (items.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Needs your response</h3>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="space-y-2">
        {items.map((s) => {
          const st = STATUS[s.status] || STATUS.pending
          return (
            <div key={s.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-sm text-gray-500">
                    {fmtDate(s.ministry_pages.service_date)}
                    {fmtRange(s.start_time, s.end_time) && ` · ${fmtRange(s.start_time, s.end_time)}`}
                  </div>
                  <div className="text-xs text-gray-400">
                    {s.ministry_pages.ministries.name}
                    {s.ministry_pages.title && ` · ${s.ministry_pages.title}`}
                  </div>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${st.cls}`}>{st.label}</span>
              </div>
              <div className="flex gap-2 mt-2">
                {s.status !== 'confirmed' && (
                  <button onClick={() => respond(s.id, 'confirmed')} className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-sm">
                    Confirm
                  </button>
                )}
                {s.status !== 'declined' && (
                  <button onClick={() => respond(s.id, 'declined')} className="px-3 py-1.5 rounded-md border border-gray-300 text-sm">
                    Can't make it
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MasterRoster({ serverId }) {
  const [pages, setPages] = useState([])
  const [names, setNames] = useState({})
  const sunday = nextSundayStr()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_pages')
      .select('id, title, ministries!inner(name, server_id), ministry_slots(id, name, start_time, end_time, sort_order, user_id, status)')
      .eq('service_date', sunday)
      .eq('ministries.server_id', serverId)
    const rows = (data || []).sort(
      (a, b) =>
        a.ministries.name.localeCompare(b.ministries.name, undefined, { sensitivity: 'base' }) ||
        (a.title || '').localeCompare(b.title || '')
    )
    setPages(rows)
    const ids = [...new Set(rows.flatMap((p) => p.ministry_slots.map((s) => s.user_id).filter(Boolean)))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids)
      const map = {}
      ;(profs || []).forEach((p) => { map[p.user_id] = p.display_name })
      setNames(map)
    }
  }, [serverId, sunday])

  useEffect(() => { load() }, [load])
  useSlotsRealtime(`master-${serverId}`, load)

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        {sunday === todayStr() ? 'Today' : 'This Sunday'} · {fmtDate(sunday)}
      </h3>
      {pages.length === 0 && <p className="text-sm text-gray-400">No rosters built for this date yet.</p>}
      <div className="space-y-3">
        {pages.map((p) => {
          const slots = [...p.ministry_slots].sort((a, b) => a.sort_order - b.sort_order)
          const open = slots.filter((s) => !s.user_id || s.status === 'declined').length
          return (
            <div key={p.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold">
                  {p.ministries.name}
                  {p.title && <span className="font-normal text-gray-500"> · {p.title}</span>}
                </div>
                {open > 0 && <span className="text-xs text-red-600">{open} open</span>}
              </div>
              <div className="space-y-1">
                {slots.map((s) => {
                  const st = STATUS[s.status] || STATUS.pending
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="text-gray-500">{s.name}</span>
                        {fmtRange(s.start_time, s.end_time) && (
                          <span className="text-gray-400"> · {fmtRange(s.start_time, s.end_time)}</span>
                        )}
                      </span>
                      <span className="shrink-0">
                        {s.user_id ? (
                          <>
                            <span className="font-medium">{names[s.user_id] || 'Member'}</span>
                            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                          </>
                        ) : (
                          <span className="text-red-500">Open</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}