import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Landing view: today's tasks (due today, or with no due date, and not yet
// done) plus a quick habit check-in for today. Both lists are read/write
// here so this page is genuinely useful on its own, not just a summary.
export default function Today({ profile }) {
  const today = todayISO()
  const [tasks, setTasks] = useState([])
  const [habits, setHabits] = useState([])
  const [logsToday, setLogsToday] = useState(new Set())
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [taskRes, habitRes, logRes] = await Promise.all([
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
      supabase
        .from('habit_logs')
        .select('habit_id')
        .eq('user_id', profile.id)
        .eq('log_date', today),
    ])

    setTasks(taskRes.data ?? [])
    setHabits(habitRes.data ?? [])
    setLogsToday(new Set((logRes.data ?? []).map((l) => l.habit_id)))
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
    const done = logsToday.has(habitId)
    const next = new Set(logsToday)
    if (done) {
      next.delete(habitId)
      setLogsToday(next)
      await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('log_date', today)
    } else {
      next.add(habitId)
      setLogsToday(next)
      await supabase.from('habit_logs').insert({ habit_id: habitId, user_id: profile.id, log_date: today })
    }
  }

  const doneCount = habits.filter((h) => logsToday.has(h.id)).length

  return (
    <div className="view-page">
      <h1>Good to see you, {profile.display_name}</h1>
      <p className="view-subtitle">
        {loading
          ? 'Loading your day...'
          : `${tasks.length} task${tasks.length === 1 ? '' : 's'} on deck, ${doneCount}/${habits.length} habits done today.`}
      </p>

      <div className="today-grid">
        <div className="card">
          <div className="card-header">
            <h2>Today's tasks</h2>
          </div>
          {tasks.length === 0 && !loading && (
            <div className="empty-hint">Nothing due today. Add something from Tasks & Habits.</div>
          )}
          <ul className="task-list">
            {tasks.map((t) => (
              <li key={t.id} className="task-row">
                <button className="task-check" onClick={() => completeTask(t.id)} aria-label="Mark done">
                  ○
                </button>
                <span>{t.title}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Habit check-in</h2>
          </div>
          {habits.length === 0 && !loading && (
            <div className="empty-hint">No habits yet. Add one from Tasks & Habits.</div>
          )}
          <ul className="habit-list">
            {habits.map((h) => {
              const done = logsToday.has(h.id)
              return (
                <li key={h.id} className="habit-row">
                  <button
                    className={'habit-check' + (done ? ' done' : '')}
                    onClick={() => toggleHabit(h.id)}
                  >
                    {done ? '✓' : ''}
                  </button>
                  <span>{h.name}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
