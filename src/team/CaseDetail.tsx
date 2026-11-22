import LanguageSelect from '../languages/LanguageSelect'
import { t, demoText } from '../languages/language'
// Staff case sheet. Codex (GPT-6) organized related needs, safe contact, verified updates and direct case actions.
import { useEffect, useRef } from 'react'
import type { StaffMember } from '../workspace'
import { actionLabel, dated, historyDeadline, historyLabels, isOverdue, needsAssignment, nextAction, outcome, partner, serviceLabels, statusLabels, type Action, type Need, type TeamRequest } from './queue'
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
  legacyApi: boolean
  onSelect: (need: Need) => void
  onClose: () => void
  onSaved: () => void
}

export default function CaseDetail({ request, need, initial, token, owners, partners, canAssign, staffMembers, demo, legacyApi, onSelect, onClose, onSaved }: Props) {
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
        <h2 id="case-title">{t("Request details")}</h2></div>
      <LanguageSelect />
      <button className="case-close" onClick={onClose} aria-label={t("Close case")} autoFocus>×</button>
    </header>
    <div className="case-body">
      <p className="case-origin">{request.neighborhood === 'Unknown' ? t('Unknown neighborhood') : request.neighborhood} · {t({ web: 'Web intake', call: 'Phone intake', text: 'Text intake' }[request.source])} · {dated(request.created_at)}</p>
      <h3>{t("Needs on this request")}</h3>
      <div role="group" aria-label={t("Select a need")} className="case-needs">
        {request.needs.map(item => <button key={item.id} aria-pressed={item.id === need.id} onClick={() => onSelect(item)}>
          <strong>{t(serviceLabels[item.service])}</strong><span>{t(statusLabels[item.status])}</span>
        </button>)}
      </div>
      <section className="case-work" aria-label={t('{service} details', { service: t(serviceLabels[need.service]) })}>
        <h3>{t(serviceLabels[need.service])}</h3>
        <dl className="case-facts">
          <div><dt>{t("Owner")}</dt><dd>{needsAssignment(need) ? <span className="team-flag">{need.owner ? need.owner + " · " + t("Link staff account") : t("Unassigned")}</span> : need.owner}</dd></div>
          <div><dt>{need.status === 'fulfilled' ? t('Delivered') : t('Deadline')}</dt>
            <dd>{isOverdue(need, Date.now()) && <span className="team-flag">{t("Overdue")}</span>}
              {need.fulfilled_at ? dated(need.fulfilled_at) : need.follow_up ? dated(need.follow_up) : need.status === 'open' ? t('Unscheduled') : t('Closed')}</dd></div>
          <div><dt>{action ? t('Next action') : t('Outcome')}</dt><dd>{action ? actionLabel(action, need) : outcome(need)}</dd></div>
          {partner(need) && <div><dt>{t("Partner")}</dt><dd>{partner(need)}</dd></div>}
        </dl>
        <NeedActions key={need.id} need={need} initial={initial} token={token} owners={owners} partners={partners}
          canAssign={canAssign} staffMembers={staffMembers} demo={demo} legacyApi={legacyApi} onSaved={onSaved}/>
        {family && <dl className="case-family">
          <div><dt>{t("Requested family support")}</dt><dd>{demoText(family.support, demo)}</dd></div>
          <div><dt>{t("Safe follow-up")}</dt><dd>{demoText(family.safe_contact, demo)}</dd></div>
          {!!family.agency && <div><dt>{t("Agency already involved")}</dt><dd>{family.agency}</dd></div>}
          {!!family.agency_reference && <div><dt>{t("Agency reference")}</dt><dd>{family.agency_reference}</dd></div>}
        </dl>}
        {(family || verified) && <div className="case-verified">
          <h4>{t("Latest verified follow-up")}</h4>
          {verified ? <><p>{demoText(verified.detail, demo)}</p><small>{dated(verified.at)}{verified.source ? ` · ${demoText(verified.source, demo)}` : ''}</small></> : <p>{t("Awaiting a verified update.")}</p>}
        </div>}
      </section>
      <h3>{t("Resident contact")}</h3>
      <p className="case-contact"><strong>{t({phone:'Call',email:'Email',text:'Text'}[request.contact_method])}</strong> {request.contact}</p>
      <p className="case-description">{demoText(request.description, demo)}</p>
      {need.referrals.length > 0 && <details className="case-details"><summary>{t("Referral attempts")} <b>{need.referrals.length}</b></summary>
        <ol>{need.referrals.map(ref => <li key={ref.id}><strong>{ref.partner}</strong><span>{t("Sent")} {dated(ref.sent_at)}{ref.declined_at ? ` · ${t('Declined')} ${dated(ref.declined_at)}` : ''}</span></li>)}</ol>
      </details>}
      <details className="case-details"><summary>{t("Request history")} <b>{history.length}</b></summary>
        {history.length ? <ol>{history.map((event, idx) => <li key={idx}>
          <strong>{t(historyLabels[event.action] || event.action)} · {t(serviceLabels[event.service])}</strong>
          <span>{event.action === 'direct' || (event.action === 'assign' && event.detail === 'Unassigned') ? t(event.detail) : event.action === 'follow_up' ? historyDeadline(event.detail) : demoText(event.detail, demo)}</span><small>{dated(event.at)}{event.source ? ` · ${demoText(event.source, demo)}` : ''}
            {event.actor_name ? ` · ${event.actor_name} (${event.actor_role === 'administrator' ? t('Administrator') : t('Caseworker')})` : ''}</small>
        </li>)}</ol> : <p>{t("Updates will appear here as the team works on this request.")}</p>}
      </details>
    </div>
  </dialog>
}
