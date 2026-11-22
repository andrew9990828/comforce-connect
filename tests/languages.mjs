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
  await page.getByRole('link', { name: messages['Lend a hand'][0], exact: true }).click()
  await page.getByRole('heading', { name: messages['Help your neighbors this week'][0] }).waitFor()
  assert.equal(await page.title(), 'ComForce Connect · ' + messages['Lend a hand'][0])
  await visit('/request')
  await page.getByLabel(messages.Food[0], { exact: true }).check()
  await page.getByLabel(messages.Transportation[0], { exact: true }).check()
  const description = 'Requested a grocery delivery for the week.'
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
  const phone = page.viewportSize()
  const staffNav = page.locator('.staff-header nav')
  await staffNav.waitFor()
  assert.deepEqual(await staffNav.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href'))),
    ['/team', '/team/board', '/#my-workspace', '/request?source=call'])
  for (const width of [390, 1024, 1100]) {
    await page.setViewportSize({ width, height: phone.height })
    await page.evaluate(() => document.fonts.ready)
    const boxes = await staffNav.getByRole('link').evaluateAll(links => links.map(link => link.getBoundingClientRect().toJSON()))
    const centers = boxes.map(box => box.top + box.height / 2)
    assert.ok(boxes.every(box => box.height >= 44 && box.width >= 44), 'Team navigation touch targets at ' + width)
    if (width === 390) {
      assert.ok(Math.abs(centers[0] - centers[1]) < 1 && Math.abs(centers[2] - centers[3]) < 1)
      assert.ok(boxes[0].bottom <= boxes[2].top && boxes[0].right <= boxes[1].left)
    } else {
      assert.ok(Math.max(...centers) - Math.min(...centers) < 1, 'Team navigation wrapped at ' + width)
    }
    await fit()
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
  await staffNav.getByRole('link', { name: messages['Community board'][0] }).click()
  await page.getByRole('heading', { name: messages['Lend a Hand board'][0] }).waitFor()
  assert.equal(await page.title(), 'ComForce Connect · ' + messages['Community board'][0])
  await visit('/team?mode=staff')
  assert.equal(await staffNav.getByRole('link', { name: messages['Community board'][0] }).getAttribute('href'), '/team/board?mode=staff')
  await page.getByRole('heading', { name: messages['Staff sign-in'][0] }).waitFor()
  await page.getByRole('button', { name: messages['Send sign-in code'][0] }).click()
  assert.equal(await page.getByRole('alert').textContent(), messages['Complete the selected field.'][0])
  await visit('/safety')
  await language().selectOption('hmn')
  await page.getByRole('heading', { name: messages['Reported incidents over time'][1] }).waitFor()
  await page.locator('.crime-timeline button').last().click()
  const safetyMap = page.locator('.crime-map svg')
  const descriptionId = await safetyMap.getAttribute('aria-describedby')
  assert.ok(descriptionId, 'Monthly map needs an accessible description')
  const summary = await page.locator('#' + descriptionId).textContent()
  const counts = await safetyMap.locator('.crime-label text').allTextContents()
  assert.equal(counts.length, 6)
  assert.ok(counts.every(label => summary.includes(label)), 'Monthly description must include every visible neighborhood count')
  assert.ok(await safetyMap.evaluate(svg => {
    const frame = svg.getBoundingClientRect()
    return [...svg.querySelectorAll('.crime-label text')].every(text => {
      const box = text.getBoundingClientRect()
      return box.left >= frame.left && box.right <= frame.right
    })
  }), 'Monthly neighborhood counts are clipped on mobile')
  await fit()
  await visit('/')
  await page.getByRole('heading', { name: messages['Neighborhood atlas'][1] }).waitFor()
  await fit()
  await language().selectOption('en')
  await page.getByRole('heading', { name: 'Neighborhood atlas' }).waitFor()
  for (const route of ['/request', '/team']) {
    await visit(route)
    for (const code of ['en', 'es', 'hmn', 'de', 'pl']) {
      await language().selectOption(code)
      for (const width of [1100, 1280]) {
        await page.setViewportSize({ width, height: phone.height })
        const separated = await page.locator('.site-bar').evaluate(async header => {
          await document.fonts.ready
          const logo = header.querySelector('.brand').getBoundingClientRect()
          const picker = header.querySelector('.language-select').getBoundingClientRect()
          return logo.right <= picker.left + 1 || logo.bottom <= picker.top + 1
        })
        assert.ok(separated, 'Logo overlaps language picker on ' + route + ' in ' + code + ' at ' + width)
      }
    }
  }
  assert.deepEqual(errors, [])
  console.log('Passed language detection, five-language switching, intake validation, submission, queue, case details, staff sign-in, maps and persistence.')
} finally {
  await browser.close()
}
