// Scrolling community impact story. Codex (GPT-6) arranged the map, reach and family resources in reading order.
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
        <h1>Community <br/>impact.</h1>
        <p>From a ride to an appointment to a family check-in, see how support reaches Milwaukee residents.</p>
        <a href="#neighborhoods">Explore the map <span aria-hidden="true">↓</span></a>
      </div>
      <Shoreline/>
    </header>
    <ChapterIndex/>
    <div className="story-sections">
      <section id="community-reach" className="story-reach impact-reach" aria-labelledby="reach-title">
        <div><h2 id="reach-title">People behind the work.</h2>
          <p>Reported by <a href={reach[0].url}>Community Task Force MKE<svg className="source-link-icon" aria-hidden="true" focusable="false"
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3H3v10h10V9M9 2h5v5M14 2 7 9"/>
          </svg></a></p>
        </div>
        <dl>{reach.map(fact => <div key={fact.unit}>
          <dt>{fact.unit}</dt><dd>{fact.value}</dd>
        </div>)}</dl>
      </section>
      <div id="neighborhoods" className="story-map"><Atlas/></div>
      <section className="guide-resource" id="services">
        <h2>Service directory</h2><p>Start with one need. You can add others to the same request.</p>
        <div className="service-directory">{Object.entries(serviceLabels).map(([id, label]) =>
          <a key={id} href={route('/request?service=' + id)}>{label}<span aria-hidden="true">↗</span></a>
        )}</div>
      </section>
      <section className="guide-resource" id="request-guide">
        <h2>How requests work</h2>
        <ol className="request-steps">
          <li><strong>Tell us what you need</strong><p>Choose your services and neighborhood. If you’re unsure of the neighborhood, select “Unknown / unsure.”</p></li>
          <li><strong>Choose how to hear back</strong><p>Choose a call, text, or email first. Add a second choice if you like. For family support, include a safe way for staff to follow up.</p></li>
          <li><strong>Keep your reference number</strong><p>One number covers all the needs in your request. The team can arrange direct help or a partner referral for each one.</p></li>
        </ol>
        <a className="guide-action" href={route('/request')}>Start a request →</a>
      </section>
      <section className="story-family" aria-labelledby="family-title">
        <h2 id="family-title">{familyProgram.name}</h2>
        <div><p>{familyProgram.description}</p>
          <div className="story-actions"><a href={route('/request?service=family_support')}>Request family support</a>
            <a href={familyProgram.url}>Program details</a></div>
        </div>
      </section>
      <section className="impact-history" aria-labelledby="city-history-title">
        <div><h2 id="city-history-title">Missing-person reports, citywide</h2>
          <p>These historical snapshots count people reported missing to Milwaukee police. The same person could be reported more than once.</p>
        </div>
        <dl>{history.map(fact => <div key={fact.period}><dt>{fact.period}</dt>
          <dd>{fact.value.toLocaleString('en-US')}</dd>
          <dd className="history-link"><a href={fact.url}>{fact.period} public safety report, p. {fact.page}</a></dd>
        </div>)}</dl>
      </section>
    </div>
  </main>
}
