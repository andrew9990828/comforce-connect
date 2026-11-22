import { t } from '../languages/language'
// Resident and staff intake. Codex (GPT-6) implemented accessible multi-need submission and recovery.
// asherjaenchen with Claude Opus 5.5 added the status-check link to the receipt, keeping community impact as a secondary link.
// Claude (Opus 5.5) added pre-fill from the community assistant.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { draftEvent, takeDraft } from '../assistant/draft'
import { supabase } from '../supabase'
import { ExpiredPairing, pairingRejected, isStaffMode, residentToken, staffContext } from '../workspace'
import ResidentRepair from '../ResidentRepair'
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
  const [expired, setExpired] = useState(false)
  const [failed, setFailed] = useState('')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<{ reference: string; needs: Service[]; method: ContactMethod } | null>(null)
  const busy = useRef(false)
  const contact = method === 'email' ? email : phone
  const family = selected.includes('family_support')
  const submitted = useRef(false)
  submitted.current = !!receipt

  // A draft from the community assistant fills only services, description and neighborhood. Residents add contact details.
  useEffect(() => {
    if (staffEntry) return
    function apply() {
      if (submitted.current) { location.assign('/request'); return }
      const draft = takeDraft()
      if (!draft) return
      select(draft.services)
      if (draft.description) describe(draft.description.slice(0, draft.services.includes('family_support') ? 500 : 800))
      if (draft.neighborhood) locate(draft.neighborhood)
      setErrors({})
      document.getElementById('description')?.focus()
    }
    apply()
    window.addEventListener(draftEvent, apply)
    return () => window.removeEventListener(draftEvent, apply)
  }, [])

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
        if (!staffEntry && result.error && pairingRejected(token, result.status, result.error.code)) throw new ExpiredPairing()
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
    } catch (error) {
      if (error instanceof ExpiredPairing) setExpired(true)
      else setFailed('We could not confirm your request. Your entries are still here. Check your connection and submit again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  if (receipt) return <main className="intake-page receipt-page">
    <article className="intake-receipt" aria-labelledby="receipt-title">
      <header className="receipt-top"><span className="receipt-check" aria-hidden="true">✓</span><span>{t("Fictional demo submission")}</span></header>
      <div className="receipt-body"><p className="receipt-ref">{t("Reference")} <strong>{receipt.reference}</strong></p>
        <h1 id="receipt-title" tabIndex={-1} ref={el => el?.focus()}>{t("Request received")}</h1>
        <h2>{t("Help you requested")}</h2><ul className="receipt-needs">{receipt.needs.map(id => <li key={id}>{t(serviceLabels[id])}</li>)}</ul>
        <h2>{t("What happens next")}</h2><p>{t('The demo team can review each need and follow up by {method} to arrange direct help or a partner referral.', { method: t(receipt.method) })}</p>
        {receipt.needs.includes('family_support') && <p>{t("Family support includes checking in with you. This form does not file an official missing-person report or dispatch assistance.")}</p>}
        <h2>{t("Check your progress")}</h2>
        <p>{t("Save your reference to check the progress of each need.")}</p>
        <p className="receipt-actions"><a className="intake-next" href={'/status?ref=' + encodeURIComponent(receipt.reference)}>{t("Check request status")}</a>
          <a className="receipt-secondary" href="/">{t("View community impact")}</a></p>
      </div>
    </article>
  </main>

  return <main className="intake-page">
    <div className="intake-intro"><p className="intake-kicker">{staffEntry ? t('Staff intake') : t('Request help')} <span> / </span> {t("Fictional demo")}</p>
      <h1>{staffEntry ? t('Log a request') : t('What do you need help with?')}</h1>
      <p>{t("Choose all the help needed. Use fictional details for this demo.")}</p></div>
    <div className="intake-layout">
      <form className="intake-form" onSubmit={submit} noValidate aria-label={t("Request help")} aria-busy={saving}>
        <fieldset disabled={saving} className="intake-fields">
          {staffEntry && <div className="intake-block"><label htmlFor="source">{t("How did the request come in?")}</label>
            <select id="source" value={source || 'call'} onChange={e => setSource(e.target.value)}>
              <option value="call">{t("Phone call")}</option><option value="text">{t("Text message")}</option>
            </select></div>}
          <fieldset className="intake-block"><legend>{t("Services needed")}</legend>
            <div className="service-options">{Object.entries(serviceLabels).map(([id, label]) =>
              <label className="service-option" key={id}><input type="checkbox" name="services" value={id}
                checked={selected.includes(id as Service)} aria-invalid={!!errors.services} aria-describedby={describedBy('services')}
                onChange={e => { clearError('services'); select(e.target.checked ? [...selected, id as Service] : selected.filter(s => s !== id)) }}/>{t(label)}</label>,
            )}</div><p className="intake-selection" aria-live="polite">{selected.length ? selected.map(id => t(serviceLabels[id])).join(' · ') : t('You can select more than one.')}</p>{message('services')}</fieldset>
          {family && <p className="family-notice">{t("The Missing Persons Network can support the family and coordinate follow-up. This form does not file an official missing-person report or dispatch assistance.")}</p>}
          <div className="intake-block"><label htmlFor="description">{family ? t('What support would help your family?') : t('Description')}</label>
            <textarea id="description" name="description" rows={3} maxLength={family ? 500 : 800} placeholder={family ? t('For example, a family check-in and a ride to a meeting.') : t('For example, groceries and a ride to an appointment.')}
              value={description} onChange={e => { describe(e.target.value); clearError('description') }} required aria-invalid={!!errors.description} aria-describedby={describedBy('description')}/>
            {message('description')}</div>
          {family && <>
            <div className="intake-block"><label htmlFor="safeContact">{t("How can staff follow up safely?")}</label>
              <input id="safeContact" name="safeContact" value={safeContact} required maxLength={300} placeholder={t("For example, text after 4 p.m. Please don’t leave a voicemail.")}
                onChange={e => { setSafeContact(e.target.value); clearError('safeContact') }} aria-invalid={!!errors.safeContact} aria-describedby={describedBy('safeContact')}/>
              {message('safeContact')}</div>
            <details className="intake-partner"><summary>{t("Add partner or agency details (optional)")}</summary>
              <div className="intake-block"><label htmlFor="agency">{t("Partner or agency already involved")}</label>
                <input id="agency" name="agency" value={agency} maxLength={120} onChange={e => setAgency(e.target.value)}/>{message('agency')}</div>
              <div className="intake-block"><label htmlFor="agencyReference">{t("Agency reference number (optional)")}</label>
                <input id="agencyReference" name="agencyReference" value={agencyReference} maxLength={80} onChange={e => setAgencyReference(e.target.value)}/>{message('agencyReference')}</div>
            </details></>}
          <div className="intake-block"><label htmlFor="neighborhood">{t("Neighborhood")}</label>
            <select id="neighborhood" name="neighborhood" required value={neighborhood} aria-invalid={!!errors.neighborhood} aria-describedby={describedBy('neighborhood')}
              onChange={e => { locate(e.target.value); clearError('neighborhood') }}><option value="">{t("Select a neighborhood")}</option>
              <option value="Unknown">{t("Unknown / unsure")}</option>{neighborhoods.map(name => <option key={name}>{name}</option>)}</select>
            {message('neighborhood')}</div>
          <fieldset className="intake-block"><legend>{t("Preferred contact method")}</legend>
            <div className="contact-options">{(Object.keys(contactLabels) as ContactMethod[]).map(value =>
              <label key={value}><input type="radio" name="method" checked={method === value} onChange={() => { prefer(value); clearError('contact') }}/>{t(contactLabels[value])}</label>,
            )}</div></fieldset>
          <div className="intake-block"><label htmlFor="contact">{method === 'email' ? t('Email address') : t('Phone number')}</label>
            <input id="contact" name="contact" type={method === 'email' ? 'email' : 'tel'} autoComplete="off" maxLength={method === 'email' ? 254 : 35} required
              placeholder={method === 'email' ? 'resident@example.com' : '(414) 555-0100'} value={contact} aria-invalid={!!errors.contact} aria-describedby={describedBy('contact')}
              onChange={e => { (method === 'email' ? setEmail : setPhone)(e.target.value); clearError('contact') }}/>
            {message('contact')}</div>
          {expired && <ResidentRepair onPaired={() => setExpired(false)}/>}
          {failed && <p className="intake-error submit-error" role="alert">{t(failed)}</p>}
          <button type="submit" disabled={expired} className="intake-submit">{saving ? t('Saving request…') : staffEntry ? t('Save and open case') : t('Submit request')}</button>
        </fieldset>
      </form>
      <aside className="intake-aside"><h2>{staffEntry ? t('After you save') : t('After you submit')}</h2>
        <p>{staffEntry ? t('The case opens in your queue with all its needs together.') : t('You’ll receive one reference number covering everything you select.')}</p>
        <p>{t("The team can arrange direct help for one need and refer another to a partner.")}</p>
      </aside>
    </div>
  </main>
}
