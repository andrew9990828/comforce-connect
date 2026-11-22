// Public Lend a Hand page. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 built the board, filters and offer form.
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { ExpiredPairing, pairingRejected, isStaffMode, residentToken } from '../workspace'
import ResidentRepair from '../ResidentRepair'
import { pendingOperation } from '../team/pendingOperation'
import { t, chicagoDate } from '../languages/language'
import { kindLabels, offersLabel, progress, validateOffer, type BoardItem, type Kind, type OfferDraft } from './board'
import { createFeed } from './feed'
import { useFeed } from './useFeed'
import './helpout.css'

const blank: OfferDraft = { name: '', method: 'text', contact: '', quantity: '', note: '' }
const buttonLabel: Record<Kind, string> = { supply: 'I can bring some', event: 'Sign me up', skill: 'Offer this skill' }
const token = () => isStaffMode() ? Promise.resolve(null) : residentToken()
type PublicBoard = { token: string | null; items: BoardItem[]; offers_this_month: number }
// Same refresh rhythm as the staff board and atlas, so a change made on another device shows up without reloading.
const publicFeed = () => createFeed<PublicBoard>(async (_session, signal) => {
  const credential = await token()
  const result = await supabase.rpc('community_board', { p_token: credential }).abortSignal(signal)
  if (result.error && pairingRejected(credential, result.status, result.error.code)) throw new ExpiredPairing()
  if (result.error) throw result.error
  return { ...result.data, token: credential }
})

function OfferForm({ item, credential, onExpired, onDone, onCancel }: { item: BoardItem; credential: string | null; onExpired: () => void; onDone: (name: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(blank)
  const [errors, setErrors] = useState<ReturnType<typeof validateOffer>>({})
  const [failed, setFailed] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (field: keyof OfferDraft, value: string) => { setDraft(d => ({ ...d, [field]: value })); setErrors(e => ({ ...e, [field]: undefined })) }
  const id = (field: string) => `${item.id}-${field}`
  const err = (field: keyof OfferDraft) => errors[field] && <p id={id(field) + '-error'} className="help-error">{t(errors[field]!)}</p>

  async function submit(event: FormEvent) {
    event.preventDefault()
    const problems = validateOffer(item.kind, draft)
    setErrors(problems)
    setFailed('')
    if (Object.values(problems).some(Boolean)) return
    setSaving(true)
    try {
      const payload = {
        p_item: item.id, p_name: draft.name.trim(), p_contact_method: draft.method,
        p_contact: draft.contact.trim(), p_quantity: item.kind === 'supply' ? String(Number(draft.quantity)) : null,
        p_note: draft.note.trim() || null, p_token: credential,
      }
      const operation = pendingOperation(payload)
      const result = await supabase.rpc('offer_help', { ...payload, p_key: operation.key,
        p_quantity: payload.p_quantity === null ? null : Number(payload.p_quantity) })
      if (result.error && pairingRejected(credential, result.status, result.error.code)) { onExpired(); return }
      if (result.error) { setFailed(result.error.code === '22023' || result.error.code === 'P0002' ? result.error.message : 'We couldn’t save your offer. Try again.'); return }
      operation.confirm()
      onDone(draft.name.trim())
    } catch {
      setFailed('We couldn’t save your offer. Check your connection and try again.')
    } finally { setSaving(false) }
  }

  return <form className="help-form" onSubmit={submit} noValidate aria-label={t('Offer help for {title}', { title: item.title })}>
    <fieldset disabled={saving}>
      <div className="help-field"><label htmlFor={id('name')}>{t("First name")}</label>
        <input id={id('name')} value={draft.name} maxLength={80} autoComplete="given-name" aria-invalid={!!errors.name}
          aria-describedby={errors.name ? id('name') + '-error' : undefined} onChange={e => set('name', e.target.value)}/>{err('name')}</div>
      {item.kind === 'supply' && <div className="help-field"><label htmlFor={id('quantity')}>{t("How many can you bring?")}</label>
        <input id={id('quantity')} inputMode="numeric" value={draft.quantity} maxLength={3} aria-invalid={!!errors.quantity}
          aria-describedby={errors.quantity ? id('quantity') + '-error' : undefined} onChange={e => set('quantity', e.target.value)}/>{err('quantity')}</div>}
      <div className="help-field"><span className="help-label">{t("How should we reach you?")}</span>
        <div className="help-methods">{(['text', 'phone', 'email'] as const).map(m =>
          <label key={m}><input type="radio" name={id('method')} checked={draft.method === m} onChange={() => set('method', m)}/>{t({ text: 'Text', phone: 'Call', email: 'Email' }[m])}</label>)}</div></div>
      <div className="help-field"><label htmlFor={id('contact')}>{t(draft.method === 'email' ? 'Email address' : 'Phone number')}</label>
        <input id={id('contact')} type={draft.method === 'email' ? 'email' : 'tel'} value={draft.contact} autoComplete="off"
          placeholder={draft.method === 'email' ? 'neighbor@example.com' : '(414) 555-0100'} aria-invalid={!!errors.contact}
          aria-describedby={errors.contact ? id('contact') + '-error' : undefined} onChange={e => set('contact', e.target.value)}/>{err('contact')}</div>
      <div className="help-field"><label htmlFor={id('note')}>{t("Anything we should know? (optional)")}</label>
        <input id={id('note')} value={draft.note} maxLength={300} placeholder={item.kind === 'skill' ? t('For example, free weekday evenings') : ''}
          onChange={e => set('note', e.target.value)}/>{err('note')}</div>
      {failed && <p className="help-error" role="alert">{t(failed)}</p>}
      <div className="help-actions"><button type="submit" className="help-primary">{t(saving ? 'Saving…' : 'Send my offer')}</button>
        <button type="button" className="help-secondary" onClick={onCancel}>{t("Cancel")}</button></div>
      <p className="help-privacy">{t("Only the ComForce team sees your name and contact. Use fictional details for this demo.")}</p>
    </fieldset>
  </form>
}

function Card({ item, credential, onOffered }: { item: BoardItem; credential: string | null; onOffered: () => void }) {
  const [open, setOpen] = useState(false)
  const [thanks, setThanks] = useState('')
  const p = progress(item)
  const full = item.kind === 'event' && p.left === 0
  return <li className={'help-card help-' + item.kind}>
    <p className="help-card-kicker">{item.kind === 'event' && item.starts_at ? chicagoDate(item.starts_at) : t(kindLabels[item.kind])}</p>
    <h3>{item.title}</h3>
    <p className="help-detail">{item.detail}</p>
    {item.location && <p className="help-location"><span aria-hidden="true">◉</span> {item.location}</p>}
    {item.kind !== 'skill' && <div className="help-progress">
      <div className="help-bar" role="img" aria-label={item.kind === 'supply'
        ? t('{have} of {goal} collected; {incoming} on the way', p) : t('{have} of {goal} spots filled', p)}>
        <span className="help-bar-incoming" style={{ width: p.incomingPercent + '%' }}/><span className="help-bar-have" style={{ width: p.percent + '%' }}/></div>
      <p className="help-count">{item.kind === 'supply'
        ? <><strong>{t('{have} of {goal} collected', p)}</strong>{p.incoming > 0 && <> · {t('{incoming} on the way', p)}</>}</>
        : <><strong>{t('{have} going', p)}</strong> · {full ? t('Full') : t('{left} spots left', p)}</>}</p>
    </div>}
    {thanks ? <p className="help-thanks" role="status">{t('Thanks, {name}. ComForce will reach out to confirm the details.', { name: thanks })}</p>
      : open ? <OfferForm item={item} credential={credential} onExpired={onOffered} onCancel={() => setOpen(false)} onDone={name => { setThanks(name); setOpen(false); onOffered() }}/>
      : <button className="help-primary" disabled={full} onClick={() => setOpen(true)}>{t(full ? 'Event full' : buttonLabel[item.kind])}</button>}
  </li>
}

export default function HelpOut() {
  const [feed] = useState(publicFeed)
  const { data, error: failed } = useFeed(feed)
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  useEffect(() => { feed.start(); feed.setSession('public'); return () => { feed.stop(); feed.setSession(null) } }, [feed])
  const items = data?.items ?? null
  const offers = data?.offers_this_month ?? 0
  const error = failed && !data ? 'The community board isn’t available right now. Try refreshing the page.' : ''
  const load = () => void feed.refresh()

  if (failed instanceof ExpiredPairing) return <main className="help-page"><h1>{t('Lend a hand')}</h1>
    <ResidentRepair onPaired={() => { feed.setSession(null); feed.setSession('public') }} /></main>
  const kinds: Kind[] = ['supply', 'event', 'skill']
  return <main className="help-page">
    <div className="help-intro"><p className="help-kicker">{t("Lend a hand")} <span> / </span> {t("Fictional demo")}</p>
      <h1>{t("Help your neighbors this week")}</h1>
      <p>{t("Whether you have five minutes or a Saturday morning, there’s a way to help. Pick what fits and ComForce will follow up.")}</p>
      {offers > 0 && <p className="help-stat"><strong>{offers}</strong> {t(offersLabel(offers))}</p>}</div>
    <div className="help-filters" role="group" aria-label={t("Filter ways to help")}>
      {(['all', ...kinds] as const).map(k => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
        {t(k === 'all' ? 'Everything' : kindLabels[k])}</button>)}
    </div>
    {error && <p className="help-error" role="alert">{t(error)}</p>}
    {!items && !error && <p role="status">{t("Loading…")}</p>}
    {items && !items.some(i => filter === 'all' || i.kind === filter) &&
      <p role="status">{t('No open opportunities in this category.')}</p>}
    {data && kinds.filter(k => filter === 'all' || filter === k).map(k => {
      const list = data.items.filter(i => i.kind === k)
      return list.length > 0 && <section key={k} className="help-section" aria-labelledby={'help-' + k}>
        <h2 id={'help-' + k}>{t(kindLabels[k])}</h2>
        <ul className="help-grid">{list.map(item => <Card key={item.id} item={item} credential={data.token} onOffered={load}/>)}</ul>
      </section>
    })}
    <aside className="help-need"><h2>{t("Need help yourself?")}</h2><p>{t("ComForce connects residents with food, rides and family support.")}</p>
      <a href="/request">{t("Request help")}</a></aside>
  </main>
}
