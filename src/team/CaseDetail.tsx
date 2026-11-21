// Staff case sheet. Codex (GPT-6) organized related needs, safe contact, verified updates and direct case actions.
import { useEffect, useRef } from 'react'
import type { StaffMember } from '../workspace'
import { actionLabel, dated, historyLabels, isOverdue, nextAction, outcome, partner, serviceLabels, statusLabels, type Action, type Need, type TeamRequest } from './queue'
import NeedActions from './NeedActions'

interface Props {
  request: TeamRequest
  need: Need
  initial: Action | null
  token: string | null
  owners: string[]
  partners: string[]
  canAssign: boolean
  staffMembers: StaffMember[]
  demo: boolean
  onSelect: (need: Need) => void
  onClose: () => void
  onSaved: () => void
}

export default function CaseDetail({ request, need, initial, token, owners, partners, canAssign, staffMembers, demo, onSelect, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const openedForAction = useRef(!!initial)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    if (openedForAction.current) element?.querySelector<HTMLElement>('.case-actions form :is(input,select,textarea,button)')?.focus()
    return () => element?.close()
  }, [])
  const history = request.needs.flatMap(item => item.history.map(event => ({ ...event, service: item.service })))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  const family = need.service === 'family_support' ? request.family_support : null
  const verified = need.history.find(event => event.action === 'check_in')
  const action = nextAction(need)
  return <dialog className="team-dialog" ref={dialog} aria-labelledby="case-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="case-header">
      <div><span className="case-reference">{request.reference}</span>
        <h2 id="case-title">Request details</h2></div>
      <button className="case-close" onClick={onClose} aria-label="Close case" autoFocus>×</button>
    </header>
    <div className="case-body">
      <p className="case-origin">{request.neighborhood} · {{ web: 'Web intake', call: 'Phone intake', text: 'Text intake' }[request.source]} · {dated(request.created_at)}</p>
      <h3>Needs on this request</h3>
      <div role="group" aria-label="Select a need" className="case-needs">
        {request.needs.map(item => <button key={item.id} aria-pressed={item.id === need.id} onClick={() => onSelect(item)}>
          <strong>{serviceLabels[item.service]}</strong><span>{statusLabels[item.status]}</span>
        </button>)}
      </div>
      <section className="case-work" aria-label={serviceLabels[need.service] + ' details'}>
        <h3>{serviceLabels[need.service]}</h3>
        <dl className="case-facts">
          <div><dt>Owner</dt><dd>{need.owner || <span className="team-flag">Unassigned</span>}</dd></div>
          <div><dt>{need.status === 'fulfilled' ? 'Delivered' : 'Deadline'}</dt>
            <dd>{isOverdue(need, Date.now()) && <span className="team-flag">Overdue</span>}
              {need.fulfilled_at ? dated(need.fulfilled_at) : need.follow_up ? dated(need.follow_up) : need.status === 'open' ? 'Unscheduled' : 'Closed'}</dd></div>
          <div><dt>{action ? 'Next action' : 'Outcome'}</dt><dd>{action ? actionLabel(action, need) : outcome(need)}</dd></div>
          {partner(need) && <div><dt>Partner</dt><dd>{partner(need)}</dd></div>}
        </dl>
        <NeedActions key={need.id} need={need} initial={initial} token={token} owners={owners} partners={partners}
          canAssign={canAssign} staffMembers={staffMembers} demo={demo} onSaved={onSaved}/>
        {family && <dl className="case-family">
          <div><dt>Requested family support</dt><dd>{family.support}</dd></div>
          <div><dt>Safe follow-up</dt><dd>{family.safe_contact}</dd></div>
          {!!family.agency && <div><dt>Agency already involved</dt><dd>{family.agency}</dd></div>}
          {!!family.agency_reference && <div><dt>Agency reference</dt><dd>{family.agency_reference}</dd></div>}
        </dl>}
        {(family || verified) && <div className="case-verified">
          <h4>Latest verified follow-up</h4>
          {verified ? <><p>{verified.detail}</p><small>{dated(verified.at)}{verified.source ? ` · ${verified.source}` : ''}</small></> : <p>Awaiting a verified update.</p>}
        </div>}
      </section>
      <h3>Resident contact</h3>
      <p className="case-contact"><strong>{{phone:'Call',email:'Email',text:'Text'}[request.contact_method]}</strong> {request.contact}</p>
      <p className="case-description">{request.description}</p>
      {need.referrals.length > 0 && <details className="case-details"><summary>Referral attempts <b>{need.referrals.length}</b></summary>
        <ol>{need.referrals.map(ref => <li key={ref.id}><strong>{ref.partner}</strong><span>Sent {dated(ref.sent_at)}{ref.declined_at ? ` · Declined ${dated(ref.declined_at)}` : ''}</span></li>)}</ol>
      </details>}
      <details className="case-details"><summary>Request history <b>{history.length}</b></summary>
        {history.length ? <ol>{history.map((event, idx) => <li key={idx}>
          <strong>{historyLabels[event.action] || event.action} · {serviceLabels[event.service]}</strong>
          <span>{event.detail}</span><small>{dated(event.at)}{event.source ? ` · ${event.source}` : ''}
            {event.actor_name ? ` · ${event.actor_name} (${event.actor_role === 'administrator' ? 'administrator' : 'caseworker'})` : ''}</small>
        </li>)}</ol> : <p>Updates will appear here as the team works on this request.</p>}
      </details>
    </div>
  </dialog>
}
