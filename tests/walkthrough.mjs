// Two-session local browser walkthrough. Codex (GPT-6) implemented the live UI and endpoint checks.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'

function localUrl(value, base) {
  const url = new URL(value, base)
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a loopback address for the local walkthrough.')
  return url.href.replace(/\/$/, '')
}
const app = localUrl(process.env.COMFORCE_APP_URL || 'http://127.0.0.1:5173')
const mailpit = localUrl(process.env.COMFORCE_MAILPIT_URL || 'http://127.0.0.1:54324')
const api = localUrl(process.env.VITE_SUPABASE_URL || '/api', app)
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
assert.ok(publicKey, 'Set VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.')
if (!publicKey.startsWith('sb_publishable_')) {
  const claims = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString())
  assert.equal(claims.role, 'anon', 'The walkthrough requires a public browser key.')
}
const headers = { apikey: publicKey, 'Content-Type': 'application/json' }
if (!publicKey.startsWith('sb_publishable_')) headers.Authorization = `Bearer ${publicKey}`

async function rpc(name, body = {}, token) {
  return fetch(`${api}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
    body: JSON.stringify(body), redirect: 'error',
  })
}
async function rpcData(name, body = {}, token) {
  const response = await rpc(name, body, token)
  assert.ok(response.ok, `${name} returned HTTP ${response.status}.`)
  return response.status === 204 ? null : response.json()
}
async function inbox() {
  const response = await fetch(mailpit + '/api/v1/messages', { redirect: 'error' })
  assert.ok(response.ok, 'Open the local Mailpit inbox before running the walkthrough.')
  return (await response.json()).messages
}
async function staffSignIn(page) {
  const previous = new Set((await inbox()).map(message => message.ID))
  await page.getByRole('button', { name: 'Send sign-in code' }).click()
  await page.getByLabel('Six-digit sign-in code').waitFor()
  for (let i = 0; i < 30; i++) {
    const message = (await inbox()).find(item => !previous.has(item.ID) && item.To.some(recipient => recipient.Address === 'von@comforce.example'))
    if (message) {
      const response = await fetch(`${mailpit}/api/v1/message/${encodeURIComponent(message.ID)}`, { redirect: 'error' })
      assert.ok(response.ok, 'Could not read the latest local demo email.')
      const body = await response.json()
      const code = (body.Text || body.HTML).match(/\b\d{6}\b/)?.[0]
      assert.ok(code, 'The local sign-in email must include a six-digit code.')
      await page.getByLabel('Six-digit sign-in code').fill(code)
      await page.getByRole('button', { name: 'Open workspace' }).click()
      await page.getByRole('heading', { name: 'Needs queue' }).waitFor()
      return
    }
    await delay(300)
  }
  throw new Error('Local staff sign-in email did not arrive.')
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow on ${new URL(page.url()).pathname}.`)
}
function chicagoMonth(value) {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', timeZone: 'America/Chicago' }).formatToParts(new Date(value))
  return parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value
}
function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  return [
    chromium.executablePath(),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(existsSync)
}
async function changeNeed(dialog, action, fill) {
  await dialog.getByLabel('Action', { exact: true }).selectOption(action)
  if (fill) await fill()
  const committed = dialog.page().waitForResponse(response => response.url().endsWith('/rpc/update_need') && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Save update' }).click()
  const response = await committed
  assert.ok(response.ok(), `Updating a need (${action}) returned HTTP ${response.status()}.`)
  await dialog.getByRole('status').filter({ hasText: 'updated.' }).waitFor()
}

// Calculate the expected seed outcome independently from the staff case data.
function expectedTotals(cases, period, area) {
  let helped = 0, fulfilled = 0, food = 0, referrals = 0
  for (const entry of cases.filter(request => request.neighborhood === area)) {
    const delivered = entry.needs.filter(need => need.fulfilled_at && chicagoMonth(need.fulfilled_at) === period)
    if (delivered.length) helped++
    fulfilled += delivered.length
    food += delivered.filter(need => need.service === 'food').length
    referrals += entry.needs.flatMap(need => need.referrals).filter(ref => chicagoMonth(ref.sent_at) === period).length
  }
  return { helped, fulfilled, food, referrals }
}

async function impactTotals(month, neighborhood) {
  const rows = await rpcData('public_impact')
  const publicFields = ['month', 'neighborhood', 'requests_helped', 'needs_fulfilled', 'referrals_made', 'food_fulfilled'].sort()
  assert.ok(rows.length, 'Seed some local impact activity first.')
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), publicFields, 'Public impact must contain only aggregate fields.')
  const row = rows.find(item => item.month === month && item.neighborhood === neighborhood)
  return { helped: row?.requests_helped ?? 0, fulfilled: row?.needs_fulfilled ?? 0,
    food: row?.food_fulfilled ?? 0, referrals: row?.referrals_made ?? 0 }
}

async function verifyImpactPage(page, month, area, totals) {
  await page.getByRole('combobox', { name: 'Reporting month', exact: true }).selectOption(month)
  await page.getByRole('combobox', { name: 'Neighborhood', exact: true }).selectOption(area)
  await checkImpactValues(page, totals)
}

async function checkImpactValues(page, totals) {
  for (const [id, count] of Object.entries({
    requests_helped: totals.helped, needs_fulfilled: totals.fulfilled, referrals_made: totals.referrals, food_fulfilled: totals.food,
  })) {
    await page.getByTestId(id).filter({ hasText: new RegExp('^\\s*' + count + '\\s*$') }).waitFor()
  }
}

async function checkAnonymousBoundary(needId) {
  const staffRead = await rpc('team_queue')
  assert.ok([401, 403].includes(staffRead.status), 'Anonymous callers must be denied the staff queue.')
  const staffWrite = await rpc('update_need', { p_need: needId, p_action: 'assign', p_value: 'Von' })
  assert.ok([401, 403].includes(staffWrite.status), 'Anonymous callers must be denied staff mutations.')
  for (const relation of ['requests', 'needs', 'referrals', 'history', 'staff']) {
    const read = await fetch(`${api}/rest/v1/${relation}?select=*&limit=1`, { headers, redirect: 'error' })
    if (read.ok) assert.deepEqual(await read.json(), [], 'RLS must hide rows from public callers.')
    else assert.ok([401, 403, 404].includes(read.status), `Unexpected status reading ${relation}.`)
  }
}

const executablePath = browserPath()
assert.ok(executablePath, 'Install Chrome or Edge, or set CHROME_PATH to a Chromium executable.')
const browser = await chromium.launch({ executablePath, headless: true })
try {
  const mobile = { width: 390, height: 844 }
  const laptop = { width: 1366, height: 820 }
  const resident = await browser.newContext({ viewport: mobile, hasTouch: true, isMobile: true })
  const staff = await browser.newContext({ viewport: laptop })
  for (const context of [resident, staff]) {
    await context.route(/^https?:/, route => {
      const host = new URL(route.request().url()).hostname
      return ['localhost', '127.0.0.1', '[::1]'].includes(host) ? route.continue() : route.abort()
    })
    context.setDefaultTimeout(12_000)
  }
  const form = await resident.newPage()
  const desk = await staff.newPage()
  for (const page of [desk, form]) {
    for (const path of ['/', '/request', '/team']) {
      await page.goto(app + path)
      await page.reload()
      await page.getByRole('heading', { level: 1 }).waitFor()
      assert.equal(new URL(page.url()).pathname, path)
      await noOverflow(page)
    }
  }
  console.log('Phone emulation and laptop direct navigation/reload passed on all three routes.')
  const firstQueue = desk.waitForResponse(reply => reply.url().endsWith('/rpc/team_queue') && reply.request().method() === 'POST' && reply.ok())
  await staffSignIn(desk)
  const authHeader = await (await firstQueue).request().headerValue('authorization')
  assert.ok(authHeader?.startsWith('Bearer '), 'Staff queue needs an authenticated session.')
  const token = authHeader.slice(7)
  const staffIntake = await staff.newPage()
  const newRequestPath = await desk.getByRole('link', { name: 'New request', exact: true }).getAttribute('href')
  await staffIntake.goto(app + newRequestPath)
  const source = staffIntake.getByLabel('How did the request come in?')
  assert.equal(await source.inputValue(), 'call')
  await staffIntake.goto(app + '/request?source=text')
  assert.equal(await source.inputValue(), 'text')
  await staffIntake.close()

  const run = randomUUID()
  const description = 'Fictional groceries and ride ' + run
  await desk.getByLabel('Search', { exact: true }).fill(description)
  await desk.getByRole('heading', { name: 'No matching needs' }).waitFor()
  await form.goto(app + '/request')
  await form.getByRole('button', { name: 'Submit request' }).click()
  await form.getByText('Choose at least one service.', { exact: true }).waitFor()
  await form.getByRole('checkbox', { name: 'Food', exact: true }).check()
  await form.getByRole('checkbox', { name: 'Transportation', exact: true }).check()
  await form.getByLabel('Description', { exact: true }).fill(description)
  const area = 'Harambee'
  await form.getByLabel('Neighborhood', { exact: true }).selectOption(area)
  await form.getByLabel('Email', { exact: true }).check()
  await form.getByLabel('Email address', { exact: true }).fill('test@example.com')
  const submit = form.getByRole('button', { name: 'Submit request' })
  const submitEndpoint = '**/rest/v1/rpc/submit_request'

  // Force a failed delivery of the form before submitting the retained values to Postgres.
  await form.route(submitEndpoint, route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated unavailable connection' }),
  }))
  await submit.click()
  await form.getByRole('alert').filter({ hasText: /fail|save|submit|connection|try again|reach/i }).first().waitFor()
  assert.equal(await form.getByLabel('Description', { exact: true }).inputValue(), description)
  assert.equal(await form.getByLabel('Email address', { exact: true }).inputValue(), 'test@example.com')
  assert.ok(await form.getByRole('checkbox', { name: 'Food', exact: true }).isChecked())
  assert.ok(await form.getByRole('checkbox', { name: 'Transportation', exact: true }).isChecked())
  await form.unroute(submitEndpoint)
  const submitReply = form.waitForResponse(reply => reply.url().endsWith('/rpc/submit_request') && reply.ok())
  await submit.click()
  const submitted = await submitReply
  const start = performance.now()
  const saved = await submitted.json()
  const originalInput = submitted.request().postDataJSON()
  await desk.locator('.team-row').filter({ hasText: 'Transportation' }).waitFor({ timeout: 5000 })
  const lag = performance.now() - start
  assert.ok(lag <= 5000, `Queue update took ${Math.round(lag)} ms.`)
  assert.equal(await desk.locator('.team-row').count(), 2)
  assert.deepEqual(await rpcData('submit_request', originalInput), saved)
  const spoofedSource = await rpc('submit_request', { ...originalInput, p_source: 'call' })
  assert.ok([401, 403].includes(spoofedSource.status), 'Public intake must not log staff calls.')
  const cases = await rpcData('team_queue', {}, token)
  const matching = cases.filter(request => request.description === description)
  assert.equal(matching.length, 1)
  const request = matching[0]
  assert.equal(request.needs.length, 2)
  await form.getByText(request.reference, { exact: true }).waitFor()
  console.log(`Failed submission retained values; idempotent retry and live staff arrival passed (${Math.round(lag)} ms).`)

  const food = request.needs.find(need => need.service === 'food')
  const ride = request.needs.find(need => need.service === 'transportation')
  const month = chicagoMonth(Date.now())
  const baseline = await impactTotals(month, area)
  await form.goto(app + '/')
  await verifyImpactPage(form, month, area, baseline)
  await desk.locator('.team-row').filter({ hasText: 'Food' }).click()
  const dialog = desk.getByRole('dialog')
  await changeNeed(dialog, 'direct')
  const confirmed = { p_need: food.id, p_action: 'fulfill' }
  let competingStatus
  await desk.route('**/rest/v1/rpc/update_need', async route => {
    const [original, concurrent] = await Promise.all([route.fetch({ maxRedirects: 0 }), rpc('update_need', confirmed, token)])
    competingStatus = concurrent.status
    await route.fulfill({ response: original })
  }, { times: 1 })
  await changeNeed(dialog, 'fulfill')
  assert.ok(competingStatus >= 200 && competingStatus < 300, 'The competing fulfillment should return the existing result.')
  assert.ok((await rpc('update_need', confirmed, token)).ok, 'Retrying fulfillment after commit should succeed.')
  await dialog.getByRole('button', { name: /Transportation/ }).click()
  await changeNeed(dialog, 'refer', () => dialog.getByLabel('Partner name', { exact: true }).fill('Demo ride partner'))
  await changeNeed(dialog, 'assign', () => dialog.getByLabel('Worker name', { exact: false }).fill('Von'))
  const followUpDay = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  await changeNeed(dialog, 'follow_up', () => dialog.getByLabel(/Follow-up date and time/).fill(followUpDay + 'T11:00'))
  await dialog.getByRole('button', { name: /Food Fulfilled/ }).waitFor()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()

  const updated = (await rpcData('team_queue', {}, token)).find(item => item.id === request.id)
  const delivered = updated.needs.find(need => need.id === food.id)
  const pending = updated.needs.find(need => need.id === ride.id)
  assert.equal(delivered.status, 'fulfilled')
  assert.ok(delivered.provider && delivered.fulfilled_at)
  assert.equal(delivered.history.filter(event => event.action === 'fulfill').length, 1)
  assert.equal(pending.status, 'open')
  assert.equal(pending.owner, 'Von')
  assert.ok(pending.follow_up)
  assert.deepEqual(pending.referrals.map(ref => ref.partner), ['Demo ride partner'])
  const totals = await impactTotals(month, area)
  assert.deepEqual(totals, {
    helped: baseline.helped + 1, fulfilled: baseline.fulfilled + 1,
    food: baseline.food + 1, referrals: baseline.referrals + 1,
  })
  await checkImpactValues(form, totals)
  assert.equal(await form.getByRole('combobox', { name: 'Reporting month', exact: true }).inputValue(), month)
  assert.equal(await form.getByRole('combobox', { name: 'Neighborhood', exact: true }).inputValue(), area)
  const allCases = await rpcData('team_queue', {}, token)
  const crossMonth = allCases.find(entry => entry.needs.some(need => need.fulfilled_at && chicagoMonth(need.fulfilled_at) !== chicagoMonth(entry.created_at)))
  assert.ok(crossMonth, 'Seed at least one cross-month fulfillment.')
  const outcome = crossMonth.needs.find(need => need.fulfilled_at && chicagoMonth(need.fulfilled_at) !== chicagoMonth(crossMonth.created_at))
  for (const period of [chicagoMonth(crossMonth.created_at), chicagoMonth(outcome.fulfilled_at)]) {
    assert.deepEqual(await impactTotals(period, crossMonth.neighborhood), expectedTotals(allCases, period, crossMonth.neighborhood))
  }
  const midnight = allCases.flatMap(entry => entry.needs.map(need => ({ area: entry.neighborhood, at: need.fulfilled_at })))
    .find(event => event.at && new Date(event.at).toISOString().slice(0, 7) !== chicagoMonth(event.at))
  assert.ok(midnight, 'Seed a fulfillment across the UTC / Chicago month boundary.')
  for (const period of [chicagoMonth(midnight.at), new Date(midnight.at).toISOString().slice(0, 7)]) {
    assert.deepEqual(await impactTotals(period, midnight.area), expectedTotals(allCases, period, midnight.area))
  }
  await checkAnonymousBoundary(food.id)
  await Promise.all([form.goto(app + '/'), desk.reload()])
  await Promise.all([form.reload(), desk.getByRole('heading', { name: 'Needs queue' }).waitFor()])
  await desk.getByLabel('Search', { exact: true }).fill(description)
  await desk.locator('.team-row').filter({ hasText: 'Transportation' }).waitFor()
  assert.equal(await desk.locator('.team-row').count(), 1)
  await desk.setViewportSize(mobile)
  await noOverflow(desk)
  await desk.locator('.team-row').click()
  await dialog.getByRole('button', { name: /Food Fulfilled/ }).waitFor()
  await dialog.getByText('Von', { exact: true }).waitFor()
  await dialog.getByText(/Check with Demo ride partner/).waitFor()
  await noOverflow(desk)
  await verifyImpactPage(form, month, area, totals)
  console.log('Direct delivery, partner referral, assignment, follow-up, duplicate confirmation, cross-month attribution, public privacy, and reload persistence passed.')
} finally {
  await browser.close()
}
