import { t, demoText } from '../languages/language'
// Staff workspace. Codex (GPT-6) built isolated case queues, scoped polling and history-aware direct actions.
// Claude (Opus 5.5) added the team assistant.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { isStaffMode, staffContext } from '../workspace'
import CaseDetail from './CaseDetail'
import TeamLogin from './TeamLogin'
import ResidentPairing from './ResidentPairing'
import TeamAssistant from '../assistant/TeamAssistant'
import { clearTeamChats, scopeLabel } from '../assistant/conversation'
import { actionLabel, dated, isOverdue, needsAssignment, nextAction, outcome, partner, serviceLabels, statusLabels, type Action, type Need, type NeedStatus, type Service, type TeamRequest } from './queue'
import './team.css'

type Attention = 'all' | 'overdue' | 'unassigned'
type Membership = Awaited<ReturnType<typeof staffContext>>
function detailLocation() {
  const params = new URLSearchParams(location.search)
  return { reference: params.get('case') || '', needId: params.get('need') || '' }
}

function Workspace({ staff }: { staff: boolean }) {
  const [membership, setMembership] = useState<Membership | null>(null)
  const [requests, setRequests] = useState<TeamRequest[] | null>(null)
  const [error, setError] = useState('')
  const [refreshNumber, setRefreshNumber] = useState(0)
  const [search, setSearch] = useState('')
  const [service, setService] = useState('')
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState<NeedStatus | 'all'>('open')
  const [attention, setAttention] = useState<Attention>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selected, setSelected] = useState(detailLocation)
  const [initialAction, setInitialAction] = useState<Action | null>(null)
  const membershipRef = useRef<Membership | null>(null)
  const queueScroll = useRef(0)
  const trigger = useRef<HTMLElement | null>(null)

  function refresh() { setRefreshNumber(n => n + 1) }
  useEffect(() => {
    function navigate() {
      const target = detailLocation()
      setSelected(target)
      setInitialAction(null)
      if (!target.reference && trigger.current) requestAnimationFrame(() => {
        window.scrollTo(0, queueScroll.current)
        trigger.current?.focus({ preventScroll: true })
      })
    }
    window.addEventListener('popstate', navigate)
    return () => window.removeEventListener('popstate', navigate)
  }, [])
  function openCase(request: TeamRequest, need: Need, action: Action | null) {
    const url = new URL(location.href)
    url.searchParams.set('case', request.reference)
    url.searchParams.set('need', need.id)
    if (!selected.reference) {
      trigger.current = document.activeElement as HTMLElement
      queueScroll.current = window.scrollY
      history.pushState({ ...history.state, comforceQueueParent: true }, '', url)
    } else history.replaceState(history.state, '', url)
    setInitialAction(action)
    setSelected(detailLocation())
  }
  function closeCase() {
    if (history.state?.comforceQueueParent) { history.back(); return }
    const url = new URL(location.href)
    url.searchParams.delete('case')
    url.searchParams.delete('need')
    history.replaceState(history.state, '', url)
    setSelected(detailLocation())
    setInitialAction(null)
  }

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    let pending: AbortController | undefined
    async function pull() {
      clearTimeout(timer)
      if (!live || pending || document.hidden) return
      const controller = new AbortController()
      pending = controller
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const context = membershipRef.current ?? await staffContext()
        if (!live) return
        if (!membershipRef.current) {
          membershipRef.current = context
          setMembership(context)
        }
        const result = await supabase.rpc('team_queue', { p_token: context.token }).abortSignal(controller.signal)
        if (!live) return
        if (result.error) {
          if (['42501', 'PGRST301', 'PGRST303'].includes(result.error.code)) {
            membershipRef.current = null
            setMembership(null)
            setRequests(null)
          }
          throw result.error
        }
        setRequests(result.data as TeamRequest[])
        setError('')
      } catch {
        if (live) setError(staff ? 'Could not open the staff queue. Check your connection and staff access.' : 'Could not refresh this demo queue. Check your connection and retry.')
      } finally {
        clearTimeout(timeout)
        pending = undefined
        if (live && !document.hidden) timer = setTimeout(pull, 2500)
      }
    }
    void pull()
    window.addEventListener('focus', pull)
    window.addEventListener('online', pull)
    document.addEventListener('visibilitychange', pull)
    return () => {
      live = false
      clearTimeout(timer)
      pending?.abort()
      window.removeEventListener('focus', pull)
      window.removeEventListener('online', pull)
      document.removeEventListener('visibilitychange', pull)
    }
  }, [refreshNumber, staff])

  const rows = (requests || []).flatMap(request => request.needs.map(need => ({ request, need })))
  const now = Date.now()
  const opened = rows.filter(r => r.need.status === 'open')
  const overdue = opened.filter(r => isOverdue(r.need, now))
  const unassigned = opened.filter(r => needsAssignment(r.need))
  const owners = [...new Set(rows.flatMap(r => r.need.owner ? [r.need.owner] : []))].sort()
  const partners = [...new Set(rows.flatMap(({ need }) => [...need.referrals.map(ref => ref.partner), ...(need.partner_contact ? [need.partner_contact] : [])]))].sort()
  const query = search.trim().toLowerCase()
  const visible = rows.filter(({ request, need }) =>
    (!service || need.service === service) && (!owner || need.owner === owner) && (status === 'all' || need.status === status) &&
    (attention !== 'overdue' || isOverdue(need, now)) && (attention !== 'unassigned' || (need.status === 'open' && needsAssignment(need))) &&
    (!query || [request.reference, request.neighborhood, request.description, demoText(request.description, !!request.demo_fixture), serviceLabels[need.service], t(serviceLabels[need.service]), need.owner, partner(need)]
      .some(field => field?.toLowerCase().includes(query))))
    .sort((a, b) => Number(isOverdue(b.need, now)) - Number(isOverdue(a.need, now))
      || Number(needsAssignment(b.need)) - Number(needsAssignment(a.need))
      || ((a.need.follow_up ? Date.parse(a.need.follow_up) : Infinity) - (b.need.follow_up ? Date.parse(b.need.follow_up) : Infinity))
      || Date.parse(b.request.created_at) - Date.parse(a.request.created_at))
  const currentRequest = requests?.find(r => r.reference === selected.reference)
  const currentNeed = currentRequest && (currentRequest.needs.find(n => n.id === selected.needId)
    || currentRequest.needs.find(n => n.status === 'open') || currentRequest.needs[0])
  function viewGroup(group: Attention) {
    setAttention(group); setStatus('open'); setSearch(''); setService(''); setOwner('')
  }
  const groups: [Attention, string, number][] = [
    ['all', 'Open needs', opened.length], ['overdue', 'Overdue', overdue.length], ['unassigned', 'Unassigned', unassigned.length],
  ]
  return <main className="team-page">
    <div className="team-intro"><div><h1>{t("Needs queue")}</h1>
      <p>{staff ? membership ? t(membership.role === 'administrator' ? 'Administrator workspace' : 'Caseworker workspace') : t('Staff workspace') : t('Private fictional workspace')} · Milwaukee</p></div>
      {!!membership?.residentToken && <ResidentPairing token={membership.residentToken}/>}
    </div>
    {error && <div role="alert" className="team-error">{t(error)} <button onClick={refresh}>{t("Retry")}</button></div>}
    {requests === null ? !error && <p role="status">{t("Opening workspace…")}</p> : <>
      <div className="team-attention" role="group" aria-label={t("Queue views")}>{groups.map(([group, label, count]) =>
        <button key={group} aria-pressed={attention === group && status === 'open'} onClick={() => viewGroup(group)}>
          <span>{t(label)}</span><b>{count}</b>
        </button>)}</div>
      <div className="team-filters">
        <label className="team-search">{t("Search")}<input type="search" value={search} placeholder={t("Reference, need or neighborhood")} onChange={e => setSearch(e.target.value)}/></label>
        <label>{t("Service")}<select value={service} onChange={e => setService(e.target.value)}>
          <option value="">{t("All services")}</option>{(Object.keys(serviceLabels) as Service[]).map(s => <option key={s} value={s}>{t(serviceLabels[s])}</option>)}
        </select></label>
        <button className="team-filter-toggle" aria-expanded={filtersOpen} aria-controls="team-extra-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
          {filtersOpen ? t('Hide filters') : t('More filters')}{!filtersOpen && (owner || status !== 'open') ? ' •' : ''}</button>
      </div>
      {filtersOpen && <div className="team-extra" id="team-extra-filters">
        <label>{t("Owner")}<select value={owner} onChange={e => setOwner(e.target.value)}><option value="">{t("All owners")}</option>{owners.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>{t("Status")}<select value={status} onChange={e => { setStatus(e.target.value as typeof status); setAttention('all') }}>
          <option value="all">{t("All statuses")}</option>{(Object.keys(statusLabels) as NeedStatus[]).map(s => <option key={s} value={s}>{t(statusLabels[s])}</option>)}
        </select></label>
      </div>}
      <section aria-label={t("Matching needs")} className="team-queue">
        <div className="queue-heading"><h2>{attention === 'overdue' ? t('Overdue follow-ups') : attention === 'unassigned' ? t('Unassigned needs') : status === 'open' ? t('Open needs') : t('Matching needs')}</h2>
          <span aria-live="polite">{t(visible.length === 1 ? '{count} need' : '{count} needs', { count: visible.length })}</span></div>
        {!visible.length ? <div className="team-empty"><h3>{t("No matching needs")}</h3><p>{t("Try another queue view, search or service.")}</p>
          <button className="team-secondary" onClick={() => { viewGroup('all'); setStatus('all') }}>{t("Clear filters")}</button>
        </div> : <>
          <div className="team-columns" aria-hidden="true"><span>{t("Need / case")}</span><span>{t("Owner")}</span><span>{t("Deadline · Chicago time")}</span><span>{t("Next action")}</span></div>
          <ul className="team-rows">{visible.map(({ request, need }) => {
            const action = nextAction(need)
            const verified = need.history.find(e => e.action === 'check_in')
            return <li key={need.id} className="team-row" data-service={need.service}>
              <button className="team-need-link" onClick={() => openCase(request, need, null)}>
                <strong>{t(serviceLabels[need.service])}</strong><small>{request.reference} · {request.neighborhood === 'Unknown' ? t('Unknown neighborhood') : request.neighborhood}</small>
              </button>
              <div className="team-row-owner"><span className="team-mobile-label">{t("Owner")}</span>
                <span className={needsAssignment(need) && need.status === 'open' ? 'team-flag' : undefined}>{needsAssignment(need) && need.owner ? need.owner + ' · ' + t('Link account') : need.owner || t('Unassigned')}</span></div>
              <div className="team-row-due"><span className="team-mobile-label">{t("Deadline")}</span>
                {isOverdue(need, now) && <span className="team-flag">{t("Overdue")}</span>}
                {need.status !== 'open' ? t(statusLabels[need.status]) : need.follow_up ? dated(need.follow_up) : t('Unscheduled')}</div>
              <div className="team-row-action">{action
                ? <button className="team-next-action" onClick={() => openCase(request, need, action)}>{actionLabel(action, need)}</button>
                : <span>{outcome(need)}</span>}</div>
              {need.service === 'family_support' && (partner(need) || verified) && <p className="team-update">
                {partner(need) && <span><strong>{t("Partner")}</strong> {partner(need)}</span>}
                {verified && <span><strong>{t("Verified follow-up")}</strong> {dated(verified.at)} · {demoText(verified.detail, !!verified.demo_fixture)}{verified.source && ` · ${demoText(verified.source, !!verified.demo_fixture)}`}</span>}</p>}
            </li>
          })}</ul>
        </>}
      </section>
      {selected.reference && !currentRequest && <div role="status" className="team-error">{t("This case is unavailable in this workspace.")} <button onClick={closeCase}>{t("Return to queue")}</button></div>}
    </>}
    <footer className="team-footer">{staff ? <><a href="/team">{t("Open fictional demo")}</a>
      <button onClick={async () => { clearTeamChats(); const { error } = await supabase.auth.signOut({ scope:'local' }); if (error) setError('Sign-out failed. Try again.') }}>{t("Sign out")}</button></>
      : <a href="/team?mode=staff">{t("Staff sign-in")}</a>}</footer>
    {requests && membership && <TeamAssistant token={membership.token} hidden={!!currentRequest} onSaved={refresh}
      scope={staff ? `staff-${membership.userId}` : `demo-${scopeLabel(membership.token ?? '')}`}
      onOpenCase={(reference, needId) => {
        const request = requests.find(r => r.reference === reference)
        const need = request?.needs.find(n => n.id === needId)
        if (request && need) openCase(request, need, null)
      }}/>}
    {!!currentRequest && !!currentNeed && membership && <CaseDetail request={currentRequest} need={currentNeed} initial={initialAction} token={membership.token}
      owners={owners} partners={partners} canAssign={membership.canAssign} staffMembers={membership.staff} demo={!staff} legacyApi={membership.legacyApi}
      onSelect={need => openCase(currentRequest, need, null)} onSaved={refresh} onClose={closeCase}/>}
  </main>
}

export default function Team() {
  const staff = isStaffMode()
  const [account, setAccount] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!staff) return
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Covers sign-out from another tab or an expired session, as well as the Sign out button.
      if (event === 'SIGNED_OUT') clearTeamChats()
      setAccount(session?.user.id ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [staff])
  if (staff && account === undefined) return <main className="team-page" role="status">{t("Checking staff session…")}</main>
  if (staff && !account) return <TeamLogin/>
  return <Workspace key={staff ? account : 'demo'} staff={staff}/>
}
