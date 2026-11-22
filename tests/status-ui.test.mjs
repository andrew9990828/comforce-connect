// Status lookup form in a real browser. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 wrote these regression tests.
// The Supabase API is stubbed in the browser, so this needs Chrome or Edge but no local database.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const executablePath = [
  process.env.CHROME_PATH, chromium.executablePath(),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(path => path && existsSync(path))
assert.ok(executablePath, 'Install Chrome or Edge, or set CHROME_PATH.')

const pairedToken = 'a'.repeat(64)
const request = (reference, service) => ({
  reference, submitted_at: '2026-11-20T15:00:00Z', contact_method: 'phone',
  needs: [{ service, stage: 'in_progress', provider: null, partner: null, updated_at: '2026-11-20T16:00:00Z' }],
})
let server, browser, origin

before(async () => {
  server = await createServer({ logLevel: 'silent', server: { port: 0, strictPort: false, host: '127.0.0.1' } })
  await server.listen()
  origin = server.resolvedUrls.local[0].replace(/\/$/, '')
  browser = await chromium.launch({ executablePath, headless: true })
})
after(async () => {
  await browser?.close()
  await server?.close()
})

// Opens /status as a paired resident and routes request_status calls to `answer`, which sees the parsed body.
async function statusPage(answer) {
  const context = await browser.newContext()
  await context.addInitScript(token => localStorage.setItem('comforce.demo.resident.v1', token), pairedToken)
  await context.route(url => !url.href.startsWith(origin), route => route.abort())
  await context.route('**/rest/v1/rpc/request_status', route => answer(route, route.request().postDataJSON()))
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  await page.goto(origin + '/status')
  return page
}
const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test('a failed lookup for a new reference does not leave the previous request on screen', async () => {
  let calls = 0
  const page = await statusPage((route, body) => {
    calls++
    if (body.p_reference === 'CF-1011') return route.fulfill(json(request('CF-1011', 'food')))
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Service unavailable"}' })
  })
  await page.getByLabel('Reference number').fill('CF-1011')
  await page.getByLabel(/Last 4 digits/).fill('0100')
  await page.getByRole('button', { name: 'Check status' }).click()
  const result = page.locator('.status-result')
  await result.getByText('CF-1011').waitFor()
  assert.equal(await result.getByRole('heading', { name: 'Food' }).count(), 1)

  await page.getByLabel('Reference number').fill('CF-1012')
  assert.equal(await result.count(), 0, 'Editing the reference should clear the earlier result.')
  await page.getByRole('button', { name: 'Check status' }).click()
  await page.getByRole('alert').getByText(/couldn’t check your request/).waitFor()
  assert.equal(calls, 2)
  assert.equal(await result.count(), 0)
  assert.equal(await page.getByText('CF-1011').count(), 0, 'The earlier request’s details must be gone.')
  assert.equal(await page.getByRole('heading', { name: 'Food' }).count(), 0)
  await page.context().close()
})

test('editing the contact check clears the shown result', async () => {
  const page = await statusPage(route => route.fulfill(json(request('CF-1011', 'food'))))
  await page.getByLabel('Reference number').fill('CF-1011')
  await page.getByLabel(/Last 4 digits/).fill('0100')
  await page.getByRole('button', { name: 'Check status' }).click()
  await page.locator('.status-result').waitFor()
  await page.getByLabel(/Last 4 digits/).fill('0101')
  assert.equal(await page.locator('.status-result').count(), 0)
  await page.context().close()
})

test('a lookup that finishes after the inputs change is ignored', async () => {
  let release
  const held = new Promise(resolve => { release = resolve })
  let arrived
  const reached = new Promise(resolve => { arrived = resolve })
  const page = await statusPage(async route => {
    arrived()
    await held
    await route.fulfill(json(request('CF-1011', 'food')))
  })
  await page.getByLabel('Reference number').fill('CF-1011')
  await page.getByLabel(/Last 4 digits/).fill('0100')
  await page.getByRole('button', { name: 'Check status' }).click()
  await reached
  await page.getByLabel('Reference number').fill('CF-1012')
  const settled = page.waitForResponse('**/rest/v1/rpc/request_status')
  release()
  await settled
  await page.evaluate(() => new Promise(requestAnimationFrame))
  assert.equal(await page.locator('.status-result').count(), 0, 'The stale CF-1011 response must not render.')
  assert.equal(await page.getByRole('alert').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Check status' }).isEnabled(), true)
  await page.context().close()
})

test('an expired pair can be repaired in place and a translated status keeps the partner name', async () => {
  const replacement = 'b'.repeat(64)
  const page = await statusPage((route, body) => {
    if (body.p_token !== replacement) return route.fulfill({ ...json({ code: '42501', message: 'Expired resident link' }), status: 403 })
    const result = request('CF-1013', 'food')
    result.needs[0].partner = 'Riverwest Pantry'
    return route.fulfill(json(result))
  })
  try {
    await page.locator('#reference').fill('CF-1013')
    await page.locator('#check').fill('0100')
    await page.getByRole('button', { name: 'Check status' }).click()
    await page.getByLabel('New resident link').fill(origin + '/request#join=' + replacement)
    await page.getByRole('button', { name: 'Pair again' }).click()
    await page.getByRole('button', { name: 'Check status' }).click()
    await page.locator('.status-result').waitFor()
    await page.locator('header select').selectOption('es')
    await page.getByRole('heading', { name: '¿Cuál es el estado de mi solicitud?' }).waitFor()
    assert.match(await page.locator('.status-message').innerText(), /en contacto con Riverwest Pantry/)
    assert.equal(await page.locator('#reference').inputValue(), 'CF-1013')
    assert.equal(await page.locator('#check').inputValue(), '0100')
  } finally { await page.context().close() }
})

test('a resident can retry an unconfirmed intake and reach status using the original reference', async () => {
  const page = await statusPage((route, body) => route.fulfill(json(request(body.p_reference, 'food'))))
  const submissions = []
  await page.route('**/rest/v1/rpc/submit_request', route => {
    submissions.push(route.request().postDataJSON())
    return route.fulfill(submissions.length === 1
      ? { ...json({ message: 'No response from database' }), status: 502 }
      : json('CF-1234'))
  })
  try {
    await page.goto(origin + '/request')
    await page.getByLabel('Food', { exact: true }).check()
    await page.getByLabel('Description', { exact: true }).fill('Fictional groceries')
    await page.getByLabel('Neighborhood', { exact: true }).selectOption('Riverwest')
    await page.getByLabel('Phone number', { exact: true }).fill('4145550100')
    await page.getByRole('button', { name: 'Submit request' }).click()
    await page.getByRole('alert').getByText(/may already have been saved/).waitFor()
    assert.equal(await page.getByLabel('Description', { exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: 'Submit request', exact: true }).click()
    await page.getByRole('link', { name: 'Check request status' }).click()
    assert.equal(await page.locator('#reference').inputValue(), 'CF-1234')
    await page.locator('#check').fill('0100')
    await page.getByRole('button', { name: 'Check status' }).click()
    await page.getByRole('heading', { name: 'Food' }).waitFor()
    assert.equal(submissions.length, 2)
    assert.deepEqual(submissions[0], submissions[1])
  } finally { await page.context().close() }
})

test('a fresh status lookup can pair in place without creating a demo workspace', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const calls = []
  await page.route('**/rest/v1/rpc/*', route => {
    const rpc = new URL(route.request().url()).pathname.split('/').pop()
    calls.push({ rpc, token: route.request().postDataJSON()?.p_token })
    return route.fulfill(json(request('CF-1013', 'food')))
  })
  try {
    await page.goto(origin + '/status?ref=CF-1013')
    await page.locator('#check').fill('0100')
    await page.getByRole('button', { name: 'Check status' }).click()
    await page.getByText(/Use the browser where you submitted/).waitFor()
    assert.deepEqual(calls, [])
    await page.getByLabel('New resident link').fill(origin + '/request#join=' + pairedToken)
    await page.getByRole('button', { name: 'Pair again' }).click()
    await page.getByRole('button', { name: 'Check status' }).click()
    await page.locator('.status-result').waitFor()
    await page.goto(origin + '/status?mode=staff&ref=CF-1013')
    await page.locator('#check').fill('0100')
    await page.getByRole('button', { name: 'Check status' }).click()
    await page.locator('.status-result').waitFor()
    assert.deepEqual(calls, [{ rpc: 'request_status', token: pairedToken }, { rpc: 'request_status', token: null }])
  } finally { await context.close() }
})
