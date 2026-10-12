import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

const COLORS = ['#f472b6', '#fbbf24', '#60a5fa', '#34d399', '#a78bfa', '#fb7185']

export default function BirthdayCelebration({ session }) {
  const [name, setName] = useState(null)

  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 3 + Math.random() * 3,
        size: 6 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
      })),
    []
  )

  useEffect(() => {
    if (!session?.user?.id) return
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, birth_date')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!data?.birth_date) return

      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
      const [, tm, td] = todayStr.split('-').map(Number)
      const [, bm, bd] = data.birth_date.split('-').map(Number)
      if (tm !== bm || td !== bd) return

      const key = `bday-celebrated-${session.user.id}-${todayStr}`
      try {
        if (localStorage.getItem(key)) return
        localStorage.setItem(key, '1')
      } catch (_e) {
        // storage unavailable: just show it
      }
      setName(data.display_name || 'friend')
    })()
  }, [session?.user?.id])

  if (!name) return null

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      <style>{`
        @keyframes bday-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: 2,
            animation: `bday-fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto bg-white rounded-2xl shadow-lg p-8 text-center max-w-xs">
          <p className="text-4xl mb-2">🎂</p>
          <h2 className="font-heading text-2xl text-gray-800 mb-1">Happy Birthday, {name}!</h2>
          <p className="text-sm text-gray-500 mb-4">Your Connext family is celebrating you today.</p>
          <button
            onClick={() => setName(null)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-full"
          >
            Thank you!
          </button>
        </div>
      </div>
    </div>
  )
}