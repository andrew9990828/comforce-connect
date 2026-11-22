// Paired community-board walkthrough. OpenAI Codex (GPT-6) verified offer retries and receipts.
import assert from 'node:assert/strict'

export async function boardWalkthrough(desk, resident, app, pairingLink) {
  await desk.goto(app + '/team/board')
  await desk.getByRole('heading', { name: 'Lend a Hand board' }).waitFor()
  await resident.goto(app + '/help-out#join=' + '0'.repeat(64))
  await resident.getByLabel('New resident link').fill(pairingLink)
  await resident.getByRole('button', { name: 'Pair again' }).click()

  const coats = resident.getByRole('listitem').filter({ has: resident.getByRole('heading', { name: 'Winter coats, all sizes' }) })
  await coats.getByRole('button', { name: 'I can bring some' }).waitFor()
  const before = /^(\d+) of (\d+) collected/.exec(await coats.locator('.help-count').innerText())
  assert.ok(before)
  async function offer() {
    await coats.getByRole('button', { name: 'I can bring some' }).click()
    await coats.getByLabel('First name').fill('Demo neighbor')
    await coats.getByLabel('Phone number').fill('(414) 555-0150')
    await coats.getByLabel('How many can you bring?').fill('4')
    await coats.getByRole('button', { name: 'Send my offer' }).click()
  }

  const keys = []
  resident.on('request', request => {
    if (request.url().endsWith('/rpc/offer_help')) keys.push(request.postDataJSON().p_key)
  })
  // Lose the first response after Postgres commits. Re-entering the same offer should find the original write.
  await resident.route('**/rpc/offer_help', async route => {
    assert.ok((await route.fetch()).ok())
    await route.abort('failed')
  }, { times: 1 })
  await offer()
  await coats.getByRole('alert').waitFor()
  await resident.reload()
  await offer()
  await coats.getByText(/Thanks, Demo neighbor/).waitFor()
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1])

  const row = desk.getByRole('row').filter({ hasText: 'Demo neighbor' })
  await row.getByLabel('Arrived').fill('3')
  assert.equal(await row.count(), 1)
  await row.getByRole('button', { name: 'Mark received' }).click()
  await row.getByText('3 received', { exact: true }).waitFor()
  await coats.getByText((Number(before[1]) + 3) + ' of ' + before[2] + ' collected', { exact: true }).waitFor()
  assert.equal(await coats.getByText(/on the way/).count(), 0)
  console.log('Paired board recovered an expired link, retried a lost offer once after reload and credited three delivered supplies.')
}
