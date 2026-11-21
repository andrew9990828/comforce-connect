// Public Lend a Hand page. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 built the board, filters and offer form.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { isStaffMode, residentToken } from '../workspace'
import { submissionKey } from '../intake/form'
import { eventDate, kindLabels, progress, validateOffer, type BoardItem, type Kind, type OfferDraft } from './board'
import './helpout.css'

const blank: OfferDraft = { name: '', method: 'text', contact: '', quantity: '', note: '' }
const buttonLabel: Record<Kind, string> = { supply: 'I can bring some', event: 'Sign me up', skill: 'Offer this skill' }
const token = () => isStaffMode() ? Promise.resolve(null) : residentToken()

function OfferForm({ item, onDone, onCancel }: { item: BoardItem; onDone: (name: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(blank)
  const [errors, setErrors] = useState<ReturnType<typeof validateOffer>>({})
  const [failed, setFailed] = useState('')
  const [saving, setSaving] = useState(false)
  const key = useRef(submissionKey())
  const set = (field: keyof OfferDraft, value: string) => { setDraft(d => ({ ...d, [field]: value })); setErrors(e => ({ ...e, [field]: undefined })) }
  const id = (field: string) => `${item.id}-${field}`
  const err = (field: keyof OfferDraft) => errors[field] && <p id={id(field) + '-error'} className="help-error">{errors[field]}</p>

  async function submit(event: FormEvent) {
    event.preventDefault()
    const problems = validateOffer(item.kind, draft)
    setErrors(problems)
    setFailed('')
    if (Object.values(problems).some(Boolean)) return
    setSaving(true)
    try {
      const result = await supabase.rpc('offer_help', {
        p_key: key.current, p_item: item.id, p_name: draft.name.trim(), p_contact_method: draft.method,
        p_contact: draft.contact.trim(), p_quantity: item.kind === 'supply' ? Number(draft.quantity) : null,
        p_note: draft.note.trim() || null, p_token: await token(),
      })
      if (result.error) { setFailed(result.error.code === '22023' || result.error.code === 'P0002' ? result.error.message : 'We couldn’t save your offer. Try again.'); return }
      onDone(draft.name.trim())
    } catch {
      setFailed('We couldn’t save your offer. Check your connection and try again.')
    } finally { setSaving(false) }
  }

  return <form className="help-form" onSubmit={submit} noValidate aria-label={`Offer help: ${item.title}`}>
    <fieldset disabled={saving}>
      <div className="help-field"><label htmlFor={id('name')}>First name</label>
        <input id={id('name')} value={draft.name} maxLength={80} autoComplete="given-name" aria-invalid={!!errors.name}
          aria-describedby={errors.name ? id('name') + '-error' : undefined} onChange={e => set('name', e.target.value)}/>{err('name')}</div>
      {item.kind === 'supply' && <div className="help-field"><label htmlFor={id('quantity')}>How many can you bring?</label>
        <input id={id('quantity')} inputMode="numeric" value={draft.quantity} maxLength={3} aria-invalid={!!errors.quantity}
          aria-describedby={errors.quantity ? id('quantity') + '-error' : undefined} onChange={e => set('quantity', e.target.value)}/>{err('quantity')}</div>}
      <div className="help-field"><span className="help-label">How should we reach you?</span>
        <div className="help-methods">{(['text', 'phone', 'email'] as const).map(m =>
          <label key={m}><input type="radio" name={id('method')} checked={draft.method === m} onChange={() => set('method', m)}/>{{ text: 'Text', phone: 'Call', email: 'Email' }[m]}</label>)}</div></div>
      <div className="help-field"><label htmlFor={id('contact')}>{draft.method === 'email' ? 'Email address' : 'Phone number'}</label>
        <input id={id('contact')} type={draft.method === 'email' ? 'email' : 'tel'} value={draft.contact} autoComplete="off"
          placeholder={draft.method === 'email' ? 'neighbor@example.com' : '(414) 555-0100'} aria-invalid={!!errors.contact}
          aria-describedby={errors.contact ? id('contact') + '-error' : undefined} onChange={e => set('contact', e.target.value)}/>{err('contact')}</div>
      <div className="help-field"><label htmlFor={id('note')}>Anything we should know? (optional)</label>
        <input id={id('note')} value={draft.note} maxLength={300} placeholder={item.kind === 'skill' ? 'For example, free weekday evenings' : ''}
          onChange={e => set('note', e.target.value)}/>{err('note')}</div>
      {failed && <p className="help-error" role="alert">{failed}</p>}
      <div className="help-actions"><button type="submit" className="help-primary">{saving ? 'Saving…' : 'Send my offer'}</button>
        <button type="button" className="help-secondary" onClick={onCancel}>Cancel</button></div>
      <p className="help-privacy">Only the ComForce team sees your name and contact. Use fictional details for this demo.</p>
    </fieldset>
  </form>
}

function Card({ item, onOffered }: { item: BoardItem; onOffered: () => void }) {
  const [open, setOpen] = useState(false)
  const [thanks, setThanks] = useState('')
  const p = progress(item)
  const full = item.kind === 'event' && p.left === 0
  return <li className={'help-card help-' + item.kind}>
    <p className="help-card-kicker">{item.kind === 'event' && item.starts_at ? eventDate(item.starts_at) : kindLabels[item.kind]}</p>
    <h3>{item.title}</h3>
    <p className="help-detail">{item.detail}</p>
    {item.location && <p className="help-location"><span aria-hidden="true">◉</span> {item.location}</p>}
    {item.kind !== 'skill' && <div className="help-progress">
      <div className="help-bar" role="img" aria-label={item.kind === 'supply' ? `${p.have} of ${p.goal} collected, ${p.incoming} more on the way` : `${p.have} of ${p.goal} spots filled`}>
        <span className="help-bar-incoming" style={{ width: p.incomingPercent + '%' }}/><span className="help-bar-have" style={{ width: p.percent + '%' }}/></div>
      <p className="help-count">{item.kind === 'supply'
        ? <><strong>{p.have} of {p.goal}</strong> collected{p.incoming > 0 && <> · {p.incoming} more on the way</>}</>
        : <><strong>{p.have} going</strong> · {full ? 'Full' : `${p.left} spots left`}</>}</p>
    </div>}
    {thanks ? <p className="help-thanks" role="status">Thanks, {thanks}. ComForce will reach out to confirm the details.</p>
      : open ? <OfferForm item={item} onCancel={() => setOpen(false)} onDone={name => { setThanks(name); setOpen(false); onOffered() }}/>
      : <button className="help-primary" disabled={full} onClick={() => setOpen(true)}>{full ? 'Event full' : buttonLabel[item.kind]}</button>}
  </li>
}

export default function HelpOut() {
  const [items, setItems] = useState<BoardItem[] | null>(null)
  const [offers, setOffers] = useState(0)
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [error, setError] = useState('')

  async function load() {
    try {
      const result = await supabase.rpc('community_board', { p_token: await token() })
      if (result.error) throw result.error
      setItems(result.data.items)
      setOffers(result.data.offers_this_month)
    } catch { setError('The community board isn’t available right now. Try refreshing the page.') }
  }
  useEffect(() => { load() }, [])

  const kinds: Kind[] = ['supply', 'event', 'skill']
  return <main className="help-page">
    <div className="help-intro"><p className="help-kicker">Lend a hand <span> / </span> Fictional demo</p>
      <h1>Help your neighbors this week</h1>
      <p>Whether you have five minutes or a Saturday morning, there’s a way to help. Pick what fits and ComForce will follow up.</p>
      {offers > 0 && <p className="help-stat"><strong>{offers}</strong> {offers === 1 ? 'neighbor has' : 'neighbors have'} offered help this month.</p>}</div>
    <div className="help-filters" role="group" aria-label="Filter ways to help">
      {(['all', ...kinds] as const).map(k => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
        {k === 'all' ? 'Everything' : kindLabels[k]}</button>)}
    </div>
    {error && <p className="help-error" role="alert">{error}</p>}
    {!items && !error && <p role="status">Loading…</p>}
    {items && kinds.filter(k => filter === 'all' || filter === k).map(k => {
      const list = items.filter(i => i.kind === k)
      return list.length > 0 && <section key={k} className="help-section" aria-labelledby={'help-' + k}>
        <h2 id={'help-' + k}>{kindLabels[k]}</h2>
        <ul className="help-grid">{list.map(item => <Card key={item.id} item={item} onOffered={load}/>)}</ul>
      </section>
    })}
    <aside className="help-need"><h2>Need help yourself?</h2><p>ComForce connects residents with food, rides and family support.</p>
      <a href="/request">Request help</a></aside>
  </main>
}
