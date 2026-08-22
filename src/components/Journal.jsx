import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { todayISO } from '../lib/dates'
import { MOOD_OPTIONS, moodLabel } from '../lib/mood'

// One entry per day, upserted as you keep editing it. The mood you tag here
// is what feeds the "Mood this week" graph on Today, that's the whole
// reason mood is a fixed small vocabulary instead of free text.
export default function Journal({ profile }) {
  const today = todayISO()
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedJustNow, setSavedJustNow] = useState(false)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('journal_entries')
      .select('id, entry_date, content, mood, created_at')
      .eq('user_id', profile.id)
      .order('entry_date', { ascending: false })
      .limit(14)
    const rows = data ?? []
    setEntries(rows)
    const todays = rows.find((e) => e.entry_date === today)
    if (todays) {
      setContent(todays.content)
      setMood(todays.mood)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function save(e) {
    e.preventDefault()
    if (!content.trim() || !mood) return
    setSaving(true)
    const { data, error } = await supabase
      .from('journal_entries')
      .upsert(
        { user_id: profile.id, entry_date: today, content: content.trim(), mood },
        { onConflict: 'user_id,entry_date' }
      )
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setEntries((prev) => [data, ...prev.filter((e) => e.entry_date !== today)])
      setSavedJustNow(true)
      setTimeout(() => setSavedJustNow(false), 3000)
    }
  }

  const pastEntries = entries.filter((e) => e.entry_date !== today)

  return (
    <div className="view-page">
      <h1>Journal</h1>
      <p className="view-subtitle">
        A private daily entry, just for you. Tag your mood and it feeds the graph on Today.
      </p>

      <div className="card card-wide card-accent-personal">
        <div className="card-head">
          <h3>Today's entry</h3>
          <span className="layer-tag">Personal</span>
        </div>
        <form onSubmit={save}>
          <div className="mood-picker">
            {MOOD_OPTIONS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={'mood-option' + (mood === m.key ? ' active' : '')}
                onClick={() => setMood(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <textarea
            className="journal-textarea"
            placeholder="What's on your mind today?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            maxLength={8000}
          />
          <button type="submit" disabled={!content.trim() || !mood || saving}>
            {saving ? 'Saving...' : "Save today's entry"}
          </button>
          {savedJustNow && <span className="form-info" style={{ marginLeft: 10 }}>Saved</span>}
        </form>
      </div>

      {!loading && pastEntries.length > 0 && (
        <div className="journal-history">
          <div className="subheading">Past entries</div>
          {pastEntries.map((e) => (
            <div key={e.id} className="card journal-entry-card">
              <div className="journal-entry-head">
                <span className="journal-entry-date">{e.entry_date}</span>
                <span className={'mood-tag mood-' + e.mood}>{moodLabel(e.mood)}</span>
              </div>
              <p className="journal-snippet">{e.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
