// Resident home: big, plain buttons for the most common needs, then a way to talk to a person.
import { route } from './preview/location'
import { neighborhoods } from './impact/neighborhoods'
import { residentLabels, serviceOrder as needs } from './services'
import Icon from './Icon'
import './home.css'

export default function Home() {
  return <main className="start-page">
    <section className="start-hello" aria-labelledby="start-title">
      <h1 id="start-title">Hi, neighbor. <span>How can we serve you?</span></h1>
      <p>Tap a button to ask for help. Someone from our team will get back to you.</p>
    </section>

    <nav className="start-needs" aria-label="What do you need?">
      {needs.map(id => <a key={id} className={'need-tile need-' + id} href={route('/request?service=' + id)}>
        <span className="need-icon"><Icon name={id}/></span>
        <span className="need-label">{residentLabels[id]}</span>
      </a>)}
    </nav>

    <a className="start-status" href={route('/status')}>
      <span className="need-icon"><Icon name="status"/></span>
      <span><small>Already asked for help?</small> Check on my request</span>
      <span className="start-arrow" aria-hidden="true">→</span>
    </a>

    <section className="start-talk" aria-label="Emergency help">
      <p className="start-danger">In danger right now? <a href="tel:911">Call 911</a>.</p>
    </section>

    <section className="start-areas" aria-labelledby="areas-title">
      <h2 id="areas-title"><Icon name="map" size={24}/> Your neighborhood</h2>
      <p>Pick your neighborhood to see how neighbors are getting help.</p>
      <nav aria-labelledby="areas-title">{neighborhoods.map(name =>
        <a key={name} href={route('/impact?area=' + encodeURIComponent(name) + '#neighborhoods')}>{name}</a>
      )}</nav>
    </section>
  </main>
}
