import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

// FloatingBubbles renders each server member's avatar as a physics-bounced
// circle behind the Home page content. On load, every bubble starts OFF
// SCREEN past a random edge and flies in fast; once it actually arrives
// inside the visible area it "enters" and downshifts to a slow drift,
// bouncing off walls and other bubbles — and can never leave again.
// Clicking a bubble opens a popup to send that person a prayer notification.
function FloatingBubbles({ selectedServer, currentUserId, currentUserName }) {
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [prayerText, setPrayerText] = useState('')
  const [sentMessage, setSentMessage] = useState('')

  const containerRef = useRef(null)
  const bubbleRefs = useRef([])
  const physicsRef = useRef([])

  useEffect(() => {
    if (!selectedServer) return

    const fetchMembers = async () => {
      const { data: memberRows } = await supabase
        .from('server_members')
        .select('user_id')
        .eq('server_id', selectedServer.id)

      const userIds = (memberRows || []).map((m) => m.user_id).filter((id) => id !== currentUserId)
      if (userIds.length === 0) {
        setMembers([])
        return
      }

      const { data: profileRows } = await supabase
        .from('profiles')
        .select('user_id, avatar_url, display_name')
        .in('user_id', userIds)

      setMembers(
        (profileRows || []).map((p) => ({
          ...p,
          size: 40 + Math.random() * 40,
        }))
      )
    }
    fetchMembers()
  }, [selectedServer, currentUserId])

  // useLayoutEffect runs synchronously right after DOM updates but BEFORE the
  // browser paints anything. We compute each bubble's off-screen starting
  // position and write it directly to the DOM in this same tick, so the very
  // first paint already shows bubbles outside the visible area — no flash.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || members.length === 0) return

    const bounds = container.getBoundingClientRect()

    const takenSpots = [] // landing spots already claimed, so we can space new ones apart from them

    physicsRef.current = members.map((m) => {
      const diameter = m.size

      // Try a handful of random landing spots and keep the first one that's not
      // too close to an already-claimed spot — this means bubbles arrive already
      // spread out, instead of needing a sudden correction once they land.
      let landingX, landingY
      for (let attempt = 0; attempt < 30; attempt++) {
        const candidateX = Math.random() * (bounds.width - diameter)
        const candidateY = Math.random() * (bounds.height - diameter)
        const tooClose = takenSpots.some((spot) => {
          const dx = candidateX - spot.x
          const dy = candidateY - spot.y
          return Math.sqrt(dx * dx + dy * dy) < (diameter / 2 + spot.radius + 10)
        })
        if (!tooClose) {
          landingX = candidateX
          landingY = candidateY
          break
        }
        // Last attempt: just accept whatever we've got rather than looping forever
        landingX = candidateX
        landingY = candidateY
      }
      takenSpots.push({ x: landingX, y: landingY, radius: diameter / 2 })

      const edge = Math.floor(Math.random() * 4)
      let startX, startY
      if (edge === 0) { startX = -diameter * 2; startY = Math.random() * bounds.height }
      else if (edge === 1) { startX = bounds.width + diameter * 2; startY = Math.random() * bounds.height }
      else if (edge === 2) { startX = Math.random() * bounds.width; startY = -diameter * 2 }
      else { startX = Math.random() * bounds.width; startY = bounds.height + diameter * 2 }

      const dx = landingX - startX
      const dy = landingY - startY
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const driftSpeed = 0.3 + Math.random() * 0.3 // same slow speed used for settled bouncing

      return {
        x: startX,
        y: startY,
        vx: (dx / dist) * driftSpeed,
        vy: (dy / dist) * driftSpeed,
        radius: diameter / 2,
        entered: false,
      }
    })

    physicsRef.current.forEach((b, index) => {
      const node = bubbleRefs.current[index]
      if (node) node.style.transform = `translate(${b.x}px, ${b.y}px)`
    })
  }, [members])

  useEffect(() => {
    if (members.length === 0) return
    let animationFrameId

    const step = () => {
      const container = containerRef.current
      const bodies = physicsRef.current
      if (container && bodies.length > 0) {
        const bounds = container.getBoundingClientRect()

        bodies.forEach((b) => {
          b.x += b.vx
          b.y += b.vy

          if (!b.entered) {
            const insideX = b.x >= 0 && b.x + b.radius * 2 <= bounds.width
            const insideY = b.y >= 0 && b.y + b.radius * 2 <= bounds.height
            if (insideX && insideY) {
              b.entered = true
            }
            return
          }

          if (b.x <= 0) { b.vx = Math.abs(b.vx); b.x = 0 }
          if (b.x + b.radius * 2 >= bounds.width) { b.vx = -Math.abs(b.vx); b.x = bounds.width - b.radius * 2 }
          if (b.y <= 0) { b.vy = Math.abs(b.vy); b.y = 0 }
          if (b.y + b.radius * 2 >= bounds.height) { b.vy = -Math.abs(b.vy); b.y = bounds.height - b.radius * 2 }
        })

        for (let i = 0; i < bodies.length; i++) {
          for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i]
            const b = bodies[j]
            const dx = (b.x + b.radius) - (a.x + a.radius)
            const dy = (b.y + b.radius) - (a.y + a.radius)
            const dist = Math.sqrt(dx * dx + dy * dy)
            const minDist = a.radius + b.radius

            if (dist < minDist && dist > 0) {
              const nx = dx / dist
              const ny = dy / dist

              // GENTLE, gradual separation: only nudge apart by a small fraction of
              // the overlap each frame, rather than fully resolving it in one frame.
              // Over several frames this smoothly drifts them apart instead of
              // snapping — and since it runs every frame, they settle into a
              // stable non-overlapping distance and stay there.
              const overlap = minDist - dist
              const nudge = overlap * 0.08
              a.x -= nx * nudge
              a.y -= ny * nudge
              b.x += nx * nudge
              b.y += ny * nudge

              const avn = a.vx * nx + a.vy * ny
              const bvn = b.vx * nx + b.vy * ny
              a.vx += (bvn - avn) * nx
              a.vy += (bvn - avn) * ny
              b.vx += (avn - bvn) * nx
              b.vy += (avn - bvn) * ny
            }
          }
        }

        bodies.forEach((b, index) => {
          const node = bubbleRefs.current[index]
          if (node) node.style.transform = `translate(${b.x}px, ${b.y}px)`
        })
      }

      animationFrameId = requestAnimationFrame(step)
    }

    animationFrameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animationFrameId)
  }, [members])

  const handleSendPrayer = async (e) => {
    e.preventDefault()
    if (!prayerText.trim() || !selectedMember) return

    await supabase.from('notifications').insert({
      recipient_id: selectedMember.user_id,
      sender_id: currentUserId,
      type: 'prayer',
      content: `${currentUserName || 'Someone'} sent you a note: "${prayerText.trim()}"`,
    })

    setSentMessage('Note sent!')
    setPrayerText('')
    setTimeout(() => {
      setSelectedMember(null)
      setSentMessage('')
    }, 1200)
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      {members.map((m, index) => (
        <button
          key={m.user_id}
          ref={(el) => (bubbleRefs.current[index] = el)}
          onClick={() => setSelectedMember(m)}
          title={`Send ${m.display_name || 'this member'} a note`}
          className="absolute top-0 left-0 pointer-events-auto rounded-full overflow-hidden shadow-md"
          style={{ width: m.size, height: m.size }}
        >
          {m.avatar_url ? (
            <img src={m.avatar_url} alt={m.display_name || 'Member'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-indigo-300 flex items-center justify-center text-white font-bold">
              {m.display_name?.[0] || '?'}
            </div>
          )}
        </button>
      ))}

      {selectedMember && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 pointer-events-auto"
          onClick={() => setSelectedMember(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg shadow-lg w-80 p-5">
            <div className="flex items-center gap-3 mb-3">
              {selectedMember.avatar_url ? (
                <img src={selectedMember.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-300" />
              )}
              <p className="font-semibold text-sm">Send a short note to {selectedMember.display_name || 'this member'}</p>
            </div>

            {sentMessage ? (
              <p className="text-sm text-green-600 text-center py-4">{sentMessage}</p>
            ) : (
              <form onSubmit={handleSendPrayer}>
                <textarea
                  autoFocus
                  value={prayerText}
                  onChange={(e) => setPrayerText(e.target.value)}
                  placeholder="Write a short prayer or encouragement..."
                  rows={3}
                  className="w-full border rounded p-2 text-sm resize-none mb-3"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setSelectedMember(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
                    Cancel
                  </button>
                  <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
                    Send
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default FloatingBubbles