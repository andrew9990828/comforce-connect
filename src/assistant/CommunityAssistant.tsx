// Public-site assistant for residents. Claude (Opus 5.5) built the request pre-fill and page buttons.
import { useState } from 'react'
import { t } from '../languages/language'
import { serviceLabels } from '../services'
import Assistant, { type StoredAction } from './Assistant'
import { offerDraft } from './draft'

function Action({ action }: { action: StoredAction }) {
  const [draftUnavailable, setDraftUnavailable] = useState(false)
  if (action.type === 'link') return <a className="assistant-action" href={action.href}>{t(action.label)}</a>
  if (action.type !== 'prefill') return null
  return <div className="assistant-card">
    <p><strong>{t('Ready for the form')}</strong> · {action.services.map(id => t(serviceLabels[id])).join(', ')}
      {action.neighborhood && ` · ${action.neighborhood}`}</p>
    {action.description && <p>{action.description}</p>}
    <button type="button" className="assistant-action" onClick={() => setDraftUnavailable(!offerDraft(action))}>{t('Fill in the request form')}</button>
    {draftUnavailable && <p role="status">{t('This browser couldn’t transfer the draft.')} <a href="/request">{t('Open the request form')}</a></p>}
    <small>{t('You’ll add your contact details and press Submit yourself.')}</small>
  </div>
}

export default function CommunityAssistant() {
  return <Assistant name="community" title="ComForce help" launcher="Need help?"
    greeting="Hi! I can explain the help ComForce offers, guide you around this site and start a request with you. I can’t see anyone’s requests or personal details. If this is an emergency, call 911."
    notice="Answers come from an AI model and may contain mistakes. Please don’t share names, phone numbers or addresses here."
    suggestions={['What help can I get?', 'I need groceries and a ride', 'My family member is missing', 'How do I read the impact map?']}
    renderAction={action => <Action action={action}/>}/>
}
