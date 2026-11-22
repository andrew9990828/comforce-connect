// App entry and route navigation. Codex (GPT-6) built the public and team layouts and route loading.
// asherjaenchen with Claude Opus 5.5 added the /status route and its navigation link.
// Claude (Opus 5.5) added the public-site assistant.
import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans/wght.css'
import './base.css'
import './appearance.css'
import './glass.css'
import { GlassOptics } from './GlassOptics'
import markUrl from './brand/mark.png'
import lockupUrl from './brand/lockup.png'
import { preview, route } from './preview/location'
import { guideRoute } from './impact/guide'
import { configured } from './supabase'
import { acceptResidentLink, isStaffMode } from './workspace'

let path = (preview ? location.pathname.slice(8) : location.pathname).replace(/\/+$/, '') || '/'
const legacyGuide = guideRoute(path)
if (legacyGuide) {
  history.replaceState(history.state, '', legacyGuide)
  path = '/impact'
}
if (!preview && (path === '/request' || path === '/' || path === '/impact' || path === '/status')) acceptResidentLink()
const source = new URLSearchParams(location.search).get('source')
const staffIntake = path === '/request' && (source === 'call' || source === 'text')
const staff = path === '/team' || staffIntake
const queue = route('/team') + (isStaffMode() ? '?mode=staff' : '')
const log = route('/request?source=call') + (isStaffMode() ? '&mode=staff' : '')
const Page = path === '/' ? lazy(() => import('./Home'))
  : path === '/safety' ? lazy(() => import('./safety/Safety'))
  : path === '/impact' ? lazy(() => import('./impact/Impact'))
  : path === '/request' ? lazy(() => import('./intake/Intake'))
  : path === '/status' ? lazy(() => import('./status/Status'))
  : path === '/team' ? lazy(() => import('./team/Team')) : undefined
document.title = 'ComForce Connect · ' + (staff ? 'Team workspace' : path === '/' ? 'Home' : path === '/safety' ? 'Your neighborhood' : path === '/impact' ? 'How we help' : path === '/request' ? 'Get help' : path === '/status' ? 'Check my request' : 'Page unavailable')

const CommunityAssistant = lazy(() => import('./assistant/CommunityAssistant'))

function App() {
  return <>
    <GlassOptics/>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className={'site-header' + (staff ? ' staff-header' : '')}>
      <div className="site-bar">
        <a className="brand" href={staff ? queue : route('/')} aria-label={staff ? 'ComForce Connect team home' : 'ComForce Connect home'}>
          <img className="brand-mark" src={markUrl} alt="" />
          <span className="brand-text"><span>ComForce <b>Connect</b></span><span className="brand-sub">Community Task Force MKE</span></span>
        </a>
        {staff ? <>
          <span className="staff-wordmark">Team workspace</span>
          <nav className="site-nav" aria-label="Team navigation">
            <a className="public-crosslink" href={route(isStaffMode() ? '/' : '/#my-workspace')}>View public site</a>
            <a className="staff-log" href={log} aria-current={staffIntake ? 'page' : undefined}>Log a request</a>
          </nav>
        </> : <nav className="site-nav" aria-label="Public navigation">
          <a className="nav-cta" href={route('/request')} aria-current={path === '/request' ? 'page' : undefined}>Get help</a>
          <a href={route('/status')} aria-current={path === '/status' ? 'page' : undefined}>Check my request</a>
          <a href={route('/impact')} aria-current={path === '/impact' ? 'page' : undefined}>How we help</a>
          <a href={route('/safety')} aria-current={path === '/safety' ? 'page' : undefined}>Your neighborhood</a>
          {Page && !isStaffMode() && <Suspense fallback={null}><CommunityAssistant/></Suspense>}
        </nav>}
      </div>
    </header>
    <div id="content" tabIndex={-1}>
      {!configured && !preview && Page && path !== '/' && path !== '/safety' && <aside className="setup-notice">Local setup needed. Set the public Supabase key in .env.local and restart Vite to connect the demo.</aside>}
      {Page ? <Suspense fallback={<main className="missing-page" role="status">Loading…</main>}><Page /></Suspense>
        : <main className="missing-page"><h1>Page unavailable</h1><a href={route('/')}>Return home</a></main>}
    </div>
    <footer className="site-footer"><img className="footer-lockup" src={lockupUrl} alt="Community Task Force MKE · ComForce MKE" />
      {!staff && <p className="footer-help">Need to talk to someone? <a href="tel:211">Call 211</a> · In danger? <a href="tel:911">Call 911</a></p>}
      {!staff && <a className="footer-team" href={queue}>Team workspace</a>}</footer>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
