import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Goals({ profile }) {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [newTarget, setNewTarget] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('goals')
      .select('id, title, notes, target_date, status')
      .eq('user_id', profile.id)
      .order('status', { ascending: true })
      .order('target_date', { ascending: true, nullsFirst: false })
    setGoals(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function addGoal(e) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    const { data, error } = await supabase
      .from('goals')
      .insert({ user_id: profile.id, title, target_date: newTarget || null })
      .select()
      .single()
    if (!error && data) {
      setGoals((prev) => [...prev, data])
      setNewTitle('')
      setNewTarget('')
    }
  }

  async function toggleGoal(goal) {
    const nextStatus = goal.status === 'done' ? 'active' : 'done'
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, status: nextStatus } : g)))
    await supabase.from('goals').update({ status: nextStatus }).eq('id', goal.id)
  }

  async function deleteGoal(id) {
    setGoals((prev) => prev.filter((g) => g.id !== id))
    await supabase.from('goals').delete().eq('id', id)
  }

  const active = goals.filter((g) => g.status === 'active')
  const done = goals.filter((g) => g.status === 'done')

  return (
    <div className="view-page">
      <h1>Goals</h1>
      <p className="view-subtitle">The bigger things your tasks are building toward.</p>

      <div className="card">
        <form className="inline-form" onSubmit={addGoal}>
          <input
            type="text"
            placeholder="Add a goal..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={300}
          />
          <input
            type="date"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            title="Target date (optional)"
          />
          <button type="submit" disabled={!newTitle.trim()}>
            Add
          </button>
        </form>

        {!loading && goals.length === 0 && (
          <div className="empty-hint">No goals yet, add the first thing you're working toward.</div>
        )}

        <ul className="goal-list">
          {active.map((g) => (
            <li key={g.id} className="goal-row">
              <button className="task-check" onClick={() => toggleGoal(g)} aria-label="Mark achieved">
                ○
              </button>
              <span className="goal-title">
                {g.title}
                {g.target_date && <span className="task-due"> · by {g.target_date}</span>}
              </span>
              <button className="row-delete" onClick={() => deleteGoal(g.id)} aria-label="Delete goal">
                ✕
              </button>
            </li>
          ))}
        </ul>

        {done.length > 0 && (
          <>
            <div className="subheading">Achieved</div>
            <ul className="goal-list">
              {done.map((g) => (
                <li key={g.id} className="goal-row done">
                  <button className="task-check done" onClick={() => toggleGoal(g)} aria-label="Mark active">
                    ✓
                  </button>
                  <span className="goal-title">{g.title}</span>
                  <button className="row-delete" onClick={() => deleteGoal(g.id)} aria-label="Delete goal">
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
