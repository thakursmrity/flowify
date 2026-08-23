import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { todayISO, addDays, computeStreak } from '../lib/dates'

// Habits stays personal-only to build (no joint ownership like a shared
// Goal), but you can now let someone from your circle *watch* a habit —
// read-only visibility into your streak, never editing rights. That's the
// "Supporting" tab: it flips the view around and shows you the habits
// other people have shared with you.

export default function Habits({ profile }) {
  const today = todayISO()
  const [tab, setTab] = useState('mine') // 'mine' | 'supporting'

  const [habits, setHabits] = useState([])
  const [logsByHabit, setLogsByHabit] = useState({}) // habitId -> Set of log_date
  const [sharesByHabit, setSharesByHabit] = useState({}) // habitId -> [{ shareId, contactId, name }]
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [newHabit, setNewHabit] = useState('')

  const [openShareId, setOpenShareId] = useState(null)
  const [shareChoice, setShareChoice] = useState('')

  const [supporting, setSupporting] = useState([]) // [{ ownerId, ownerName, habits: [{...}] }]
  const [supportingLoading, setSupportingLoading] = useState(true)
  const [activePersonId, setActivePersonId] = useState(null)

  async function loadMine() {
    setLoading(true)
    const [habitRes, logRes, shareRes, contactRes] = await Promise.all([
      supabase
        .from('habits')
        .select('id, name, archived')
        .eq('user_id', profile.id)
        .eq('archived', false)
        .order('created_at', { ascending: true }),
      supabase.from('habit_logs').select('habit_id, log_date').eq('user_id', profile.id),
      supabase.from('habit_shares').select('id, habit_id, shared_with_id').eq('owner_id', profile.id),
      supabase
        .from('contacts')
        .select('contact_id, profiles:contact_id ( id, display_name )')
        .eq('owner_id', profile.id),
    ])

    setHabits(habitRes.data ?? [])

    const grouped = {}
    for (const row of logRes.data ?? []) {
      if (!grouped[row.habit_id]) grouped[row.habit_id] = new Set()
      grouped[row.habit_id].add(row.log_date)
    }
    setLogsByHabit(grouped)

    const contactList = (contactRes.data ?? []).map((row) => row.profiles).filter(Boolean)
    setContacts(contactList)
    const nameById = {}
    for (const c of contactList) nameById[c.id] = c.display_name

    const shareGroups = {}
    for (const row of shareRes.data ?? []) {
      if (!shareGroups[row.habit_id]) shareGroups[row.habit_id] = []
      shareGroups[row.habit_id].push({
        shareId: row.id,
        contactId: row.shared_with_id,
        name: nameById[row.shared_with_id] ?? 'Someone',
      })
    }
    setSharesByHabit(shareGroups)

    setLoading(false)
  }

  async function loadSupporting() {
    setSupportingLoading(true)
    const { data: shareRows } = await supabase
      .from('habit_shares')
      .select('id, habit_id, owner_id')
      .eq('shared_with_id', profile.id)

    if (!shareRows || shareRows.length === 0) {
      setSupporting([])
      setSupportingLoading(false)
      return
    }

    const ownerIds = [...new Set(shareRows.map((r) => r.owner_id))]
    const habitIds = [...new Set(shareRows.map((r) => r.habit_id))]

    const [ownerRes, habitRes, logRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name').in('id', ownerIds),
      supabase.from('habits').select('id, name, user_id').in('id', habitIds),
      supabase.from('habit_logs').select('habit_id, log_date').in('habit_id', habitIds),
    ])

    const ownerName = {}
    for (const p of ownerRes.data ?? []) ownerName[p.id] = p.display_name

    const habitById = {}
    for (const h of habitRes.data ?? []) habitById[h.id] = h

    const logsByHabitId = {}
    for (const row of logRes.data ?? []) {
      if (!logsByHabitId[row.habit_id]) logsByHabitId[row.habit_id] = new Set()
      logsByHabitId[row.habit_id].add(row.log_date)
    }

    const byOwner = {}
    for (const row of shareRows) {
      const habit = habitById[row.habit_id]
      if (!habit) continue
      if (!byOwner[row.owner_id]) {
        byOwner[row.owner_id] = { ownerId: row.owner_id, ownerName: ownerName[row.owner_id] ?? 'Someone', habits: [] }
      }
      const set = logsByHabitId[row.habit_id] ?? new Set()
      const last14 = []
      for (let i = 13; i >= 0; i -= 1) {
        const d = addDays(today, -i)
        last14.push({ date: d, on: set.has(d) })
      }
      const checkinRate = Math.round((last14.filter((d) => d.on).length / 14) * 100)
      byOwner[row.owner_id].habits.push({
        id: habit.id,
        name: habit.name,
        streak: computeStreak(set, today),
        heatmap: last14,
        checkinRate,
      })
    }

    const list = Object.values(byOwner)
    setSupporting(list)
    setActivePersonId((prev) => prev ?? list[0]?.ownerId ?? null)
    setSupportingLoading(false)
  }

  useEffect(() => {
    loadMine()
    loadSupporting()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function addHabit(e) {
    e.preventDefault()
    const name = newHabit.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('habits')
      .insert({ user_id: profile.id, name })
      .select()
      .single()
    if (!error && data) {
      setHabits((prev) => [...prev, data])
      setNewHabit('')
    }
  }

  async function toggleHabitToday(habitId) {
    const set = logsByHabit[habitId] ?? new Set()
    const done = set.has(today)
    const nextSet = new Set(set)
    if (done) {
      nextSet.delete(today)
      await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('log_date', today)
    } else {
      nextSet.add(today)
      await supabase.from('habit_logs').insert({ habit_id: habitId, user_id: profile.id, log_date: today })
    }
    setLogsByHabit((prev) => ({ ...prev, [habitId]: nextSet }))
  }

  async function archiveHabit(id) {
    setHabits((prev) => prev.filter((h) => h.id !== id))
    await supabase.from('habits').update({ archived: true }).eq('id', id)
  }

  function toggleSharePanel(habitId) {
    setOpenShareId((prev) => (prev === habitId ? null : habitId))
    setShareChoice('')
  }

  async function confirmShare(habitId) {
    if (!shareChoice) return
    const { data, error } = await supabase
      .from('habit_shares')
      .insert({ habit_id: habitId, owner_id: profile.id, shared_with_id: shareChoice })
      .select()
      .single()
    if (!error && data) {
      const contact = contacts.find((c) => c.id === shareChoice)
      setSharesByHabit((prev) => ({
        ...prev,
        [habitId]: [...(prev[habitId] ?? []), { shareId: data.id, contactId: shareChoice, name: contact?.display_name ?? 'Someone' }],
      }))
    }
    setOpenShareId(null)
    setShareChoice('')
  }

  async function unshareHabit(habitId, shareId) {
    setSharesByHabit((prev) => ({
      ...prev,
      [habitId]: (prev[habitId] ?? []).filter((s) => s.shareId !== shareId),
    }))
    await supabase.from('habit_shares').delete().eq('id', shareId)
  }

  const activePerson = supporting.find((p) => p.ownerId === activePersonId) ?? supporting[0] ?? null

  return (
    <div className="view-page">
      <h1>Habits</h1>
      <p className="view-subtitle">Yours to build. Share one to let someone watch your streak, read-only.</p>

      <div className="tab-row">
        <button className={'tab-btn' + (tab === 'mine' ? ' active' : '')} onClick={() => setTab('mine')}>
          My habits
        </button>
        <button className={'tab-btn' + (tab === 'supporting' ? ' active' : '')} onClick={() => setTab('supporting')}>
          Supporting
        </button>
      </div>

      {tab === 'mine' && (
        <div className="card card-wide card-accent-personal">
          <div className="card-head">
            <h3>Your habits</h3>
            <span className="layer-tag">Personal</span>
          </div>
          <form className="inline-form" onSubmit={addHabit}>
            <input
              type="text"
              placeholder="Add a habit..."
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              maxLength={200}
            />
            <button type="submit" disabled={!newHabit.trim()}>
              Add
            </button>
          </form>

          {!loading && habits.length === 0 && (
            <div className="empty-hint">No habits yet, add one you want to build above.</div>
          )}

          <ul className="habit-list">
            {habits.map((h) => {
              const set = logsByHabit[h.id] ?? new Set()
              const done = set.has(today)
              const streak = computeStreak(set, today)
              const watchers = sharesByHabit[h.id] ?? []
              const availableContacts = contacts.filter((c) => !watchers.some((w) => w.contactId === c.id))
              return (
                <li key={h.id} className="habit-row-block">
                  <div className="habit-row">
                    <button
                      className={'habit-check' + (done ? ' done' : '')}
                      onClick={() => toggleHabitToday(h.id)}
                    >
                      {done ? '✓' : ''}
                    </button>
                    <span className="habit-name">{h.name}</span>
                    {streak > 0 && <span className="streak-pill">{streak}-day streak</span>}
                    <button className="row-delete" onClick={() => archiveHabit(h.id)} aria-label="Archive habit">
                      ✕
                    </button>
                  </div>

                  <div className="habit-share-row">
                    {watchers.map((w) => (
                      <span key={w.shareId} className="watch-chip">
                        <span className="watch-dot" aria-hidden="true">
                          ◉
                        </span>
                        {w.name} watching
                        <button
                          className="watch-remove"
                          onClick={() => unshareHabit(h.id, w.shareId)}
                          aria-label={`Stop sharing with ${w.name}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}

                    {openShareId === h.id ? (
                      availableContacts.length > 0 ? (
                        <span className="share-panel">
                          <select value={shareChoice} onChange={(e) => setShareChoice(e.target.value)}>
                            <option value="">Choose from your circle...</option>
                            {availableContacts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.display_name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="share-confirm"
                            disabled={!shareChoice}
                            onClick={() => confirmShare(h.id)}
                          >
                            Add
                          </button>
                          <button className="share-cancel" onClick={() => toggleSharePanel(h.id)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="share-panel">
                          <span className="empty-hint small">
                            Everyone in your circle is already watching this, or your circle is empty. Add
                            someone from Messages first.
                          </span>
                          <button className="share-cancel" onClick={() => toggleSharePanel(h.id)}>
                            Close
                          </button>
                        </span>
                      )
                    ) : (
                      <button className="share-btn" onClick={() => toggleSharePanel(h.id)}>
                        + Share
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {tab === 'supporting' && (
        <div className="card card-wide card-accent-shared">
          <div className="card-head">
            <h3>Habits shared with you</h3>
            <span className="layer-tag layer-tag-shared">Read-only</span>
          </div>

          {!supportingLoading && supporting.length === 0 && (
            <div className="empty-hint">
              No one has shared a habit with you yet. When they do, their streak shows up here.
            </div>
          )}

          {supporting.length > 0 && (
            <>
              <div className="person-switcher">
                {supporting.map((p) => (
                  <button
                    key={p.ownerId}
                    className={'person-chip' + (activePerson?.ownerId === p.ownerId ? ' active' : '')}
                    onClick={() => setActivePersonId(p.ownerId)}
                  >
                    {p.ownerName}
                  </button>
                ))}
              </div>

              {activePerson && (
                <div className="support-person-card">
                  <div className="support-person-head">
                    <span className="support-person-name">{activePerson.ownerName}</span>
                    <span className="readonly-note">Read-only</span>
                  </div>

                  {activePerson.habits.map((h) => (
                    <div key={h.id} className="supported-habit">
                      <div className="supported-habit-head">
                        <span className="supported-habit-name">{h.name}</span>
                        {h.streak > 0 && <span className="streak-pill">{h.streak}-day streak</span>}
                      </div>
                      <div className="heatmap">
                        {h.heatmap.map((day) => (
                          <span key={day.date} className={'hm-cell' + (day.on ? ' on' : '')} title={day.date} />
                        ))}
                      </div>
                      <div className="checkin-rate">{h.checkinRate}% of the last 14 days</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
