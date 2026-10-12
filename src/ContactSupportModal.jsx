import { useState } from 'react'
import { supabase } from './supabaseClient'

// ContactSupportModal lets any user send a support message, which arrives as
// a notification in every admin's bell (rather than an email) — reusing the
// notification system already built for prayers/birthdays/etc.
function ContactSupportModal({ session, senderName, onClose }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)

    const { data: admins } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('is_admin', true)

    if (admins && admins.length > 0) {
      await supabase.from('notifications').insert(
        admins.map((admin) => ({
          recipient_id: admin.user_id,
          sender_id: session.user.id,
          type: 'support',
          content: `Support request from ${senderName || session.user.email}: "${message.trim()}"`,
        }))
      )
    }

    setSent(true)
    setSending(false)
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg shadow-lg w-96 p-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold">Contact Support</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {sent ? (
          <p className="text-sm text-green-600 text-center py-6">Sent! We'll get back to you soon.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-gray-500 mb-3">
              Describe your issue or question — this goes straight to the app admins. Be sure to include a form of contact (e.g. email or phone number) so we can get back to you with any questions.
            </p>
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's going on?"
              rows={5}
              className="w-full border rounded p-2 text-sm resize-none mb-3"
            />
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="w-full bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default ContactSupportModal