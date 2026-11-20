// Public landing page. Codex (GPT-6) designed the atlas introduction, program entry and attributed historical context.
import Atlas from './Atlas'
import { familyProgram, history, reach } from './publishedFacts'
import './impact.css'

export default function Impact() {
  return <main className="impact-page">
    <div className="impact-spread">
      <header className="impact-lead">
        <p className="impact-location">Milwaukee, Wisconsin</p>
        <h1>Community <em>impact</em></h1>
        <p className="impact-intro-copy">Community Task Force MKE connects Milwaukee residents with food and rides, and coordinates <a href="#family-program">support for families</a> when a loved one goes missing.</p>
        <a className="impact-cta" href="/request">Request help</a>
        <div className="impact-reach">
          <p className="impact-source">Reported by ComForce MKE</p>
          <dl>{reach.map(fact => <div key={fact.unit}><dt>{fact.unit}</dt><dd>
            <a href={fact.url} aria-label={`Source for ${fact.value} ${fact.unit}, ComForce MKE`}>{fact.value}</a>
          </dd></div>)}</dl>
        </div>
      </header>
      <Atlas />
      <section className="impact-program" aria-labelledby="family-program">
        <p className="impact-kicker">Family support</p>
        <h2 id="family-program">{familyProgram.name}</h2>
        <p>{familyProgram.description} <a href={familyProgram.url}>Program details</a></p>
        <a className="impact-program-link" href="/request?service=family_support">Request family support</a>
      </section>
    </div>
    <section className="impact-history" aria-labelledby="city-history-title">
      <div><p className="impact-kicker">Milwaukee historical context</p>
        <h2 id="city-history-title">Missing-person reports, citywide</h2>
        <p>Two annual snapshots from the Milwaukee Fire and Police Commission count people reported missing to police. The same person could be reported more than once.</p>
      </div>
      <dl>{history.map(fact => <div key={fact.period}>
        <dt>{fact.period}</dt>
        <dd>{fact.value.toLocaleString('en-US')}</dd>
        <dd className="history-link"><a href={fact.url}>{fact.period} public safety report, p. {fact.page}</a></dd>
      </div>)}</dl>
    </section>
  </main>
}
