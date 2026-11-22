import { formatNumber, t, monthLabel as label } from '../languages/language'
// Interactive demo atlas. Codex (GPT-6) implemented scoped aggregate reads, month comparisons, map selection and trend controls.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { preview } from '../preview/location'
import { sampleImpact } from '../preview/samples'
import { ExpiredPairing, pairingRejected, impactToken } from '../workspace'
import ResidentRepair from '../ResidentRepair'
import { neighborhoods } from './neighborhoods'
import NeighborhoodMap from './NeighborhoodMap'

type Totals = {
  requests_helped: number; needs_fulfilled: number; referrals_made: number; food_fulfilled: number; family_followups: number
}
type ImpactRow = Totals & { month: string; neighborhood: string | null }
const zero: Totals = { requests_helped: 0, needs_fulfilled: 0, referrals_made: 0, food_fulfilled: 0, family_followups: 0 }
const metrics = [
  ['requests_helped', 'Requests helped'], ['needs_fulfilled', 'Needs fulfilled'],
  ['referrals_made', 'Referrals sent'], ['family_followups', 'Family check-ins completed'],
] as const
function offset(month: string, steps: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + steps, 1)).toISOString().slice(0, 7)
}
function chicagoMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', timeZone: 'America/Chicago' }).formatToParts(new Date())
  return parts.find(p => p.type === 'year')!.value + '-' + parts.find(p => p.type === 'month')!.value
}
function comparison(month: string, current: string, count: number | null, prior: number | null) {
  const previous = label(offset(month, -1))
  if (month === current) return t('{month} is still in progress.', { month: label(month) })
  if (count === null) return t('No recorded outcomes for this month.')
  if (prior === null) return t('No recorded outcomes for {month} to compare.', { month: previous })
  if (count === prior) return t('The same number of needs were fulfilled as in {month}.', { month: previous })
  if (!prior) return t(count === 1 ? '{count} need fulfilled, after zero in {month}.' : '{count} needs fulfilled, after zero in {month}.', { count: formatNumber(count), month: previous })
  const delta = Math.abs(count - prior)
  const key = count > prior
    ? (delta === 1 ? '{count} more need fulfilled than in {month}.' : '{count} more needs fulfilled than in {month}.')
    : (delta === 1 ? '{count} fewer need fulfilled than in {month}.' : '{count} fewer needs fulfilled than in {month}.')
  return t(key, { count: formatNumber(delta), month: previous })
}

export default function Atlas() {
  const [rows, setRows] = useState<ImpactRow[] | null>(null)
  const [month, setMonth] = useState('')
  const [selected, setSelected] = useState(() => {
    const name = new URLSearchParams(location.search).get('area')
    return name && neighborhoods.includes(name) ? name : ''
  })
  const [expired, setExpired] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (preview) { setRows(sampleImpact); setMonth(chosen => chosen || sampleImpact.at(-1)!.month); return }
    let disposed = false
    let pending: AbortController | null = null
    async function refresh() {
      if (disposed || pending || document.hidden) return
      const controller = new AbortController()
      pending = controller
      const timeout = window.setTimeout(() => controller.abort(), 8000)
      try {
        const token = await impactToken()
        const result = await supabase.rpc('public_impact', { p_token: token, p_template: token === null }).abortSignal(controller.signal)
        if (disposed) return
        if (result.error && pairingRejected(token, result.status, result.error.code)) throw new ExpiredPairing()
        if (result.error) throw result.error
        if (!disposed) {
          const fresh = (result.data ?? []) as ImpactRow[]
          setRows(fresh)
          setMonth(chosen => chosen || fresh.map(row => row.month).sort().at(-1) || chicagoMonth())
          setExpired(false)
          setFailed(false)
        }
      } catch (error) {
        if (!disposed && error instanceof ExpiredPairing) {
          setRows(null)
          setExpired(true)
          setFailed(false)
        } else if (!disposed) setFailed(true)
      } finally {
        window.clearTimeout(timeout)
        pending = null
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 3000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      disposed = true
      pending?.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [retry])

  const current = chicagoMonth()
  const period = month || current
  const cityMonths = (rows ?? []).filter(row => row.neighborhood === null).map(row => row.month).sort()
  const start = [period, cityMonths[0] || current].sort()[0]
  const end = [current, period, cityMonths.at(-1) || current].sort().at(-1)!
  const periods: string[] = []
  for (let m = start; m <= end; m = offset(m, 1)) periods.push(m)
  const monthly = (rows ?? []).filter(row => row.month === period)
  const totals = monthly.find(row => row.neighborhood === (selected || null)) ?? zero
  const counts = rows && Object.fromEntries(monthly.filter(row => row.neighborhood).map(row => [row.neighborhood!, row.needs_fulfilled]))
  const scope = selected === 'Unknown' ? t('Unknown neighborhood') : selected || t('All neighborhoods')
  const series = Array.from({ length: 6 }, (_, i) => {
    const m = offset(period, i - 5)
    const value = cityMonths.includes(m)
      ? (rows?.find(row => row.month === m && row.neighborhood === (selected || null))?.needs_fulfilled ?? 0)
      : null
    return { m, value }
  })
  const max = Math.max(1, ...(rows ?? []).filter(row => row.neighborhood === (selected || null)).map(row => row.needs_fulfilled))
  const index = periods.indexOf(period)
  const hasActivity = totals.needs_fulfilled + totals.referrals_made + totals.family_followups > 0
  const areas = [...neighborhoods, 'Unknown']
  return <section className="atlas-board" aria-labelledby="atlas-title">
    <header className="atlas-heading"><div>
      <h2 id="atlas-title">{t("Neighborhood atlas")}</h2>
    </div>
      <div className="atlas-month">
        <button type="button" aria-label={t("Previous month")} disabled={index <= 0} onClick={() => setMonth(periods[index - 1])}>‹</button>
        <select aria-label={t("Reporting month")} value={period} onChange={event => setMonth(event.target.value)}>
          {periods.map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <button type="button" aria-label={t("Next month")} disabled={index < 0 || index >= periods.length - 1} onClick={() => setMonth(periods[index + 1])}>›</button>
      </div>
    </header>
    <p className="atlas-instruction">{t("Explore fictional outcomes across six Milwaukee neighborhoods. Tap a name to see local totals.")}</p>
    {expired && <ResidentRepair onPaired={() => { setExpired(false); setRetry(value => value + 1) }}/> }
    {failed && <div role="alert" className="atlas-error">
      {rows ? t('Refresh failed. The last available totals are shown.') : t('Demo outcomes are unavailable. Check your connection.')}
      <button type="button" onClick={() => setRetry(value => value + 1)}>{t("Retry")}</button>
    </div>}
    <NeighborhoodMap selected={selected} periodLabel={label(period)} counts={counts} legendLabel={t("Needs fulfilled")}
      readout={rows ? t(totals.needs_fulfilled === 1 ? '{count} need fulfilled' : '{count} needs fulfilled', { count: formatNumber(totals.needs_fulfilled) }) : t('Awaiting data')} choose={setSelected} />
    <div className="atlas-outcomes">
      <div className="atlas-scope">
        <h3>{selected ? t('{area} outcomes', { area: scope }) : t('Citywide outcomes')}</h3>
        <span>{label(period)}</span>
      </div>
      <dl className="atlas-metrics">{metrics.map(([key, title]) => <div key={key}>
        <dt>{t(title)}</dt><dd data-testid={key}>{rows ? formatNumber(totals[key]) : '—'}</dd>
      </div>)}</dl>
      <p className="atlas-food"><strong data-testid="food_fulfilled">{rows ? formatNumber(totals.food_fulfilled) : '—'}</strong> {t(totals.food_fulfilled === 1 ? 'food need fulfilled in this selection.' : 'food needs fulfilled in this selection.')}</p>
      {rows && !hasActivity && <p className="atlas-empty" role="status">{t("No recorded outcomes in this selection. Choose another month or neighborhood.")}</p>}
    </div>
    <div className="atlas-trend">
      <div><h3>{t("Needs fulfilled over six months")}</h3>
        <p>{scope} · {label(series[0].m, true)}–{label(period)}</p>
        <p className="atlas-comparison">{rows ? comparison(period, current, series[5].value, series[4].value) : t('Awaiting demo data.')}</p>
        {rows && series.some(point => point.value === null) && <p className="atlas-gap">{t("— No citywide outcomes recorded.")}</p>}
      </div>
      <ol aria-label={t('Monthly fulfilled needs for {area}', { area: scope })}>{series.map(({m, value}) => <li key={m} className={m === period ? 'current' : ''}>
        <span className="trend-amount">{value === null ? '—' : formatNumber(value)}</span>
        <span className="trend-track"><i aria-hidden="true" style={{height: value ? `${value / max * 100}%` : '0'}} /></span>
        <span aria-label={label(m)}>{label(m, true)}</span>
      </li>)}</ol>
    </div>
    <section className="atlas-table" aria-labelledby="atlas-data-title"><h3 id="atlas-data-title">{t("Neighborhood totals and map sources")}</h3>
      <div className="atlas-table-body"><p>{t("Confirmed needs fulfilled in")} {label(period)}{t(". Select a neighborhood to update the atlas.")}</p>
        <ul>{areas.map(name => <li key={name}><button type="button" aria-pressed={selected === name} onClick={() => setSelected(name)}>
          {name === 'Unknown' ? t('Unknown neighborhood') : name}<b>{rows ? formatNumber(counts?.[name] ?? 0) : '—'}</b>
        </button></li>)}</ul>
        <p>{t("Requests helped counts each request with a confirmed fulfillment once in the selected month. A referral counts when sent. A family check-in counts when recorded as completed. Gaps in the history indicate months with no recorded citywide outcomes.")}</p>
        <p>{t("Neighborhood boundaries from the")} <a href="https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/AGO/neighborhoods/MapServer/0">{t("City of Milwaukee")}</a>{t(". Water features from the 2025 U.S. Census TIGER/Line files for")} <a href="https://www2.census.gov/geo/tiger/TIGER2025/AREAWATER/tl_2025_55079_areawater.zip">Milwaukee</a> {t("and")} <a href="https://www2.census.gov/geo/tiger/TIGER2025/AREAWATER/tl_2025_55089_areawater.zip">Ozaukee</a>{t(' counties.')}</p>
      </div>
    </section>
  </section>
}
