import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import ConversationWindow from './ConversationWindow'

// Everything messaging-related lives under one view: your circle (add people
// by Flow ID), your list of open Currents (1:1) and Syncs (groups), a way to
// start new ones, and the conversation window itself.
export default function MessagesPanel({ profile }) {
  const [contacts, setContacts] = useState([])
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null) // { id, type, name, other }

  const [addId, setAddId] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [showNewSync, setShowNewSync] = useState(false)
  const [syncName, setSyncName] = useState('')
  const [syncMembers, setSyncMembers] = useState(new Set())
  const [syncError, setSyncError] = useState('')
  const [syncLoading, setSyncLoading] = useState(false)

  async function loadContacts() {
    const { data } = await supabase
      .from('contacts')
      .select('contact_id, profiles:contact_id ( id, display_name, flow_id )')
      .eq('owner_id', profile.id)
      .order('created_at', { ascending: false })
    setContacts((data ?? []).map((row) => row.profiles).filter(Boolean))
  }

  async function loadConversations() {
    const { data: memberRows } = await supabase
      .from('conversation_members')
      .select('conversation_id, conversations ( id, type, name, created_at )')
      .eq('user_id', profile.id)

    const convos = (memberRows ?? []).map((r) => r.conversations).filter(Boolean)
    const directIds = convos.filter((c) => c.type === 'direct').map((c) => c.id)

    const otherByConv = {}
    if (directIds.length > 0) {
      const { data: others } = await supabase
        .from('conversation_members')
        .select('conversation_id, profiles:user_id ( id, display_name, flow_id )')
        .in('conversation_id', directIds)
        .neq('user_id', profile.id)
      for (const row of others ?? []) {
        otherByConv[row.conversation_id] = row.profiles
      }
    }

    const enriched = convos
      .map((c) => ({ ...c, other: c.type === 'direct' ? otherByConv[c.id] ?? null : null }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    setConversations(enriched)
  }

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadContacts(), loadConversations()])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  function copyId() {
    navigator.clipboard?.writeText(profile.flow_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleAddContact(e) {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)
    const { error } = await supabase.rpc('add_contact', { target_flow_id: addId.trim() })
    if (error) {
      setAddError(error.message)
    } else {
      setAddId('')
      await loadContacts()
    }
    setAddLoading(false)
  }

  async function openCurrent(contact) {
    const { data, error } = await supabase.rpc('start_direct_conversation', {
      other_flow_id: contact.flow_id,
    })
    if (error) {
      setAddError(error.message)
      return
    }
    await loadConversations()
    setActive({ id: data, type: 'direct', other: contact })
  }

  function toggleSyncMember(id) {
    setSyncMembers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createSync(e) {
    e.preventDefault()
    setSyncError('')
    if (syncMembers.size === 0) {
      setSyncError('Pick at least one person.')
      return
    }
    setSyncLoading(true)
    const memberFlowIds = contacts.filter((c) => syncMembers.has(c.id)).map((c) => c.flow_id)
    const { data, error } = await supabase.rpc('create_group_conversation', {
      group_name: syncName.trim(),
      member_flow_ids: memberFlowIds,
    })
    if (error) {
      setSyncError(error.message)
      setSyncLoading(false)
      return
    }
    await loadConversations()
    setActive({ id: data, type: 'group', name: syncName.trim() })
    setShowNewSync(false)
    setSyncName('')
    setSyncMembers(new Set())
    setSyncLoading(false)
  }

  return (
    <div className="messages-shell">
      <div className="messages-sidebar">
        <div className="my-id-row" onClick={copyId} title="Click to copy">
          <span>Your Flow ID</span>
          <strong>{profile.flow_id}</strong>
          {copied && <span className="copied-pill">Copied</span>}
        </div>

        <form className="add-contact-form" onSubmit={handleAddContact}>
          <input
            type="text"
            placeholder="Add someone by their Flow ID"
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
          />
          <button type="submit" disabled={addLoading || !addId.trim()}>
            Add
          </button>
        </form>
        {addError && <div className="form-error small">{addError}</div>}

        <div className="messages-section-label">
          Conversations
          <button className="link-button small" onClick={() => setShowNewSync((v) => !v)}>
            + New Sync
          </button>
        </div>

        {showNewSync && (
          <form className="new-sync-form" onSubmit={createSync}>
            <input
              type="text"
              placeholder="Sync name"
              value={syncName}
              onChange={(e) => setSyncName(e.target.value)}
              maxLength={100}
            />
            <div className="new-sync-members">
              {contacts.length === 0 && <div className="empty-hint small">Add contacts first.</div>}
              {contacts.map((c) => (
                <label key={c.id} className="new-sync-member">
                  <input
                    type="checkbox"
                    checked={syncMembers.has(c.id)}
                    onChange={() => toggleSyncMember(c.id)}
                  />
                  {c.display_name}
                </label>
              ))}
            </div>
            {syncError && <div className="form-error small">{syncError}</div>}
            <button type="submit" disabled={syncLoading || !syncName.trim()}>
              {syncLoading ? 'Creating...' : 'Create Sync'}
            </button>
          </form>
        )}

        <div className="conversation-list">
          {loading && <div className="empty-hint">Loading...</div>}
          {!loading && conversations.length === 0 && (
            <div className="empty-hint">No conversations yet, start a Current below.</div>
          )}
          {conversations.map((c) => {
            const label = c.type === 'direct' ? c.other?.display_name ?? 'Unknown' : c.name
            const kind = c.type === 'direct' ? 'Current' : 'Sync'
            return (
              <div
                key={c.id}
                className={'contact-row' + (active?.id === c.id ? ' active' : '')}
                onClick={() => setActive({ ...c, other: c.other })}
              >
                <div className={'avatar' + (c.type === 'group' ? ' sync' : '')}>
                  {label ? label.charAt(0).toUpperCase() : '?'}
                </div>
                <div>
                  <div className="contact-name">{label}</div>
                  <div className="conversation-kind">{kind}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="messages-section-label">Your circle</div>
        <div className="contact-list">
          {!loading && contacts.length === 0 && (
            <div className="empty-hint">No one yet, add someone by their Flow ID above.</div>
          )}
          {contacts.map((c) => (
            <div key={c.id} className="contact-row" onClick={() => openCurrent(c)}>
              <div className="avatar">{c.display_name.charAt(0).toUpperCase()}</div>
              <div className="contact-name">{c.display_name}</div>
            </div>
          ))}
        </div>
      </div>

      <ConversationWindow profile={profile} conversation={active} />
    </div>
  )
}
