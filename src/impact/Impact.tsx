// Community impact: the neighborhood map first, then three short cards on reach, family support and city history.
// Codex (GPT-6) built the atlas and sourced facts; Claude (Opus 5.5) simplified the page around the map.
import { formatNumber, t } from '../languages/language'
import { route } from '../preview/location'
import Atlas from './Atlas'
import { familyProgram, history, reach } from './publishedFacts'
import './impact.css'

export default function Impact() {
  return <main className="impact-page impact-simple">
    <h1 className="impact-sr-only">{t("How we help")}</h1>
    <div id="neighborhoods" className="impact-map"><Atlas/></div>

    <div className="impact-cards">
      <section className="impact-card" aria-labelledby="reach-title">
        <h2 id="reach-title">{t("People behind the work")}</h2>
        <dl className="impact-stats">{reach.map(fact => <div key={fact.unit}>
          <dd>{formatNumber(fact.minimum)}+</dd><dt>{t(fact.unit)}</dt>
        </div>)}</dl>
        <p className="impact-source">{t("Reported by")} <a href={reach[0].url}>Community Task Force MKE</a> · {t(reach[0].period)}</p>
      </section>

      <section className="impact-card impact-card-family" aria-labelledby="family-title">
        <h2 id="family-title">{t(familyProgram.name)}</h2>
        <p>{t(familyProgram.description)}</p>
        <div className="impact-actions">
          <a className="impact-button" href={route('/request?service=family_support')}>{t("Request family support")}</a>
          <a href={familyProgram.url}>{t("Program details")}</a>
        </div>
      </section>

      <section className="impact-card" aria-labelledby="city-history-title">
        <h2 id="city-history-title">{t("Missing-person reports, citywide")}</h2>
        <dl className="impact-stats">{history.map(fact => <div key={fact.period}>
          <dd>{formatNumber(fact.value)}</dd><dt>{t("in")} {fact.period} · <a href={fact.url}>{t("source, p.")} {fact.page}</a></dt>
        </div>)}</dl>
        <p className="impact-source">{t("People reported missing to Milwaukee police. The same person could be reported more than once.")}</p>
      </section>
    </div>
  </main>
}
