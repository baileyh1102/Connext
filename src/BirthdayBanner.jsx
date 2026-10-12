import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { PartyHatIcon } from './PrayerIcons'

function todayParts() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

export default function BirthdayBanner({ selectedServer }) {
  const [people, setPeople] = useState([])

  useEffect(() => {
    if (!selectedServer) return
    let cancelled = false
    ;(async () => {
      const { data: members } = await supabase
        .from('server_members')
        .select('user_id')
        .eq('server_id', selectedServer.id)
      const ids = [...new Set([...(members || []).map((m) => m.user_id), selectedServer.created_by])].filter(Boolean)
      if (ids.length === 0) return

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, birth_date')
        .in('user_id', ids)
        .not('birth_date', 'is', null)

      const { y, m, d } = todayParts()
      const today = (profiles || [])
        .filter((p) => {
          const [, bm, bd] = p.birth_date.split('-').map(Number)
          return bm === m && bd === d
        })
        .map((p) => ({ ...p, age: y - Number(p.birth_date.split('-')[0]) }))

      if (!cancelled) setPeople(today)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedServer?.id])

  if (people.length === 0) return null

  return (
    <div className="pointer-events-auto bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <PartyHatIcon className="w-6 h-6" />
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Today's Birthdays</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {people.map((p) => (
          <div key={p.user_id} className="flex items-center gap-2">
            {p.avatar_url ? (
              <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-200" />
            )}
            <span className="font-heading text-gray-800">
              {p.display_name || 'A member'} <span className="text-sm text-gray-500">(turns {p.age})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}