// Resident request status page. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 built the lookup form and tracker.
import { useRef, useState, type FormEvent } from 'react'
import { route } from '../preview/location'
import { supabase } from '../supabase'
import { isStaffMode, residentToken } from '../workspace'
import { serviceLabels } from '../services'
import { normalizeReference, stageLabels, stageMessage, stageSteps, validateLookup, type NeedStatus, type RequestStatus } from './lookup'
import '../intake/intake.css'
import './status.css'

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function Tracker({ need }: { need: NeedStatus }) {
  const reached = need.stage === 'closed' ? 1 : stageSteps.indexOf(need.stage)
  return <li className="status-need">
    <div className="status-need-head"><h3>{serviceLabels[need.service]}</h3>
      <span className={'status-pill status-' + need.stage}>{stageLabels[need.stage]}</span></div>
    {need.stage !== 'closed' && <ol className="status-steps" aria-label={`Progress for ${serviceLabels[need.service]}`}>
      {stageSteps.map((step, i) => <li key={step} className={i <= reached ? 'done' : undefined} aria-current={i === reached ? 'step' : undefined}>
        <span className="status-dot" aria-hidden="true">{i <= reached ? '✓' : ''}</span>{stageLabels[step]}</li>)}
    </ol>}
    <p className="status-message">{stageMessage(need)}</p>
    <p className="status-updated">Last update {when(need.updated_at)}</p>
  </li>
}

export default function Status() {
  const [reference, setReference] = useState(() => new URLSearchParams(location.search).get('ref') ?? '')
  const [check, setCheck] = useState('')
  const [errors, setErrors] = useState<ReturnType<typeof validateLookup>>({})
  const [failed, setFailed] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RequestStatus | null>(null)
  // Each lookup and each input edit takes a new number, so a slower earlier response can't overwrite newer state.
  const latest = useRef(0)

  // A shown result belongs to the inputs that produced it; editing either one retires it and any lookup in flight.
  function edited() {
    latest.current++
    setResult(null)
    setFailed('')
    setLoading(false)
  }

  async function lookup(event?: FormEvent) {
    event?.preventDefault()
    const problems = validateLookup(reference, check)
    setErrors(problems)
    setFailed('')
    if (problems.reference || problems.check) return
    const id = ++latest.current
    const current = () => id === latest.current
    setLoading(true)
    try {
      const token = isStaffMode() ? null : await residentToken()
      if (!current()) return
      const res = await supabase.rpc('request_status', { p_reference: normalizeReference(reference), p_check: check.trim(), p_token: token })
      if (!current()) return
      if (res.error?.code === 'P0002') { setResult(null); setFailed('We couldn’t find a request with that reference and contact. Check both and try again.'); return }
      if (res.error || !res.data) throw new Error('Lookup unavailable')
      setResult(res.data as RequestStatus)
    } catch {
      if (current()) setFailed('We couldn’t check your request right now. Check your connection and try again.')
    } finally {
      if (current()) setLoading(false)
    }
  }

  const done = result?.needs.filter(n => n.stage === 'delivered').length ?? 0

  return <main className="intake-page status-page">
    <div className="intake-intro"><p className="intake-kicker">Check a request <span> / </span> Fictional demo</p>
      <h1>Where is my request?</h1>
      <p>Enter the reference from your confirmation. To keep your request private, we also ask for part of your contact information.</p></div>
    <div className="intake-layout">
      <div>
        <form className="intake-form" onSubmit={lookup} noValidate aria-label="Check a request" aria-busy={loading}>
          <div className="intake-block"><label htmlFor="reference">Reference number</label>
            <input id="reference" value={reference} placeholder="CF-1042" autoComplete="off" maxLength={14}
              aria-invalid={!!errors.reference} aria-describedby={errors.reference ? 'reference-error' : undefined}
              onChange={e => { setReference(e.target.value); setErrors(c => ({ ...c, reference: undefined })); edited() }}/>
            {errors.reference && <p id="reference-error" className="intake-error">{errors.reference}</p>}</div>
          <div className="intake-block"><label htmlFor="check">Last 4 digits of your phone, or your email</label>
            <input id="check" value={check} placeholder="0100" autoComplete="off" maxLength={254}
              aria-invalid={!!errors.check} aria-describedby={errors.check ? 'check-error' : undefined}
              onChange={e => { setCheck(e.target.value); setErrors(c => ({ ...c, check: undefined })); edited() }}/>
            {errors.check && <p id="check-error" className="intake-error">{errors.check}</p>}</div>
          {failed && <p className="intake-error submit-error" role="alert">{failed}</p>}
          <button type="submit" className="intake-submit" disabled={loading}>{loading ? 'Checking…' : result ? 'Refresh status' : 'Check status'}</button>
        </form>
        {result && <section className="status-result" aria-labelledby="status-title" aria-live="polite">
          <p className="receipt-ref">Reference <strong>{result.reference}</strong> · submitted {when(result.submitted_at)}</p>
          <h2 id="status-title">{done === result.needs.length ? 'All of your help has been delivered' : `${done} of ${result.needs.length} delivered`}</h2>
          <ul className="status-needs">{result.needs.map(need => <Tracker key={need.service} need={need}/>)}</ul>
        </section>}
      </div>
      <aside className="intake-aside"><h2>In danger right now?</h2>
        <p>Call <strong>911</strong>. For a mental health crisis, call or text <strong>988</strong>.</p>
        <p>This page shows progress only. Your notes and contact details are never shown here.</p>
        <p><a href={route('/request')}>Make a new request</a></p>
      </aside>
    </div>
  </main>
}
