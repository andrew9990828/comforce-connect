// Resident home: big, plain buttons for the most common needs, then the community impact page.
import { t } from './languages/language'
import { route } from './preview/location'
import { residentLabels, serviceOrder as needs } from './services'
import Impact from './impact/Impact'
import Icon from './Icon'
import './home.css'

function Greeting() {
  return <section className="start-page" aria-labelledby="start-title">
    <div className="start-hello">
      <h1 id="start-title">{t('Hi, neighbor.')} <span>{t('How can we serve you?')}</span></h1>
      <p>{t('Tap a button to ask for help. Someone from our team will get back to you.')}</p>
    </div>

    <nav className="start-needs" aria-label={t('What do you need?')}>
      {needs.map(id => <a key={id} className={'need-tile need-' + id} href={route('/request?service=' + id)}>
        <span className="need-icon"><Icon name={id}/></span>
        <span className="need-label">{t(residentLabels[id])}</span>
      </a>)}
    </nav>

    <a className="start-status" href={route('/status')}>
      <span className="need-icon"><Icon name="status"/></span>
      <span><small>{t('Already asked for help?')}</small> {t('Check on my request')}</span>
      <span className="start-arrow" aria-hidden="true">→</span>
    </a>
  </section>
}

export default function Home() {
  return <Impact intro={<Greeting/>}/>
}
