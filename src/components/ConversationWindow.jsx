import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

// Works for both a direct "Current" and a group "Sync" — the only real
// difference is the header, and whether sender names show above bubbles
// (group chats need them, 1:1 doesn't).
export default function ConversationWindow({ profile, conversation }) {
  const [messages, setMessages] = useState([])
  const [memberNames, setMemberNames] = useState({}) // user_id -> display_name, group chats only
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!conversation) return

    let cancelled = false
    setLoading(true)
    setError('')

    async function loadMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, content, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (error) {
        setError(error.message)
      } else {
        setMessages(data ?? [])
      }
      setLoading(false)
    }

    async function loadMemberNames() {
      if (conversation.type !== 'group') return
      const { data } = await supabase
        .from('conversation_members')
        .select('user_id, profiles:user_id ( display_name )')
        .eq('conversation_id', conversation.id)
      if (cancelled || !data) return
      const map = {}
      for (const row of data) {
        map[row.user_id] = row.profiles?.display_name ?? 'Someone'
      }
      setMemberNames(map)
    }

    loadMessages()
    loadMemberNames()

    const channel = supabase
      .channel(`messages-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const m = payload.new
          setMessages((prev) => (prev.some((existing) => existing.id === m.id) ? prev : [...prev, m]))
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [conversation])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || !conversation) return

    setSending(true)
    setError('')
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: profile.id,
      content,
    })

    if (error) {
      setError(error.message)
    } else {
      setDraft('')
    }
    setSending(false)
  }

  if (!conversation) {
    return (
      <div className="chat-window chat-empty">
        <div className="empty-hint">
          Pick a conversation on the left, open a Current with someone in your circle, or start a Sync.
        </div>
      </div>
    )
  }

  const headerLabel = conversation.type === 'direct' ? conversation.other?.display_name ?? 'Unknown' : conversation.name
  const headerSub =
    conversation.type === 'direct' ? conversation.other?.flow_id ?? '' : 'Sync'

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className={'avatar' + (conversation.type === 'group' ? ' sync' : '')}>
          {headerLabel ? headerLabel.charAt(0).toUpperCase() : '?'}
        </div>
        <div>
          <div className="contact-name">{headerLabel}</div>
          <div className="contact-id-small">{headerSub}</div>
        </div>
      </div>

      <div className="message-list">
        {loading && <div className="empty-hint">Loading conversation...</div>}
        {!loading && messages.length === 0 && <div className="empty-hint">No messages yet, say hi!</div>}
        {messages.map((m) => {
          const mine = m.sender_id === profile.id
          const senderName = conversation.type === 'group' ? memberNames[m.sender_id] : null
          return (
            <div key={m.id} className={'message-bubble' + (mine ? ' mine' : ' theirs')}>
              {!mine && senderName && <div className="message-sender">{senderName}</div>}
              <div className="message-content">{m.content}</div>
              <div className="message-time">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className="form-error small">{error}</div>}

      <form className="message-form" onSubmit={handleSend}>
        <input
          type="text"
          placeholder={`Message ${headerLabel ?? ''}...`}
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
