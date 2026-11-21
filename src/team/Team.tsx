// Staff workspace. Codex (GPT-6) built isolated case queues, scoped polling and history-aware direct actions.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { isStaffMode, staffContext } from '../workspace'
import CaseDetail from './CaseDetail'
import TeamLogin from './TeamLogin'
import ResidentPairing from './ResidentPairing'
import { actionLabel, dated, isOverdue, nextAction, outcome, partner, serviceLabels, statusLabels, type Action, type Need, type NeedStatus, type Service, type TeamRequest } from './queue'
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
          if (['42501', 'PGRST301', 'PGRST303'].includes(result.error.code)) setRequests(null)
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
  const unassigned = opened.filter(r => !r.need.owner)
  const owners = [...new Set(rows.flatMap(r => r.need.owner ? [r.need.owner] : []))].sort()
  const partners = [...new Set(rows.flatMap(({ need }) => [...need.referrals.map(ref => ref.partner), ...(need.partner_contact ? [need.partner_contact] : [])]))].sort()
  const query = search.trim().toLowerCase()
  const visible = rows.filter(({ request, need }) =>
    (!service || need.service === service) && (!owner || need.owner === owner) && (status === 'all' || need.status === status) &&
    (attention !== 'overdue' || isOverdue(need, now)) && (attention !== 'unassigned' || (need.status === 'open' && !need.owner)) &&
    (!query || [request.reference, request.neighborhood, request.description, serviceLabels[need.service], need.owner, partner(need)]
      .some(field => field?.toLowerCase().includes(query))))
    .sort((a, b) => Number(isOverdue(b.need, now)) - Number(isOverdue(a.need, now))
      || Number(!b.need.owner) - Number(!a.need.owner)
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
    <div className="team-intro"><div><h1>Needs queue</h1>
      <p>{staff ? membership ? `${membership.role === 'administrator' ? 'Administrator' : 'Caseworker'} workspace` : 'Staff workspace' : 'Private fictional workspace'} · Milwaukee</p></div>
      {!!membership?.residentToken && <ResidentPairing token={membership.residentToken}/>}
    </div>
    {error && <div role="alert" className="team-error">{error} <button onClick={refresh}>Retry</button></div>}
    {requests === null ? !error && <p role="status">Opening workspace…</p> : <>
      <div className="team-attention" role="group" aria-label="Queue views">{groups.map(([group, label, count]) =>
        <button key={group} aria-pressed={attention === group && status === 'open'} onClick={() => viewGroup(group)}>
          <span>{label}</span><b>{count}</b>
        </button>)}</div>
      <div className="team-filters">
        <label className="team-search">Search<input type="search" value={search} placeholder="Reference, need or neighborhood" onChange={e => setSearch(e.target.value)}/></label>
        <label>Service<select value={service} onChange={e => setService(e.target.value)}>
          <option value="">All services</option>{(Object.keys(serviceLabels) as Service[]).map(s => <option key={s} value={s}>{serviceLabels[s]}</option>)}
        </select></label>
        <button className="team-filter-toggle" aria-expanded={filtersOpen} aria-controls="team-extra-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
          {filtersOpen ? 'Hide filters' : 'More filters'}{!filtersOpen && (owner || status !== 'open') ? ' •' : ''}</button>
      </div>
      {filtersOpen && <div className="team-extra" id="team-extra-filters">
        <label>Owner<select value={owner} onChange={e => setOwner(e.target.value)}><option value="">All owners</option>{owners.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>Status<select value={status} onChange={e => { setStatus(e.target.value as typeof status); setAttention('all') }}>
          <option value="all">All statuses</option>{(Object.keys(statusLabels) as NeedStatus[]).map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
        </select></label>
      </div>}
      <section aria-label="Matching needs" className="team-queue">
        <div className="queue-heading"><h2>{attention === 'overdue' ? 'Overdue follow-ups' : attention === 'unassigned' ? 'Unassigned needs' : status === 'open' ? 'Open needs' : 'Matching needs'}</h2>
          <span aria-live="polite">{visible.length} {visible.length === 1 ? 'need' : 'needs'}</span></div>
        {!visible.length ? <div className="team-empty"><h3>No matching needs</h3><p>Try another queue view, search or service.</p>
          <button className="team-secondary" onClick={() => { viewGroup('all'); setStatus('all') }}>Clear filters</button>
        </div> : <>
          <div className="team-columns" aria-hidden="true"><span>Need / case</span><span>Owner</span><span>Deadline · Chicago time</span><span>Next action</span></div>
          <ul className="team-rows">{visible.map(({ request, need }) => {
            const action = nextAction(need)
            const verified = need.history.find(e => e.action === 'check_in')
            return <li key={need.id} className="team-row" data-service={need.service}>
              <button className="team-need-link" onClick={() => openCase(request, need, null)}>
                <strong>{serviceLabels[need.service]}</strong><small>{request.reference} · {request.neighborhood}</small>
              </button>
              <div className="team-row-owner"><span className="team-mobile-label">Owner</span>
                <span className={!need.owner && need.status === 'open' ? 'team-flag' : undefined}>{need.owner || 'Unassigned'}</span></div>
              <div className="team-row-due"><span className="team-mobile-label">Deadline</span>
                {isOverdue(need, now) && <span className="team-flag">Overdue</span>}
                {need.status !== 'open' ? statusLabels[need.status] : need.follow_up ? dated(need.follow_up) : 'Unscheduled'}</div>
              <div className="team-row-action">{action
                ? <button className="team-next-action" onClick={() => openCase(request, need, action)}>{actionLabel(action, need)}</button>
                : <span>{outcome(need)}</span>}</div>
              {need.service === 'family_support' && (partner(need) || verified) && <p className="team-update">
                {partner(need) && <span><strong>Partner</strong> {partner(need)}</span>}
                {verified && <span><strong>Verified follow-up</strong> {dated(verified.at)} · {verified.detail}{verified.source && ` · ${verified.source}`}</span>}</p>}
            </li>
          })}</ul>
        </>}
      </section>
      {selected.reference && !currentRequest && <div role="status" className="team-error">This case is unavailable in this workspace. <button onClick={closeCase}>Return to queue</button></div>}
    </>}
    <footer className="team-footer">{staff ? <><a href="/team">Open fictional demo</a>
      <button onClick={async () => { const { error } = await supabase.auth.signOut({ scope:'local' }); if (error) setError('Sign-out failed. Try again.') }}>Sign out</button></>
      : <a href="/team?mode=staff">Staff sign-in</a>}</footer>
    {!!currentRequest && !!currentNeed && membership && <CaseDetail request={currentRequest} need={currentNeed} initial={initialAction} token={membership.token}
      owners={owners} partners={partners} canAssign={membership.canAssign} staffMembers={membership.staff} demo={!staff}
      onSelect={need => openCase(currentRequest, need, null)} onSaved={refresh} onClose={closeCase}/>}
  </main>
}

export default function Team() {
  const staff = isStaffMode()
  const [account, setAccount] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!staff) return
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAccount(session?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [staff])
  if (staff && account === undefined) return <main className="team-page" role="status">Checking staff session…</main>
  if (staff && !account) return <TeamLogin/>
  return <Workspace key={staff ? account : 'demo'} staff={staff}/>
}
