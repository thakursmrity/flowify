import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Habits used to share a page with Tasks. Split out on its own because
// habits are the one tracker that stays personal-only forever, no sharing,
// no "shared with," which made it worth its own spot in the sidebar rather
// than living inside a combined "Tasks & Habits" page.

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Current streak = consecutive logged days ending today (if today is
// already logged) or ending yesterday (if today just hasn't happened yet —
// we don't want a streak to visually die the moment you wake up).
function computeStreak(logDates, today) {
  const set = new Set(logDates)
  let cursor = set.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export default function Habits({ profile }) {
  const today = todayISO()
  const [habits, setHabits] = useState([])
  const [logsByHabit, setLogsByHabit] = useState({}) // habitId -> Set of log_date
  const [loading, setLoading] = useState(true)
  const [newHabit, setNewHabit] = useState('')

  async function load() {
    setLoading(true)
    const [habitRes, logRes] = await Promise.all([
      supabase
        .from('habits')
        .select('id, name, archived')
        .eq('user_id', profile.id)
        .eq('archived', false)
        .order('created_at', { ascending: true }),
      supabase.from('habit_logs').select('habit_id, log_date').eq('user_id', profile.id),
    ])

    setHabits(habitRes.data ?? [])

    const grouped = {}
    for (const row of logRes.data ?? []) {
      if (!grouped[row.habit_id]) grouped[row.habit_id] = new Set()
      grouped[row.habit_id].add(row.log_date)
    }
    setLogsByHabit(grouped)
    setLoading(false)
  }

  useEffect(() => {
    load()
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

  return (
    <div className="view-page">
      <h1>Habits</h1>
      <p className="view-subtitle">Personal, daily, just for you, no one else ever sees this list.</p>

      <div className="card card-wide">
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
            return (
              <li key={h.id} className="habit-row">
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
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
