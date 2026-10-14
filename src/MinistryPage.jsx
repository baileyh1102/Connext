import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import MinistryView from './MinistryView'
import { MySchedule, MasterRoster } from './MinistrySchedule'

function MinistryPage({ currentUserId, serverId, canManage, isLeader, onChanged }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_members')
      .select('ministry_id, status, is_leader, ministries!inner(id, name, description, server_id)')
      .eq('user_id', currentUserId)
      .eq('ministries.server_id', serverId)
    setRows(data || [])
    setLoading(false)
  }, [currentUserId, serverId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const invites = rows.filter((r) => r.status === 'invited')
  const mine = rows
    .filter((r) => r.status === 'active')
    .sort((a, b) => a.ministries.name.localeCompare(b.ministries.name, undefined, { sensitivity: 'base' }))
  const led = mine.filter((r) => r.is_leader)

  const accept = async (ministryId) => {
    await supabase
      .from('ministry_members')
      .update({ status: 'active' })
      .eq('ministry_id', ministryId)
      .eq('user_id', currentUserId)
    await load()
    onChanged?.()
  }

  const decline = async (ministryId) => {
    await supabase
      .from('ministry_members')
      .delete()
      .eq('ministry_id', ministryId)
      .eq('user_id', currentUserId)
    await load()
    onChanged?.()
  }

  const create = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setError('')
    const { error: err } = await supabase
      .from('ministries')
      .insert({ server_id: serverId, name: trimmed, created_by: currentUserId })
    if (err) {
      setError(err.message)
      return
    }
    setName('')
    setCreating(false)
    await load()
    onChanged?.()
  }

  if (selected) {
    const sel = led.find((r) => r.ministry_id === selected)
    if (sel) {
      return (
        <MinistryView
          ministry={sel.ministries}
          isLeader={true}
          currentUserId={currentUserId}
          serverId={serverId}
          onBack={() => setSelected(null)}
          onDeleted={async () => { setSelected(null); await load(); onChanged?.() }}
        />
      )
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 max-w-2xl mx-auto w-full">
      <h2 className="text-xl font-semibold mb-4">Schedule</h2>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {mine.length > 0 && (
        <>
          <MySchedule currentUserId={currentUserId} serverId={serverId} />
          <MasterRoster serverId={serverId} />
        </>
      )}

      {isLeader && invites.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Invitations</h3>
          <div className="space-y-2">
            {invites.map((r) => (
              <div key={r.ministry_id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                <span className="font-medium">{r.ministries.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => accept(r.ministry_id)} className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-sm">
                    Join
                  </button>
                  <button onClick={() => decline(r.ministry_id)} className="px-3 py-1.5 rounded-md border border-gray-300 text-sm">
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLeader && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Ministries you lead</h3>
          {!loading && led.length === 0 && <p className="text-sm text-gray-400">You don't lead a ministry yet.</p>}
          <div className="space-y-2">
            {led.map((r) => (
              <button
                key={r.ministry_id}
                onClick={() => setSelected(r.ministry_id)}
                className="w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 flex items-center justify-between"
              >
                <span className="font-medium">{r.ministries.name}</span>
                <span className="text-xs text-gray-500">Leader</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <div>
          {creating ? (
            <form onSubmit={create} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ministry name (e.g. Worship Team)"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-base"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-sm">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false)
                    setError('')
                  }}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setCreating(true)} className="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium">
              + New ministry
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default MinistryPage