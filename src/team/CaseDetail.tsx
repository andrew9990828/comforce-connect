// Request detail and need actions. Codex (GPT-6) implemented the staff case workflow.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { actionLabels, dated, nextStep, serviceLabels, statusLabels, type Action, type Need, type TeamRequest } from './queue'

interface Props {
  request: TeamRequest
  need: Need
  owners: string[]
  partners: string[]
  onSelect: (id: string) => void
  onClose: () => void
  onSaved: () => void
}

const choices: [Action, string][] = [
  ['assign', 'Assign a worker'], ['direct', 'Arrange direct help'], ['refer', 'Refer to a partner'],
  ['decline', 'Record a declined referral'], ['follow_up', 'Schedule follow-up'],
  ['fulfill', 'Confirm delivery'], ['unmet', 'Close as unmet'],
]

function NeedAction({ need, owners, partners, onSaved }: Pick<Props, 'need' | 'owners' | 'partners' | 'onSaved'>) {
  const [action, setAction] = useState<Action | ''>('')
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const activeReferrals = need.referrals.filter(referral => !referral.declined_at)

  function selectAction(action: Action | '') {
    setAction(action)
    setError('')
    setNotice('')
    if (action === 'assign') setValue(need.owner || '')
    else if (action === 'decline') setValue(activeReferrals[0]?.id || '')
    else setValue('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!action || pending) return
    setError('')
    setNotice('')
    const params: { p_need: string; p_action: Action; p_value?: string; p_referral?: string; p_when?: string } = {
      p_need: need.id, p_action: action,
    }
    if (action === 'follow_up') {
      const date = new Date(value)
      if (!Number.isFinite(date.getTime())) {
        setError('Choose a follow-up date and time.')
        return
      }
      params.p_when = date.toISOString()
    }
    if (action === 'assign' || action === 'refer' || action === 'unmet') {
      params.p_value = value.trim()
      if (action !== 'assign' && !params.p_value) {
        setError(action === 'refer' ? 'Enter the partner name.' : 'Enter the reason this need could not be met.')
        return
      }
    }
    if ((action === 'decline' || action === 'fulfill') && value) params.p_referral = value
    setPending(true)
    try {
      const { error } = await supabase.rpc('update_need', params)
      if (error) throw error
      setNotice(`${serviceLabels[need.service]} updated.`)
      setAction('')
      setValue('')
      onSaved()
    } catch {
      setError('Update failed. Check the connection and current need status, then try again.')
    } finally {
      setPending(false)
    }
  }

  return <div className="team-action">
    {need.status === 'open' && <form onSubmit={save}>
      <fieldset disabled={pending}>
        <legend>Update this need</legend>
        <label htmlFor="team-action">Action</label>
        <select id="team-action" value={action} onChange={e => selectAction(e.target.value as Action | '')}>
          <option value="">Choose an action</option>
          {choices.filter(([key]) => key !== 'decline' || activeReferrals.length > 0).map(([key, label]) =>
            <option key={key} value={key}>{label}</option>)}
        </select>
        {action === 'assign' && <label>Worker name
          <input list="team-owners" maxLength={80} value={value} onChange={e => setValue(e.target.value)} />
          <datalist id="team-owners">{owners.map(name => <option key={name} value={name} />)}</datalist>
          <span className="team-hint">Leave blank to remove the assignment.</span>
        </label>}
        {action === 'direct' && <p>ComForce will provide the help directly. Confirm delivery once the resident receives it.</p>}
        {action === 'refer' && <label>Partner name
          <input required list="team-partners" maxLength={100} value={value} onChange={e => setValue(e.target.value)} />
          <datalist id="team-partners">{partners.map(name => <option key={name} value={name} />)}</datalist>
        </label>}
        {action === 'follow_up' && <label>Follow-up date and time
          <input type="datetime-local" required value={value} onChange={e => setValue(e.target.value)} />
          <span className="team-hint">Enter the time in your device’s time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</span>
        </label>}
        {(action === 'fulfill' || action === 'decline') && <label>{action === 'fulfill' ? 'Who delivered the help?' : 'Declined by'}
          <select value={value} onChange={e => setValue(e.target.value)} required={action === 'decline'}>
            {action === 'fulfill' && <option value="">ComForce (direct)</option>}
            {activeReferrals.map(ref => <option key={ref.id} value={ref.id}>{ref.partner} · {dated(ref.sent_at)}</option>)}
          </select>
          {action === 'decline' && <span className="team-hint">The need stays open for another referral or direct help.</span>}
        </label>}
        {action === 'unmet' && <label>Reason help could not be delivered
          <textarea required maxLength={300} value={value} onChange={e => setValue(e.target.value)} rows={2} />
        </label>}
        {action && <button className="team-primary" type="submit">{pending ? 'Saving…' : 'Save update'}</button>}
      </fieldset>
    </form>}
    {error && <p className="team-error" role="alert">{error}</p>}
    <p role="status" className="team-notice">{notice}</p>
  </div>
}

export default function CaseDetail({ request, need, owners, partners, onSelect, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const history = request.needs.flatMap(item => item.history.map(event => ({ ...event, service: item.service })))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  return <dialog className="team-dialog" ref={dialog} aria-labelledby="team-case-title" onCancel={event => {
    event.preventDefault()
    onClose()
  }}>
    <header className="team-dialog-header">
      <div><h2 id="team-case-title">Request {request.reference}</h2><p>{request.neighborhood}</p></div>
      <button className="team-secondary" onClick={onClose} autoFocus>Close</button>
    </header>
    <div className="team-dialog-body">
      <p className="team-description">{request.description}</p>
      <dl className="team-contact">
        <div><dt>Preferred contact</dt><dd>{{ phone: 'Phone', text: 'Text', email: 'Email' }[request.contact_method]} · {request.contact}</dd></div>
        <div><dt>Received</dt><dd>{dated(request.created_at)} · {{ web: 'Web form', call: 'Call', text: 'Text' }[request.source]}</dd></div>
      </dl>
      <h3>Needs on this request</h3>
      <div className="team-siblings" role="group" aria-label="Select a need">
        {request.needs.map(item => <button key={item.id} onClick={() => onSelect(item.id)} aria-pressed={need.id === item.id}>
          {serviceLabels[item.service]} <small>{statusLabels[item.status]}</small>
        </button>)}
      </div>
      <section className="team-need" aria-label={serviceLabels[need.service] + ' details'}>
        <h3>{serviceLabels[need.service]}</h3>
        <dl className="team-need-facts">
          <div><dt>Status</dt><dd>{statusLabels[need.status]}</dd></div>
          <div><dt>Owner</dt><dd>{need.owner || 'Unassigned'}</dd></div>
          <div><dt>{need.status === 'open' ? 'Next step' : 'Outcome'}</dt><dd>{nextStep(need)}</dd></div>
          <div><dt>{need.status === 'fulfilled' ? 'Delivered' : 'Follow-up'}</dt>
            <dd>{need.status === 'fulfilled' && need.fulfilled_at ? dated(need.fulfilled_at)
              : need.status === 'open' && need.follow_up ? dated(need.follow_up) : '—'}</dd></div>
        </dl>
        <NeedAction key={need.id} need={need} owners={owners} partners={partners} onSaved={onSaved}/>
      </section>
      {!!need.referrals.length && <details className="team-details">
        <summary>Referral attempts ({need.referrals.length})</summary>
        <ul>{need.referrals.map(ref => <li key={ref.id}><strong>{ref.partner}</strong><span>Sent {dated(ref.sent_at)}{ref.declined_at ? ` · Declined ${dated(ref.declined_at)}` : ''}</span></li>)}</ul>
      </details>}
      <details className="team-details">
        <summary>Request history ({history.length})</summary>
        {history.length ? <ul>{history.map((event, index) => <li key={index}>
          <strong>{serviceLabels[event.service]} · {actionLabels[event.action] || event.action}</strong>
          <span>{dated(event.at)}{event.detail ? ` · ${event.detail}` : ''}</span>
        </li>)}</ul> : <p>No actions recorded yet.</p>}
      </details>
    </div>
  </dialog>
}
