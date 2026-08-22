import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

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

export default function TasksHabits({ profile }) {
  const today = todayISO()
  const [tasks, setTasks] = useState([])
  const [habits, setHabits] = useState([])
  const [logsByHabit, setLogsByHabit] = useState({}) // habitId -> Set of log_date
  const [loading, setLoading] = useState(true)

  const [newTask, setNewTask] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newHabit, setNewHabit] = useState('')

  async function load() {
    setLoading(true)
    const [taskRes, habitRes, logRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, due_date, status')
        .eq('user_id', profile.id)
        .order('status', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('habits')
        .select('id, name, archived')
        .eq('user_id', profile.id)
        .eq('archived', false)
        .order('created_at', { ascending: true }),
      supabase.from('habit_logs').select('habit_id, log_date').eq('user_id', profile.id),
    ])

    setTasks(taskRes.data ?? [])
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

  async function addTask(e) {
    e.preventDefault()
    const title = newTask.trim()
    if (!title) return
    const { data, error } = await supabase
      .from('tasks')
      .insert({ user_id: profile.id, title, due_date: newTaskDue || null })
      .select()
      .single()
    if (!error && data) {
      setTasks((prev) => [data, ...prev])
      setNewTask('')
      setNewTaskDue('')
    }
  }

  async function toggleTask(task) {
    const nextStatus = task.status === 'done' ? 'todo' : 'done'
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)))
    await supabase
      .from('tasks')
      .update({ status: nextStatus, completed_at: nextStatus === 'done' ? new Date().toISOString() : null })
      .eq('id', task.id)
  }

  async function deleteTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }

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

  const todoTasks = tasks.filter((t) => t.status === 'todo')
  const doneTasks = tasks.filter((t) => t.status === 'done')

  return (
    <div className="view-page">
      <h1>Tasks & Habits</h1>
      <p className="view-subtitle">Your to-do list and daily habit tracking, all in one place.</p>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h2>Tasks</h2>
          </div>
          <form className="inline-form" onSubmit={addTask}>
            <input
              type="text"
              placeholder="Add a task..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              maxLength={300}
            />
            <input
              type="date"
              value={newTaskDue}
              onChange={(e) => setNewTaskDue(e.target.value)}
              title="Due date (optional)"
            />
            <button type="submit" disabled={!newTask.trim()}>
              Add
            </button>
          </form>

          {!loading && todoTasks.length === 0 && doneTasks.length === 0 && (
            <div className="empty-hint">No tasks yet, add your first one above.</div>
          )}

          <ul className="task-list">
            {todoTasks.map((t) => (
              <li key={t.id} className="task-row">
                <button className="task-check" onClick={() => toggleTask(t)} aria-label="Mark done">
                  ○
                </button>
                <span className="task-title">
                  {t.title}
                  {t.due_date && <span className="task-due"> · due {t.due_date}</span>}
                </span>
                <button className="row-delete" onClick={() => deleteTask(t.id)} aria-label="Delete task">
                  ✕
                </button>
              </li>
            ))}
          </ul>

          {doneTasks.length > 0 && (
            <>
              <div className="subheading">Done</div>
              <ul className="task-list">
                {doneTasks.map((t) => (
                  <li key={t.id} className="task-row done">
                    <button className="task-check done" onClick={() => toggleTask(t)} aria-label="Mark not done">
                      ✓
                    </button>
                    <span className="task-title">{t.title}</span>
                    <button className="row-delete" onClick={() => deleteTask(t.id)} aria-label="Delete task">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Habits</h2>
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
    </div>
  )
}
