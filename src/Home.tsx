// Resident home. Codex (GPT-6) organized the landing page around resident support and community impact.
import { route } from './preview/location'
import { neighborhoods } from './impact/neighborhoods'
import Shoreline from './impact/Shoreline'

export default function Home() {
  return <main className="home-page">
    <div className="home-copy">
      <h1>How can <br/>we help?</h1>
      <p>Find everyday help in Milwaukee, including support when a loved one is missing.</p>
      <nav className="home-choices" aria-label="Choose a destination">
        <a href={route('/request')}>Request help or family support <span aria-hidden="true">→</span></a>
        <a href={route('/impact')}>Explore community impact <span aria-hidden="true">→</span></a>
      </nav>
    </div>
    <Shoreline/>
    <section className="home-neighborhoods" aria-labelledby="home-area-title">
      <h2 id="home-area-title">Explore your neighborhood</h2>
      <p>See fictional monthly activity in the Milwaukee neighborhood atlas.</p>
      <nav aria-labelledby="home-area-title">{neighborhoods.map(name =>
        <a key={name} href={route('/impact?area=' + encodeURIComponent(name) + '#neighborhoods')}>{name}</a>
      )}</nav>
    </section>
  </main>
}
