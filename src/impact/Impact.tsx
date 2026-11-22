// Scrolling community impact story. Codex (GPT-6) arranged the map, reach and family resources in reading order.
import { formatNumber, t } from '../languages/language'
import { route } from '../preview/location'
import ChapterIndex from './ChapterIndex'
import { serviceLabels } from '../services'
import Atlas from './Atlas'
import Shoreline from './Shoreline'
import { familyProgram, history, reach } from './publishedFacts'
import './impact.css'

export default function Impact() {
  return <main className="impact-page impact-story" data-layout="field-guide" data-edition="scroll">
    <header className="story-cover">
      <div className="story-intro">
        <h1>{t("Community")} <br/>{t("impact")}.</h1>
        <p>{t("From a ride to an appointment to a family check-in, see how support reaches Milwaukee residents.")}</p>
        <a href="#neighborhoods">{t("Explore the map")} <span aria-hidden="true">↓</span></a>
      </div>
      <Shoreline/>
    </header>
    <ChapterIndex/>
    <div className="story-sections">
      <section id="community-reach" className="story-reach impact-reach" aria-labelledby="reach-title">
        <div><h2 id="reach-title">{t("People behind the work.")}</h2>
          <p className="reach-attribution"><span>{t("Reported by")}</span> <a href={reach[0].url}>Community Task Force <span className="source-link-end">MKE<svg className="source-link-icon" aria-hidden="true" focusable="false"
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3H3v10h10V9M9 2h5v5M14 2 7 9"/>
          </svg></span></a> · {t(reach[0].period)}</p>
        </div>
        <dl>{reach.map(fact => <div key={fact.unit}>
          <dt>{t(fact.unit)}</dt><dd>{formatNumber(fact.minimum)}+</dd>
        </div>)}</dl>
      </section>
      <div id="neighborhoods" className="story-map"><Atlas/></div>
      <section className="guide-resource" id="services">
        <h2>{t("Service directory")}</h2><p>{t("Start with one need. You can add others to the same request.")}</p>
        <div className="service-directory">{Object.entries(serviceLabels).map(([id, label]) =>
          <a key={id} href={route('/request?service=' + id)}>{t(label)}<span aria-hidden="true">↗</span></a>
        )}</div>
      </section>
      <section className="guide-resource" id="request-guide">
        <h2>{t("How requests work")}</h2>
        <ol className="request-steps">
          <li><strong>{t("Tell us what you need")}</strong><p>{t("Choose your services and neighborhood. If you’re unsure of the neighborhood, select “Unknown / unsure.”")}</p></li>
          <li><strong>{t("Choose how to hear back")}</strong><p>{t("Choose a call, text, or email first. Add a second choice if you like. For family support, include a safe way for staff to follow up.")}</p></li>
          <li><strong>{t("Keep your reference number")}</strong><p>{t("One number covers all the needs in your request. The team can arrange direct help or a partner referral for each one.")}</p></li>
        </ol>
        <a className="guide-action" href={route('/request')}>{t("Start a request")} →</a>
      </section>
      <section className="story-family" aria-labelledby="family-title">
        <h2 id="family-title">{t(familyProgram.name)}</h2>
        <div><p>{t(familyProgram.description)}</p>
          <div className="story-actions"><a href={route('/request?service=family_support')}>{t("Request family support")}</a>
            <a href={familyProgram.url}>{t("Program details")}</a></div>
        </div>
      </section>
      <section className="impact-history" aria-labelledby="city-history-title">
        <div><h2 id="city-history-title">{t("Missing-person reports, citywide")}</h2>
          <p>{t("These historical snapshots count people reported missing to Milwaukee police. The same person could be reported more than once.")}</p>
        </div>
        <dl>{history.map(fact => <div key={fact.period}><dt>{fact.period}</dt>
          <dd>{formatNumber(fact.value)}</dd>
          <dd className="history-link"><a href={fact.url}>{fact.period} {t("public safety report, p.")} {fact.page}</a></dd>
        </div>)}</dl>
      </section>
    </div>
  </main>
}
