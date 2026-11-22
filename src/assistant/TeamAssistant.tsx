// Team workspace assistant with confirm-before-save proposals. Claude (Opus 5.5) built the proposal cards and save path.
import { useState } from 'react'
import { t } from '../languages/language'
import { supabase } from '../supabase'
import { submissionKey } from '../intake/form'
import { dated } from '../team/queue'
import Assistant, { type StoredAction } from './Assistant'
import { teamPrefix } from './conversation'

type Proposal = Extract<StoredAction, { type: 'proposal' }>

function ProposalCard({ proposal, token, update, onSaved }: { proposal: Proposal; token: string | null; update: (patch: Partial<StoredAction>) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (saving || proposal.status) return
    // update_need requires an operation key for every action. Cards get theirs when they arrive (withKeys), so every save
    // and retry of this card reuses it. The fallback covers cards stored before keys were added.
    const key = proposal.key || submissionKey()
    if (!proposal.key) update({ key })
    const params: Record<string, string | null> = { p_token: token, p_need: proposal.needId, p_action: proposal.action }
    if (proposal.value !== undefined) params.p_value = proposal.value
    if (proposal.when) params.p_when = proposal.when
    if (proposal.source) params.p_source = proposal.source
    if (proposal.referral) params.p_referral = proposal.referral
    params.p_key = key
    setSaving(true)
    setError('')
    try {
      const { error } = await supabase.rpc('update_need', params)
      if (error) throw error
      update({ status: 'saved' })
      onSaved()
    } catch {
      setError('Could not save. The case may have changed. Check it in the queue and try again.')
    } finally { setSaving(false) }
  }
  return <div className="assistant-card assistant-proposal">
    <p><strong>{proposal.label.split(' · ').map(part => t(part)).join(' · ')}</strong></p>
    <p>{proposal.summary}</p>
    {(proposal.value || proposal.when || proposal.source || proposal.partner) && <dl>
      {proposal.value && <div><dt>{t('Details')}</dt><dd>{proposal.value}</dd></div>}
      {proposal.partner && <div><dt>{t(proposal.action === 'fulfill' ? 'Delivery credit' : 'Declined by')}</dt><dd>{proposal.partner}</dd></div>}
      {proposal.when && <div><dt>{t(proposal.action === 'check_in' ? 'Happened' : 'Due')}</dt><dd>{dated(proposal.when)}</dd></div>}
      {proposal.source && <div><dt>{t('Verified by')}</dt><dd>{proposal.source}</dd></div>}
    </dl>}
    {proposal.status === 'saved' ? <p className="assistant-status" role="status">{t('Saved to the case.')}</p>
      : proposal.status === 'dismissed' ? <p className="assistant-status">{t('Dismissed. Nothing was changed.')}</p>
      : <div className="assistant-buttons">
        <button type="button" className="assistant-action" disabled={saving} onClick={() => void save()}>{t(saving ? 'Saving…' : 'Save update')}</button>
        <button type="button" className="assistant-secondary" disabled={saving} onClick={() => update({ status: 'dismissed' })}>{t('Dismiss')}</button>
      </div>}
    {error && <p className="assistant-error" role="alert">{t(error)}</p>}
  </div>
}

// `scope` names the signed-in staff account or demo workspace. Each scope keeps its own conversation,
// so a different identity in the same tab never sees an earlier transcript or its proposal cards.
interface Props { token: string | null; scope: string; hidden: boolean; onSaved: () => void; onOpenCase: (reference: string, needId: string) => void }

export default function TeamAssistant({ token, scope, hidden, onSaved, onOpenCase }: Props) {
  return <Assistant key={scope} name="team" title="Team assistant" launcher="Team assistant" token={token} hidden={hidden}
    storageKey={`${teamPrefix}v2.${scope}`}
    greeting="I can search this workspace’s queue, explain what a case needs next and draft updates. Nothing is saved until you press Save update."
    notice="Drafted by an AI model. Check each update before saving."
    suggestions={['What should I work on first?', 'Which needs are overdue?', 'Summarize unassigned family support needs', 'Who has the most open needs?']}
    renderAction={(action, update) => {
      if (action.type === 'open_case') return <button type="button" className="assistant-action" onClick={() => onOpenCase(action.reference, action.needId)}>{action.service ? t('Open {reference}', { reference: action.reference }) + ' · ' + t(action.service) : action.label}</button>
      if (action.type === 'proposal') return <ProposalCard proposal={action} token={token} update={update} onSaved={onSaved}/>
      return null
    }}/>
}
