// Resident and staff intake. Codex (GPT-6) implemented accessible multi-need submission and recovery.
import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { neighborhoods } from '../impact/neighborhoods'
import { serviceLabels, type Service } from '../services'
import { submissionKey, validate, type ContactMethod, type IntakeDraft } from './form'
import './intake.css'

const entry = new URLSearchParams(location.search).get('source')
const staffEntry = entry === 'call' || entry === 'text'
const contactLabels = { phone: 'Call', text: 'Text', email: 'Email' } as const

export default function Intake() {
  const [selected, select] = useState<Service[]>([])
  const [description, describe] = useState('')
  const [neighborhood, locate] = useState('')
  const [method, prefer] = useState<ContactMethod>('text')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState(staffEntry ? entry : 'web')
  const [key] = useState(submissionKey)
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({})
  const [failed, setFailed] = useState('')
  const [saving, setSaving] = useState(false)
  const [reference, setReference] = useState('')
  const busy = useRef(false)
  const contact = method === 'email' ? email : phone

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
    const problems = validate({ services: selected, description, neighborhood, method, contact })
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
      const result = await supabase.rpc('submit_request', {
        p_key: key, p_services: selected, p_description: description.trim(),
        p_neighborhood: neighborhood, p_contact_method: method, p_contact: contact.trim(), p_source: source,
      })
      if (result.error || !result.data) {
        if (result.error?.code === '42501' && staffEntry) {
          setFailed('Sign in to the team workspace to log a call or text. Your entries are still here.')
          return
        }
        throw new Error('Submission unavailable')
      }
      setReference(result.data as string)
      window.scrollTo(0, 0)
    } catch {
      setFailed('We could not confirm your request. Your entries are still here. Check your connection and submit again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  if (reference) return <main className="intake-page">
    <div className="intake-receipt" role="status">
      <span className="receipt-check" aria-hidden="true">✓</span>
      <h1>Request received</h1><p>The team can now follow up on your fictional request.</p>
      <div className="receipt-ref"><small>Reference number</small><strong>{reference}</strong></div>
      <a href={staffEntry ? '/team' : '/'}>{staffEntry ? 'Return to team workspace' : 'View community impact'}</a>
    </div>
  </main>

  return <main className="intake-page">
    <div className="intake-intro"><h1>What do you need help with?</h1>
      <p>This is a fictional demo submission. Use made-up contact details.</p></div>
    <div className="intake-layout">
      <form className="intake-form" onSubmit={submit} noValidate aria-label="Request help" aria-busy={saving}>
        <fieldset disabled={saving} className="intake-fields">
          {staffEntry && <div className="intake-block"><label htmlFor="source">How did the request come in?</label>
            <select id="source" value={source || 'call'} onChange={e => setSource(e.target.value)}>
              <option value="call">Phone call</option><option value="text">Text message</option>
            </select></div>}
          <fieldset className="intake-block"><legend>Services needed</legend>
            <p className="intake-hint">Choose all that apply.</p>
            <div className="service-options">{Object.entries(serviceLabels).map(([id, label]) =>
              <label className="service-option" key={id}><input type="checkbox" name="services" value={id}
                checked={selected.includes(id as Service)} aria-invalid={!!errors.services} aria-describedby={describedBy('services')}
                onChange={e => { clearError('services'); select(e.target.checked ? [...selected, id as Service] : selected.filter(s => s !== id)) }}/>{label}</label>,
            )}</div>{message('services')}</fieldset>
          <div className="intake-block"><label htmlFor="description">Description</label>
            <textarea id="description" name="description" rows={3} maxLength={800} placeholder="For example, groceries and a ride to an appointment."
              value={description} onChange={e => { describe(e.target.value); clearError('description') }} required aria-invalid={!!errors.description} aria-describedby={describedBy('description')}/>
            {message('description')}</div>
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
          <button type="submit" className="intake-submit">{saving ? 'Saving request…' : 'Submit request'}</button>
        </fieldset>
      </form>
      <aside className="intake-aside"><h2>After you submit</h2>
        <p>You’ll get a reference number for this request.</p><p>The team follows up on each need separately. One request can include direct help from ComForce and a referral to a partner.</p>
      </aside>
    </div>
  </main>
}
