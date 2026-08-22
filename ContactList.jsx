import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Left sidebar: shows the signed-in user's own Tend ID (so others can add
// them), a field to add someone else by their ID, and the resulting contact
// list. Clicking a contact opens that conversation.
export default function ContactList({ profile, activeContact, onSelectContact, onSignOut }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [addId, setAddId] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function loadContacts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('contacts')
      .select('contact_id, profiles:contact_id ( id, display_name, tend_id )')
      .eq('owner_id', profile.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setContacts(data.map((row) => row.profiles).filter(Boolean))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadContacts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function handleAdd(e) {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)

    const { error } = await supabase.rpc('add_contact', { target_tend_id: addId.trim() })

    if (error) {
      setAddError(error.message)
    } else {
      setAddId('')
      await loadContacts()
    }
    setAddLoading(false)
  }

  function copyId() {
    navigator.clipboard?.writeText(profile.tend_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div>
          <div className="app-name">Tend Chat</div>
          <div className="my-name">{profile.display_name}</div>
        </div>
        <button className="link-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      <div className="my-id-row" onClick={copyId} title="Click to copy">
        <span>Your ID</span>
        <strong>{profile.tend_id}</strong>
        {copied && <span className="copied-pill">Copied</span>}
      </div>

      <form className="add-contact-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Add someone by their Tend ID"
          value={addId}
          onChange={(e) => setAddId(e.target.value)}
        />
        <button type="submit" disabled={addLoading || !addId.trim()}>
          Add
        </button>
      </form>
      {addError && <div className="form-error small">{addError}</div>}

      <div className="contact-list">
        {loading && <div className="empty-hint">Loading...</div>}
        {!loading && contacts.length === 0 && (
          <div className="empty-hint">No contacts yet — add someone by their Tend ID above.</div>
        )}
        {contacts.map((c) => (
          <div
            key={c.id}
            className={'contact-row' + (activeContact?.id === c.id ? ' active' : '')}
            onClick={() => onSelectContact(c)}
          >
            <div className="avatar">{c.display_name.charAt(0).toUpperCase()}</div>
            <div className="contact-name">{c.display_name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
