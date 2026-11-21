// Team workspace assistant with confirm-before-save proposals. Claude (Opus 5.5) built the proposal cards and save path.
import { useState } from 'react'
import { supabase } from '../supabase'
import { submissionKey } from '../intake/form'
import { dated } from '../team/queue'
import Assistant, { type StoredAction } from './Assistant'

type Proposal = Extract<StoredAction, { type: 'proposal' }>

function ProposalCard({ proposal, token, update, onSaved }: { proposal: Proposal; token: string | null; update: (patch: Partial<StoredAction>) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (saving) return
    // update_need requires an operation key for every action. It's stored with the card, so a retry after a lost response can't apply the update twice.
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
    <p><strong>{proposal.label}</strong></p>
    <p>{proposal.summary}</p>
    {(proposal.value || proposal.when || proposal.source) && <dl>
      {proposal.value && <div><dt>Details</dt><dd>{proposal.value}</dd></div>}
      {proposal.when && <div><dt>{proposal.action === 'check_in' ? 'Happened' : 'Due'}</dt><dd>{dated(proposal.when)}</dd></div>}
      {proposal.source && <div><dt>Verified by</dt><dd>{proposal.source}</dd></div>}
    </dl>}
    {proposal.status === 'saved' ? <p className="assistant-status" role="status">Saved to the case.</p>
      : proposal.status === 'dismissed' ? <p className="assistant-status">Dismissed. Nothing was changed.</p>
      : <div className="assistant-buttons">
        <button type="button" className="assistant-action" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save update'}</button>
        <button type="button" className="assistant-secondary" disabled={saving} onClick={() => update({ status: 'dismissed' })}>Dismiss</button>
      </div>}
    {error && <p className="assistant-error" role="alert">{error}</p>}
  </div>
}

interface Props { token: string | null; hidden: boolean; onSaved: () => void; onOpenCase: (reference: string, needId: string) => void }

export default function TeamAssistant({ token, hidden, onSaved, onOpenCase }: Props) {
  return <Assistant name="team" title="Team assistant" launcher="Team assistant" token={token} hidden={hidden}
    greeting="I can search this workspace’s queue, explain what a case needs next and draft updates. Nothing is saved until you press Save update."
    notice="Drafted by an AI model. Check each update before saving."
    suggestions={['What should I work on first?', 'Which needs are overdue?', 'Summarize unassigned family support needs', 'Who has the most open needs?']}
    renderAction={(action, update) => {
      if (action.type === 'open_case') return <button type="button" className="assistant-action" onClick={() => onOpenCase(action.reference, action.needId)}>{action.label}</button>
      if (action.type === 'proposal') return <ProposalCard proposal={action} token={token} update={update} onSaved={onSaved}/>
      return null
    }}/>
}
