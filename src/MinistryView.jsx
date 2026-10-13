import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import RosterBuilder from './RosterBuilder'
import { MySchedule } from './MinistrySchedule'

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = Number(h)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

const fmtRange = (s, e) => (s && e ? `${fmtTime(s)} – ${fmtTime(e)}` : s ? fmtTime(s) : '')

const todayStr = () => new Date().toLocaleDateString('en-CA')

function PositionRow({ pos, isLeader, onSave, onDelete }) {
  const [name, setName] = useState(pos.name)
  const [start, setStart] = useState(pos.start_time?.slice(0, 5) || '')
  const [end, setEnd] = useState(pos.end_time?.slice(0, 5) || '')
  const save = () =>
    onSave(pos.id, { name: name.trim() || pos.name, start_time: start || null, end_time: end || null })

  if (!isLeader) {
    return (
      <div className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
        <span className="font-medium">{pos.name}</span>
        <span className="text-sm text-gray-500">{fmtRange(pos.start_time, pos.end_time)}</span>
      </div>
    )
  }
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-base min-w-0"
      />
      <div className="flex items-center gap-2">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} onBlur={save}
          className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-2 text-base" />
        <span className="text-gray-400">to</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} onBlur={save}
          className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-2 text-base" />
        <button onClick={() => onDelete(pos.id)} className="text-sm text-red-600 px-2">Delete</button>
      </div>
    </div>
  )
}

function MinistryView({ ministry, isLeader, currentUserId, serverId, onBack }) {
  const [tab, setTab] = useState('members')
  const [error, setError] = useState('')

  // ---------- members ----------
  const [members, setMembers] = useState([])
  const [lastServed, setLastServed] = useState({})
  const [profiles, setProfiles] = useState({})
  const [inviteOpen, setInviteOpen] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [search, setSearch] = useState('')

  const fetchProfiles = useCallback(async (ids) => {
    if (!ids.length) return
    const { data } = await supabase
      .from('profiles').select('user_id, display_name, avatar_url').in('user_id', ids)
    setProfiles((cur) => {
      const next = { ...cur }
      ;(data || []).forEach((p) => { next[p.user_id] = p })
      return next
    })
  }, [])

  const loadMembers = useCallback(async () => {
    const { data: rows } = await supabase
      .from('ministry_members').select('user_id, is_leader, status').eq('ministry_id', ministry.id)
    const { data: ls } = await supabase.rpc('ministry_last_served', { mid: ministry.id })
    const map = {}
    ;(ls || []).forEach((r) => { map[r.user_id] = r.last_served })
    setLastServed(map)
    setMembers(rows || [])
    fetchProfiles((rows || []).map((r) => r.user_id))
  }, [ministry.id, fetchProfiles])

  useEffect(() => {
    loadMembers()
    const channel = supabase
      .channel(`ministry-members-${ministry.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ministry_members', filter: `ministry_id=eq.${ministry.id}` },
        () => loadMembers())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [ministry.id, loadMembers])

  const nameOf = (uid) => profiles[uid]?.display_name || 'Member'

  const activeMembers = useMemo(() => {
    return members
      .filter((m) => m.status === 'active')
      .map((m) => ({ ...m, last: lastServed[m.user_id] || null }))
      .sort((a, b) => {
        if (!a.last && !b.last) return nameOf(a.user_id).localeCompare(nameOf(b.user_id))
        if (!a.last) return -1
        if (!b.last) return 1
        return a.last.localeCompare(b.last) || nameOf(a.user_id).localeCompare(nameOf(b.user_id))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, lastServed, profiles])

  const invitedMembers = members.filter((m) => m.status === 'invited')

  const openInvite = async () => {
    setInviteOpen(true)
    const { data: sm } = await supabase.from('server_members').select('user_id').eq('server_id', serverId)
    const taken = new Set(members.map((m) => m.user_id))
    const ids = [...new Set((sm || []).map((r) => r.user_id))].filter((id) => !taken.has(id))
    setCandidates(ids)
    fetchProfiles(ids)
  }

  const visibleCandidates = candidates
    .filter((id) => nameOf(id).toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 5)

  const invite = async (uid) => {
    setError('')
    const { error: err } = await supabase.from('ministry_members').insert({
      ministry_id: ministry.id, user_id: uid, invited_by: currentUserId, status: 'invited', is_leader: false,
    })
    if (err) return setError(err.message)
    setCandidates((c) => c.filter((id) => id !== uid))
    loadMembers()
  }

  const toggleLeader = async (m) => {
    setError('')
    const { data, error: err } = await supabase
      .from('ministry_members').update({ is_leader: !m.is_leader })
      .eq('ministry_id', ministry.id).eq('user_id', m.user_id).select()
    if (err || !data?.length) return setError(err?.message || 'Could not update leader.')
    loadMembers()
  }

  const removeMember = async (m) => {
    if (!window.confirm(`Remove ${nameOf(m.user_id)} from ${ministry.name}?`)) return
    setError('')
    const { data, error: err } = await supabase
      .from('ministry_members').delete()
      .eq('ministry_id', ministry.id).eq('user_id', m.user_id).select()
    if (err || !data?.length) return setError(err?.message || 'Could not remove.')
    loadMembers()
  }

  // ---------- positions ----------
  const [positions, setPositions] = useState([])
  const [newPos, setNewPos] = useState({ name: '', start: '', end: '' })

  const loadPositions = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_positions').select('*').eq('ministry_id', ministry.id).order('sort_order')
    setPositions(data || [])
  }, [ministry.id])

  useEffect(() => { loadPositions() }, [loadPositions])

  const addPosition = async (e) => {
    e.preventDefault()
    if (!newPos.name.trim()) return
    setError('')
    const nextOrder = positions.length ? Math.max(...positions.map((p) => p.sort_order)) + 1 : 0
    const { error: err } = await supabase.from('ministry_positions').insert({
      ministry_id: ministry.id, name: newPos.name.trim(),
      start_time: newPos.start || null, end_time: newPos.end || null, sort_order: nextOrder,
    })
    if (err) return setError(err.message)
    setNewPos({ name: '', start: '', end: '' })
    loadPositions()
  }

  const savePosition = async (id, patch) => {
    const { error: err } = await supabase.from('ministry_positions').update(patch).eq('id', id)
    if (err) setError(err.message)
    else loadPositions()
  }

  const deletePosition = async (id) => {
    await supabase.from('ministry_positions').delete().eq('id', id)
    loadPositions()
  }

  // ---------- pages ----------
  const [pages, setPages] = useState([])
  const [newDate, setNewDate] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [openPage, setOpenPage] = useState(null)

  const loadPages = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_pages')
      .select('*, ministry_slots(id, name, start_time, end_time, sort_order, user_id, status)')
      .eq('ministry_id', ministry.id)
      .order('service_date')
    setPages(data || [])
  }, [ministry.id])

  useEffect(() => { loadPages() }, [loadPages])

  const createPage = async (e) => {
    e.preventDefault()
    if (!newDate) return
    setError('')
    const { data: page, error: err } = await supabase
      .from('ministry_pages')
      .insert({ ministry_id: ministry.id, service_date: newDate, title: newTitle.trim() || null, created_by: currentUserId })
      .select().single()
    if (err || !page) return setError(err?.message || 'Could not create event.')
    if (positions.length) {
      const { error: slotErr } = await supabase.from('ministry_slots').insert(
        positions.map((p) => ({
          page_id: page.id, name: p.name, start_time: p.start_time, end_time: p.end_time, sort_order: p.sort_order,
        }))
      )
      if (slotErr) setError(slotErr.message)
    }
    setNewDate('')
    setNewTitle('')
    loadPages()
  }

  const deletePage = async (id) => {
    if (!window.confirm('Delete this event and its roster?')) return
    await supabase.from('ministry_pages').delete().eq('id', id)
    loadPages()
  }

  const today = todayStr()
  const upcoming = pages.filter((p) => p.service_date >= today)
  const past = pages.filter((p) => p.service_date < today).reverse()

  const renderPage = (p) => {
    const slots = [...(p.ministry_slots || [])].sort((a, b) => a.sort_order - b.sort_order)
    const open = openPage === p.id
    return (
      <div key={p.id} className="border border-gray-200 rounded-lg">
        <button onClick={() => setOpenPage(open ? null : p.id)} className="w-full text-left p-3 flex items-center justify-between">
          <span>
            <span className="font-medium">{fmtDate(p.service_date)}</span>
            {p.title && <span className="text-gray-500"> · {p.title}</span>}
          </span>
          <span className="text-xs text-gray-400">
            {slots.filter((s) => s.user_id).length}/{slots.length} filled
          </span>
        </button>
        {open && (
          <RosterBuilder
            page={p}
            slots={slots}
            members={activeMembers}
            nameOf={nameOf}
            isLeader={isLeader}
            onChanged={loadPages}
            onDeletePage={() => deletePage(p.id)}
          />
        )}
        {false && (
          <div className="px-3 pb-3 space-y-1">
            {slots.length === 0 && <p className="text-sm text-gray-400">No positions yet. Add some on the Positions tab.</p>}
            {slots.map((s) => (
              <div key={s.id} className="flex justify-between text-sm">
                <span>{s.name}</span>
                <span className="text-gray-500">
                  {s.user_id ? nameOf(s.user_id) : 'Open'} {fmtRange(s.start_time, s.end_time) && `· ${fmtRange(s.start_time, s.end_time)}`}
                </span>
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-1">Assigning people comes in the next step.</p>
            {isLeader && (
              <button onClick={() => deletePage(p.id)} className="text-sm text-red-600 pt-1">Delete event</button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 max-w-2xl mx-auto w-full">
      <button onClick={onBack} className="text-sm text-blue-600 mb-3">← All ministries</button>
      <h2 className="text-xl font-semibold mb-3">{ministry.name}</h2>

      <div className="flex gap-1 mb-4">
        {['members', 'positions', 'events'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${
              tab === t ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <MySchedule currentUserId={currentUserId} serverId={serverId} ministryId={ministry.id} />

      {tab === 'members' && (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Rotation order: the person who served longest ago is at the top.
          </p>
          <div className="space-y-2 mb-4">
            {activeMembers.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3 gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {nameOf(m.user_id)}
                    {m.is_leader && <span className="ml-2 text-xs text-gray-500">Leader</span>}
                  </div>
                  <div className="text-xs text-gray-500">
                    {m.last ? `Last served ${fmtDate(m.last)}` : 'Never served'}
                  </div>
                </div>
                {isLeader && m.user_id !== currentUserId && (
                  <div className="flex gap-3 shrink-0 text-sm">
                    <button onClick={() => toggleLeader(m)} className="text-blue-600">
                      {m.is_leader ? 'Remove leader' : 'Make leader'}
                    </button>
                    <button onClick={() => removeMember(m)} className="text-red-600">Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {invitedMembers.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Invited</h3>
              {invitedMembers.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm py-1">
                  <span>{nameOf(m.user_id)} <span className="text-gray-400">(pending)</span></span>
                  {isLeader && <button onClick={() => removeMember(m)} className="text-red-600">Cancel</button>}
                </div>
              ))}
            </div>
          )}

          {isLeader && (
            inviteOpen ? (
              <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people in this server"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-base"
                />
                {visibleCandidates.map((id) => (
                  <div key={id} className="flex items-center justify-between">
                    <span>{nameOf(id)}</span>
                    <button onClick={() => invite(id)} className="px-3 py-1 rounded-md bg-gray-800 text-white text-sm">Invite</button>
                  </div>
                ))}
                {visibleCandidates.length === 0 && <p className="text-sm text-gray-400">No one found.</p>}
                <button onClick={() => { setInviteOpen(false); setSearch('') }} className="text-sm text-gray-500">Done</button>
              </div>
            ) : (
              <button onClick={openInvite} className="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium">
                + Invite people
              </button>
            )
          )}
        </div>
      )}

      {tab === 'positions' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            These are copied onto every new dated event. Changing them here doesn't change events already made.
          </p>
          {positions.map((p) => (
            <PositionRow key={p.id} pos={p} isLeader={isLeader} onSave={savePosition} onDelete={deletePosition} />
          ))}
          {positions.length === 0 && <p className="text-sm text-gray-400">No positions yet.</p>}
          {isLeader && (
            <form onSubmit={addPosition} className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2">
              <input
                value={newPos.name}
                onChange={(e) => setNewPos({ ...newPos, name: e.target.value })}
                placeholder="Position name (e.g. Greeter)"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-base"
              />
              <div className="flex items-center gap-2">
                <input type="time" value={newPos.start} onChange={(e) => setNewPos({ ...newPos, start: e.target.value })}
                  className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-2 text-base" />
                <span className="text-gray-400">to</span>
                <input type="time" value={newPos.end} onChange={(e) => setNewPos({ ...newPos, end: e.target.value })}
                  className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-2 text-base" />
              </div>
              <button type="submit" className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-sm">Add position</button>
            </form>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="space-y-4">
          {isLeader && (
            <form onSubmit={createPage} className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-base" />
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Label (optional, e.g. 9am Service)"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-base" />
              <button type="submit" className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-sm">
                New event{positions.length ? ` (with ${positions.length} positions)` : ''}
              </button>
            </form>
          )}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Upcoming</h3>
            {upcoming.length === 0 && <p className="text-sm text-gray-400">No upcoming events.</p>}
            {upcoming.map(renderPage)}
          </div>
          {past.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Past</h3>
              {past.map(renderPage)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MinistryView