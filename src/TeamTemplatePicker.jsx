import { useState } from 'react'
import { supabase } from './supabaseClient'
import { TEAM_TEMPLATES } from './teamTemplates'

const NO_ACCESS = {
  can_view: false,
  can_send_messages: false,
  can_react: false,
  can_reply: false,
  can_edit_delete_own: false,
}
const FULL_ACCESS = {
  can_view: true,
  can_send_messages: true,
  can_react: true,
  can_reply: true,
  can_edit_delete_own: true,
}

export default function TeamTemplatePicker({ server, currentUserId, canManageChannels }) {
  const [selected, setSelected] = useState(null)
  const [makePrivate, setMakePrivate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  if (!canManageChannels) {
    return <p className="text-sm text-gray-600">You don't have permission to create teams.</p>
  }

  function pick(template) {
    setSelected(template)
    setMakePrivate(template.defaultPrivate)
    setMessage('')
    setIsError(false)
  }

  async function handleCreate() {
    if (!selected || creating) return
    setCreating(true)
    setMessage('')
    setIsError(false)

    let categoryId = null
    const fail = async (err) => {
      console.error(err)
      if (categoryId) {
        await supabase.from('category_permissions').delete().eq('category_id', categoryId)
        await supabase.from('channel_categories').delete().eq('id', categoryId)
      }
      setIsError(true)
      setMessage(`Couldn't create ${selected.name}, so nothing was created.`)
      setCreating(false)
    }

    // 1. Category (placed after existing ones)
    const { data: existing, error: posErr } = await supabase
      .from('channel_categories')
      .select('position')
      .eq('server_id', server.id)
    if (posErr) return fail(posErr)
    const maxPos = (existing || []).reduce((m, c) => Math.max(m, c.position || 0), 0)

    const { data: cat, error: catErr } = await supabase
      .from('channel_categories')
      .insert({ server_id: server.id, name: selected.name, position: maxPos + 1 })
      .select()
      .single()
    if (catErr) return fail(catErr)
    categoryId = cat.id

    // 2. Lock down BEFORE channels exist, so nothing is ever briefly visible
    if (makePrivate) {
      const { error: permErr } = await supabase.from('category_permissions').insert([
        { category_id: categoryId, member_user_id: null, ...NO_ACCESS },
        { category_id: categoryId, member_user_id: currentUserId, ...FULL_ACCESS },
      ])
      if (permErr) return fail(permErr)
    }

    // 3. Channels
    const rows = selected.channels.map((ch, i) => ({
      server_id: server.id,
      category_id: categoryId,
      name: ch.name,
      description: ch.description,
      position: i + 1,
      created_by: currentUserId,
    }))
    const { error: chErr } = await supabase.from('channels').insert(rows)
    if (chErr) return fail(chErr)

    let msg = `Created "${selected.name}" with ${selected.channels.length} channels.`
    if (makePrivate) {
      msg += ' Only you can see it for now. Add people under Categories → this team → Permissions.'
    }
    setMessage(msg)
    setSelected(null)
    setCreating(false)
  }

  // ---- Detail view ----
  if (selected) {
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-blue-600 hover:underline mb-3"
        >
          ← All templates
        </button>
        <h3 className="text-lg font-semibold text-gray-900">{selected.name}</h3>
        <p className="text-sm text-gray-600 mb-3">{selected.blurb}</p>

        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-4">
          {selected.channels.map((ch) => (
            <li key={ch.name} className="px-3 py-2">
              <div className="text-sm font-medium text-gray-900"># {ch.name}</div>
              <div className="text-xs text-gray-500">{ch.description}</div>
            </li>
          ))}
        </ul>

        <label className="flex items-center gap-2 text-sm text-gray-800 mb-4">
          <input
            type="checkbox"
            checked={makePrivate}
            onChange={(e) => setMakePrivate(e.target.checked)}
          />
          Private team (only you can see it until you add people)
        </label>

        {message && (
          <p className={`text-sm mb-3 ${isError ? 'text-red-600' : 'text-green-700'}`}>{message}</p>
        )}

        <button
          onClick={handleCreate}
          disabled={creating}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
        >
          {creating ? 'Creating...' : `Create ${selected.name}`}
        </button>
      </div>
    )
  }

  // ---- Template grid ----
  return (
    <div>
      <p className="text-sm text-gray-600 mb-3">
        Pick a ministry team to create a ready-made category of channels. You can rename or delete
        anything afterward.
      </p>
      {message && (
        <p className={`text-sm mb-3 ${isError ? 'text-red-600' : 'text-green-700'}`}>{message}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEAM_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => pick(t)}
            className="text-left border border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg p-3 transition-colors"
          >
            <div className="text-sm font-semibold text-gray-900">{t.name}</div>
            <div className="text-xs text-gray-600 mt-0.5">{t.blurb}</div>
            <div className="text-xs text-gray-400 mt-1">
              {t.channels.length} channels{t.defaultPrivate ? ' · private by default' : ''}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}