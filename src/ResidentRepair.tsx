// Restore resident pairing in place. OpenAI Codex (GPT-6) implemented draft-preserving recovery.
import { useState } from 'react'
import { replacePairing } from './workspace'

export default function ResidentRepair({ onPaired }: { onPaired: () => void }) {
  const [link, setLink] = useState('')
  const [invalid, setInvalid] = useState(false)
  return <div>
    <p role="alert">Your resident link has expired. Ask the team for a new resident link and paste it here.</p>
    <label>New resident link <input type="url" value={link} autoComplete="off"
      onChange={event => { setLink(event.target.value); setInvalid(false) }} /></label>
    <button type="button" onClick={() => {
      if (replacePairing(link)) onPaired()
      else setInvalid(true)
    }}>Pair again</button>
    {invalid && <p role="alert">Use a resident link from this site’s team workspace.</p>}
  </div>
}
