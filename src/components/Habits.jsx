import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { todayISO, addDays, computeStreak, bestStreak, monthCells, monthLabel } from '../lib/dates'

// Habits, round 4: categories, a real calendar on every card instead of an
// abstract heatmap, a click-through detail panel, and three tabs —
//   My habits   — yours, private by default
//   Shared      — a habit you and someone else BOTH log, streaks compared
//   Supporting  — habits other people have shared with you, read-only
// "Shared" is a different mechanic from "Supporting": Shared is two people
// each with their own habit row, paired together (habit_pairs, created via
// the create_shared_habit() function so it can also create the partner's
// row). Supporting is one-directional watching (habit_shares, round 3).

const CATS = {
  health: { label: 'Health', icon: '💧', color: 'var(--cat-health)', soft: 'var(--cat-health-soft)' },
  study: { label: 'Study', icon: '📖', color: 'var(--cat-study)', soft: 'var(--cat-study-soft)' },
  finance: { label: 'Finance', icon: '💰', color: 'var(--cat-finance)', soft: 'var(--cat-finance-soft)' },
  mind: { label: 'Mindfulness', icon: '🧘', color: 'var(--cat-mind)', soft: 'var(--cat-mind-soft)' },
  personal: { label: 'Personal', icon: '✦', color: 'var(--cat-personal)', soft: 'var(--cat-personal-soft)' },
}

function initial(name) {
  return (name || '?').charAt(0).toUpperCase()
}

function weeklyCounts(doneSet, today, weeksBack) {
  const day = new Date(today + 'T00:00:00').getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday0 = addDays(today, diffToMonday)
  const weeks = []
  for (let w = weeksBack - 1; w >= 0; w -= 1) {
    const monday = addDays(monday0, -w * 7)
    let count = 0
    for (let i = 0; i < 7; i += 1) {
      if (doneSet.has(addDays(monday, i))) count += 1
    }
    weeks.push({ label: monday.slice(5).replace('-', '/'), count })
  }
  return weeks
}

// One calendar renderer, three sizes: 'sm' on cards (current month, day
// numbers), 'lg' in the detail panel (navigable, day numbers, weekday
// row), 'dot' side-by-side in the Shared comparison (no numbers, just fill).
function HabitCalendar({ doneSet, color, year, month, today, size = 'sm' }) {
  const cells = monthCells(year, month)

  if (size === 'dot') {
    return (
      <div className="mini-full-cal">
        {cells.map((c, i) =>
          c ? (
            <span
              key={c}
              className={'d' + (doneSet.has(c) ? ' on' : '')}
              style={doneSet.has(c) ? { background: color } : undefined}
              title={c}
            />
          ) : (
            <span key={'b' + i} className="d blank" />
          )
        )}
      </div>
    )
  }

  const wrapCls = size === 'lg' ? 'full-cal' : 'mini-cal'
  const cellCls = size === 'lg' ? 'day' : 'cell'

  return (
    <div className={wrapCls}>
      {size === 'lg' && ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
        <span key={'dow' + i} className="dow">{d}</span>
      ))}
      {cells.map((c, i) => {
        if (!c) return <span key={'b' + i} className={cellCls + ' blank'} />
        const on = doneSet.has(c)
        const isToday = c === today
        return (
          <span
            key={c}
            className={cellCls + (on ? ' on' : '') + (isToday ? ' today' : '')}
            style={on ? { background: color, color: '#fff' } : isToday ? { outlineColor: color } : undefined}
          >
            {Number(c.slice(-2))}
          </span>
        )
      })}
    </div>
  )
}

export default function Habits({ profile }) {
  const today = todayISO()
  const now = new Date()
  const todayYear = now.getFullYear()
  const todayMonthIdx = now.getMonth()

  const [tab, setTab] = useState('mine') // 'mine' | 'shared' | 'supporting'
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [habits, setHabits] = useState([])
  const [logsByHabit, setLogsByHabit] = useState({})
  const [sharesByHabit, setSharesByHabit] = useState({})
  const [contacts, setContacts] = useState([])
  const [loadingMine, setLoadingMine] = useState(true)

  const [pairs, setPairs] = useState([])
  const [loadingPairs, setLoadingPairs] = useState(true)

  const [supporting, setSupporting] = useState([])
  const [loadingSupporting, setLoadingSupporting] = useState(true)
  const [activePersonId, setActivePersonId] = useState(null)

  const [nudges, setNudges] = useState([])
  const [bellOpen, setBellOpen] = useState(false)

  const [openShareId, setOpenShareId] = useState(null)
  const [shareChoice, setShareChoice] = useState('')

  const [detail, setDetail] = useState(null) // { type: 'mine'|'shared'|'supporting', ... }
  const [panelMonth, setPanelMonth] = useState({ year: todayYear, month: todayMonthIdx })
  const [panelView, setPanelView] = useState('calendar')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalName, setModalName] = useState('')
  const [modalCategory, setModalCategory] = useState('health')
  const [modalWho, setModalWho] = useState('me')
  const [modalPartnerId, setModalPartnerId] = useState('')
  const [creatingHabit, setCreatingHabit] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef(null)

  function showToast(msg) {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600)
  }

  async function loadMine() {
    setLoadingMine(true)
    const [habitRes, logRes, shareRes, contactRes] = await Promise.all([
      supabase
        .from('habits')
        .select('id, name, category, archived')
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
    setLogsByHabit((prev) => ({ ...prev, ...grouped }))

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

    setLoadingMine(false)
  }

  async function loadPairs() {
    setLoadingPairs(true)
    const { data: pairRows } = await supabase
      .from('habit_pairs')
      .select('id, habit_a_id, user_a_id, habit_b_id, user_b_id')
      .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`)

    if (!pairRows || pairRows.length === 0) {
      setPairs([])
      setLoadingPairs(false)
      return
    }

    const allHabitIds = [...new Set(pairRows.flatMap((p) => [p.habit_a_id, p.habit_b_id]))]
    const otherUserIds = [...new Set(pairRows.map((p) => (p.user_a_id === profile.id ? p.user_b_id : p.user_a_id)))]

    const [habitRes, profileRes, logRes] = await Promise.all([
      supabase.from('habits').select('id, name, category, archived').in('id', allHabitIds),
      supabase.from('profiles').select('id, display_name').in('id', otherUserIds),
      supabase.from('habit_logs').select('habit_id, log_date').in('habit_id', allHabitIds),
    ])

    const habitById = {}
    for (const h of habitRes.data ?? []) habitById[h.id] = h
    const nameById = {}
    for (const p of profileRes.data ?? []) nameById[p.id] = p.display_name

    const logsById = {}
    for (const row of logRes.data ?? []) {
      if (!logsById[row.habit_id]) logsById[row.habit_id] = new Set()
      logsById[row.habit_id].add(row.log_date)
    }
    setLogsByHabit((prev) => ({ ...prev, ...logsById }))

    const list = []
    for (const p of pairRows) {
      const mineIsA = p.user_a_id === profile.id
      const myHabitId = mineIsA ? p.habit_a_id : p.habit_b_id
      const partnerHabitId = mineIsA ? p.habit_b_id : p.habit_a_id
      const partnerId = mineIsA ? p.user_b_id : p.user_a_id
      const myHabit = habitById[myHabitId]
      const partnerHabit = habitById[partnerHabitId]
      if (!myHabit || !partnerHabit || myHabit.archived || partnerHabit.archived) continue
      list.push({
        pairId: p.id,
        mine: { id: myHabit.id, name: myHabit.name, category: myHabit.category },
        partner: { id: partnerId, name: nameById[partnerId] ?? 'Someone', habitId: partnerHabit.id },
      })
    }
    setPairs(list)
    setLoadingPairs(false)
  }

  async function loadSupporting() {
    setLoadingSupporting(true)
    const { data: shareRows } = await supabase
      .from('habit_shares')
      .select('id, habit_id, owner_id')
      .eq('shared_with_id', profile.id)

    if (!shareRows || shareRows.length === 0) {
      setSupporting([])
      setLoadingSupporting(false)
      return
    }

    const ownerIds = [...new Set(shareRows.map((r) => r.owner_id))]
    const habitIds = [...new Set(shareRows.map((r) => r.habit_id))]

    const [ownerRes, habitRes, logRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name').in('id', ownerIds),
      supabase.from('habits').select('id, name, category').in('id', habitIds),
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
      byOwner[row.owner_id].habits.push({
        id: habit.id,
        name: habit.name,
        category: habit.category,
        done: logsByHabitId[habit.id] ?? new Set(),
      })
    }

    const list = Object.values(byOwner)
    setSupporting(list)
    setActivePersonId((prev) => prev ?? list[0]?.ownerId ?? null)
    setLoadingSupporting(false)
  }

  async function loadNudges() {
    const { data } = await supabase
      .from('habit_nudges')
      .select('id, habit_id, from_id, kind, message, seen, created_at')
      .eq('to_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setNudges(data ?? [])
  }

  useEffect(() => {
    loadMine()
    loadPairs()
    loadSupporting()
    loadNudges()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

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

  async function sendPairNudge(pair) {
    const message = `${profile.display_name} nudged you about ${pair.mine.name} — catch up together!`
    const { error } = await supabase
      .from('habit_nudges')
      .insert({ habit_id: pair.mine.id, from_id: profile.id, to_id: pair.partner.id, kind: 'nudge', message })
    showToast(error ? 'Could not send that nudge' : `Nudge sent to ${pair.partner.name}!`)
  }

  async function sendCheer(personId, personName, habit) {
    const message = `${profile.display_name} cheered you on for ${habit.name}!`
    const { error } = await supabase
      .from('habit_nudges')
      .insert({ habit_id: habit.id, from_id: profile.id, to_id: personId, kind: 'cheer', message })
    showToast(error ? 'Could not send that cheer' : `Cheer sent to ${personName}!`)
  }

  async function markNudgesSeen() {
    const unseenIds = nudges.filter((n) => !n.seen).map((n) => n.id)
    if (unseenIds.length === 0) return
    setNudges((prev) => prev.map((n) => ({ ...n, seen: true })))
    await supabase.from('habit_nudges').update({ seen: true }).in('id', unseenIds)
  }

  function toggleBell() {
    const next = !bellOpen
    setBellOpen(next)
    if (next) markNudgesSeen()
  }

  function openModal() {
    setModalName('')
    setModalCategory('health')
    setModalWho('me')
    setModalPartnerId('')
    setModalOpen(true)
  }

  async function submitNewHabit() {
    const name = modalName.trim()
    if (!name) return
    setCreatingHabit(true)
    if (modalWho === 'together') {
      const { error } = await supabase.rpc('create_shared_habit', {
        p_name: name,
        p_category: modalCategory,
        p_partner_id: modalPartnerId,
      })
      if (error) {
        showToast(error.message || 'Could not create that shared habit')
      } else {
        await loadPairs()
        showToast('Shared habit created')
      }
    } else {
      const { data, error } = await supabase
        .from('habits')
        .insert({ user_id: profile.id, name, category: modalCategory })
        .select()
        .single()
      if (!error && data) {
        setHabits((prev) => [...prev, data])
        showToast('Habit created')
      } else {
        showToast('Could not create that habit')
      }
    }
    setCreatingHabit(false)
    setModalOpen(false)
  }

  function openMineDetail(h) {
    setPanelMonth({ year: todayYear, month: todayMonthIdx })
    setPanelView('calendar')
    setDetail({ type: 'mine', habit: h })
  }

  function openSharedDetail(pair) {
    setPanelMonth({ year: todayYear, month: todayMonthIdx })
    setDetail({ type: 'shared', pair })
  }

  function openSupportDetail(person, habit) {
    setPanelMonth({ year: todayYear, month: todayMonthIdx })
    setDetail({ type: 'supporting', person, habit })
  }

  function closeDetail() {
    setDetail(null)
  }

  function shiftPanelMonth(delta) {
    setPanelMonth((prev) => {
      let m = prev.month + delta
      let y = prev.year
      if (m < 0) {
        m = 11
        y -= 1
      } else if (m > 11) {
        m = 0
        y += 1
      }
      return { year: y, month: m }
    })
  }

  const pairedMineIds = new Set(pairs.map((p) => p.mine.id))
  const mineVisible = habits.filter(
    (h) => !pairedMineIds.has(h.id) && (categoryFilter === 'all' || h.category === categoryFilter)
  )
  const activePerson = supporting.find((p) => p.ownerId === activePersonId) ?? supporting[0] ?? null
  const unseenCount = nudges.filter((n) => !n.seen).length

  return (
    <div className="view-page-wide habits-v2">
      <div className="hx-top">
        <div>
          <h1 className="hx-title">Habits</h1>
          <p className="view-subtitle">Build your own, track it on a real calendar, and let people watch or work on one together with you.</p>
        </div>
        <div className="hx-actions">
          <div className="bell-wrap">
            <button className="bell-btn" onClick={toggleBell} aria-label="Notifications">
              🔔{unseenCount > 0 && <span className="bell-dot" />}
            </button>
            {bellOpen && (
              <>
                <div className="bell-scrim" onClick={() => setBellOpen(false)} />
                <div className="bell-panel">
                  <div className="bell-panel-title">Recent</div>
                  {nudges.length === 0 && <div className="bell-item muted">Nothing yet.</div>}
                  {nudges.map((n) => (
                    <div key={n.id} className="bell-item">
                      {n.kind === 'cheer' ? '👏' : '⏰'} {n.message}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button className="new-habit-btn" onClick={openModal}>＋ New habit</button>
        </div>
      </div>

      <div className="hx-tabs-row">
        <div className="seg">
          <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My habits</button>
          <button className={tab === 'shared' ? 'active' : ''} onClick={() => setTab('shared')}>Shared</button>
          <button className={tab === 'supporting' ? 'active' : ''} onClick={() => setTab('supporting')}>Supporting</button>
        </div>
        {tab === 'mine' && (
          <div className="hx-filters">
            <button className={'filter-chip' + (categoryFilter === 'all' ? ' active' : '')} onClick={() => setCategoryFilter('all')}>
              <span className="dot" style={{ background: 'var(--ink)' }} />All
            </button>
            {Object.entries(CATS).map(([key, c]) => (
              <button
                key={key}
                className={'filter-chip' + (categoryFilter === key ? ' active' : '')}
                onClick={() => setCategoryFilter(key)}
              >
                <span className="dot" style={{ background: c.color }} />{c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'mine' && (
        <div className="grid">
          {!loadingMine && mineVisible.length === 0 && (
            <div className="empty-hint">No habits in this category yet. Use "New habit" above to add one.</div>
          )}
          {mineVisible.map((h) => {
            const cat = CATS[h.category] ?? CATS.personal
            const doneSet = logsByHabit[h.id] ?? new Set()
            const streak = computeStreak(doneSet, today)
            const watchers = sharesByHabit[h.id] ?? []
            const doneToday = doneSet.has(today)
            return (
              <div
                key={h.id}
                className="hcard"
                style={{ '--cat': cat.color, '--cat-soft': cat.soft }}
                onClick={() => openMineDetail(h)}
              >
                <div className="hcard-top">
                  <div className="hcard-icon">{cat.icon}</div>
                  <div className="hcard-cat">{cat.label}</div>
                </div>
                <div className="hcard-name">{h.name}</div>
                <div className="hcard-streak">
                  <span className="num accent-num">{streak}</span>
                  <span className="lbl">day streak</span>
                </div>
                <HabitCalendar doneSet={doneSet} color={cat.color} year={todayYear} month={todayMonthIdx} today={today} size="sm" />
                <div className="hcard-foot">
                  <div className="watch-avatars">
                    {watchers.map((w) => <span key={w.shareId} className="mini-avatar">{initial(w.name)}</span>)}
                  </div>
                  <button
                    className={'quick-check' + (doneToday ? ' done' : '')}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleHabitToday(h.id)
                    }}
                  >
                    {doneToday ? '✓ Done today' : 'Mark done'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'shared' && (
        <div className="grid">
          {!loadingPairs && pairs.length === 0 && (
            <div className="empty-hint">
              Nothing shared yet. Create a habit above and choose "Track it together" to start one with someone in your circle.
            </div>
          )}
          {pairs.map((p) => {
            const cat = CATS[p.mine.category] ?? CATS.personal
            const myDone = logsByHabit[p.mine.id] ?? new Set()
            const theirDone = logsByHabit[p.partner.habitId] ?? new Set()
            const mine = computeStreak(myDone, today)
            const theirs = computeStreak(theirDone, today)
            let banner
            if (mine < theirs - 1) banner = { cls: 'behind', icon: '⏰', msg: `${p.partner.name} is ${theirs - mine} days ahead — catch up today!` }
            else if (mine > theirs + 1) banner = { cls: 'ahead', icon: '👏', msg: `You're leading by ${mine - theirs} days. Keep it up!` }
            else banner = { cls: 'even', icon: '🔥', msg: `You and ${p.partner.name} are neck-and-neck` }
            return (
              <div
                key={p.pairId}
                className="shared-card"
                style={{ '--cat': cat.color, '--cat-soft': cat.soft }}
                onClick={() => openSharedDetail(p)}
              >
                <div className="shared-top">
                  <div className="shared-title">
                    <div className="ic">{cat.icon}</div>
                    <div>
                      <h4>{p.mine.name}</h4>
                      <div className="cat">{cat.label} · with {p.partner.name}</div>
                    </div>
                  </div>
                </div>
                <div className="vs-row">
                  <div className="vs-person">
                    <div className="who">You</div>
                    <div className="streak-num accent-num" style={{ color: cat.color }}>{mine}</div>
                  </div>
                  <div className="vs-mid">VS</div>
                  <div className="vs-person">
                    <div className="who">{p.partner.name}</div>
                    <div className="streak-num accent-num" style={{ color: cat.color }}>{theirs}</div>
                  </div>
                </div>
                <div className={'nudge-banner ' + banner.cls}>{banner.icon} {banner.msg}</div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'supporting' && (
        <>
          {supporting.length > 0 && (
            <div className="people-row">
              {supporting.map((p) => (
                <button
                  key={p.ownerId}
                  className={'person-pill' + (activePerson?.ownerId === p.ownerId ? ' active' : '')}
                  onClick={() => setActivePersonId(p.ownerId)}
                >
                  <span className="pav">{initial(p.ownerName)}</span>{p.ownerName}
                </button>
              ))}
            </div>
          )}

          {!loadingSupporting && supporting.length === 0 && (
            <div className="empty-hint">No one has shared a habit with you yet. When they do, it shows up here.</div>
          )}

          {activePerson && (
            <>
              <div className="support-head">
                <div className="who">{activePerson.ownerName}</div>
                <span className="readonly-badge">Read-only</span>
              </div>
              <div className="grid">
                {activePerson.habits.map((h) => {
                  const cat = CATS[h.category] ?? CATS.personal
                  const streak = computeStreak(h.done, today)
                  return (
                    <div
                      key={h.id}
                      className="hcard"
                      style={{ '--cat': cat.color, '--cat-soft': cat.soft }}
                      onClick={() => openSupportDetail(activePerson, h)}
                    >
                      <div className="hcard-top">
                        <div className="hcard-icon">{cat.icon}</div>
                        <div className="hcard-cat">{cat.label}</div>
                      </div>
                      <div className="hcard-name">{h.name}</div>
                      <div className="hcard-streak">
                        <span className="num accent-num">{streak}</span>
                        <span className="lbl">day streak</span>
                      </div>
                      <HabitCalendar doneSet={h.done} color={cat.color} year={todayYear} month={todayMonthIdx} today={today} size="sm" />
                      <div className="hcard-foot">
                        <span className="hcard-hint">Read-only · tap to open →</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {detail && (
        <>
          <div className="backdrop" onClick={closeDetail} />
          <aside className="panel">
            <button className="panel-close" onClick={closeDetail}>✕</button>

            {detail.type === 'mine' && (() => {
              const h = detail.habit
              const cat = CATS[h.category] ?? CATS.personal
              const doneSet = logsByHabit[h.id] ?? new Set()
              const streak = computeStreak(doneSet, today)
              const best = bestStreak(doneSet)
              const monthPrefix = `${todayYear}-${String(todayMonthIdx + 1).padStart(2, '0')}`
              const thisMonthCount = [...doneSet].filter((d) => d.startsWith(monthPrefix)).length
              const weeks = weeklyCounts(doneSet, today, 8)
              const watchers = sharesByHabit[h.id] ?? []
              const availableContacts = contacts.filter((c) => !watchers.some((w) => w.contactId === c.id))

              return (
                <>
                  <span className="panel-cat" style={{ background: cat.soft, color: cat.color }}>{cat.icon} {cat.label}</span>
                  <h2 className="panel-title">{h.name}</h2>

                  <div className="stat-row">
                    <div className="stat-box"><div className="n accent-num" style={{ color: cat.color }}>{streak}</div><div className="l">Current streak</div></div>
                    <div className="stat-box"><div className="n accent-num" style={{ color: cat.color }}>{best}</div><div className="l">Best streak</div></div>
                    <div className="stat-box"><div className="n accent-num" style={{ color: cat.color }}>{thisMonthCount}</div><div className="l">This month</div></div>
                  </div>

                  <div className="view-toggle">
                    <button className={panelView === 'calendar' ? 'active' : ''} onClick={() => setPanelView('calendar')}>Calendar</button>
                    <button className={panelView === 'chart' ? 'active' : ''} onClick={() => setPanelView('chart')}>Chart</button>
                  </div>

                  {panelView === 'calendar' ? (
                    <>
                      <div className="cal-nav-row">
                        <button className="cal-nav-btn" onClick={() => shiftPanelMonth(-1)}>‹</button>
                        <span className="cal-month-label">{monthLabel(panelMonth.year, panelMonth.month)}</span>
                        <button className="cal-nav-btn" onClick={() => shiftPanelMonth(1)}>›</button>
                      </div>
                      <HabitCalendar doneSet={doneSet} color={cat.color} year={panelMonth.year} month={panelMonth.month} today={today} size="lg" />
                    </>
                  ) : (
                    <div className="chart-wrap">
                      {weeks.map((w) => (
                        <div className="chart-bar" key={w.label}>
                          <div className="bar" style={{ height: `${Math.max(4, (w.count / 7) * 100)}%`, background: cat.color }} />
                          <span className="wl">{w.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="panel-section-title">Shared with</div>
                  <div className="watch-list">
                    {watchers.length === 0 && <div className="empty-hint small">No one's watching this yet.</div>}
                    {watchers.map((w) => (
                      <div className="watch-item" key={w.shareId}>
                        <span className="pav">{initial(w.name)}</span>
                        <span className="nm">{w.name} watching</span>
                        <button onClick={() => unshareHabit(h.id, w.shareId)}>✕</button>
                      </div>
                    ))}
                  </div>

                  {openShareId === h.id ? (
                    availableContacts.length > 0 ? (
                      <div className="share-panel">
                        <select value={shareChoice} onChange={(e) => setShareChoice(e.target.value)}>
                          <option value="">Choose from your circle...</option>
                          {availableContacts.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                        </select>
                        <button className="share-confirm" disabled={!shareChoice} onClick={() => confirmShare(h.id)}>Add</button>
                        <button className="share-cancel" onClick={() => setOpenShareId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="share-panel">
                        <span className="empty-hint small">Everyone in your circle is already watching this, or your circle is empty.</span>
                        <button className="share-cancel" onClick={() => setOpenShareId(null)}>Close</button>
                      </div>
                    )
                  ) : (
                    <button className="add-share-btn" onClick={() => { setOpenShareId(h.id); setShareChoice('') }}>＋ Share with someone</button>
                  )}

                  <button
                    className="add-share-btn"
                    style={{ marginTop: 10, borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    onClick={() => { archiveHabit(h.id); closeDetail() }}
                  >
                    Archive this habit
                  </button>
                </>
              )
            })()}

            {detail.type === 'shared' && (() => {
              const p = detail.pair
              const cat = CATS[p.mine.category] ?? CATS.personal
              const myDone = logsByHabit[p.mine.id] ?? new Set()
              const theirDone = logsByHabit[p.partner.habitId] ?? new Set()
              const mineStreak = computeStreak(myDone, today)
              const theirStreak = computeStreak(theirDone, today)

              return (
                <>
                  <span className="panel-cat" style={{ background: cat.soft, color: cat.color }}>{cat.icon} {cat.label} · Shared</span>
                  <h2 className="panel-title">{p.mine.name}</h2>

                  <div className="cal-nav-row">
                    <button className="cal-nav-btn" onClick={() => shiftPanelMonth(-1)}>‹</button>
                    <span className="cal-month-label">{monthLabel(panelMonth.year, panelMonth.month)}</span>
                    <button className="cal-nav-btn" onClick={() => shiftPanelMonth(1)}>›</button>
                  </div>

                  <div className="compare-row">
                    <div className="compare-col">
                      <div className="who"><span className="pav">{initial(profile.display_name)}</span>You · {mineStreak}🔥</div>
                      <HabitCalendar doneSet={myDone} color={cat.color} year={panelMonth.year} month={panelMonth.month} today={today} size="dot" />
                    </div>
                    <div className="compare-col">
                      <div className="who"><span className="pav">{initial(p.partner.name)}</span>{p.partner.name} · {theirStreak}🔥</div>
                      <HabitCalendar doneSet={theirDone} color="var(--cat-personal)" year={panelMonth.year} month={panelMonth.month} today={today} size="dot" />
                    </div>
                  </div>

                  <button className="cheer-btn" onClick={() => sendPairNudge(p)}>👋 Send {p.partner.name} a nudge</button>
                </>
              )
            })()}

            {detail.type === 'supporting' && (() => {
              const { person, habit } = detail
              const cat = CATS[habit.category] ?? CATS.personal
              const doneSet = habit.done
              const streak = computeStreak(doneSet, today)
              const best = bestStreak(doneSet)

              return (
                <>
                  <span className="panel-cat" style={{ background: cat.soft, color: cat.color }}>{cat.icon} {cat.label} · {person.ownerName}'s habit</span>
                  <h2 className="panel-title">{habit.name}</h2>

                  <div className="stat-row">
                    <div className="stat-box"><div className="n accent-num" style={{ color: cat.color }}>{streak}</div><div className="l">Current streak</div></div>
                    <div className="stat-box"><div className="n accent-num" style={{ color: cat.color }}>{best}</div><div className="l">Best streak</div></div>
                  </div>

                  <div className="cal-nav-row">
                    <button className="cal-nav-btn" onClick={() => shiftPanelMonth(-1)}>‹</button>
                    <span className="cal-month-label">{monthLabel(panelMonth.year, panelMonth.month)}</span>
                    <button className="cal-nav-btn" onClick={() => shiftPanelMonth(1)}>›</button>
                  </div>
                  <HabitCalendar doneSet={doneSet} color={cat.color} year={panelMonth.year} month={panelMonth.month} today={today} size="lg" />

                  <div className="readonly-note">Read-only — you're supporting {person.ownerName}, not editing their log.</div>
                  <button className="cheer-btn" onClick={() => sendCheer(person.ownerId, person.ownerName, habit)}>👏 Send {person.ownerName} a cheer</button>
                </>
              )
            })()}
          </aside>
        </>
      )}

      {modalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal">
            <h3>New habit</h3>
            <p className="sub">Give it a name, a category, and decide who's involved — you can always change sharing later.</p>

            <div className="field-label">Name</div>
            <input
              type="text"
              placeholder="e.g. Stretch for 10 minutes"
              value={modalName}
              onChange={(e) => setModalName(e.target.value)}
              maxLength={200}
            />

            <div className="field-label">Category</div>
            <div className="cat-pick-row">
              {Object.entries(CATS).map(([key, c]) => (
                <button
                  key={key}
                  className={'cat-pick' + (modalCategory === key ? ' active' : '')}
                  style={modalCategory === key ? { background: c.color, borderColor: c.color, color: '#fff' } : undefined}
                  onClick={() => setModalCategory(key)}
                >
                  <span className="dot" style={{ background: c.color }} />{c.label}
                </button>
              ))}
            </div>

            <div className="field-label">Who's tracking this?</div>
            <div className="who-pick-row">
              <div className={'who-pick' + (modalWho === 'me' ? ' active' : '')} onClick={() => setModalWho('me')}>
                <span className="rd" />Just me — private
              </div>
              <div className={'who-pick' + (modalWho === 'together' ? ' active' : '')} onClick={() => setModalWho('together')}>
                <span className="rd" />Track it together — both of us check in, streaks compared
              </div>
              {modalWho === 'together' && (
                <div className="contact-pick-row">
                  {contacts.length === 0 && <span className="empty-hint small">Add someone to your circle first, from Messages.</span>}
                  {contacts.map((c) => (
                    <button
                      key={c.id}
                      className={'contact-pick' + (modalPartnerId === c.id ? ' active' : '')}
                      onClick={() => setModalPartnerId(c.id)}
                    >
                      {c.display_name}
                    </button>
                  ))}
                </div>
              )}
              <div className={'who-pick' + (modalWho === 'later' ? ' active' : '')} onClick={() => setModalWho('later')}>
                <span className="rd" />Decide later — I'll share it from the habit card
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
              <button
                className="btn-create"
                disabled={!modalName.trim() || (modalWho === 'together' && !modalPartnerId) || creatingHabit}
                onClick={submitNewHabit}
              >
                {creatingHabit ? 'Creating…' : 'Create habit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>
    </div>
  )
}
