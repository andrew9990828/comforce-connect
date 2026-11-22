// Team management for the Lend a Hand board. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 built offers, counts and item creation.
// Staff mode follows the queue: the board belongs to the signed-in account and is cleared the moment it changes.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { isStaffMode, demoStaffToken } from '../workspace'
import { submissionKey } from '../intake/form'
import TeamLogin from '../team/TeamLogin'
import { t, chicagoDate } from '../languages/language'
import { chicagoTime } from '../../server/agents/time'
import { kindLabels, type Kind } from './board'
import { createFeed, type Feed, type FeedState } from './feed'
import { useFeed } from './useFeed'
import './helpout.css'

interface Item {
  id: string; kind: Kind; title: string; starts_at: string | null; goal: number | null; collected: number; received: number
  closed: boolean; ended: boolean; offers: number; pledged: number
}
interface Offer {
  id: string; item_id: string; title: string; kind: Kind; name: string; contact_method: string; contact: string
  quantity: number | null; received: number | null; note: string | null; status: 'new' | 'contacted' | 'confirmed'; created_at: string
}
type Board = { token: string | null; items: Item[]; offers: Offer[] }
const statusLabels = { new: 'New', contacted: 'Contacted', confirmed: 'Received / done' }
const blankDraft = { kind: 'supply' as Kind, title: '', detail: '', location: '', starts_at: '', goal: '' }
const userMessages = ['22023', '40001']

// Demo browsers manage their own private workspace; verified staff use their session and no capability token.
function boardFeed(staff: boolean) {
  return createFeed<Board>(async (_session, signal) => {
    const token = staff ? null : await demoStaffToken()
    const result = await supabase.rpc('team_board', { p_token: token }).abortSignal(signal)
    if (result.error) throw result.error
    return { ...result.data, token }
  })
}

export default function TeamBoard() {
  const staff = isStaffMode()
  const [account, setAccount] = useState<string | null | undefined>(staff ? undefined : 'demo')
  const [feed] = useState(() => boardFeed(staff))
  const snapshot = useFeed(feed)
  useEffect(() => {
    if (!staff) return
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAccount(session?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [staff])
  useEffect(() => { feed.start(); return () => { feed.stop(); feed.setSession(null) } }, [feed])
  useEffect(() => { feed.setSession(account ?? null) }, [feed, account])
  if (account === undefined) return <main className="help-page" role="status">{t("Checking staff session…")}</main>
  if (account === null) return <TeamLogin/>
  if (snapshot.session !== account) return <main className="help-page" role="status">{t("Loading…")}</main>
  return <ManageBoard key={snapshot.data?.token ?? account} feed={feed} snapshot={snapshot} staff={staff} />
}

function ManageBoard({ feed, snapshot, staff }: { feed: Feed<Board>; snapshot: FeedState<Board>; staff: boolean }) {
  const { data, error: loadError, denied } = snapshot
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [counts, setCounts] = useState<Record<string, { value: string; expected: number }>>({})
  const [receipts, setReceipts] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState(blankDraft)
  const [formError, setFormError] = useState('')
  const addKey = useRef(submissionKey())
  const inflight = useRef(new Set<string>())
  const queue = staff ? '/team?mode=staff' : '/team'
  const preview = staff ? '/help-out?mode=staff' : '/help-out#my-workspace'

  async function act(job: string, p_action: string, args: { p_item?: string; p_offer?: string; p_data?: object }) {
    if (!data || inflight.current.has(job)) return false
    inflight.current.add(job)
    setBusy(b => ({ ...b, [job]: true }))
    try {
      const result = await supabase.rpc('manage_board', { p_action, p_token: data.token, ...args })
      if (result.error) {
        setError(userMessages.includes(result.error.code) ? result.error.message : 'That change didn’t save. Check your connection and try again.')
        return result.error.code === '40001' ? 'conflict' : false
      }
      setError('')
      return true
    } catch {
      setError('That change didn’t save. Check your connection and try again.')
      return false
    } finally {
      inflight.current.delete(job)
      setBusy(b => ({ ...b, [job]: false }))
      void feed.refresh()
    }
  }

  function editDraft(change: Partial<typeof blankDraft>) {
    setDraft(d => ({ ...d, ...change }))
    addKey.current = submissionKey() // A changed form is a new item; an unchanged retry reuses the key.
  }
  async function add(event: FormEvent) {
    event.preventDefault()
    if (inflight.current.has('add')) return
    const goal = Number(draft.goal)
    if (!draft.title.trim() || !draft.detail.trim()) { setFormError('Enter a title and a short description.'); return }
    if (draft.kind !== 'skill' && (!Number.isInteger(goal) || goal < 1 || goal > 10000)) { setFormError('Enter a goal from 1 to 10,000.'); return }
    let startsAt: string | null = null
    if (draft.kind === 'event') {
      try { startsAt = chicagoTime(draft.starts_at) } catch { setFormError('Choose a valid start time in Chicago.'); return }
    }
    setFormError('')
    const ok = await act('add', 'add_item', { p_data: {
      key: addKey.current, kind: draft.kind, title: draft.title.trim(), detail: draft.detail.trim(), location: draft.location.trim(),
      starts_at: startsAt, goal: draft.kind === 'skill' ? null : goal,
    } })
    if (ok === true) { setDraft({ ...blankDraft, kind: draft.kind }); addKey.current = submissionKey() }
  }
  async function saveCount(item: Item) {
    const edit = counts[item.id]
    const n = Number(edit?.value)
    if (!edit?.value.trim() || !Number.isInteger(n) || n < 0 || n > 10000) { setError('Enter a whole number from 0 to 10,000.'); return }
    const result = await act('count-' + item.id, 'set_collected', { p_item: item.id, p_data: { collected: n, expected: edit.expected } })
    if (result) setCounts(c => { const { [item.id]: _, ...rest } = c; return rest })
  }
  async function receive(offer: Offer) {
    const n = Number(receipts[offer.id] ?? offer.received ?? offer.quantity)
    if (!Number.isInteger(n) || n < 1 || n > 500) { setError('Enter how many arrived, from 1 to 500.'); return }
    if (await act('offer-' + offer.id, 'receive_offer', { p_offer: offer.id, p_data: { received: n } })) {
      setReceipts(r => { const { [offer.id]: _, ...rest } = r; return rest })
    }
  }

  if (!data) {
    if (denied) return <main className="help-page"><h1>{t("Community board")}</h1>
      <p className="help-error">{t(staff ? 'This account can’t manage the community board. Sign in through the queue with a staff account.' : 'This demo board is unavailable in this browser.')}</p>
      <a href={queue}>{t("Open the queue")}</a></main>
    if (loadError) return <main className="help-page"><h1>{t("Community board")}</h1>
      <p className="help-error" role="alert">{t("Could not open the community board. Check your connection and try again.")}</p>
      <button className="help-secondary" onClick={() => void feed.refresh()}>{t("Retry")}</button></main>
    return <main className="help-page" role="status">{t("Loading…")}</main>
  }
  const fresh = data.offers.filter(o => o.status === 'new').length

  return <main className="help-page team-board">
    <div className="help-intro"><p className="help-kicker">{t("Team workspace")} <span> / </span> {t("Community board")}</p>
      <h1>{t("Lend a Hand board")}</h1>
      <p>{t("Offers from neighbors arrive here. When donated supplies arrive, enter how many came in on that offer and choose Mark received. The public page updates within a few seconds.")} <a href={preview} target="_blank" rel="noreferrer">{t("View the public board")}</a></p></div>
    {error && <p className="help-error" role="alert">{t(error)}</p>}
    {!!loadError && <p className="help-error" role="status">{t("Could not refresh the board. Showing the last update.")}</p>}

    <section className="help-section" aria-labelledby="offers-title">
      <h2 id="offers-title">{t("Offers of help")} {fresh > 0 && <span className="board-badge">{t('{count} new', { count: fresh })}</span>}</h2>
      {data.offers.length === 0 ? <p className="help-detail">{t("No offers yet. They’ll show up here as neighbors respond.")}</p>
        : <div className="board-table-wrap"><table className="board-table">
          <thead><tr><th>{t("Neighbor")}</th><th>{t("Offer")}</th><th>{t("Contact")}</th><th>{t("Sent")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{data.offers.map(o => {
            const job = 'offer-' + o.id
            const supply = o.kind === 'supply'
            return <tr key={o.id} className={o.status === 'new' ? 'is-new' : undefined}>
              <td><strong>{o.name}</strong>{o.note && <div className="board-note">“{o.note}”</div>}</td>
              <td>{o.title}{o.quantity ? <> · {t('{count} offered', { count: o.quantity })}</> : null}
                {o.received ? <div className="board-note">{t('{count} received', { count: o.received })}</div> : null}</td>
              <td>{t({ text: 'Text', phone: 'Call', email: 'Email' }[o.contact_method] ?? '')} {o.contact}</td>
              <td>{chicagoDate(o.created_at)}</td>
              <td><select aria-label={t('Status for {name}', { name: o.name })} value={o.status} disabled={busy[job]}
                  onChange={e => act(job, 'offer_status', { p_offer: o.id, p_data: { status: e.target.value } })}>
                  {Object.entries(statusLabels).filter(([v]) => !supply || v !== 'confirmed' || o.status === 'confirmed')
                    .map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
                {supply && <form className="board-receive" onSubmit={e => { e.preventDefault(); void receive(o) }}>
                  <label htmlFor={'receive-' + o.id}>{t("Arrived")}</label>
                  <input id={'receive-' + o.id} inputMode="numeric" value={receipts[o.id] ?? String(o.received ?? o.quantity ?? '')}
                    onChange={e => setReceipts(r => ({ ...r, [o.id]: e.target.value }))}/>
                  <button className="help-secondary" disabled={busy[job]}>{t(o.received ? 'Update' : 'Mark received')}</button></form>}</td>
            </tr>
          })}</tbody></table></div>}
    </section>

    <section className="help-section" aria-labelledby="items-title">
      <h2 id="items-title">{t("Needs and events")}</h2>
      <ul className="board-items">{data.items.map(i => {
        const edit = counts[i.id]
        return <li key={i.id} className={i.closed || i.ended ? 'is-closed' : undefined}>
          <div><p className="help-card-kicker">{i.kind === 'event' && i.starts_at ? chicagoDate(i.starts_at) : t(kindLabels[i.kind])}{(i.closed || i.ended) && <> · {t(i.closed ? 'Closed' : 'Ended')}</>}</p>
            <strong>{i.title}</strong>
            <p className="help-count">{t(i.offers === 1 ? '{count} offer' : '{count} offers', { count: i.offers })}
              {i.kind === 'supply' && <> · <strong>{t('{have} of {goal} collected', { have: i.received, goal: i.goal ?? 0 })}</strong>{i.pledged > 0 && <> · {t('{incoming} on the way', { incoming: i.pledged })}</>}</>}</p></div>
          {i.kind !== 'skill' && <form className="board-count" onSubmit={e => { e.preventDefault(); void saveCount(i) }}>
            <label htmlFor={'count-' + i.id}>{t(i.kind === 'supply' ? 'Other donations (not from an offer)' : 'Signed up before site')}</label>
            <input id={'count-' + i.id} disabled={busy['count-' + i.id]} inputMode="numeric" value={edit?.value ?? String(i.collected)}
              onChange={e => setCounts(c => ({ ...c, [i.id]: { value: e.target.value, expected: c[i.id]?.expected ?? i.collected } }))}/>
            {i.kind === 'event' && <span>{t('of {goal}', { goal: i.goal ?? 0 })}</span>}
            <button className="help-secondary" disabled={!edit || busy['count-' + i.id]}>{t("Save")}</button></form>}
          <button className="help-secondary" disabled={busy['item-' + i.id]}
            onClick={() => act('item-' + i.id, i.closed ? 'reopen_item' : 'close_item', { p_item: i.id })}>{t(i.closed ? 'Reopen' : 'Close')}</button>
        </li>
      })}</ul>
    </section>

    <section className="help-section" aria-labelledby="add-heading">
      <h2 id="add-heading">{t("Add to the board")}</h2>
      <form className="board-add" onSubmit={add} noValidate>
        <fieldset disabled={busy.add}>
          <div className="help-field"><label htmlFor="add-kind">{t("Type")}</label>
            <select id="add-kind" value={draft.kind} onChange={e => editDraft({ kind: e.target.value as Kind })}>
              {(Object.keys(kindLabels) as Kind[]).map(k => <option key={k} value={k}>{t(kindLabels[k])}</option>)}</select></div>
          <div className="help-field"><label htmlFor="add-title">{t("Title")}</label>
            <input id="add-title" maxLength={80} value={draft.title} placeholder={t("Winter gloves")} onChange={e => editDraft({ title: e.target.value })}/></div>
          <div className="help-field board-wide"><label htmlFor="add-detail">{t("Short description")}</label>
            <input id="add-detail" maxLength={300} value={draft.detail} onChange={e => editDraft({ detail: e.target.value })}/></div>
          <div className="help-field"><label htmlFor="add-location">{t("Location (optional)")}</label>
            <input id="add-location" maxLength={120} value={draft.location} onChange={e => editDraft({ location: e.target.value })}/></div>
          {draft.kind === 'event' && <div className="help-field"><label htmlFor="add-start">{t("Starts (Chicago time)")}</label>
            <input id="add-start" type="datetime-local" value={draft.starts_at} onChange={e => editDraft({ starts_at: e.target.value })}/></div>}
          {draft.kind !== 'skill' && <div className="help-field"><label htmlFor="add-goal">{t(draft.kind === 'event' ? 'Spots' : 'Goal')}</label>
            <input id="add-goal" inputMode="numeric" value={draft.goal} onChange={e => editDraft({ goal: e.target.value })}/></div>}
          {formError && <p className="help-error board-wide" role="alert">{t(formError)}</p>}
          <div className="board-wide"><button className="help-primary">{t(busy.add ? 'Adding…' : 'Add to board')}</button></div>
        </fieldset>
      </form>
    </section>
  </main>
}
