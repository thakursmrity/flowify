import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { todayISO, addDays, computeStreak, bestStreak, monthCells, monthLabel } from '../lib/dates'

// Habits, round 5: shared habits are now a real invite — creating one only
// sets YOUR side up plus a pending row; the other person has to accept
// before it starts comparing streaks. Categories are no longer locked to
// five built-ins — you can add your own (name + color) and change a
// habit's category later. An overview chart sits above the card grid so
// you can see every habit's progress at a glance before drilling into one.

const BUILTIN_CATS = {
  health: { label: 'Health', icon: '💧', color: 'var(--cat-health)', soft: 'var(--cat-health-soft)' },
  study: { label: 'Study', icon: '📖', color: 'var(--cat-study)', soft: 'var(--cat-study-soft)' },
  finance: { label: 'Finance', icon: '💰', color: 'var(--cat-finance)', soft: 'var(--cat-finance-soft)' },
  mind: { label: 'Mindfulness', icon: '🧘', color: 'var(--cat-mind)', soft: 'var(--cat-mind-soft)' },
  personal: { label: 'Personal', icon: '✦', color: 'var(--cat-personal)', soft: 'var(--cat-personal-soft)' },
}

const FALLBACK_CAT = { label: 'Other', icon: '✦', color: 'var(--ink-muted)', soft: 'var(--surface-2)' }

const PALETTE = ['#1f8a8c', '#2f5da8', '#b3791f', '#6a5acd', '#c0447a', '#3f8f52', '#a8433c', '#4a534e']

// Default order the "My habits" category sections appear in, before a user
// drags any of them into a different arrangement (round 6).
const DEFAULT_CATEGORY_ORDER = ['personal', 'health', 'study', 'finance', 'mind']

// Small rotating motivation line next to the tabs (round 6) — purely
// decorative, no backend involved, resets to the first one on reload.
const QUOTES = [
  "Small steps, repeated daily, build unstoppable momentum.",
  "You don't have to be extreme, just consistent.",
  "Discipline is choosing what you want most over what you want now.",
  "The chain is only as strong as today's link.",
  "Progress, not perfection.",
  "Show up. That's the whole game.",
  "Streaks are just promises you kept to yourself.",
]

function initial(name) {
  return (name || '?').charAt(0).toUpperCase()
}

function hexToRgba(hex, alpha) {
  const h = (hex || '#999999').replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function slugify(label) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'cat'
  return `c_${base}_${Math.random().toString(36).slice(2, 6)}`
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
// Pass onToggleToday to make just today's cell clickable (round 6) — tapping
// it marks the habit done/undone right there instead of opening the detail
// panel; every other cell stays a plain display square. Callers that show
// someone else's habit (Supporting) simply omit the prop, keeping it read-only.
function HabitCalendar({ doneSet, color, year, month, today, size = 'sm', onToggleToday }) {
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
        const style = on ? { background: color, color: '#fff' } : isToday ? { outlineColor: color } : undefined
        if (isToday && onToggleToday) {
          return (
            <span
              key={c}
              className={cellCls + (on ? ' on' : '') + ' today clickable'}
              style={style}
              title="Tap to mark today done or undone"
              onClick={(e) => {
                e.stopPropagation()
                onToggleToday()
              }}
            >
              {Number(c.slice(-2))}
            </span>
          )
        }
        return (
          <span
            key={c}
            className={cellCls + (on ? ' on' : '') + (isToday ? ' today' : '')}
            style={style}
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
  const [catFilterOpen, setCatFilterOpen] = useState(false)
  const [categoryOrder, setCategoryOrder] = useState(DEFAULT_CATEGORY_ORDER)
  const [quoteIdx, setQuoteIdx] = useState(0)

  const [habits, setHabits] = useState([])
  const [logsByHabit, setLogsByHabit] = useState({})
  const [sharesByHabit, setSharesByHabit] = useState({})
  const [contacts, setContacts] = useState([])
  const [customCats, setCustomCats] = useState([])
  const [loadingMine, setLoadingMine] = useState(true)

  const [pairs, setPairs] = useState([])
  const [incomingInvites, setIncomingInvites] = useState([])
  const [outgoingInvites, setOutgoingInvites] = useState([])
  const [loadingPairs, setLoadingPairs] = useState(true)
  const [sharedPersonFilter, setSharedPersonFilter] = useState('all')

  const [supporting, setSupporting] = useState([])
  const [loadingSupporting, setLoadingSupporting] = useState(true)
  const [activePersonId, setActivePersonId] = useState(null)

  const [nudges, setNudges] = useState([])
  const [bellOpen, setBellOpen] = useState(false)

  const [openShareId, setOpenShareId] = useState(null)
  const [shareChoice, setShareChoice] = useState('')
  const [editingCatFor, setEditingCatFor] = useState(null)

  const [detail, setDetail] = useState(null) // { type: 'mine'|'shared'|'supporting', ... }
  const [panelMonth, setPanelMonth] = useState({ year: todayYear, month: todayMonthIdx })
  const [panelView, setPanelView] = useState('calendar')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalName, setModalName] = useState('')
  const [modalCategory, setModalCategory] = useState('health')
  const [modalWho, setModalWho] = useState('me')
  const [modalPartnerId, setModalPartnerId] = useState('')
  const [creatingHabit, setCreatingHabit] = useState(false)

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catLabel, setCatLabel] = useState('')
  const [catColor, setCatColor] = useState(PALETTE[0])
  const [savingCat, setSavingCat] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef(null)

  const allCats = { ...BUILTIN_CATS }
  for (const c of customCats) {
    allCats[c.key] = { label: c.label, icon: initial(c.label), color: c.color, soft: hexToRgba(c.color, 0.16) }
  }

  function showToast(msg) {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600)
  }

  async function loadMine() {
    setLoadingMine(true)
    const [habitRes, logRes, shareRes, contactRes, catRes] = await Promise.all([
      supabase
        .from('habits')
        .select('id, name, category, archived, sort_order')
        .eq('user_id', profile.id)
        .eq('archived', false)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('habit_logs').select('habit_id, log_date').eq('user_id', profile.id),
      supabase.from('habit_shares').select('id, habit_id, shared_with_id').eq('owner_id', profile.id),
      supabase
        .from('contacts')
        .select('contact_id, profiles:contact_id ( id, display_name )')
        .eq('owner_id', profile.id),
      supabase.from('habit_categories').select('id, key, label, color').eq('user_id', profile.id).order('created_at', { ascending: true }),
    ])

    setHabits(habitRes.data ?? [])
    setCustomCats(catRes.data ?? [])

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
      .select('id, habit_a_id, user_a_id, habit_b_id, user_b_id, status')
      .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`)

    if (!pairRows || pairRows.length === 0) {
      setPairs([])
      setIncomingInvites([])
      setOutgoingInvites([])
      setLoadingPairs(false)
      return
    }

    const allHabitIds = [...new Set(pairRows.flatMap((p) => [p.habit_a_id, p.habit_b_id]).filter(Boolean))]
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

    const accepted = []
    const incoming = []
    const outgoing = []

    for (const p of pairRows) {
      const iAmA = p.user_a_id === profile.id
      const otherId = iAmA ? p.user_b_id : p.user_a_id
      const otherName = nameById[otherId] ?? 'Someone'

      if (p.status === 'pending') {
        const inviterHabit = habitById[p.habit_a_id]
        if (!inviterHabit) continue
        const entry = { pairId: p.id, name: inviterHabit.name, category: inviterHabit.category, otherName }
        if (iAmA) outgoing.push(entry)
        else incoming.push(entry)
        continue
      }

      if (p.status !== 'accepted') continue

      const myHabitId = iAmA ? p.habit_a_id : p.habit_b_id
      const partnerHabitId = iAmA ? p.habit_b_id : p.habit_a_id
      const myHabit = habitById[myHabitId]
      const partnerHabit = habitById[partnerHabitId]
      if (!myHabit || !partnerHabit || myHabit.archived || partnerHabit.archived) continue
      accepted.push({
        pairId: p.id,
        mine: { id: myHabit.id, name: myHabit.name, category: myHabit.category },
        partner: { id: otherId, name: otherName, habitId: partnerHabit.id },
      })
    }

    setPairs(accepted)
    setIncomingInvites(incoming)
    setOutgoingInvites(outgoing)
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

  // The order a user has dragged the category sections into (round 6).
  // No row yet just means "use the default order" — nothing to migrate.
  async function loadCategoryOrder() {
    const { data } = await supabase
      .from('habit_category_order')
      .select('order_json')
      .eq('user_id', profile.id)
      .maybeSingle()
    if (Array.isArray(data?.order_json) && data.order_json.length > 0) {
      setCategoryOrder(data.order_json)
    }
  }

  useEffect(() => {
    loadMine()
    loadPairs()
    loadSupporting()
    loadNudges()
    loadCategoryOrder()
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

  async function changeHabitCategory(habitId, key) {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, category: key } : h)))
    setEditingCatFor(null)
    await supabase.from('habits').update({ category: key }).eq('id', habitId)
  }

  // Category display order: the default five, then anything a user has
  // dragged around (round 6), then any built-in or custom category not yet
  // in that list (a brand-new custom category, for instance).
  function catList() {
    const known = new Set(categoryOrder)
    const builtinsNotInOrder = Object.keys(BUILTIN_CATS).filter((c) => !known.has(c))
    const customsNotInOrder = customCats.map((c) => c.key).filter((c) => !known.has(c))
    return [...categoryOrder, ...builtinsNotInOrder, ...customsNotInOrder]
  }

  // Drag a habit card (or its "month at a glance" row) onto another one to
  // reorder within a category — cards from two different categories don't
  // reorder against each other, since which category a habit is in doesn't
  // change here (round 6).
  async function reorderHabit(draggedId, targetId) {
    if (!draggedId || draggedId === targetId) return
    const dragged = habits.find((h) => h.id === draggedId)
    const target = habits.find((h) => h.id === targetId)
    if (!dragged || !target || dragged.category !== target.category) return

    const inCat = habits
      .filter((h) => h.category === dragged.category)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const fromIdx = inCat.findIndex((h) => h.id === draggedId)
    const toIdx = inCat.findIndex((h) => h.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const reordered = [...inCat]
    const [item] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, item)

    const updates = reordered.map((h, i) => ({ id: h.id, sort_order: i }))
    setHabits((prev) =>
      prev.map((h) => {
        const u = updates.find((x) => x.id === h.id)
        return u ? { ...h, sort_order: u.sort_order } : h
      })
    )
    await Promise.all(updates.map((u) => supabase.from('habits').update({ sort_order: u.sort_order }).eq('id', u.id)))
  }

  // Drag a category section's header onto another's to reorder the sections
  // themselves — separate from reordering habits within one (round 6).
  async function reorderCategory(draggedCat, targetCat) {
    if (!draggedCat || draggedCat === targetCat) return
    const order = catList()
    const fromIdx = order.indexOf(draggedCat)
    const toIdx = order.indexOf(targetCat)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...order]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    setCategoryOrder(next)
    await supabase
      .from('habit_category_order')
      .upsert({ user_id: profile.id, order_json: next, updated_at: new Date().toISOString() })
  }

  function refreshQuote() {
    setQuoteIdx((prev) => {
      if (QUOTES.length <= 1) return prev
      let next = prev
      while (next === prev) next = Math.floor(Math.random() * QUOTES.length)
      return next
    })
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

  async function acceptInvite(pairId) {
    const { error } = await supabase.rpc('accept_shared_habit', { p_pair_id: pairId })
    if (error) {
      showToast(error.message || 'Could not accept that invite')
      return
    }
    showToast('Joined — check the Shared tab')
    setBellOpen(false)
    await Promise.all([loadMine(), loadPairs()])
  }

  async function declineInvite(pairId) {
    const { error } = await supabase.rpc('decline_shared_habit', { p_pair_id: pairId })
    showToast(error ? 'Could not decline that invite' : 'Invite declined')
    setBellOpen(false)
    await loadPairs()
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
      const partnerName = contacts.find((c) => c.id === modalPartnerId)?.display_name ?? 'them'
      const { error } = await supabase.rpc('create_shared_habit', {
        p_name: name,
        p_category: modalCategory,
        p_partner_id: modalPartnerId,
      })
      if (error) {
        showToast(error.message || 'Could not send that invite')
      } else {
        await loadPairs()
        showToast(`Invite sent to ${partnerName} — it'll show as Shared once they accept`)
      }
    } else {
      const inCat = habits.filter((h) => h.category === modalCategory)
      const nextOrder = inCat.length ? Math.max(...inCat.map((h) => h.sort_order ?? 0)) + 1 : 0
      const { data, error } = await supabase
        .from('habits')
        .insert({ user_id: profile.id, name, category: modalCategory, sort_order: nextOrder })
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

  async function submitNewCategory() {
    const label = catLabel.trim()
    if (!label) return
    setSavingCat(true)
    const key = slugify(label)
    const { data, error } = await supabase
      .from('habit_categories')
      .insert({ user_id: profile.id, key, label, color: catColor })
      .select()
      .single()
    if (!error && data) {
      setCustomCats((prev) => [...prev, data])
      setModalCategory(data.key)
      showToast('Category added')
      setCatModalOpen(false)
      setCatLabel('')
      setCatColor(PALETTE[0])
    } else {
      showToast('Could not add that category')
    }
    setSavingCat(false)
  }

  function openMineDetail(h) {
    setPanelMonth({ year: todayYear, month: todayMonthIdx })
    setPanelView('calendar')
    setEditingCatFor(null)
    setDetail({ type: 'mine', habitId: h.id })
  }

  function openSharedDetail(pair) {
    setPanelMonth({ year: todayYear, month: todayMonthIdx })
    setDetail({ type: 'shared', pairId: pair.pairId })
  }

  function openSupportDetail(person, habit) {
    setPanelMonth({ year: todayYear, month: todayMonthIdx })
    setDetail({ type: 'supporting', personId: person.ownerId, habitId: habit.id })
  }

  function closeDetail() {
    setDetail(null)
    setEditingCatFor(null)
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

  // A shared habit lives in BOTH places: it's still yours to check off day
  // to day (My habits), and it's also where you compare streaks (Shared).
  // This map is just for a small "shared with X" note on the card, not a
  // filter — nothing gets hidden from My habits because it's paired.
  const pairedPartnerByHabit = {}
  for (const p of pairs) pairedPartnerByHabit[p.mine.id] = p.partner.name

  const activePerson = supporting.find((p) => p.ownerId === activePersonId) ?? supporting[0] ?? null
  const unseenCount = nudges.filter((n) => !n.seen).length + incomingInvites.length

  const monthPrefix = `${todayYear}-${String(todayMonthIdx + 1).padStart(2, '0')}`
  const daysInMonth = new Date(todayYear, todayMonthIdx + 1, 0).getDate()
  const dayOfMonth = now.getDate()

  // Every habit, ordered the way the user has dragged them (round 6) — used
  // both by "This month at a glance" (always shows everything, regardless
  // of the category filter below) and by the categorized card sections.
  // `habits` already arrives from Supabase ordered by sort_order then
  // created_at, so a stable sort here just needs to key on sort_order —
  // habits that still share the default 0 keep their created_at order.
  const habitsSorted = [...habits].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const glanceRows = habitsSorted.map((h) => {
    const cat = allCats[h.category] ?? FALLBACK_CAT
    const doneSet = logsByHabit[h.id] ?? new Set()
    return { habit: h, cat, doneSet, streak: computeStreak(doneSet, today) }
  })

  const orderedCategories = catList().filter((c) => categoryFilter === 'all' || categoryFilter === c)
  const categoriesWithHabits = catList().filter((c) => habits.some((h) => h.category === c))

  const sharedPartners = [...new Set(pairs.map((p) => p.partner.name))]
  const pairsVisible = pairs.filter((p) => sharedPersonFilter === 'all' || p.partner.name === sharedPersonFilter)

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
                  {incomingInvites.length === 0 && nudges.length === 0 && (
                    <div className="bell-item muted">Nothing yet.</div>
                  )}
                  {incomingInvites.map((inv) => (
                    <div key={inv.pairId} className="bell-item bell-invite">
                      <div>🤝 <b>{inv.otherName}</b> wants to track "{inv.name}" together</div>
                      <div className="bell-invite-actions">
                        <button onClick={() => acceptInvite(inv.pairId)}>Accept</button>
                        <button onClick={() => declineInvite(inv.pairId)}>Decline</button>
                      </div>
                    </div>
                  ))}
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
          <button className={tab === 'shared' ? 'active' : ''} onClick={() => setTab('shared')}>
            Shared{incomingInvites.length > 0 ? ` (${incomingInvites.length})` : ''}
          </button>
          <button className={tab === 'supporting' ? 'active' : ''} onClick={() => setTab('supporting')}>Supporting</button>
        </div>
        <div className="quote-banner">
          <span className="quote-text">"{QUOTES[quoteIdx]}"</span>
          <button className="quote-refresh" onClick={refreshQuote} title="New quote">↻</button>
        </div>
      </div>

      {tab === 'mine' && (
        <>
          {glanceRows.length > 0 && (
            <div className="overview-card">
              <div className="overview-head">
                <span className="overview-title">This month at a glance</span>
                <span className="overview-month">{monthLabel(todayYear, todayMonthIdx)}</span>
              </div>
              <div className="glance-scale" style={{ '--days': daysInMonth }}>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <span key={d}>{d === 1 || d % 5 === 0 || d === daysInMonth ? d : ''}</span>
                ))}
              </div>
              {glanceRows.map((r) => (
                <div
                  key={r.habit.id}
                  className="glance-row"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', r.habit.id)
                    e.currentTarget.classList.add('dragging')
                  }}
                  onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    reorderHabit(e.dataTransfer.getData('text/plain'), r.habit.id)
                  }}
                >
                  <span className="glance-drag-handle" title="Drag to reorder">⠿</span>
                  <span className="glance-icon" style={{ background: r.cat.soft, color: r.cat.color }}>{r.cat.icon}</span>
                  <span className="glance-name">{r.habit.name}</span>
                  <div className="glance-cells" style={{ '--days': daysInMonth }}>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const d = i + 1
                      const dateIso = `${monthPrefix}-${String(d).padStart(2, '0')}`
                      const isFuture = d > dayOfMonth
                      const on = r.doneSet.has(dateIso)
                      const isToday = dateIso === today
                      const cellStyle = {
                        ...(on ? { background: r.cat.color } : {}),
                        ...(isToday ? { outline: `1.5px solid ${r.cat.color}` } : {}),
                      }
                      return <span key={dateIso} className={'gc' + (on ? ' on' : '') + (isFuture ? ' future' : '')} style={cellStyle} title={dateIso} />
                    })}
                  </div>
                  <span className="glance-streak">🔥{r.streak}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mine-toolbar">
            <div className="cat-dropdown">
              <button className="cat-dropdown-btn" onClick={() => setCatFilterOpen((v) => !v)}>
                {categoryFilter !== 'all' && (
                  <span className="dd-dot" style={{ background: (allCats[categoryFilter] ?? FALLBACK_CAT).color }} />
                )}
                <span className="dd-label">{categoryFilter === 'all' ? 'All categories' : (allCats[categoryFilter] ?? FALLBACK_CAT).label}</span>
                <span className="dd-arrow">▾</span>
              </button>
              {catFilterOpen && (
                <>
                  <div className="bell-scrim" onClick={() => setCatFilterOpen(false)} />
                  <div className="cat-dropdown-menu">
                    <div
                      className={'cat-dropdown-item' + (categoryFilter === 'all' ? ' active' : '')}
                      onClick={() => { setCategoryFilter('all'); setCatFilterOpen(false) }}
                    >
                      All categories
                    </div>
                    <div className="cat-dropdown-sep" />
                    {categoriesWithHabits.map((c) => {
                      const cat = allCats[c] ?? FALLBACK_CAT
                      return (
                        <div
                          key={c}
                          className={'cat-dropdown-item' + (categoryFilter === c ? ' active' : '')}
                          onClick={() => { setCategoryFilter(c); setCatFilterOpen(false) }}
                        >
                          <span className="dot" style={{ background: cat.color }} />{cat.label}
                        </div>
                      )
                    })}
                    <div className="cat-dropdown-sep" />
                    <div className="cat-dropdown-item cat-dropdown-add" onClick={() => { setCatFilterOpen(false); setCatModalOpen(true) }}>
                      ＋ Add category
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {!loadingMine && habits.length === 0 && (
            <div className="empty-hint">No habits yet. Use "New habit" above to add one.</div>
          )}

          {orderedCategories.map((c) => {
            const cat = allCats[c] ?? FALLBACK_CAT
            const items = habitsSorted.filter((h) => h.category === c)
            if (items.length === 0) return null
            return (
              <div className="cat-section" key={c}>
                <div
                  className="cat-section-head"
                  draggable
                  title="Drag to reorder this category"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/category', c)
                    e.currentTarget.classList.add('dragging')
                  }}
                  onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    reorderCategory(e.dataTransfer.getData('text/category'), c)
                  }}
                >
                  <span className="cat-drag-handle">⠿</span>
                  <span className="dot" style={{ background: cat.color }} />
                  <h3>{cat.label}</h3>
                  <span className="count">{items.length}</span>
                </div>
                <div className="cat-row">
                  {items.map((h) => {
                    const hcat = allCats[h.category] ?? FALLBACK_CAT
                    const doneSet = logsByHabit[h.id] ?? new Set()
                    const streak = computeStreak(doneSet, today)
                    const sharedWith = pairedPartnerByHabit[h.id]
                    return (
                      <div
                        key={h.id}
                        className="hcard short"
                        style={{ '--cat': hcat.color, '--cat-soft': hcat.soft }}
                        onClick={() => openMineDetail(h)}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', h.id)
                          e.currentTarget.classList.add('dragging')
                        }}
                        onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          reorderHabit(e.dataTransfer.getData('text/plain'), h.id)
                        }}
                      >
                        <span className="drag-handle" title="Drag to reorder">⠿</span>
                        <div className="hcard-top">
                          <div className="hcard-icon">{hcat.icon}</div>
                          <div className="hcard-cat">{hcat.label}</div>
                        </div>
                        <div className="hcard-name">{h.name}</div>
                        {sharedWith && <div className="paired-note">🤝 {sharedWith}</div>}
                        <div className="hcard-streak">
                          <span className="num accent-num">{streak}</span>
                          <span className="lbl">day streak</span>
                        </div>
                        <HabitCalendar
                          doneSet={doneSet}
                          color={hcat.color}
                          year={todayYear}
                          month={todayMonthIdx}
                          today={today}
                          size="sm"
                          onToggleToday={() => toggleHabitToday(h.id)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {categoryFilter !== 'all' && habitsSorted.filter((h) => h.category === categoryFilter).length === 0 && (
            <div className="empty-hint">No habits in this category yet.</div>
          )}
        </>
      )}

      {tab === 'shared' && (
        <>
          {(incomingInvites.length > 0 || outgoingInvites.length > 0) && (
            <div className="invites-row">
              {incomingInvites.map((inv) => (
                <div key={inv.pairId} className="invite-card">
                  <div className="invite-text">🤝 <b>{inv.otherName}</b> wants to track "<b>{inv.name}</b>" together with you</div>
                  <div className="invite-actions">
                    <button className="invite-accept" onClick={() => acceptInvite(inv.pairId)}>Accept</button>
                    <button className="invite-decline" onClick={() => declineInvite(inv.pairId)}>Decline</button>
                  </div>
                </div>
              ))}
              {outgoingInvites.map((inv) => (
                <div key={inv.pairId} className="invite-card waiting">
                  <div className="invite-text">Waiting for <b>{inv.otherName}</b> to accept "<b>{inv.name}</b>"</div>
                </div>
              ))}
            </div>
          )}

          {pairs.length > 0 && (
            <div className="shared-toolbar">
              <div className="person-filters">
                <button
                  className={'filter-chip' + (sharedPersonFilter === 'all' ? ' active' : '')}
                  onClick={() => setSharedPersonFilter('all')}
                >
                  <span className="dot" style={{ background: 'var(--ink)' }} />All
                </button>
                {sharedPartners.map((name) => (
                  <button
                    key={name}
                    className={'person-filter-chip' + (sharedPersonFilter === name ? ' active' : '')}
                    onClick={() => setSharedPersonFilter(name)}
                  >
                    <span className="pav">{initial(name)}</span>{name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid">
            {!loadingPairs && pairs.length === 0 && incomingInvites.length === 0 && outgoingInvites.length === 0 && (
              <div className="empty-hint">
                Nothing shared yet. Create a habit above and choose "Track it together" to invite someone in your circle.
              </div>
            )}
            {!loadingPairs && pairs.length > 0 && pairsVisible.length === 0 && (
              <div className="empty-hint">No shared habits with this person yet.</div>
            )}
            {pairsVisible.map((p) => {
              const cat = allCats[p.mine.category] ?? FALLBACK_CAT
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
        </>
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
                  const cat = allCats[h.category] ?? FALLBACK_CAT
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
              const h = habits.find((x) => x.id === detail.habitId)
              if (!h) return null
              const cat = allCats[h.category] ?? FALLBACK_CAT
              const doneSet = logsByHabit[h.id] ?? new Set()
              const streak = computeStreak(doneSet, today)
              const best = bestStreak(doneSet)
              const thisMonthCount = [...doneSet].filter((d) => d.startsWith(monthPrefix)).length
              const weeks = weeklyCounts(doneSet, today, 8)
              const watchers = sharesByHabit[h.id] ?? []
              const availableContacts = contacts.filter((c) => !watchers.some((w) => w.contactId === c.id))

              return (
                <>
                  <span
                    className="panel-cat panel-cat-edit"
                    style={{ background: cat.soft, color: cat.color }}
                    onClick={() => setEditingCatFor(editingCatFor === h.id ? null : h.id)}
                  >
                    {cat.icon} {cat.label} ✎
                  </span>

                  {editingCatFor === h.id && (
                    <div className="cat-pick-row cat-pick-row-inline">
                      {Object.entries(allCats).map(([key, c]) => (
                        <button
                          key={key}
                          className={'cat-pick' + (h.category === key ? ' active' : '')}
                          style={h.category === key ? { background: c.color, borderColor: c.color, color: '#fff' } : undefined}
                          onClick={() => changeHabitCategory(h.id, key)}
                        >
                          <span className="dot" style={{ background: c.color }} />{c.label}
                        </button>
                      ))}
                      <button className="cat-pick cat-pick-add" onClick={() => setCatModalOpen(true)}>＋ New</button>
                    </div>
                  )}

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
                      <HabitCalendar
                        doneSet={doneSet}
                        color={cat.color}
                        year={panelMonth.year}
                        month={panelMonth.month}
                        today={today}
                        size="lg"
                        onToggleToday={() => toggleHabitToday(h.id)}
                      />
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
              const p = pairs.find((x) => x.pairId === detail.pairId)
              if (!p) return null
              const cat = allCats[p.mine.category] ?? FALLBACK_CAT
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
              const person = supporting.find((x) => x.ownerId === detail.personId)
              const habit = person?.habits.find((x) => x.id === detail.habitId)
              if (!person || !habit) return null
              const cat = allCats[habit.category] ?? FALLBACK_CAT
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
              {Object.entries(allCats).map(([key, c]) => (
                <button
                  key={key}
                  className={'cat-pick' + (modalCategory === key ? ' active' : '')}
                  style={modalCategory === key ? { background: c.color, borderColor: c.color, color: '#fff' } : undefined}
                  onClick={() => setModalCategory(key)}
                >
                  <span className="dot" style={{ background: c.color }} />{c.label}
                </button>
              ))}
              <button className="cat-pick cat-pick-add" onClick={() => setCatModalOpen(true)}>＋ New</button>
            </div>

            <div className="field-label">Who's tracking this?</div>
            <div className="who-pick-row">
              <div className={'who-pick' + (modalWho === 'me' ? ' active' : '')} onClick={() => setModalWho('me')}>
                <span className="rd" />Just me — private
              </div>
              <div className={'who-pick' + (modalWho === 'together' ? ' active' : '')} onClick={() => setModalWho('together')}>
                <span className="rd" />Track it together — invite someone, they accept, then both streaks compare
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
                {creatingHabit ? (modalWho === 'together' ? 'Sending…' : 'Creating…') : modalWho === 'together' ? 'Send invite' : 'Create habit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {catModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setCatModalOpen(false) }}>
          <div className="modal modal-sm">
            <h3>New category</h3>
            <p className="sub">Give it a name and a color — it'll show up everywhere alongside the built-in ones.</p>

            <div className="field-label">Name</div>
            <input
              type="text"
              placeholder="e.g. Home, Music, Side project"
              value={catLabel}
              onChange={(e) => setCatLabel(e.target.value)}
              maxLength={40}
            />

            <div className="field-label">Color</div>
            <div className="color-pick-row">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={'color-pick' + (catColor === c ? ' active' : '')}
                  style={{ background: c }}
                  onClick={() => setCatColor(c)}
                  aria-label={c}
                />
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setCatModalOpen(false)}>Cancel</button>
              <button className="btn-create" disabled={!catLabel.trim() || savingCat} onClick={submitNewCategory}>
                {savingCat ? 'Adding…' : 'Add category'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>
    </div>
  )
}
