import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { todayISO, addDays, computeStreak } from '../lib/dates'
import { moodLevel, moodLabel } from '../lib/mood'
import { quoteOfTheDay } from '../lib/quotes'

function last7Dates(todayIso) {
  const days = []
  for (let i = 6; i >= 0; i--) days.push(addDays(todayIso, -i))
  return days
}

function weekdayLabel(iso) {
  const d = new Date(iso + 'T00:00:00')
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]
}

// Landing view. Pulls together today's tasks, a habit check-in with
// streaks, the last 7 days of mood (from Journal), this week's focus time,
// and a teaser of today's journal entry, one glance at how the day and the
// week are going. Everything here is read/write in its own module (Tasks,
// Habits, Journal, Focus), this page just assembles the view.
export default function Today({ profile, onNavigate }) {
  const today = todayISO()
  const [tasks, setTasks] = useState([])
  const [habits, setHabits] = useState([])
  const [logsByHabit, setLogsByHabit] = useState({})
  const [moodByDate, setMoodByDate] = useState({})
  const [todayEntry, setTodayEntry] = useState(null)
  const [focusToday, setFocusToday] = useState(0)
  const [focusWeek, setFocusWeek] = useState(0)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const weekAgo = addDays(today, -6)
    const [taskRes, habitRes, logRes, journalRes, focusRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, due_date, status')
        .eq('user_id', profile.id)
        .eq('status', 'todo')
        .or(`due_date.eq.${today},due_date.is.null`)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('habits')
        .select('id, name')
        .eq('user_id', profile.id)
        .eq('archived', false)
        .order('created_at', { ascending: true }),
      supabase.from('habit_logs').select('habit_id, log_date').eq('user_id', profile.id),
      supabase
        .from('journal_entries')
        .select('entry_date, mood, content')
        .eq('user_id', profile.id)
        .gte('entry_date', weekAgo),
      supabase
        .from('focus_sessions')
        .select('minutes, started_at')
        .eq('user_id', profile.id)
        .gte('started_at', weekAgo),
    ])

    setTasks(taskRes.data ?? [])
    setHabits(habitRes.data ?? [])

    const grouped = {}
    for (const row of logRes.data ?? []) {
      if (!grouped[row.habit_id]) grouped[row.habit_id] = new Set()
      grouped[row.habit_id].add(row.log_date)
    }
    setLogsByHabit(grouped)

    const moods = {}
    let todaysJournal = null
    for (const row of journalRes.data ?? []) {
      moods[row.entry_date] = row.mood
      if (row.entry_date === today) todaysJournal = row
    }
    setMoodByDate(moods)
    setTodayEntry(todaysJournal)

    let tMin = 0
    let wMin = 0
    for (const row of focusRes.data ?? []) {
      wMin += row.minutes
      if (row.started_at.slice(0, 10) === today) tMin += row.minutes
    }
    setFocusToday(tMin)
    setFocusWeek(wMin)

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function completeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase
      .from('tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function toggleHabit(habitId) {
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

  const doneCount = habits.filter((h) => (logsByHabit[h.id] ?? new Set()).has(today)).length
  const days = last7Dates(today)

  return (
    <div className="view-page">
      <div className="today-top">
        <div>
          <h1>Good to see you, {profile.display_name}</h1>
          <p className="view-subtitle">
            {loading
              ? 'Loading your day...'
              : `${tasks.length} task${tasks.length === 1 ? '' : 's'} on deck, ${doneCount}/${habits.length} habits done today.`}
          </p>
        </div>
        <div className="quote-chip">"{quoteOfTheDay()}"</div>
      </div>

      <div className="today-grid">
        <div className="card card-accent-personal">
          <div className="card-head">
            <h3>Habit check-in</h3>
            <span className="layer-tag">Personal</span>
          </div>
          {habits.length === 0 && !loading && (
            <div className="empty-hint">No habits yet. Add one from Habits.</div>
          )}
          <ul className="habit-list">
            {habits.map((h) => {
              const set = logsByHabit[h.id] ?? new Set()
              const done = set.has(today)
              const streak = computeStreak(set, today)
              return (
                <li key={h.id} className="habit-row">
                  <button className={'habit-check' + (done ? ' done' : '')} onClick={() => toggleHabit(h.id)}>
                    {done ? '✓' : ''}
                  </button>
                  <span className="habit-name">{h.name}</span>
                  {streak > 0 && <span className="streak-pill">{streak}-day</span>}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Today's tasks</h3>
          </div>
          {tasks.length === 0 && !loading && (
            <div className="empty-hint">Nothing due today. Add something from Tasks.</div>
          )}
          <ul className="task-list">
            {tasks.map((t) => (
              <li key={t.id} className="task-row">
                <button className="task-check" onClick={() => completeTask(t.id)} aria-label="Mark done">
                  ○
                </button>
                <span className="task-title">{t.title}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card card-accent-personal">
          <div className="card-head">
            <h3>Mood this week</h3>
            <span className="layer-tag">Personal</span>
          </div>
          <div className="mood-bars">
            {days.map((d) => {
              const mood = moodByDate[d]
              const level = mood ? moodLevel(mood) : 0
              return (
                <div key={d} className="mood-bar-col">
                  <div className="mood-bar" style={{ height: level ? `${level * 14 + 8}px` : '3px' }} />
                  <span>{weekdayLabel(d)}</span>
                </div>
              )
            })}
          </div>
          {!loading && Object.keys(moodByDate).length === 0 && (
            <div className="empty-hint small">Log a mood in Journal to see it here.</div>
          )}
        </div>

        <div className="card card-accent-personal">
          <div className="card-head">
            <h3>Focus time</h3>
            <span className="layer-tag">Personal</span>
          </div>
          <div className="focus-number">{focusToday}m</div>
          <div className="focus-sub">today · {focusWeek}m this week</div>
          <button className="focus-btn" onClick={() => onNavigate?.('focus')}>
            Start focus session
          </button>
        </div>

        <div className="card card-accent-personal">
          <div className="card-head">
            <h3>Journal</h3>
            <span className="layer-tag">Personal</span>
          </div>
          {todayEntry ? (
            <>
              <div className={'mood-tag mood-' + todayEntry.mood}>{moodLabel(todayEntry.mood)}</div>
              <p className="journal-snippet">{todayEntry.content}</p>
            </>
          ) : (
            <p className="journal-snippet">You haven't written today's entry yet.</p>
          )}
          <button className="subtle-btn" onClick={() => onNavigate?.('journal')}>
            {todayEntry ? "Continue today's entry →" : "Write today's entry →"}
          </button>
        </div>
      </div>
    </div>
  )
}
