// Case action editor. Codex (GPT-6) implemented direct queue actions and retry-safe follow-up outcomes.
import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { submissionKey } from '../intake/form'
import type { StaffMember } from '../workspace'
import { actionLabel, dated, nextAction, type Action, type Need } from './queue'

const actions: Action[] = ['assign', 'partner_contact', 'follow_up', 'check_in', 'refer', 'decline', 'direct', 'fulfill', 'unmet']
function localTime(instant: Date) {
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

interface Props {
  need: Need
  token: string | null
  initial: Action | null
  owners: string[]
  partners: string[]
  canAssign: boolean
  staffMembers: StaffMember[]
  demo: boolean
  onSaved: () => void
}

export default function NeedActions({ need, token, initial, owners, partners, canAssign, staffMembers, demo, onSaved }: Props) {
  const activeRefs = need.referrals.filter(r => !r.declined_at)
  const [action, setAction] = useState<Action | null>(initial)
  const [value, setValue] = useState(initial === 'assign' ? (need.owner || '') : '')
  const [assignee, setAssignee] = useState(need.assigned_staff_id || '')
  const [when, setWhen] = useState(initial === 'check_in' ? localTime(new Date()) : '')
  const [source, setSource] = useState('')
  const [attempt, setAttempt] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const operation = useRef<{ key: string; payload: string } | null>(null)
  const saving = useRef(false)
  const primary = nextAction(need)

  function choose(next: Action | null) {
    setAction(next)
    setExpanded(false)
    setError('')
    setNotice('')
    setValue(next === 'assign' ? (need.owner || '') : '')
    setAssignee(need.assigned_staff_id || '')
    setSource('')
    setWhen(next === 'check_in' ? localTime(new Date()) : '')
    setAttempt(next === 'decline' ? activeRefs[0]?.id || '' : '')
    operation.current = null
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!action || saving.current) return
    const params: Record<string, string | null> = { p_token: token, p_need: need.id, p_action: action }
    if (action === 'assign') {
      if (demo) params.p_value = value.trim() || null
      else params.p_assignee = assignee || null
    } else if (['refer', 'unmet', 'partner_contact', 'check_in'].includes(action)) {
      params.p_value = value.trim()
      if (!params.p_value) { setError('Enter the requested details.'); return }
    }
    if (action === 'follow_up' || action === 'check_in') {
      const date = new Date(when)
      if (!Number.isFinite(date.getTime())) { setError('Enter a date and time.'); return }
      if (action === 'check_in' && date.getTime() > Date.now()) { setError('Choose the time the follow-up happened.'); return }
      params.p_when = date.toISOString()
    }
    if (action === 'check_in') {
      if (!source.trim()) { setError('Record who or what verified the update.'); return }
      params.p_source = source.trim()
    }
    if ((action === 'decline' || action === 'fulfill') && attempt) params.p_referral = attempt
    const payload = JSON.stringify(params)
    if (operation.current?.payload !== payload) operation.current = { key: submissionKey(), payload }
    params.p_key = operation.current.key
    saving.current = true
    setPending(true)
    setError('')
    try {
      const { error } = await supabase.rpc('update_need', params)
      if (error) throw error
      choose(null)
      setNotice(action === 'check_in' ? 'Follow-up recorded. This need remains open.' : 'Update saved.')
      onSaved()
    } catch {
      setError('Could not save this update. Your entries are here. Check the connection and try again.')
    } finally {
      saving.current = false
      setPending(false)
    }
  }

  const secondary = actions.filter(a => a !== primary
    && (a !== 'assign' || canAssign)
    && (a !== 'decline' || activeRefs.length > 0)
    && (a !== 'check_in' || need.follow_up)
    && (a !== 'partner_contact' || need.service === 'family_support'))
  return <section className="case-actions" aria-label="Update this need">
    {need.status === 'open' && (action ? <form onSubmit={save}>
      <fieldset disabled={pending}>
        <legend>{actionLabel(action, need)}</legend>
        {action === 'assign' && (demo ? <label>Worker name
          <input list="case-workers" value={value} maxLength={80} onChange={e => setValue(e.target.value)} required={!need.owner} autoFocus />
          <datalist id="case-workers">{owners.map(name => <option key={name} value={name}/>)}</datalist>
        </label> : <label>Assigned staff member
          <select value={assignee} onChange={e => setAssignee(e.target.value)} autoFocus>
            <option value="">Unassigned</option>
            {staffMembers.map(member => <option value={member.user_id} key={member.user_id}>
              {member.display_name} · {member.role === 'administrator' ? 'Administrator' : 'Caseworker'}
            </option>)}
          </select>
        </label>)}
        {(action === 'refer' || action === 'partner_contact') && <label>Partner name
          <input list="case-partners" value={value} maxLength={100} onChange={e => setValue(e.target.value)} required autoFocus />
          <datalist id="case-partners">{partners.map(name => <option key={name} value={name}/>)}</datalist>
        </label>}
        {action === 'check_in' && <>
          <label>Follow-up outcome<textarea value={value} maxLength={500} onChange={e => setValue(e.target.value)} required autoFocus rows={2} /></label>
          <label>Verified by<input value={source} maxLength={120} onChange={e => setSource(e.target.value)} placeholder="e.g. Family member by phone" required /></label>
        </>}
        {(action === 'check_in' || action === 'follow_up') && <label>{action === 'check_in' ? 'Completed at' : 'Follow-up due'}
          <input type="datetime-local" required value={when} max={action === 'check_in' ? localTime(new Date()) : undefined}
            onChange={e => setWhen(e.target.value)} autoFocus={action === 'follow_up'}/>
          <span className="case-hint">Device time · {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </label>}
        {(action === 'fulfill' || action === 'decline') && <label>{action === 'fulfill' ? 'Who delivered the help?' : 'Declined referral'}
          <select value={attempt} onChange={e => setAttempt(e.target.value)} required={action === 'decline'} autoFocus>
            {action === 'fulfill' && <option value="">ComForce (direct)</option>}
            {activeRefs.map(r => <option value={r.id} key={r.id}>{r.partner} · {dated(r.sent_at)}</option>)}
          </select>
        </label>}
        {action === 'direct' && <p>Mark this need for delivery by ComForce. Confirm delivery after the resident receives help.</p>}
        {action === 'unmet' && <label>Unmet reason<textarea value={value} maxLength={300} onChange={e => setValue(e.target.value)} required autoFocus rows={2}/></label>}
        {error && <p className="team-error" role="alert">{error}</p>}
        <div className="case-buttons"><button className="team-primary" type="submit">{pending ? 'Saving…' : 'Save update'}</button>
          <button className="team-secondary" type="button" onClick={() => choose(null)}>Cancel</button></div>
      </fieldset>
    </form> : <>
      <div className="case-buttons">{primary && (primary !== 'assign' || canAssign) && <button className="team-primary" onClick={() => choose(primary)}>{actionLabel(primary, need)}</button>}
        <button className="team-secondary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>More actions</button></div>
      {expanded && <div className="case-action-list">{secondary.map(a => <button key={a} onClick={() => choose(a)}>{actionLabel(a, need)}</button>)}</div>}
    </>)}
    <p className="team-notice" role="status">{notice}</p>
  </section>
}
