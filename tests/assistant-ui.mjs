// Browser regression checks for the assistant panel against the local app and database. Claude (Opus 5.5) wrote these for
// the PR #8 review. The /agent/team endpoint is stubbed, so no OpenAI key or credits are used; saves go to the real update_need.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const app = new URL(process.env.COMFORCE_APP_URL || 'http://127.0.0.1:5173').origin
const mailpit = process.env.COMFORCE_MAILPIT_URL || 'http://127.0.0.1:54324'
const staffEmail = 'von@comforce.example'
const executablePath = [
  process.env.CHROME_PATH, chromium.executablePath(),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(path => path && existsSync(path))
assert.ok(executablePath, 'Install Chrome or Edge, or set CHROME_PATH.')
const browser = await chromium.launch({ executablePath, headless: true })
const stamp = Date.now().toString(36)

// Stubbed assistant. Each test step queues replies; a held reply waits until the test releases it.
// Like the real server, it rejects a conversation that doesn't alternate user/assistant and end on a user turn.
function stubAssistant(context) {
  const queued = []
  const seen = []
  context.route('**/agent/team', async route => {
    const { messages } = route.request().postDataJSON()
    seen.push(messages)
    const alternating = messages.every((m, i) => m.role === (i % 2 ? 'assistant' : 'user')) && messages.at(-1)?.role === 'user'
    if (!alternating) return route.fulfill({ status: 400, json: { error: 'Keep the conversation to 30 messages of 2000 characters or fewer.' } })
    const next = queued.shift() ?? { body: { reply: 'Stub reply.', actions: [] } }
    if (next.hold) await next.hold
    if (next.abandon) return route.abort().catch(() => {})
    await route.fulfill({ json: next.body }).catch(() => { /* The page reloaded while this reply was held. */ })
  })
  return {
    seen,
    reply(body) { queued.push({ body }) },
    held(body) { let release; queued.push({ body, hold: new Promise(r => { release = r }) }); return () => release() },
    never() { let release; queued.push({ abandon: true, hold: new Promise(r => { release = r }) }); return () => release() },
  }
}

async function openTeam(page) {
  const queue = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/rpc/team_queue') && r.ok())
  await page.goto(app + '/team')
  return queue
}
const panel = page => page.getByRole('region', { name: 'Team assistant' })
async function openPanel(page) {
  // Wait for the launcher first: after a reload the panel may already be open, and clicking would close it.
  const launcher = page.locator('.assistant-team .assistant-launcher')
  await launcher.waitFor()
  if (await launcher.getAttribute('aria-expanded') !== 'true') await launcher.click()
  await panel(page).waitFor()
  return panel(page)
}
async function ask(page, text) {
  const chat = await openPanel(page)
  await chat.getByLabel('Message').fill(text)
  await chat.getByRole('button', { name: 'Send' }).click()
  return chat
}

let failures = 0
async function check(name, run) {
  const context = await browser.newContext({ timezoneId: 'America/Chicago' })
  context.setDefaultTimeout(12_000)
  try { await run(context); console.log('pass  ' + name) }
  catch (error) {
    failures++
    const shown = await context.pages()[0]?.locator('.assistant-panel').innerText({ timeout: 1000 }).catch(() => '(panel not open)')
    console.log('FAIL  ' + name + '\n  ' + (error?.message ?? error).split('\n').join('\n  ') + '\n  Panel:\n    ' + String(shown).split('\n').join('\n    '))
  }
  finally { await context.close() }
}

await check('Changing the site language translates chat controls and preserves the conversation', async context => {
  let sent
  await context.route('**/agent/community', async route => {
    sent = route.request().postDataJSON().messages[0].text
    assert.equal(route.request().headers()['x-comforce-language'], 'es')
    await route.fulfill({ json: { reply: 'Respuesta de prueba.', actions: [] } })
  })
  const page = await context.newPage()
  await page.goto(app + '/request')
  const picker = page.locator('.site-header select')
  await picker.selectOption('es')
  await page.getByRole('button', { name: '¿Necesita ayuda?' }).click()
  await page.getByRole('button', { name: '¿Qué ayuda puedo recibir?' }).click()
  await page.getByText('Respuesta de prueba.').waitFor()
  assert.equal(sent, '¿Qué ayuda puedo recibir?')
  await page.getByLabel('Mensaje', { exact: true }).fill('A draft I am still writing')
  await picker.selectOption('en')
  assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'A draft I am still writing')
  await page.getByText(sent, { exact: true }).waitFor()
  await page.getByText('Respuesta de prueba.').waitFor()
})

await check('A card saved while a reply is pending stays saved and writes one referral', async context => {
  const agent = stubAssistant(context)
  const page = await context.newPage()
  const queueResponse = await openTeam(page)
  const cases = await queueResponse.json()
  const target = cases.flatMap(c => c.needs.map(n => ({ c, n }))).find(({ n }) => n.status === 'open' && n.service !== 'family_support')
  assert.ok(target, 'The demo workspace needs an open, non-family need.')
  const partner = 'Marker Pantry ' + stamp
  agent.reply({ reply: 'Here is the referral for you to confirm.', actions: [{ type: 'proposal', needId: target.n.id, reference: target.c.reference,
    action: 'refer', label: 'Refer · ' + target.c.reference, summary: 'Refer to ' + partner + '.', value: partner }] })
  const chat = await ask(page, 'Refer ' + target.c.reference + ' to a pantry')
  await chat.getByRole('button', { name: 'Save update' }).waitFor()

  const release = agent.held({ reply: 'Nothing is overdue.', actions: [] })
  await ask(page, 'What is overdue?')
  const saved = page.waitForResponse(r => r.url().endsWith('/rpc/update_need'))
  await chat.getByRole('button', { name: 'Save update' }).click()
  assert.ok((await saved).ok(), 'update_need failed')
  await chat.getByText('Saved to the case.').waitFor()
  release()
  await chat.getByText('Nothing is overdue.').waitFor()
  assert.equal(await chat.getByRole('button', { name: 'Save update' }).count(), 0, 'Save update came back after the late reply.')
  await page.reload()
  await (await openPanel(page)).getByText('Saved to the case.').waitFor()
  assert.equal(await panel(page).getByRole('button', { name: 'Save update' }).count(), 0, 'Save update came back after reload.')

  // Count rows in PostgreSQL through the same RPC the queue uses.
  const request = queueResponse.request()
  const rows = await fetch(request.url(), { method: 'POST', headers: await request.allHeaders(), body: request.postData() }).then(r => r.json())
  const need = rows.flatMap(c => c.needs).find(n => n.id === target.n.id)
  assert.equal(need.referrals.filter(r => r.partner === partner).length, 1, 'Expected exactly one referral row.')
})

await check('Reloading mid-answer recovers the question and the next send works', async context => {
  const agent = stubAssistant(context)
  const page = await context.newPage()
  await openTeam(page)
  agent.reply({ reply: 'First answer.', actions: [] })
  await (await ask(page, 'First question')).getByText('First answer.').waitFor()
  const release = agent.never()
  await ask(page, 'Question lost to a reload')
  await panel(page).getByText('Thinking…').waitFor()
  await page.reload()
  release()
  const chat = await openPanel(page)
  assert.equal(await chat.getByLabel('Message').inputValue(), 'Question lost to a reload', 'The unanswered question returns to the input.')
  await chat.getByText('Your last message wasn’t answered. Send it again.').waitFor()
  agent.reply({ reply: 'Recovered answer.', actions: [] })
  await chat.getByRole('button', { name: 'Send' }).click()
  await chat.getByText('Recovered answer.').waitFor()
  agent.reply({ reply: 'Third answer.', actions: [] })
  await (await ask(page, 'Third question')).getByText('Third answer.').waitFor()
  assert.ok(agent.seen.every(messages => messages.every((m, i) => m.role === (i % 2 ? 'assistant' : 'user'))), 'A request did not alternate turns.')
})

await check('New chat while a reply is pending discards that reply', async context => {
  const agent = stubAssistant(context)
  const page = await context.newPage()
  await openTeam(page)
  agent.reply({ reply: 'Old answer.', actions: [] })
  await (await ask(page, 'Old question')).getByText('Old answer.').waitFor()
  const release = agent.held({ reply: 'Late reply from the cleared chat.', actions: [] })
  const chat = await ask(page, 'Pending question')
  await chat.getByRole('button', { name: 'New chat' }).click()
  const late = page.waitForResponse(r => r.url().endsWith('/agent/team'))
  release()
  await late
  await page.waitForTimeout(300)
  assert.equal(await chat.getByText('Late reply from the cleared chat.').count(), 0)
  assert.equal(await chat.getByText('Old question').count(), 0, 'The cleared conversation came back.')
  await chat.getByRole('group', { name: 'Suggested questions' }).waitFor()
})

await check('Another demo workspace in the same tab starts with an empty conversation', async context => {
  const agent = stubAssistant(context)
  const page = await context.newPage()
  await openTeam(page)
  agent.reply({ reply: 'Answer for workspace one.', actions: [] })
  await (await ask(page, 'Workspace one question')).getByText('Answer for workspace one.').waitFor()
  await page.evaluate(() => localStorage.removeItem('comforce.demo.owner.v1'))
  await openTeam(page)
  const chat = await openPanel(page)
  assert.equal(await chat.getByText('Workspace one question').count(), 0, 'The previous workspace transcript is visible.')
  await chat.getByRole('group', { name: 'Suggested questions' }).waitFor()
})

await check('Staff sign-out clears the team conversation, and the next session starts empty', async context => {
  const agent = stubAssistant(context)
  const page = await context.newPage()
  const before = Date.now()
  await page.goto(app + '/team?mode=staff')
  await page.getByLabel('Staff email').fill(staffEmail)
  await page.getByRole('button', { name: 'Send sign-in code' }).click()
  await page.getByLabel('Six-digit sign-in code').waitFor()
  let code
  for (let i = 0; i < 40 && !code; i++) {
    const list = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent('to:' + staffEmail)}&limit=1`).then(r => r.json())
    const latest = list.messages?.[0]
    if (latest && Date.parse(latest.Created) >= before - 5000) {
      const message = await fetch(`${mailpit}/api/v1/message/${latest.ID}`).then(r => r.json())
      code = /\b(\d{6})\b/.exec(message.Text)?.[1]
    }
    if (!code) await new Promise(r => setTimeout(r, 250))
  }
  assert.ok(code, 'No sign-in code arrived in Mailpit. Local auth may be rate limited; wait and retry.')
  await page.getByLabel('Six-digit sign-in code').fill(code)
  await page.getByRole('button', { name: 'Open workspace' }).click()
  await page.getByRole('button', { name: 'Sign out' }).waitFor()

  agent.reply({ reply: 'Staff answer.', actions: [] })
  await (await ask(page, 'Staff question')).getByText('Staff answer.').waitFor()
  const session = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key === 'comforce-local-session'))
  assert.ok(session.length, 'Could not find the Supabase session to restore.')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByLabel('Staff email').waitFor()
  const left = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('comforce.assistant.team.')))
  assert.deepEqual(left, [], 'Team conversations remain after sign-out.')

  // Start a new session in the same tab (restoring the token avoids a second emailed code) and check the panel is empty.
  await page.evaluate(entries => { for (const [key, value] of entries) localStorage.setItem(key, value) }, session)
  await page.reload()
  await page.getByRole('button', { name: 'Sign out' }).waitFor()
  const chat = await openPanel(page)
  assert.equal(await chat.getByText('Staff question').count(), 0, 'The previous session transcript is visible.')
  await chat.getByRole('group', { name: 'Suggested questions' }).waitFor()
})

await browser.close()
console.log(failures ? `${failures} assistant UI check(s) failed` : 'All assistant UI checks passed.')
process.exit(failures ? 1 : 0)
