import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

// Right-hand pane: shows the message history between the signed-in user and
// whichever contact is selected, a box to send a new message, and a
// Supabase Realtime subscription so both sides see new messages instantly.
export default function ChatWindow({ profile, contact }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!contact) return

    let cancelled = false
    setLoading(true)
    setError('')

    // Load the existing conversation: any message sent by me to them, or by
    // them to me.
    async function loadMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, created_at')
        .or(
          `and(sender_id.eq.${profile.id},receiver_id.eq.${contact.id}),` +
            `and(sender_id.eq.${contact.id},receiver_id.eq.${profile.id})`
        )
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (error) {
        setError(error.message)
      } else {
        setMessages(data ?? [])
      }
      setLoading(false)
    }

    loadMessages()

    // Subscribe to new inserts and add anything that belongs to this
    // conversation to the list live.
    const channel = supabase
      .channel(`messages-${profile.id}-${contact.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new
          const belongsToThisChat =
            (m.sender_id === profile.id && m.receiver_id === contact.id) ||
            (m.sender_id === contact.id && m.receiver_id === profile.id)
          if (belongsToThisChat) {
            setMessages((prev) => (prev.some((existing) => existing.id === m.id) ? prev : [...prev, m]))
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [profile.id, contact])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || !contact) return

    setSending(true)
    setError('')
    const { error } = await supabase.from('messages').insert({
      sender_id: profile.id,
      receiver_id: contact.id,
      content,
    })

    if (error) {
      setError(error.message)
    } else {
      setDraft('')
    }
    setSending(false)
  }

  if (!contact) {
    return (
      <div className="chat-window chat-empty">
        <div className="empty-hint">Pick a contact on the left, or add someone by their Tend ID to start chatting.</div>
      </div>
    )
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="avatar">{contact.display_name.charAt(0).toUpperCase()}</div>
        <div>
          <div className="contact-name">{contact.display_name}</div>
          <div className="contact-id-small">{contact.tend_id}</div>
        </div>
      </div>

      <div className="message-list">
        {loading && <div className="empty-hint">Loading conversation...</div>}
        {!loading && messages.length === 0 && (
          <div className="empty-hint">No messages yet — say hi!</div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={'message-bubble' + (m.sender_id === profile.id ? ' mine' : ' theirs')}
          >
            <div className="message-content">{m.content}</div>
            <div className="message-time">
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="form-error small">{error}</div>}

      <form className="message-form" onSubmit={handleSend}>
        <input
          type="text"
          placeholder={`Message ${contact.display_name}...`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
