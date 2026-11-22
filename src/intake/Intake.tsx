import { t } from '../languages/language'
// Resident and staff intake. Codex (GPT-6) implemented accessible multi-need submission and recovery.
// asherjaenchen with Claude Opus 5.5 added the status-check link to the receipt, keeping community impact as a secondary link.
// Claude (Opus 5.5) added pre-fill from the community assistant, and split the resident form into four short steps with plain wording.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { draftEvent, takeDraft } from '../assistant/draft'
import { preview, route } from '../preview/location'
import { supabase } from '../supabase'
import { ExpiredPairing, pairingRejected, isStaffMode, residentToken, staffContext } from '../workspace'
import ResidentRepair from '../ResidentRepair'
import { neighborhoods } from '../impact/neighborhoods'
import { residentLabels, serviceLabels, serviceOrder, type Service } from '../services'
import Icon from '../Icon'
import { pendingOperation } from '../team/pendingOperation'
import { validate, type ContactMethod, type IntakeDraft } from './form'
import './intake.css'

const entry = new URLSearchParams(location.search).get('source')
const staffEntry = entry === 'call' || entry === 'text'
// Residents go one step at a time. Staff logging a call see every field at once.
const guided = !staffEntry
const contactLabels = { phone: 'Call me', text: 'Text me', email: 'Email me' } as const
const secondLabels = { phone: 'Call', text: 'Text', email: 'Email' } as const
const steps = ['What do you need?', 'Tell us a little more', 'Where are you?', 'How can we reach you?']
const fieldStep: Record<keyof IntakeDraft, number> = {
  services: 0, description: 1, safeContact: 1, agency: 1, agencyReference: 1, neighborhood: 2,
  method: 3, contact: 3, secondMethod: 3, secondContact: 3,
}
const labels = staffEntry ? serviceLabels : residentLabels

export default function Intake() {
  const [selected, select] = useState<Service[]>(() => {
    const service = new URLSearchParams(location.search).get('service')
    return service && Object.hasOwn(serviceLabels, service) ? [service as Service] : []
  })
  // Coming from a home-page button means step 1 is already answered.
  const [step, setStep] = useState(() => guided && selected.length ? 1 : 0)
  const [description, describe] = useState('')
  const [neighborhood, locate] = useState('')
  const [method, prefer] = useState<IntakeDraft['method']>('')
  const [secondMethod, setSecondMethod] = useState<IntakeDraft['method']>('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [safeContact, setSafeContact] = useState('')
  const [agency, setAgency] = useState('')
  const [agencyReference, setAgencyReference] = useState('')
  const [source, setSource] = useState(staffEntry ? entry : 'web')
  const [retryRequired, setRetryRequired] = useState(false)
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({})
  const [expired, setExpired] = useState(false)
  const [failed, setFailed] = useState('')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<{ reference: string; needs: Service[]; method: ContactMethod; secondMethod: IntakeDraft['method'] } | null>(null)
  const busy = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const focusNext = useRef<string | null>(null)
  const firstRender = useRef(true)
  const contact = method === 'email' ? email : phone
  const secondContact = secondMethod === 'email' ? email : phone
  const sameNumber = method && secondMethod && method !== 'email' && secondMethod !== 'email'
  const family = selected.includes('family_support')
  const submitted = useRef(false)
  submitted.current = !!receipt
  const retrying = useRef(false)
  retrying.current = retryRequired

  // A draft from the community assistant fills only services, description and neighborhood. Residents add contact details.
  useEffect(() => {
    if (staffEntry) return
    function apply() {
      if (submitted.current) { location.assign(route('/request')); return }
      if (busy.current || retrying.current) return
      const draft = takeDraft()
      if (!draft) return
      select(draft.services)
      if (draft.description) describe(draft.description.slice(0, draft.services.includes('family_support') ? 500 : 800))
      if (draft.neighborhood) locate(draft.neighborhood)
      setErrors({})
      focusNext.current = 'description'
      setStep(1)
      requestAnimationFrame(() => document.getElementById('description')?.focus())
    }
    apply()
    window.addEventListener(draftEvent, apply)
    return () => window.removeEventListener(draftEvent, apply)
  }, [])

  // Moving between steps puts focus on the new question (or on the field that needs fixing).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    if (!guided) return
    const name = focusNext.current
    focusNext.current = null
    if (name) focusField(name)
    else heading.current?.focus()
  }, [step])

  function focusField(name: string) {
    const input = form.current?.elements.namedItem(name)
    if (input instanceof HTMLElement) input.focus()
    else if (input instanceof RadioNodeList) (input[0] as HTMLElement).focus()
  }
  function go(next: number, field?: string) {
    focusNext.current = field ?? null
    if (next === step) { if (field) focusField(field) } else setStep(next)
    window.scrollTo(0, 0)
  }
  function clearError(field: keyof IntakeDraft) {
    setErrors(current => ({ ...current, [field]: undefined }))
  }
  function message(field: keyof IntakeDraft) {
    const error = errors[field]
    if (!error) return null
    const limit = /^Keep the description to (\d+) characters or fewer\.$/.exec(error)
    return <p id={field + '-error'} className="intake-error">{limit ? t('Keep the description to {max} characters or fewer.', { max: limit[1] }) : t(error)}</p>
  }
  function describedBy(field: keyof IntakeDraft) {
    return errors[field] ? field + '-error' : undefined
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const problems = validate({ services: selected, description, neighborhood, method, contact, secondMethod, secondContact, safeContact, agency, agencyReference })
    setFailed('')
    if (guided && step < steps.length - 1) {
      // "Next" only checks the fields on this step.
      const here = Object.fromEntries(Object.entries(problems).filter(([field]) => fieldStep[field as keyof IntakeDraft] === step))
      setErrors(here)
      const first = Object.keys(here)[0]
      if (first) focusField(first)
      else go(step + 1)
      return
    }
    setErrors(problems)
    const first = Object.keys(problems)[0] as keyof IntakeDraft | undefined
    if (first) {
      if (guided) go(fieldStep[first], first)
      else focusField(first)
      return
    }
    if (!method) return
    if (preview) {
      if (staffEntry) { location.assign(route('/team')); return }
      setReceipt({ reference: 'MKE-PREVIEW', needs: [...selected], method, secondMethod })
      window.scrollTo(0, 0)
      return
    }
    busy.current = true
    setSaving(true)
    let writeStarted = false
    try {
      const staff = staffEntry ? await staffContext() : null
      const token = staff ? staff.token : await residentToken()
      const payload = {
        p_services: [...selected].sort(), p_description: description.trim(),
        p_neighborhood: neighborhood, p_contact_method: method, p_contact: contact.trim(), p_source: source,
        ...(secondMethod && { p_second_method: secondMethod, p_second_contact: secondContact.trim() }),
        p_token: token,
        p_family: family ? { support: description.trim(), safe_contact: safeContact.trim(), agency: agency.trim(), agency_reference: agencyReference.trim() } : null,
      }
      const operation = pendingOperation({ operation: 'submit_request', actor: staff?.userId ?? null, payload: JSON.stringify(payload) })
      writeStarted = true
      const result = await supabase.rpc('submit_request', { ...payload, p_key: operation.key })
      if (result.error || !result.data) {
        if (result.status >= 400 && result.status < 500) {
          writeStarted = false
          setRetryRequired(false)
        }
        if (!staffEntry && result.error && pairingRejected(token, result.status, result.error.code)) throw new ExpiredPairing()
        if (result.error?.code === '42501' && staffEntry) {
          setFailed('Sign in to the team workspace to log a call or text. Your entries are still here.')
          return
        }
        throw new Error('Submission unavailable')
      }
      operation.confirm()
      setRetryRequired(false)
      if (staffEntry) {
        const params = new URLSearchParams({ case: result.data })
        if (isStaffMode()) params.set('mode', 'staff')
        location.replace(route('/team?' + params))
        return
      }
      setReceipt({ reference: result.data, needs: [...selected], method, secondMethod })
      window.scrollTo(0, 0)
    } catch (error) {
      if (error instanceof ExpiredPairing) setExpired(true)
      else if (writeStarted) {
        setRetryRequired(true)
        setFailed('Your request may already have been saved. Tap Send again with the same details to get your request number.')
      } else setFailed('Your request did not go through. Nothing you typed was lost. Check your internet and tap Send again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  if (receipt) {
    const reach = { phone: 'call you', text: 'text you', email: 'email you' }
    return <main className="intake-page receipt-page">
      <article className="intake-receipt" aria-labelledby="receipt-title">
        <header className="receipt-top"><span className="receipt-check" aria-hidden="true">✓</span><span>{t("Practice request (demo only)")}</span></header>
        <div className="receipt-body">
          <h1 id="receipt-title" tabIndex={-1} ref={el => el?.focus()}>{t("We got your request!")}</h1>
          <div className="receipt-number"><span>{t("Your request number")}</span><strong>{receipt.reference}</strong>
            <small>{t("Write this down or take a screenshot. You need it to check on your request.")}</small></div>
          <h2>{t("You asked for")}</h2><ul className="receipt-needs">{receipt.needs.map(id => <li key={id}>{t(residentLabels[id])}</li>)}</ul>
          <h2>{t("What happens next")}</h2>
          <p>{t('Someone from our team will look at your request and {reach}.', { reach: t(reach[receipt.method]) })}</p>
          {receipt.secondMethod && <p>{t('If we can’t reach you, we’ll {reach} instead.', { reach: t(reach[receipt.secondMethod]) })}</p>}
          {receipt.needs.includes('family_support') && <p>{t("We can help your family and check in with you. This is not a police report. If someone is in danger, call 911.")}</p>}
          <p className="receipt-actions"><a className="intake-next" href={route('/status?ref=' + encodeURIComponent(receipt.reference))}>{t("Check on my request")}</a>
            <a className="receipt-secondary" href={route('/impact')}>{t("See how we help")}</a></p>
        </div>
      </article>
    </main>
  }

  const show = (n: number) => !guided || step === n
  const title = (n: number) => guided && <h2 className="step-title" tabIndex={-1} ref={step === n ? heading : undefined}>{n === 1 && family ? t('Tell us about your family') : t(steps[n])}</h2>
  const last = step === steps.length - 1

  return <main className={'intake-page' + (guided ? ' intake-guided' : '')}>
    <div className="intake-intro">
      <h1>{staffEntry ? t('Log a request') : t('Get help')}</h1>
      {staffEntry
        ? <p className="intake-followup"><strong>{preview ? t('After you finish, you can preview the team queue.') : t('After you save, the case opens in your queue with all its needs together.')}</strong>
          {' '}{t('The team can arrange direct help for one need and refer another to a partner.')}</p>
        : <div className="step-progress">
          <p>{t('Step {step} of {total}', { step: step + 1, total: steps.length })}</p>
          <div className="step-bar" aria-hidden="true"><span style={{ width: ((step + 1) / steps.length * 100) + '%' }}/></div>
        </div>}
    </div>
    <form ref={form} className="intake-form" onSubmit={submit} noValidate aria-label={staffEntry ? t('Log a request') : t('Get help')} aria-busy={saving}>
      <fieldset disabled={saving || retryRequired} className="intake-fields">
        {staffEntry && <div className="intake-block"><label htmlFor="source">{t("How did the request come in?")}</label>
          <select id="source" value={source || 'call'} onChange={e => setSource(e.target.value)}>
            <option value="call">{t("Phone call")}</option><option value="text">{t("Text message")}</option>
          </select></div>}

        <section className="intake-step" hidden={!show(0)}>
          {title(0)}
          <fieldset className="intake-block"><legend>{guided ? t('Pick everything you need.') : t('Services needed (select all that apply)')}</legend>
            <div className="service-options">{serviceOrder.map(id =>
              <label className={'service-option option-' + id} key={id}><input type="checkbox" name="services" value={id}
                checked={selected.includes(id)} aria-invalid={!!errors.services} aria-describedby={describedBy('services')}
                onChange={e => { clearError('services'); select(e.target.checked ? [...selected, id] : selected.filter(s => s !== id)) }}/>
                {guided && <Icon name={id} size={26}/>}<span>{t(labels[id])}</span></label>,
            )}</div>{message('services')}</fieldset>
        </section>

        <section className="intake-step" hidden={!show(1)}>
          {title(1)}
          {family && <p className="family-notice">{t("We can help your family and check in with you. This is not a police report. If someone is in danger right now, call 911.")}</p>}
          <div className="intake-block"><label htmlFor="description">{family ? t('What would help your family right now?') : t('What do you need help with?')}</label>
            {guided && <p className="intake-hint" id="description-hint">{t("A sentence or two is fine.")}</p>}
            <textarea id="description" name="description" rows={4} maxLength={family ? 500 : 800} placeholder={family ? t('Example: Someone to check in with us, and a ride to a meeting.') : t('Example: Groceries for my family and a ride to the doctor on Tuesday.')}
              value={description} onChange={e => { describe(e.target.value); clearError('description') }} required aria-invalid={!!errors.description}
              aria-describedby={[guided && 'description-hint', describedBy('description')].filter(Boolean).join(' ') || undefined}/>
            {message('description')}</div>
          {family && <>
            <div className="intake-block"><label htmlFor="safeContact">{t("When and how is it safe to reach you?")}</label>
              <input id="safeContact" name="safeContact" value={safeContact} required maxLength={300} placeholder="Example: Text me after 4 p.m. Please don’t leave a voicemail."
                onChange={e => { setSafeContact(e.target.value); clearError('safeContact') }} aria-invalid={!!errors.safeContact} aria-describedby={describedBy('safeContact')}/>
              {message('safeContact')}</div>
            <details className="intake-partner"><summary>{t("Is another group already helping? (optional)")}</summary>
              <div className="intake-block"><label htmlFor="agency">{t("Name of the group or agency")}</label>
                <input id="agency" name="agency" value={agency} maxLength={120} onChange={e => setAgency(e.target.value)}/>{message('agency')}</div>
              <div className="intake-block"><label htmlFor="agencyReference">{t("Their case number, if you have one")}</label>
                <input id="agencyReference" name="agencyReference" value={agencyReference} maxLength={80} onChange={e => setAgencyReference(e.target.value)}/>{message('agencyReference')}</div>
            </details></>}
        </section>

        <section className="intake-step" hidden={!show(2)}>
          {title(2)}
          <div className="intake-block"><label htmlFor="neighborhood">{t("Which neighborhood are you in?")}</label>
            <select id="neighborhood" name="neighborhood" required value={neighborhood} aria-invalid={!!errors.neighborhood} aria-describedby={describedBy('neighborhood')}
              onChange={e => { locate(e.target.value); clearError('neighborhood') }}><option value="">{t("Choose one")}</option>
              {neighborhoods.map(name => <option key={name}>{name}</option>)}<option value="Unknown">{t("I’m not sure")}</option></select>
            {message('neighborhood')}</div>
        </section>

        <section className="intake-step" hidden={!show(3)}>
          {title(3)}
          <fieldset className="intake-block"><legend>{guided ? t('Pick the best way.') : t('First-choice contact method (required)')}</legend>
            <div className="contact-options">{(Object.keys(contactLabels) as ContactMethod[]).map(value =>
              <label className="service-option contact-option" key={value}><input type="radio" name="method" value={value}
                checked={method === value} aria-invalid={!!errors.method} aria-describedby={describedBy('method')}
                onChange={() => {
                  prefer(value)
                  if (value === secondMethod) setSecondMethod('')
                  clearError('method'); clearError('contact'); clearError('secondContact')
                }}/><Icon name={value} size={24}/><span>{t(contactLabels[value])}</span></label>)}
            </div>{message('method')}</fieldset>
          {method && <div className="intake-block"><label htmlFor="contact">{method === 'email' ? t('Your email') : t('Your phone number')}</label>
            <input id="contact" name="contact" type={method === 'email' ? 'email' : 'tel'} autoComplete={method === 'email' ? 'email' : 'tel'} maxLength={method === 'email' ? 254 : 35} required
              placeholder={method === 'email' ? 'name@example.com' : '(414) 555-0100'} value={contact} aria-invalid={!!errors.contact} aria-describedby={describedBy('contact')}
              onChange={e => { (method === 'email' ? setEmail : setPhone)(e.target.value); clearError('contact'); if (sameNumber) clearError('secondContact') }}/>
            {message('contact')}</div>}
          {method && <div className="intake-block"><label htmlFor="secondMethod">{t("Another way to reach you (optional)")}</label>
            <select id="secondMethod" name="secondMethod" value={secondMethod}
              onChange={e => { setSecondMethod(e.target.value as IntakeDraft['method']); clearError('secondMethod'); clearError('secondContact') }}>
              <option value="">{t("No, that’s all")}</option>
              {(Object.keys(secondLabels) as ContactMethod[]).filter(value => value !== method).map(value =>
                <option key={value} value={value}>{t(secondLabels[value])}</option>)}
            </select>{message('secondMethod')}
            {sameNumber && <p className="intake-hint">{t("We’ll use the same phone number.")}</p>}
          </div>}
          {secondMethod && !sameNumber && <div className="intake-block">
            <label htmlFor="secondContact">{secondMethod === 'email' ? t('Your email') : t('Your phone number')} ({t('second choice')})</label>
            <input id="secondContact" name="secondContact" type={secondMethod === 'email' ? 'email' : 'tel'}
              value={secondContact} required maxLength={secondMethod === 'email' ? 254 : 35}
              aria-invalid={!!errors.secondContact} aria-describedby={describedBy('secondContact')}
              onChange={e => { (secondMethod === 'email' ? setEmail : setPhone)(e.target.value); clearError('secondContact') }}/>
            {message('secondContact')}</div>}
        </section>
      </fieldset>
      {expired && <ResidentRepair onPaired={() => setExpired(false)}/>}
      {failed && <p className="intake-error submit-error" role="alert">{t(failed)}</p>}
      {(!guided || last) && <p className="intake-hint">{preview ? t('This is a practice form. Nothing is saved.') : t('This is a demo. Please use made-up details.')}</p>}
      <div className="intake-actions">
        {guided && step > 0 && <button type="button" className="intake-back" disabled={saving || retryRequired} onClick={() => go(step - 1)}>{t("← Back")}</button>}
        <button type="submit" className="intake-submit" disabled={saving || expired}>{saving ? t('Sending…')
          : staffEntry ? (preview ? t('Preview queue') : t('Save and open case'))
          : last ? t('Send my request') : t('Next →')}</button>
      </div>
    </form>
    {guided && <p className="intake-talk"><Icon name="phone" size={20}/> {t('Rather talk to someone?')} <a href="tel:211">{t("Call 211")}</a></p>}
  </main>
}
