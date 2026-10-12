import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function DailyVerseCard() {
  const [verse, setVerse] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('daily_verse')
        .select('*')
        .order('verse_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) setFailed(true)
      else setVerse(data)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (failed || !verse) return null

  return (
    <div className="pointer-events-auto bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">Verse of the Day</p>
      <p className="font-heading text-lg text-gray-800 leading-snug">“{verse.verse_text}”</p>
      <p className="text-sm font-semibold text-blue-800 mt-2">
        {verse.reference}
      </p>
      <p className="text-[10px] text-gray-400 mt-2">
        Powered by{' '}
        <a href="https://www.ourmanna.com/" target="_blank" rel="noreferrer" className="underline">
          OurManna.com
        </a>
      </p>
    </div>
  )
}