// Resident and staff intake. Codex (GPT-6) implemented accessible multi-need submission and recovery.
// asherjaenchen with Claude Opus 5.5 added the status-check link to the receipt, keeping community impact as a secondary link.
import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { isStaffMode, residentToken, staffContext } from '../workspace'
import { neighborhoods } from '../impact/neighborhoods'
import { serviceLabels, type Service } from '../services'
import { submissionKey, validate, type ContactMethod, type IntakeDraft } from './form'
import './intake.css'

const entry = new URLSearchParams(location.search).get('source')
const staffEntry = entry === 'call' || entry === 'text'
const contactLabels = { phone: 'Call', text: 'Text', email: 'Email' } as const

export default function Intake() {
  const [selected, select] = useState<Service[]>(() => new URLSearchParams(location.search).get('service') === 'family_support' ? ['family_support'] : [])
  const [description, describe] = useState('')
  const [neighborhood, locate] = useState('')
  const [method, prefer] = useState<ContactMethod>('text')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [safeContact, setSafeContact] = useState('')
  const [agency, setAgency] = useState('')
  const [agencyReference, setAgencyReference] = useState('')
  const [source, setSource] = useState(staffEntry ? entry : 'web')
  const [key] = useState(submissionKey)
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({})
  const [failed, setFailed] = useState('')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<{ reference: string; needs: Service[]; method: ContactMethod } | null>(null)
  const busy = useRef(false)
  const contact = method === 'email' ? email : phone
  const family = selected.includes('family_support')

  function clearError(field: keyof IntakeDraft) {
    setErrors(current => ({ ...current, [field]: undefined }))
  }
  function message(field: keyof IntakeDraft) {
    return errors[field] && <p id={field + '-error'} className="intake-error">{errors[field]}</p>
  }
  function describedBy(field: keyof IntakeDraft) {
    return errors[field] ? field + '-error' : undefined
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const problems = validate({ services: selected, description, neighborhood, method, contact, safeContact, agency, agencyReference })
    setErrors(problems)
    setFailed('')
    const first = Object.keys(problems)[0]
    if (first) {
      const input = event.currentTarget.elements.namedItem(first)
      if (input instanceof HTMLElement) input.focus()
      else if (input instanceof RadioNodeList) (input[0] as HTMLElement).focus()
      return
    }
    busy.current = true
    setSaving(true)
    try {
      const token = staffEntry ? (await staffContext()).token : await residentToken()
      const result = await supabase.rpc('submit_request', {
        p_key: key, p_services: selected, p_description: description.trim(),
        p_neighborhood: neighborhood, p_contact_method: method, p_contact: contact.trim(), p_source: source,
        p_token: token,
        p_family: family ? { support: description.trim(), safe_contact: safeContact.trim(), agency: agency.trim(), agency_reference: agencyReference.trim() } : null,
      })
      if (result.error || !result.data) {
        if (result.error?.code === '42501' && staffEntry) {
          setFailed('Sign in to the team workspace to log a call or text. Your entries are still here.')
          return
        }
        throw new Error('Submission unavailable')
      }
      if (staffEntry) {
        const params = new URLSearchParams({ case: result.data })
        if (isStaffMode()) params.set('mode', 'staff')
        location.replace('/team?' + params)
        return
      }
      setReceipt({ reference: result.data, needs: [...selected], method })
      window.scrollTo(0, 0)
    } catch {
      setFailed('We could not confirm your request. Your entries are still here. Check your connection and submit again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  if (receipt) return <main className="intake-page receipt-page">
    <article className="intake-receipt" aria-labelledby="receipt-title">
      <header className="receipt-top"><span className="receipt-check" aria-hidden="true">✓</span><span>Fictional demo submission</span></header>
      <div className="receipt-body"><p className="receipt-ref">Reference <strong>{receipt.reference}</strong></p>
        <h1 id="receipt-title" tabIndex={-1} ref={el => el?.focus()}>Request received</h1>
        <h2>Help you requested</h2><ul className="receipt-needs">{receipt.needs.map(id => <li key={id}>{serviceLabels[id]}</li>)}</ul>
        <h2>What happens next</h2><p>The demo team can review each need and follow up by {{ phone: 'phone', text: 'text', email: 'email' }[receipt.method]} to arrange direct help or a partner referral.</p>
        {receipt.needs.includes('family_support') && <p>Family support includes checking in with you. This form does not file an official missing-person report or dispatch assistance.</p>}
        <h2>Check your progress</h2><p>Save your reference. You can see each need’s progress any time with it and {receipt.method === 'email' ? 'your email address' : 'the last 4 digits of your phone number'}.</p>
        <p className="receipt-actions"><a className="intake-next" href={'/status?ref=' + encodeURIComponent(receipt.reference)}>Check request status</a>
          <a className="receipt-secondary" href="/">View community impact</a></p>
      </div>
    </article>
  </main>

  return <main className="intake-page">
    <div className="intake-intro"><p className="intake-kicker">{staffEntry ? 'Staff intake' : 'Request help'} <span> / </span> Fictional demo</p>
      <h1>{staffEntry ? 'Log a request' : 'What do you need help with?'}</h1>
      <p>Choose all the help needed. Use fictional details for this demo.</p></div>
    <div className="intake-layout">
      <form className="intake-form" onSubmit={submit} noValidate aria-label="Request help" aria-busy={saving}>
        <fieldset disabled={saving} className="intake-fields">
          {staffEntry && <div className="intake-block"><label htmlFor="source">How did the request come in?</label>
            <select id="source" value={source || 'call'} onChange={e => setSource(e.target.value)}>
              <option value="call">Phone call</option><option value="text">Text message</option>
            </select></div>}
          <fieldset className="intake-block"><legend>Services needed</legend>
            <div className="service-options">{Object.entries(serviceLabels).map(([id, label]) =>
              <label className="service-option" key={id}><input type="checkbox" name="services" value={id}
                checked={selected.includes(id as Service)} aria-invalid={!!errors.services} aria-describedby={describedBy('services')}
                onChange={e => { clearError('services'); select(e.target.checked ? [...selected, id as Service] : selected.filter(s => s !== id)) }}/>{label}</label>,
            )}</div><p className="intake-selection" aria-live="polite">{selected.length ? selected.map(id => serviceLabels[id]).join(' · ') : 'You can select more than one.'}</p>{message('services')}</fieldset>
          {family && <p className="family-notice">The Missing Persons Network can support the family and coordinate follow-up. This form does not file an official missing-person report or dispatch assistance.</p>}
          <div className="intake-block"><label htmlFor="description">{family ? 'What support would help your family?' : 'Description'}</label>
            <textarea id="description" name="description" rows={3} maxLength={family ? 500 : 800} placeholder={family ? 'For example, a family check-in and a ride to a meeting.' : 'For example, groceries and a ride to an appointment.'}
              value={description} onChange={e => { describe(e.target.value); clearError('description') }} required aria-invalid={!!errors.description} aria-describedby={describedBy('description')}/>
            {message('description')}</div>
          {family && <>
            <div className="intake-block"><label htmlFor="safeContact">How can staff follow up safely?</label>
              <input id="safeContact" name="safeContact" value={safeContact} required maxLength={300} placeholder="For example, text after 4 p.m. Please don’t leave a voicemail."
                onChange={e => { setSafeContact(e.target.value); clearError('safeContact') }} aria-invalid={!!errors.safeContact} aria-describedby={describedBy('safeContact')}/>
              {message('safeContact')}</div>
            <details className="intake-partner"><summary>Add partner or agency details (optional)</summary>
              <div className="intake-block"><label htmlFor="agency">Partner or agency already involved</label>
                <input id="agency" name="agency" value={agency} maxLength={120} onChange={e => setAgency(e.target.value)}/>{message('agency')}</div>
              <div className="intake-block"><label htmlFor="agencyReference">Agency reference number (optional)</label>
                <input id="agencyReference" name="agencyReference" value={agencyReference} maxLength={80} onChange={e => setAgencyReference(e.target.value)}/>{message('agencyReference')}</div>
            </details></>}
          <div className="intake-block"><label htmlFor="neighborhood">Neighborhood</label>
            <select id="neighborhood" name="neighborhood" required value={neighborhood} aria-invalid={!!errors.neighborhood} aria-describedby={describedBy('neighborhood')}
              onChange={e => { locate(e.target.value); clearError('neighborhood') }}><option value="">Select a neighborhood</option>
              <option value="Unknown">Unknown / unsure</option>{neighborhoods.map(name => <option key={name}>{name}</option>)}</select>
            {message('neighborhood')}</div>
          <fieldset className="intake-block"><legend>Preferred contact method</legend>
            <div className="contact-options">{(Object.keys(contactLabels) as ContactMethod[]).map(value =>
              <label key={value}><input type="radio" name="method" checked={method === value} onChange={() => { prefer(value); clearError('contact') }}/>{contactLabels[value]}</label>,
            )}</div></fieldset>
          <div className="intake-block"><label htmlFor="contact">{method === 'email' ? 'Email address' : 'Phone number'}</label>
            <input id="contact" name="contact" type={method === 'email' ? 'email' : 'tel'} autoComplete="off" maxLength={method === 'email' ? 254 : 35} required
              placeholder={method === 'email' ? 'resident@example.com' : '(414) 555-0100'} value={contact} aria-invalid={!!errors.contact} aria-describedby={describedBy('contact')}
              onChange={e => { (method === 'email' ? setEmail : setPhone)(e.target.value); clearError('contact') }}/>
            {message('contact')}</div>
          {failed && <p className="intake-error submit-error" role="alert">{failed}</p>}
          <button type="submit" className="intake-submit">{saving ? 'Saving request…' : staffEntry ? 'Save and open case' : 'Submit request'}</button>
        </fieldset>
      </form>
      <aside className="intake-aside"><h2>{staffEntry ? 'After you save' : 'After you submit'}</h2>
        <p>{staffEntry ? 'The case opens in your queue with all its needs together.' : 'You’ll receive one reference number covering everything you select.'}</p>
        <p>The team can arrange direct help for one need and refer another to a partner.</p>
      </aside>
    </div>
  </main>
}
