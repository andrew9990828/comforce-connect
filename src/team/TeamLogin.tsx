import { firstFieldError } from '../languages/formValidation'
import { t } from '../languages/language'
// Verified staff entry. Codex (GPT-6) implemented the optional OTP flow and retained the pending step on reload.
import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'

const pendingKey = 'comforce.pending-staff-email'
export default function TeamLogin() {
  const [sentTo, setSentTo] = useState(() => sessionStorage.getItem(pendingKey) || '')
  const [email, setEmail] = useState(sentTo)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const invalid = firstFieldError(event.currentTarget)
    if (invalid) { setError(invalid); return }
    setError('')
    setBusy(true)
    try {
      const address = email.trim().toLowerCase()
      const result = sentTo
        ? await supabase.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' })
        : await supabase.auth.signInWithOtp({ email: address })
      if (result.error) throw result.error
      if (sentTo) sessionStorage.removeItem(pendingKey)
      else {
        sessionStorage.setItem(pendingKey, address)
        setSentTo(address)
      }
    } catch {
      setError(sentTo ? 'Check the newest code in your inbox or request another code.' : 'Could not send the code. Check the email address and try again.')
    } finally { setBusy(false) }
  }
  function restart() {
    sessionStorage.removeItem(pendingKey)
    setSentTo('')
    setCode('')
    setError('')
  }
  return <main className="team-page"><section className="team-login">
    <h1>{t("Staff sign-in")}</h1>
    <p>{t("Use your approved staff email. Administrators manage assignments; caseworkers see only cases assigned to them.")}</p>
    <form noValidate onSubmit={signIn}>
      {sentTo ? <><p role="status">{t("Enter the six-digit code sent to")} <strong>{sentTo}</strong>.</p>
        <label>{t("Six-digit sign-in code")}<input value={code} onChange={e => setCode(e.target.value)}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /></label></>
        : <label>{t("Staff email")}<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>}
      {error && <p role="alert" className="team-error">{t(error)}</p>}
      <div className="case-buttons">
        <button type="submit" disabled={busy} className="team-primary">{busy ? t('Please wait…') : sentTo ? t('Open workspace') : t('Send sign-in code')}</button>
        {sentTo && <button type="button" className="team-secondary" disabled={busy} onClick={restart}>{t("Request another code")}</button>}
      </div>
    </form>
    <a href="/team">{t("Open fictional team demo")}</a>
  </section></main>
}
