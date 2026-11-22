// OpenAI Codex (GPT-6) implemented this local multilingual resident-to-team walkthrough.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const app = new URL(process.env.COMFORCE_APP_URL || 'http://127.0.0.1:5173')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(app.hostname))
const messages = JSON.parse(readFileSync(new URL('../src/languages/messages.json', import.meta.url)))
const executablePath = [process.env.CHROME_PATH, chromium.executablePath(),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(path => path && existsSync(path))
const browser = await chromium.launch({ executablePath })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-MX', reducedMotion: 'reduce' })
  const page = await context.newPage()
  if (process.argv.includes('--fixture-staff-context')) {
    // Exercise the demo UI against older local seeds that predate staff roles.
    await page.route('**/rest/v1/rpc/staff_context', route => route.fulfill({
      json: { role: 'administrator', can_assign: true, staff: [] },
    }))
  }
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const visit = path => page.goto(new URL(path, app).href)
  const language = () => page.locator('header.site-header .language-select select')
  const fit = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow on ' + page.url())

  await visit('/')
  await page.getByRole('link', { name: messages['Request help'][0], exact: true }).first().waitFor()
  assert.equal(await page.getByRole('link', { name: messages['Check a request'][0], exact: true }).getAttribute('href'), '/status')
  assert.equal(await language().inputValue(), 'es')
  await fit()
  await visit('/request')
  await page.getByLabel(messages.Food[0], { exact: true }).check()
  await page.getByLabel(messages.Transportation[0], { exact: true }).check()
  const description = 'Fictional language walkthrough'
  await page.locator('#description').fill(description)
  await page.locator('button[type=submit]').click()
  await page.locator('#contact-error').waitFor()
  for (const [code, index] of [['de', 2], ['pl', 3]]) {
    await language().selectOption(code)
    assert.equal(await page.locator('#description').inputValue(), description)
    assert.equal(await page.getByLabel(messages.Food[index], { exact: true }).isChecked(), true)
    assert.equal(await page.locator('#contact-error').textContent(), messages['Enter a phone number, including the area code.'][index])
    await fit()
  }
  await language().selectOption('hmn')
  assert.equal(await page.locator('#description').inputValue(), description)
  assert.equal(await page.locator('input[name=services]:checked').count(), 2)
  assert.equal(await page.locator('#contact-error').textContent(), messages['Enter a phone number, including the area code.'][1])
  await page.locator('#contact').fill('4145550123')
  await page.locator('#neighborhood').selectOption('Riverwest')
  await page.locator('button[type=submit]').click()
  await page.getByRole('heading', { name: messages['Request received'][1] }).waitFor()
  await fit()
  const reference = await page.locator('.receipt-ref strong').innerText()
  assert.equal(await page.getByRole('link', { name: messages['Check request status'][1], exact: true }).getAttribute('href'), '/status?ref=' + encodeURIComponent(reference))
  await visit('/team')
  // Long Hmong labels previously pushed the staff action onto a separate line.
  const phone = page.viewportSize()
  await page.locator('.staff-header nav').waitFor()
  for (const width of [390, 1024, 1100]) {
    await page.setViewportSize({ width, height: phone.height })
    await page.evaluate(() => document.fonts.ready)
    const centers = await page.locator('.staff-header nav a').evaluateAll(links => links.map(link => {
      const box = link.getBoundingClientRect()
      return box.top + box.height / 2
    }))
    assert.equal(centers.length, 3)
    assert.ok(Math.max(...centers) - Math.min(...centers) < 1, 'Team navigation wrapped at ' + width)
  }
  await page.setViewportSize(phone)
  await page.getByRole('searchbox').fill(reference)
  await page.getByRole('button', { name: new RegExp(messages.Food[1] + '.*' + reference) }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: messages['Request details'][1] }).waitFor()
  await dialog.locator('.language-select select').selectOption('es')
  await dialog.getByRole('heading', { name: messages['Request details'][0] }).waitFor()
  assert.equal(await dialog.locator('.case-description').innerText(), description)
  await dialog.getByRole('button', { name: messages['Assign a worker'][0], exact: true }).click()
  await dialog.getByLabel(messages['Worker name'][0]).fill('Demo worker')
  for (const [code, index] of [['pl', 3], ['de', 2]]) {
    await dialog.locator('.language-select select').selectOption(code)
    assert.equal(await dialog.getByLabel(messages['Worker name'][index]).inputValue(), 'Demo worker')
    await dialog.getByRole('heading', { name: messages['Request details'][index] }).waitFor()
  }
  await dialog.locator('.language-select select').selectOption('hmn')
  assert.equal(await dialog.getByLabel(messages['Worker name'][1]).inputValue(), 'Demo worker')
  await dialog.getByRole('button', { name: messages['Save update'][1] }).click()
  await dialog.getByText(messages['Update saved.'][1], { exact: true }).waitFor()
  await dialog.locator('.language-select select').selectOption('es')
  await dialog.getByRole('button', { name: messages['Close case'][0] }).click()
  assert.equal(await page.getByRole('searchbox').inputValue(), reference)
  await fit()
  await page.reload()
  assert.equal(await language().inputValue(), 'es')
  await visit('/team?mode=staff')
  await page.getByRole('heading', { name: messages['Staff sign-in'][0] }).waitFor()
  await page.getByRole('button', { name: messages['Send sign-in code'][0] }).click()
  assert.equal(await page.getByRole('alert').textContent(), messages['Complete the selected field.'][0])
  await visit('/safety')
  await language().selectOption('hmn')
  await page.getByRole('heading', { name: messages['Reported incidents over time'][1] }).waitFor()
  await fit()
  await visit('/')
  await page.getByRole('heading', { name: messages['Neighborhood atlas'][1] }).waitFor()
  await fit()
  await language().selectOption('en')
  await page.getByRole('heading', { name: 'Neighborhood atlas' }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Passed language detection, five-language switching, intake validation, submission, queue, case details, staff sign-in, maps and persistence.')
} finally {
  await browser.close()
}
