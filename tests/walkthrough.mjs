// Local presentation walkthrough. OpenAI Codex (GPT-6) built two paired-device stories, isolation checks and responsive inspections.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const app = new URL(process.env.COMFORCE_APP_URL || 'http://127.0.0.1:5173').origin
const local = url => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
assert.ok(local(app), 'Run this test against a loopback app URL.')
const screenshots = process.env.COMFORCE_QA
if (screenshots) await mkdir(screenshots, { recursive: true })
const phone = { width: 390, height: 844 }, laptop = { width: 1440, height: 900 }
const executablePath = [
  process.env.CHROME_PATH, chromium.executablePath(),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(path => path && existsSync(path))
assert.ok(executablePath, 'Install Chrome or Edge, or set CHROME_PATH.')
const browser = await chromium.launch({ executablePath, headless: true })
let rpcUrl, publicHeaders

async function device(viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, reducedMotion: 'reduce', timezoneId: 'America/Chicago' })
  await context.route(/^https?:/, route => local(route.request().url()) ? route.continue() : route.abort())
  context.setDefaultTimeout(12_000)
  return context.newPage()
}
const reply = (page, name) => page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/rpc/' + name))
async function read(response, name) {
  assert.ok(response.ok(), name + ' failed with status ' + response.status())
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
async function rpc(name, body) {
  return fetch(rpcUrl + name, { method: 'POST', redirect: 'error', headers: publicHeaders, body: JSON.stringify(body) })
}
async function result(name, body) {
  const response = await rpc(name, body)
  assert.ok(response.ok, name + ' failed with status ' + response.status)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
async function deny(name, body) {
  assert.ok([401, 403].includes((await rpc(name, body)).status), name + ' must reject this credential.')
}
async function inspect(page, name) {
  const original = page.viewportSize()
  for (const size of [phone, laptop]) {
    await page.setViewportSize(size)
    await page.evaluate(() => document.fonts.ready)
    if (name === 'intake') await page.evaluate(() => scrollTo(0, 0))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' overflowed at ' + size.width)
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible()) {
      assert.ok(await dialog.evaluate(d => d.scrollWidth <= d.clientWidth + 1), 'Case sheet overflowed at ' + size.width)
    }
    if (screenshots) {
      await page.screenshot({ path: join(screenshots, name + '-' + size.width + '.png'), animations: 'disabled' })
    }
  }
  await page.setViewportSize(original)
}
const area = 'Riverwest'
const familyLabel = 'Someone is missing'
const metrics = ['requests_helped', 'needs_fulfilled', 'referrals_made', 'food_fulfilled', 'family_followups']
const fields = [...metrics, 'month', 'neighborhood'].sort()
const chicagoMonth = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', timeZone: 'America/Chicago',
})
function period(date) {
  const parts = chicagoMonth.formatToParts(new Date(date))
  return parts.find(part => part.type === 'year').value + '-' + parts.find(part => part.type === 'month').value
}
const current = period(Date.now())
async function totals(token, month = current, neighborhood = area) {
  const rows = await result('public_impact', { p_token: token })
  assert.ok(rows.length)
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), fields)
  const row = rows.find(r => r.month === month && r.neighborhood === neighborhood)
  return Object.fromEntries(metrics.map(key => [key, row?.[key] || 0]))
}
async function shown(page, numbers) {
  for (const [key, value] of Object.entries(numbers)) {
    await page.getByTestId(key).filter({ hasText: new RegExp('^' + value + '$') }).waitFor()
  }
}
async function scope(page, month, neighborhood) {
  await page.getByRole('combobox', { name: 'Reporting month', exact: true }).selectOption(month)
  await page.getByRole('combobox', { name: 'Neighborhood', exact: true }).selectOption(neighborhood)
}
// Residents answer one step at a time; staff intake shows every field, so there is no Next button to press.
async function details(page, text, family = false) {
  const next = page.getByRole('button', { name: 'Next →' })
  const step = async () => { if (await next.isVisible()) await next.click() }
  await step()
  await page.getByRole('textbox', { name: family ? 'What would help your family right now?' : 'What do you need help with?', exact: true }).fill(text)
  if (family) await page.getByLabel('When and how is it safe to reach you?').fill('Text before calling about this fictional case.')
  await step()
  await page.getByLabel('Which neighborhood are you in?', { exact: true }).selectOption(area)
  await step()
  await page.getByRole('radio', { name: 'Email me' }).check()
  assert.equal(await page.getByLabel('Your phone number', { exact: true }).count(), 0)
  await page.getByLabel('Your email', { exact: true }).fill('demo@example.invalid')
}
async function submit(web, desk, description, services) {
  await desk.getByRole('searchbox', { name: 'Search' }).fill(description)
  await desk.getByRole('heading', { name: 'No matching needs' }).waitFor()
  const committed = reply(web, 'submit_request')
  await web.getByRole('button', { name: 'Send my request' }).click()
  const saved = await committed
  const start = performance.now()
  const reference = await read(saved, 'Submit')
  await desk.locator('.team-row').filter({ hasText: reference }).first().waitFor({ timeout: 5000 })
  const lag = Math.round(performance.now() - start)
  assert.ok(lag <= 5000, 'Queue took ' + lag + ' ms to receive intake.')
  assert.equal(await desk.locator('.team-row').count(), services.length)
  await web.getByRole('heading', { name: 'We got your request!' }).waitFor()
  await web.getByText(reference, { exact: true }).waitFor()
  for (const service of services) await web.locator('.receipt-needs').getByText(service, { exact: true }).waitFor()
  assert.equal(await web.getByRole('navigation', { name: 'Team navigation' }).count(), 0)
  assert.equal(await result('submit_request', saved.request().postDataJSON()), reference)
  console.log('Committed multi-need intake and retry; queue arrival ' + lag + ' ms.')
  return reference
}
async function action(desk, label, fill, alreadyOpen = false) {
  const dialog = desk.getByRole('dialog')
  if (!alreadyOpen) {
    const option = dialog.getByRole('button', { name: label, exact: true })
    if (!(await option.isVisible())) await dialog.getByRole('button', { name: 'More actions', exact: true }).click()
    await option.click()
  }
  if (fill) await fill(dialog)
  const committed = reply(desk, 'update_need')
  await dialog.getByRole('button', { name: 'Save update', exact: true }).click()
  const response = await committed
  await read(response, label)
  await dialog.getByRole('status').filter({ hasText: /Update saved|Follow-up recorded/ }).waitFor()
  return response.request().postDataJSON()
}
function racingUpdate(page) {
  // Both requests use the same payload and the database serializes them on the need row.
  return page.route('**/rest/v1/rpc/update_need', async route => {
    const [original, copy] = await Promise.all([route.fetch(), rpc('update_need', route.request().postDataJSON())])
    assert.ok(copy.ok, 'Concurrent update failed with status ' + copy.status)
    await route.fulfill({ response: original })
  }, { times: 1 })
}
async function pairedDemo() {
  const desk = await device(laptop), web = await device(phone, true), stranger = await device(laptop)
  const firstQueue = reply(desk, 'team_queue')
  await desk.goto(app + '/team')
  const ready = await firstQueue
  await read(ready, 'Open team demo')
  rpcUrl = ready.url().slice(0, -'team_queue'.length)
  assert.ok(local(rpcUrl))
  const auth = await ready.request().allHeaders()
  publicHeaders = { apikey: auth.apikey, 'Content-Type': 'application/json' }
  if (auth.authorization) publicHeaders.Authorization = auth.authorization
  const staff = ready.request().postDataJSON().p_token
  assert.ok(staff, 'Team must open a scoped demo without email.')
  await desk.getByRole('button', { name: 'Pair a resident device' }).click()
  const link = await desk.getByLabel('Resident-only link').inputValue()
  assert.ok(local(link) && new URL(link).pathname === '/request')
  await web.goto(link)
  assert.ok(!web.url().includes('#'), 'Resident capability should be removed from the visible URL.')
  await desk.getByRole('button', { name: 'Pair a resident device' }).click()
  await inspect(desk, 'queue')
  await web.goto(app + '/')
  assert.equal(await web.getByRole('combobox', { name: 'Reporting month' }).count(), 0)
  await web.getByRole('link', { name: 'How we help' }).click()
  const aggregate = reply(web, 'public_impact')
  await web.reload()
  const data = await aggregate
  await read(data, 'Open paired atlas')
  const resident = data.request().postDataJSON().p_token
  assert.ok(resident && resident !== staff)
  const otherQueue = reply(stranger, 'team_queue')
  await stranger.goto(app + '/team')
  const otherResult = await otherQueue
  await read(otherResult, 'Open independent team')
  const other = otherResult.request().postDataJSON().p_token
  assert.ok(other && other !== staff)
  const baseline = await totals(resident)
  const otherBaseline = await totals(other)
  await scope(web, current, area)
  await shown(web, baseline)
  const published = () => Promise.all([web.locator('.impact-reach').innerText(), web.locator('.impact-history').innerText()])
  const evidence = await published()
  await web.getByRole('combobox', { name: 'Reporting month', exact: true }).selectOption('2026-10')
  await web.locator('.atlas-map-label text').filter({ hasText: /^Lincoln Park$/ }).tap()
  assert.equal(await web.getByRole('combobox', { name: 'Neighborhood', exact: true }).inputValue(), 'Lincoln Park')
  await shown(web, await totals(resident, '2026-10', 'Lincoln Park'))
  assert.deepEqual(await published(), evidence)
  await web.locator('body').press('Control+Home')
  await inspect(web, 'impact')
  assert.ok(await web.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
  await web.goto(app + '/request')
  await web.reload()
  await web.keyboard.press('Tab')
  assert.equal(await web.evaluate(() => document.activeElement?.textContent), 'Skip to content')
  await web.keyboard.press('Enter')
  await web.getByRole('button', { name: 'Next →' }).click()
  await web.getByText('Pick at least one thing you need.', { exact: true }).waitFor()
  await web.getByText('Food', { exact: true }).first().tap()
  await web.getByRole('checkbox', { name: 'A ride', exact: true }).check()
  const stamp = randomUUID().slice(0, 8)
  const groceries = 'Fictional groceries and ride ' + stamp
  await details(web, groceries)
  await web.route('**/rest/v1/rpc/submit_request', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Offline fixture"}' }), { times: 1 })
  await web.getByRole('button', { name: 'Send my request' }).click()
  await web.getByRole('alert').waitFor()
  assert.equal(await web.getByLabel('What do you need help with?', { exact: true }).inputValue(), groceries)
  assert.ok(await web.getByRole('checkbox', { name: 'Food', exact: true, includeHidden: true }).isChecked())
  const groceriesRef = await submit(web, desk, groceries, ['Food', 'A ride'])
  await web.getByRole('link', { name: 'See how we help' }).click()
  await scope(web, current, area)
  await desk.locator('[data-service="food"] .team-need-link').click()
  const dialog = desk.getByRole('dialog')
  await action(desk, 'Arrange direct help')
  await racingUpdate(desk)
  const confirm = await action(desk, 'Confirm delivery')
  await result('update_need', confirm)
  await dialog.getByRole('group', { name: 'Select a need' }).getByRole('button', { name: /Transportation/ }).click()
  await action(desk, 'Assign a worker', d => d.getByLabel('Worker name').fill('Von'))
  await action(desk, 'Send referral', d => d.getByLabel('Partner name').fill('Fictional Ride Partner'))
  const due = '2026-12-05T14:30'
  await action(desk, 'Schedule follow-up', d => d.getByLabel(/Follow-up due/).fill(due))
  await dialog.getByRole('button', { name: /Food.*Fulfilled/i }).waitFor()
  await desk.goBack()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await desk.getByRole('searchbox', { name: 'Search' }).inputValue(), groceries)
  const foodTotals = {
...baseline, needs_fulfilled: baseline.needs_fulfilled + 1, food_fulfilled: baseline.food_fulfilled + 1,
    requests_helped: baseline.requests_helped + 1, referrals_made: baseline.referrals_made + 1,
}
  assert.deepEqual(await totals(resident), foodTotals)
  await shown(web, foodTotals)
  console.log('Groceries delivered once, ride referred, public filter retained and live totals updated.')
  await web.getByRole('link', { name: 'Request family support', exact: true }).tap()
  assert.ok(await web.getByRole('checkbox', { name: familyLabel, exact: true, includeHidden: true }).isChecked())
  // The family link skips straight to step 2, so go back to add a second need.
  await web.getByRole('button', { name: '← Back' }).click()
  await web.getByRole('checkbox', { name: 'A ride', exact: true }).check()
  const familyNote = 'Fictional family callback and ride ' + stamp
  await details(web, familyNote, true)
  await inspect(web, 'intake')
  const familyRef = await submit(web, desk, familyNote, [familyLabel, 'A ride'])
  await inspect(web, 'confirmation')
  await web.getByRole('link', { name: 'See how we help' }).click()
  await scope(web, current, area)
  const familyRow = desk.locator('[data-service="family_support"]')
  await familyRow.getByRole('button', { name: 'Assign a worker', exact: true }).click()
  await action(desk, 'Assign a worker', d => d.getByLabel('Worker name').fill('Von'), true)
  await action(desk, 'Record partner contact', d => d.getByLabel('Partner name').fill('Fictional Family Liaison'))
  await action(desk, 'Schedule family check-in', d => d.getByLabel(/Follow-up due/).fill(due))
  await racingUpdate(desk)
  const checked = await action(desk, 'Record follow-up', async d => {
    await d.getByLabel('Follow-up outcome').fill('Family received the requested support contacts.')
    await d.getByLabel('Verified by').fill('Family member by phone')
  })
  await result('update_need', checked)
  await dialog.getByText('Family received the requested support contacts.', { exact: true }).first().waitFor()
  await inspect(desk, 'case')
  const familyTotals = { ...foodTotals, family_followups: foodTotals.family_followups + 1 }
  await shown(web, familyTotals)
  assert.deepEqual(await totals(resident), familyTotals)
  assert.deepEqual(await totals(other), otherBaseline)
  assert.deepEqual(await published(), evidence)
  await web.reload()
  await scope(web, current, area)
  await shown(web, familyTotals)
  await desk.reload()
  await dialog.getByRole('button', { name: /Transportation.*Open/i }).waitFor()
  await dialog.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  const cases = await result('team_queue', { p_token: staff })
  const familyCase = cases.find(c => c.reference === familyRef), foodCase = cases.find(c => c.reference === groceriesRef)
  const support = familyCase.needs.find(n => n.service === 'family_support')
  assert.equal(familyCase.family_support.safe_contact, 'Text before calling about this fictional case.')
  assert.equal(support.owner, 'Von')
  assert.equal(support.status, 'open')
  assert.equal(support.follow_up, null)
  assert.equal(support.partner_contact, 'Fictional Family Liaison')
  assert.equal(support.history.filter(e => e.action === 'check_in').length, 1)
  const outcome = support.history.find(e => e.action === 'check_in')
  assert.equal(outcome.source, 'Family member by phone')
  assert.equal(new Date(outcome.at).getTime(), new Date(checked.p_when).getTime())
  assert.equal(familyCase.needs.find(n => n.service === 'transportation').status, 'open')
  const transport = foodCase.needs.find(n => n.service === 'transportation')
  assert.ok(transport.status === 'open' && transport.owner === 'Von' && transport.follow_up)
  assert.equal(transport.referrals.length, 1)
  assert.equal(foodCase.needs.find(n => n.service === 'food').history.filter(e => e.action === 'fulfill').length, 1)
  await deny('team_queue', { p_token: resident })
  await deny('team_queue', { p_token: null })
  await deny('update_need', { p_token: resident, p_need: support.id, p_action: 'assign', p_value: 'Wrong worker' })
  await deny('update_need', { p_token: other, p_need: support.id, p_action: 'assign', p_value: 'Wrong worker' })
  assert.ok(!(await result('team_queue', { p_token: other })).some(c => c.reference === familyRef || c.reference === groceriesRef))
  for (const name of ['requests', 'needs', 'referrals', 'history', 'workspaces', 'need_operations']) {
    const url = new URL('../' + name + '?select=*&limit=1', rpcUrl)
    const response = await fetch(url, { headers: publicHeaders, redirect: 'error' })
    assert.ok([401, 403, 404].includes(response.status) || response.ok && (await response.json()).length === 0)
  }
  // Independent accounting catches attribution by intake date or UTC instead of Chicago outcome date.
  const boundary = cases.find(c => c.needs.some(n => n.fulfilled_at && period(c.created_at) !== period(n.fulfilled_at)
    && period(n.fulfilled_at) !== new Date(n.fulfilled_at).toISOString().slice(0, 7)))
  assert.ok(boundary, 'Missing the cross-month, Chicago-boundary demo fixture.')
  for (const month of ['2026-08', '2026-09', '2026-10']) {
    const delivered = cases.filter(c => c.neighborhood === boundary.neighborhood).flatMap(c => c.needs)
      .filter(n => n.fulfilled_at && period(n.fulfilled_at) === month)
    assert.equal((await totals(resident, month, boundary.neighborhood)).needs_fulfilled, delivered.length)
  }
  console.log('Family callback counted once with source/time, paired access and independent workspace isolation passed.')
  await desk.getByRole('link', { name: 'Log a request', exact: true }).click()
  assert.equal(await desk.getByLabel('How did the request come in?').inputValue(), 'call')
  await desk.getByLabel('How did the request come in?').selectOption('text')
  await desk.getByRole('checkbox', { name: 'Food', exact: true }).check()
  await details(desk, 'Fictional staff text ' + stamp)
  await desk.getByRole('button', { name: 'Save and open case' }).click()
  await dialog.getByText(/Text intake/).waitFor()
  assert.ok(new URL(desk.url()).searchParams.has('case'))
  await stranger.goto(app + '/team?case=' + encodeURIComponent(familyRef))
  await stranger.getByText(/This case is unavailable/).waitFor()
  assert.equal(await stranger.getByRole('dialog').count(), 0)
  console.log('Staff intake source/return, private deep links, reloads, keyboard, touch, reduced motion and 390/1440 layouts passed.')
}

try { await pairedDemo() }
catch (error) {
  // Playwright navigation errors can include the URL fragment. Keep every capability out of logs.
  console.error(String(error?.message || error).replace(/[a-f\d]{64}/gi, '[workspace credential]').replace(/eyJ[\w.-]+/g, '[token]'))
  process.exitCode = 1
} finally { await browser.close() }
