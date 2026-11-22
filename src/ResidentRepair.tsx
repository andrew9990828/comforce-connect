// Restore resident pairing in place. OpenAI Codex (GPT-6) implemented draft-preserving recovery.
import { useState } from 'react'
import { t } from './languages/language'
import { replacePairing } from './workspace'

export default function ResidentRepair({ onPaired, unpaired = false }: { onPaired: () => void; unpaired?: boolean }) {
  const [link, setLink] = useState('')
  const [invalid, setInvalid] = useState(false)
  return <div>
    <p role="alert">{t(unpaired ? 'Use the browser where you submitted the request, or paste a resident link from the team.' : 'Your resident link has expired. Ask the team for a new resident link and paste it here.')}</p>
    <label>{t('New resident link')} <input type="url" value={link} autoComplete="off"
      onChange={event => { setLink(event.target.value); setInvalid(false) }} /></label>
    <button type="button" onClick={() => {
      if (replacePairing(link)) onPaired()
      else setInvalid(true)
    }}>{t('Pair again')}</button>
    {invalid && <p role="alert">{t('Use a resident link from this site’s team workspace.')}</p>}
  </div>
}
