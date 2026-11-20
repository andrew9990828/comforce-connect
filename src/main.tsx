// Application entry and route navigation. Codex (GPT-6) implemented the local demo shell.
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans/wght.css'
import './base.css'
import { configured } from './supabase'
import Impact from './impact/Impact'
import Intake from './intake/Intake'
import Team from './team/Team'

const path = location.pathname.replace(/\/+$/, '') || '/'
const pages = [
  { path: '/', name: 'Community impact', shortName: 'Impact', component: Impact },
  { path: '/request', name: 'Request help', shortName: 'Request help', component: Intake },
  { path: '/team', name: 'Team workspace', shortName: 'Team', component: Team },
]
const route = pages.find(page => page.path === path)
const Page = route?.component
document.title = `${route?.name ?? 'Page unavailable'} · ComForce Connect`

function App() {
  return <>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="site-header">
      <div className="site-bar">
        <a className="brand" href="/" aria-label="ComForce Connect home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>ComForce <b>Connect</b></span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">{pages.map(page =>
          <a key={page.path} href={page.path} aria-label={page.name} aria-current={path === page.path ? 'page' : undefined}>
            <span className="nav-full">{page.name}</span><span className="nav-short">{page.shortName}</span>
          </a>,
        )}</nav>
        <span className="demo-label"><span aria-hidden="true">◇</span> Fictional demo</span>
      </div>
    </header>
    <div id="content" tabIndex={-1}>
      {!configured && <aside className="setup-notice">Local setup needed. Set the public Supabase key in .env.local and restart Vite to connect the demo.</aside>}
      {Page ? <Page /> : <main className="missing-page"><h1>Page unavailable</h1><a href="/">Return to community impact</a></main>}
    </div>
    <footer className="site-footer"><span>Community Task Force MKE</span><span>Milwaukee, Wisconsin</span></footer>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
