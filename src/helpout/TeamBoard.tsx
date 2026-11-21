// Team management for the Lend a Hand board. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 built offers, counts and item creation.
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { staffContext } from '../workspace'
import { eventDate, kindLabels, type Kind } from './board'
import './helpout.css'

interface Item { id: string; kind: Kind; title: string; starts_at: string | null; goal: number | null; collected: number; closed: boolean; offers: number; pledged: number }
interface Offer { id: string; item_id: string; title: string; kind: Kind; name: string; contact_method: string; contact: string; quantity: number | null; note: string | null; status: 'new' | 'contacted' | 'confirmed'; created_at: string }
const statusLabels = { new: 'New', contacted: 'Contacted', confirmed: 'Received / done' }
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function TeamBoard() {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [data, setData] = useState<{ items: Item[]; offers: Offer[] } | null>(null)
  const [error, setError] = useState('')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState({ kind: 'supply' as Kind, title: '', detail: '', location: '', starts_at: '', goal: '' })
  const [formError, setFormError] = useState('')

  async function load(t = token) {
    const result = await supabase.rpc('team_board', { p_token: t ?? null })
    if (result.error) { setError('Sign in through the Queue first to manage the community board.'); return }
    setData(result.data)
  }
  useEffect(() => {
    staffContext().then(c => { setToken(c.token); load(c.token) })
      .catch(() => setError('Sign in through the Queue first to manage the community board.'))
  }, [])

  async function act(p_action: string, args: { p_item?: string; p_offer?: string; p_data?: object }) {
    const result = await supabase.rpc('manage_board', { p_action, p_token: token ?? null, ...args })
    if (result.error) { setError('That change didn’t save. Refresh and try again.'); return false }
    setError('')
    await load()
    return true
  }
  async function add(event: FormEvent) {
    event.preventDefault()
    const goal = Number(draft.goal)
    if (!draft.title.trim() || !draft.detail.trim()) { setFormError('Enter a title and a short description.'); return }
    if (draft.kind !== 'skill' && (!Number.isInteger(goal) || goal < 1)) { setFormError('Enter a goal of at least 1.'); return }
    if (draft.kind === 'event' && !draft.starts_at) { setFormError('Choose when the event starts.'); return }
    setFormError('')
    const ok = await act('add_item', { p_data: {
      kind: draft.kind, title: draft.title.trim(), detail: draft.detail.trim(), location: draft.location.trim(),
      starts_at: draft.kind === 'event' ? new Date(draft.starts_at).toISOString() : null, goal: draft.kind === 'skill' ? null : goal,
    } })
    if (ok) setDraft({ kind: draft.kind, title: '', detail: '', location: '', starts_at: '', goal: '' })
  }

  if (error && !data) return <main className="help-page"><h1>Community board</h1><p className="help-error">{error}</p><a href="/team">Open the queue</a></main>
  if (!data) return <main className="help-page" role="status">Loading…</main>
  const fresh = data.offers.filter(o => o.status === 'new').length

  return <main className="help-page team-board">
    <div className="help-intro"><p className="help-kicker">Team workspace <span> / </span> Community board</p>
      <h1>Lend a Hand board</h1>
      <p>Offers from neighbors arrive here. When donated supplies arrive, add them to Received and mark the offer Received / done. The public page updates right away. <a href="/help-out" target="_blank" rel="noreferrer">View the public board</a></p></div>
    {error && <p className="help-error" role="alert">{error}</p>}

    <section className="help-section" aria-labelledby="offers-title">
      <h2 id="offers-title">Offers of help {fresh > 0 && <span className="board-badge">{fresh} new</span>}</h2>
      {data.offers.length === 0 ? <p className="help-detail">No offers yet. They’ll show up here as neighbors respond.</p>
        : <div className="board-table-wrap"><table className="board-table">
          <thead><tr><th>Neighbor</th><th>Offer</th><th>Contact</th><th>Received</th><th>Status</th></tr></thead>
          <tbody>{data.offers.map(o => <tr key={o.id} className={o.status === 'new' ? 'is-new' : undefined}>
            <td><strong>{o.name}</strong>{o.note && <div className="board-note">“{o.note}”</div>}</td>
            <td>{o.title}{o.quantity ? <> · <strong>{o.quantity}</strong></> : null}</td>
            <td>{{ text: 'Text', phone: 'Call', email: 'Email' }[o.contact_method]} {o.contact}</td>
            <td>{when(o.created_at)}</td>
            <td><select aria-label={`Status for ${o.name}`} value={o.status} onChange={e => act('offer_status', { p_offer: o.id, p_data: { status: e.target.value } })}>
              {Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
          </tr>)}</tbody></table></div>}
    </section>

    <section className="help-section" aria-labelledby="items-title">
      <h2 id="items-title">Needs and events</h2>
      <ul className="board-items">{data.items.map(i => <li key={i.id} className={i.closed ? 'is-closed' : undefined}>
        <div><p className="help-card-kicker">{i.kind === 'event' && i.starts_at ? eventDate(i.starts_at) : kindLabels[i.kind]}{i.closed && ' · Closed'}</p>
          <strong>{i.title}</strong>
          <p className="help-count">{i.offers} {i.offers === 1 ? 'offer' : 'offers'}{i.kind === 'supply' && i.pledged > 0 && ` · ${i.pledged} pledged`}</p></div>
        {i.kind !== 'skill' && <form className="board-count" onSubmit={e => { e.preventDefault(); const n = Number(counts[i.id]); if (Number.isInteger(n) && n >= 0) act('set_collected', { p_item: i.id, p_data: { collected: n } }) }}>
          <label htmlFor={'count-' + i.id}>{i.kind === 'supply' ? 'Received' : 'Signed up before site'}</label>
          <input id={'count-' + i.id} inputMode="numeric" value={counts[i.id] ?? String(i.collected)} onChange={e => setCounts(c => ({ ...c, [i.id]: e.target.value }))}/>
          <span>of {i.goal}</span><button className="help-secondary">Save</button></form>}
        <button className="help-secondary" onClick={() => act(i.closed ? 'reopen_item' : 'close_item', { p_item: i.id })}>{i.closed ? 'Reopen' : 'Close'}</button>
      </li>)}</ul>
    </section>

    <section className="help-section" aria-labelledby="add-title">
      <h2 id="add-title">Add to the board</h2>
      <form className="board-add" onSubmit={add} noValidate>
        <div className="help-field"><label htmlFor="add-kind">Type</label>
          <select id="add-kind" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value as Kind }))}>
            {(Object.keys(kindLabels) as Kind[]).map(k => <option key={k} value={k}>{kindLabels[k]}</option>)}</select></div>
        <div className="help-field"><label htmlFor="add-title">Title</label>
          <input id="add-title" maxLength={80} value={draft.title} placeholder="Winter gloves" onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}/></div>
        <div className="help-field board-wide"><label htmlFor="add-detail">Short description</label>
          <input id="add-detail" maxLength={300} value={draft.detail} onChange={e => setDraft(d => ({ ...d, detail: e.target.value }))}/></div>
        <div className="help-field"><label htmlFor="add-location">Location (optional)</label>
          <input id="add-location" maxLength={120} value={draft.location} onChange={e => setDraft(d => ({ ...d, location: e.target.value }))}/></div>
        {draft.kind === 'event' && <div className="help-field"><label htmlFor="add-start">Starts</label>
          <input id="add-start" type="datetime-local" value={draft.starts_at} onChange={e => setDraft(d => ({ ...d, starts_at: e.target.value }))}/></div>}
        {draft.kind !== 'skill' && <div className="help-field"><label htmlFor="add-goal">{draft.kind === 'event' ? 'Spots' : 'Goal'}</label>
          <input id="add-goal" inputMode="numeric" value={draft.goal} onChange={e => setDraft(d => ({ ...d, goal: e.target.value }))}/></div>}
        {formError && <p className="help-error board-wide" role="alert">{formError}</p>}
        <div className="board-wide"><button className="help-primary">Add to board</button></div>
      </form>
    </section>
  </main>
}
