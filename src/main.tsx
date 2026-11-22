// App entry and route navigation. Codex (GPT-6) built the public and team layouts and route loading.
// asherjaenchen with Claude Opus 5.5 added the Lend a Hand routes (/help-out and /team/board).
// asherjaenchen with Claude Opus 5.5 added the /status route and its navigation link.
// Claude (Opus 5.5) added the public-site assistant.
import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans/wght.css'
import './base.css'
import './appearance.css'
import './glass.css'
import { GlassOptics } from './GlassOptics'
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
if (!preview && (path === '/request' || path === '/' || path === '/impact' || path === '/help-out' || path === '/status')) acceptResidentLink()
const source = new URLSearchParams(location.search).get('source')
const staffIntake = path === '/request' && (source === 'call' || source === 'text')
const staff = path === '/team' || path === '/team/board' || staffIntake
const queue = route('/team') + (isStaffMode() ? '?mode=staff' : '')
const board = '/team/board' + (isStaffMode() ? '?mode=staff' : '')
const log = route('/request?source=call') + (isStaffMode() ? '&mode=staff' : '')
const Page = path === '/' ? lazy(() => import('./Home'))
  : path === '/safety' ? lazy(() => import('./safety/Safety'))
  : path === '/impact' ? lazy(() => import('./impact/Impact'))
  : path === '/request' ? lazy(() => import('./intake/Intake'))
  : path === '/status' ? lazy(() => import('./status/Status'))
  : path === '/team' ? lazy(() => import('./team/Team'))
  : !preview && path === '/help-out' ? lazy(() => import('./helpout/HelpOut'))
  : !preview && path === '/team/board' ? lazy(() => import('./helpout/TeamBoard')) : undefined
document.title = 'ComForce Connect · ' + (staff ? 'Team workspace' : path === '/' ? 'Home' : path === '/safety' ? 'Neighborhood data' : path === '/impact' ? 'Community impact' : path === '/request' ? 'Request help' : path === '/help-out' ? 'Lend a hand' : path === '/status' ? 'Check a request' : 'Page unavailable')

const CommunityAssistant = lazy(() => import('./assistant/CommunityAssistant'))

function App() {
  return <>
    <GlassOptics/>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className={'site-header' + (staff ? ' staff-header' : '')}>
      <div className="site-bar">
        <a className="brand" href={staff ? queue : route('/')} aria-label={staff ? 'ComForce Connect team home' : 'ComForce Connect home'}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>ComForce <b>Connect</b></span>
        </a>
        {staff ? <>
          <span className="staff-wordmark">Team workspace</span>
          <nav className="site-nav" aria-label="Team navigation">
            {!preview && <a href={board} aria-current={path === '/team/board' ? 'page' : undefined}>Community board</a>}
            <a className="public-crosslink" href={route(isStaffMode() ? '/' : '/#my-workspace')}>View public site</a>
            <a className="staff-log" href={log} aria-current={staffIntake ? 'page' : undefined}>Log a request</a>
          </nav>
        </> : <nav className="site-nav" aria-label="Public navigation">
          {path !== '/' && <a href={route('/')}>Home</a>}
          <a href={route('/impact')} aria-current={path === '/impact' ? 'page' : undefined}>Community impact</a>
          <a href={route('/safety')} aria-current={path === '/safety' ? 'page' : undefined}>Neighborhood data</a>
          <a href={route('/request')} aria-current={path === '/request' ? 'page' : undefined}>Request help</a>
          {!preview && <a href="/help-out" aria-current={path === '/help-out' ? 'page' : undefined}>Lend a hand</a>}
          <a href={route('/status')} aria-current={path === '/status' ? 'page' : undefined}>Check a request</a>
          <a href={queue}>Team workspace</a>
          {Page && !isStaffMode() && <Suspense fallback={null}><CommunityAssistant/></Suspense>}
        </nav>}
      </div>
    </header>
    <div id="content" tabIndex={-1}>
      {!configured && !preview && Page && path !== '/' && path !== '/safety' && <aside className="setup-notice">Local setup needed. Set the public Supabase key in .env.local and restart Vite to connect the demo.</aside>}
      {Page ? <Suspense fallback={<main className="missing-page" role="status">Loading…</main>}><Page /></Suspense>
        : <main className="missing-page"><h1>Page unavailable</h1><a href={route('/')}>Return home</a></main>}
    </div>
    <footer className="site-footer"><span>Community Task Force MKE</span></footer>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
