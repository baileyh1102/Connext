import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// PollMessage renders a poll attached to a chat message: voting options
// until the current user votes, then live results (bars + percentages).
// Realtime keeps vote counts fresh as other people vote too.
function PollMessage({ messageId, currentUserId }) {
  const [poll, setPoll] = useState(null)
  const [options, setOptions] = useState([])
  const [votes, setVotes] = useState([])
  const [myVoteOptionIds, setMyVoteOptionIds] = useState([])

  useEffect(() => {
    const fetchPoll = async () => {
      const { data: pollRow } = await supabase.from('polls').select('*').eq('message_id', messageId).maybeSingle()
      if (!pollRow) return
      setPoll(pollRow)

      const { data: optionRows } = await supabase
        .from('poll_options')
        .select('*')
        .eq('poll_id', pollRow.id)
        .order('position', { ascending: true })
      setOptions(optionRows || [])

      const optionIds = (optionRows || []).map((o) => o.id)
      if (optionIds.length > 0) {
        const { data: voteRows } = await supabase.from('poll_votes').select('*').in('poll_option_id', optionIds)
        setVotes(voteRows || [])
        setMyVoteOptionIds((voteRows || []).filter((v) => v.user_id === currentUserId).map((v) => v.poll_option_id))
      }
    }
    fetchPoll()

    const channel = supabase
      .channel(`poll-votes-${messageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, fetchPoll)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [messageId, currentUserId])

  if (!poll) return null

  const hasVoted = myVoteOptionIds.length > 0
  const totalVotes = votes.length

  const handleVote = async (optionId) => {
    if (poll.allow_multiple) {
      if (myVoteOptionIds.includes(optionId)) {
        await supabase.from('poll_votes').delete().eq('poll_option_id', optionId).eq('user_id', currentUserId)
      } else {
        await supabase.from('poll_votes').insert({ poll_option_id: optionId, user_id: currentUserId })
      }
    } else {
      const otherOptionIds = options.map((o) => o.id).filter((id) => id !== optionId)
      if (otherOptionIds.length > 0) {
        await supabase.from('poll_votes').delete().in('poll_option_id', otherOptionIds).eq('user_id', currentUserId)
      }
      if (!myVoteOptionIds.includes(optionId)) {
        await supabase.from('poll_votes').insert({ poll_option_id: optionId, user_id: currentUserId })
      }
    }
  }

  const countFor = (optionId) => votes.filter((v) => v.poll_option_id === optionId).length

  return (
    <div className="bg-white border rounded-lg p-3 mt-1 w-72">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Poll Created</p>
      <p className="text-sm font-semibold mb-2">{poll.question}</p>
      {poll.allow_multiple && (
        <p className="text-xs text-gray-400 mb-2">Select one or more</p>
      )}

      <div className="space-y-1.5">
        {options.map((opt) => {
          const count = countFor(opt.id)
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const isMine = myVoteOptionIds.includes(opt.id)

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              className="w-full text-left relative"
            >
              {hasVoted ? (
                <div className="relative border rounded overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 ${isMine ? 'bg-blue-100' : 'bg-gray-100'}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex justify-between px-2 py-1.5 text-sm">
                    <span className={isMine ? 'font-medium text-blue-700' : 'text-gray-700'}>
                      {isMine && '✓ '}{opt.option_text}
                    </span>
                    <span className="text-gray-500">{pct}%</span>
                  </div>
                </div>
              ) : (
                <div className="border rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  {opt.option_text}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-2">{totalVotes} vote{totalVotes === 1 ? '' : 's'}</p>
    </div>
  )
}

export default PollMessage