import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Tasks used to share a page with Habits. Split out on its own so it can grow
// into something that supports sharing a task with someone from your circle
// (a private/shared toggle, "shared with" avatars, joint progress) without
// that being tangled up with the habit tracker, which stays personal-only.
export default function Tasks({ profile }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTask, setNewTask] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('id, title, due_date, status')
      .eq('user_id', profile.id)
      .order('status', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    setTasks(data ?? [])
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

  const todoTasks = tasks.filter((t) => t.status === 'todo')
  const doneTasks = tasks.filter((t) => t.status === 'done')

  return (
    <div className="view-page">
      <h1>Tasks</h1>
      <p className="view-subtitle">Your to-do list. Sharing a task with someone from your circle is coming soon.</p>

      <div className="card card-wide">
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
    </div>
  )
}
