import { formatNumber, t } from '../languages/language'
// Public landing page. Codex (GPT-6) designed the atlas introduction, program entry and attributed historical context.
import Atlas from './Atlas'
import { familyProgram, history, reach } from './publishedFacts'
import './impact.css'

export default function Impact() {
  return <main className="impact-page">
    <div className="impact-spread">
      <header className="impact-lead">
        <p className="impact-location">Milwaukee, Wisconsin</p>
        <h1>{t("Community")} <em>{t("impact")}</em></h1>
        <p className="impact-intro-copy">{t("Community Task Force MKE connects Milwaukee residents with food and rides, and coordinates")} <a href="#family-program">{t("support for families")}</a> {t("when a loved one goes missing.")}</p>
        <a className="impact-cta" href="/request">{t("Request help")}</a>
        <div className="impact-reach">
          <p className="impact-source">{t("Reported by ComForce MKE")} · {t(reach[0].period)}</p>
          <dl>{reach.map(fact => {
            const value = formatNumber(fact.minimum) + '+'
            return <div key={fact.unit}>
              <dt>{t(fact.unit)}</dt>
              <dd><a href={fact.url} aria-label={t('Source for {value} {unit}, ComForce MKE', { value, unit: t(fact.unit) })}>{value}</a></dd>
            </div>
          })}</dl>
        </div>
      </header>
      <Atlas />
      <section className="impact-program" aria-labelledby="family-program">
        <p className="impact-kicker">{t("Family support")}</p>
        <h2 id="family-program">{t(familyProgram.name)}</h2>
        <p>{t(familyProgram.description)} <a href={familyProgram.url}>{t("Program details")}</a></p>
        <a className="impact-program-link" href="/request?service=family_support">{t("Request family support")}</a>
      </section>
    </div>
    <section className="impact-history" aria-labelledby="city-history-title">
      <div><p className="impact-kicker">{t("Milwaukee historical context")}</p>
        <h2 id="city-history-title">{t("Missing-person reports, citywide")}</h2>
        <p>{t("Two annual snapshots from the Milwaukee Fire and Police Commission count people reported missing to police. The same person could be reported more than once.")}</p>
      </div>
      <dl>{history.map(fact => <div key={fact.period}>
        <dt>{fact.period}</dt>
        <dd>{formatNumber(fact.value)}</dd>
        <dd className="history-link"><a href={fact.url}>{fact.period} {t("public safety report, p.")} {fact.page}</a></dd>
      </div>)}</dl>
    </section>
  </main>
}
