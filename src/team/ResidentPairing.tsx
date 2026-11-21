import { t } from '../languages/language'
// Phone pairing panel. Codex (GPT-6) implemented resident-only links and local-network address selection.
import { useRef, useState } from 'react'
import { residentLink } from '../workspace'

function lanOrigin(address: string) {
  try {
    const url = new URL(address)
    const ip = url.hostname.split('.').map(Number)
    const local = url.hostname.endsWith('.local') || ip.length === 4 && (ip[0] === 10
      || ip[0] === 192 && ip[1] === 168 || ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31)
    if (local && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.origin
  } catch { /* Incomplete address while typing. */ }
  return ''
}

export default function ResidentPairing({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [message, setMessage] = useState('')
  const output = useRef<HTMLInputElement>(null)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  const origin = loopback && address.trim() ? lanOrigin(address.trim()) : location.origin
  const link = origin ? residentLink(token, origin) : ''
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link)
      else {
        output.current?.select()
        if (!document.execCommand('copy')) throw new Error('Select link')
      }
      setMessage('Resident link copied.')
    } catch {
      output.current?.focus()
      output.current?.select()
      setMessage('Copy the selected resident link.')
    }
  }
  return <div className="team-pair">
    <button className="team-secondary" aria-controls="resident-pairing" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span aria-hidden="true" className="pair-device"/>{t("Pair a resident device")}
    </button>
    {open && <section id="resident-pairing" aria-label={t("Pair a resident device")}>
      <h2>{t("Resident link")}</h2>
      <p>{t("Open this link on the resident’s device. Their fictional requests will arrive in this queue. The link grants intake and aggregate access only.")}</p>
      {loopback && <label>{t("Laptop’s Wi-Fi address")}
        <input type="url" autoComplete="off" placeholder="http://192.168.1.20:5173" value={address} onChange={e => { setAddress(e.target.value); setMessage('') }}/>
        <span className="case-hint">{t("For a phone, use the laptop’s LAN URL on the same trusted Wi-Fi. Leave blank for a second browser on this laptop.")}</span>
      </label>}
      {link ? <><label>{t("Resident-only link")}<input ref={output} readOnly value={link} onFocus={e => e.target.select()}/></label>
        <button className="team-primary" onClick={copy}>{t("Copy resident link")}</button></>
        : <p className="team-error">{t("Enter a local Wi-Fi URL with its port.")}</p>}
      <p role="status" className="team-notice">{t(message)}</p>
    </section>}
  </div>
}
