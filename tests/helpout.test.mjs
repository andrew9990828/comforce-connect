// Lend a Hand offer and progress checks. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 authored these Node tests.
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateOffer, progress, offersLabel } from '../src/helpout/board.ts'
import { createFeed } from '../src/helpout/feed.ts'

const offer = { name: 'Dee', method: 'text', contact: '(414) 555-0142', quantity: '', note: '' }

test('skill and event offers need a name and contact only', () => {
  assert.deepEqual(validateOffer('skill', offer), {})
  assert.deepEqual(validateOffer('event', { ...offer, method: 'email', contact: 'dee@example.com' }), {})
  assert.deepEqual(Object.keys(validateOffer('event', { ...offer, name: ' ', contact: '123' })), ['name', 'contact'])
})
test('supply offers need a whole quantity from 1 to 500', () => {
  assert.ok(validateOffer('supply', offer).quantity)
  assert.ok(validateOffer('supply', { ...offer, quantity: '2.5' }).quantity)
  assert.ok(validateOffer('supply', { ...offer, quantity: '501' }).quantity)
  assert.deepEqual(validateOffer('supply', { ...offer, quantity: '6' }), {})
})
test('supply progress separates received from pledged', () => {
  const p = progress({ kind: 'supply', goal: 50, collected: 34, pledged: 6, signed_up: 2 })
  assert.deepEqual([p.have, p.incoming, p.left, p.percent, p.incomingPercent], [34, 6, 10, 68, 80])
})
test('event progress counts prior and new sign-ups and never goes negative', () => {
  assert.equal(progress({ kind: 'event', goal: 20, collected: 9, pledged: 0, signed_up: 3 }).left, 8)
  assert.equal(progress({ kind: 'event', goal: 5, collected: 5, pledged: 0, signed_up: 2 }).left, 0)
  assert.equal(progress({ kind: 'event', goal: 5, collected: 5, pledged: 0, signed_up: 2 }).percent, 100)
})

// Board feed: session changes, stale answers and cross-view refresh. AI assistance: Claude Opus 5.5.
function fakeHost() {
  const timers = new Map(); const handlers = new Set(); let next = 0
  return {
    hidden: () => false,
    listen(h) { handlers.add(h); return () => handlers.delete(h) },
    setTimeout(fn) { timers.set(++next, fn); return next },
    clearTimeout(id) { timers.delete(id) },
    focus() { handlers.forEach(h => h()) },
    // Fires the scheduled poll timers (not the 8-second abort timers, which tests never reach).
    poll() { const due = [...timers].filter(([, fn]) => fn.name === 'pull'); due.forEach(([id, fn]) => { timers.delete(id); fn() }) },
  }
}
const settle = () => new Promise(r => setImmediate(r))
const staffRows = { items: [], offers: [{ id: 'o1', name: 'Dee', contact: 'dee@example.com' }] }

test('a staff board open during sign-out drops contacts and ignores the old session’s late answer', async () => {
  const calls = []
  const feed = createFeed((session, signal) => new Promise((resolve, reject) => calls.push({ session, signal, resolve, reject })), { host: fakeHost() })
  feed.start()
  feed.setSession('staff-a')
  calls[0].resolve(staffRows); await settle()
  assert.equal(feed.get().data.offers[0].contact, 'dee@example.com')
  feed.refresh()
  assert.equal(calls.length, 2)
  feed.setSession(null)
  assert.equal(feed.get().data, null)
  assert.ok(calls[1].signal.aborted)
  calls[1].resolve(staffRows); await settle()
  assert.equal(feed.get().data, null, 'a response from the signed-out session must not reappear')
  assert.equal(calls.length, 2, 'nothing is fetched while signed out')
  feed.setSession('staff-b')
  assert.equal(calls[2].session, 'staff-b')
  calls[1].reject(new Error('late')); await settle()
  assert.equal(feed.get().error, null)
  feed.stop()
})

test('switching accounts clears the board before the new account loads', async () => {
  const calls = []
  const feed = createFeed(session => new Promise(resolve => calls.push({ session, resolve })), { host: fakeHost() })
  feed.setSession('staff-a'); calls[0].resolve(staffRows); await settle()
  feed.refresh()
  feed.setSession('staff-b')
  assert.equal(feed.get().data, null)
  calls[1].resolve(staffRows); await settle()
  assert.equal(feed.get().data, null)
  calls[2].resolve({ items: [], offers: [] }); await settle()
  assert.deepEqual(feed.get().data.offers, [])
})

test('access denial clears private rows; a dropped connection keeps the last view', async () => {
  const answers = [staffRows, Promise.reject(Object.assign(new Error('offline'), { code: '' })), staffRows,
    Promise.reject(Object.assign(new Error('denied'), { code: '42501' }))]
  answers.forEach(a => a.catch?.(() => {}))
  const feed = createFeed(async () => answers.shift(), { host: fakeHost() })
  feed.setSession('staff-a'); await settle()
  feed.refresh(); await settle()
  assert.equal(feed.get().data.offers.length, 1)
  assert.ok(feed.get().error)
  feed.refresh(); await settle()
  feed.refresh(); await settle()
  assert.equal(feed.get().data, null)
  assert.equal(feed.get().denied, true)
})

test('two open views see a change made in another view without reloading', async () => {
  const server = { pledged: 0, offers: [] }
  const residentHost = fakeHost(), otherHost = fakeHost(), staffHost = fakeHost()
  const resident = createFeed(async () => ({ pledged: server.pledged }), { host: residentHost })
  const other = createFeed(async () => ({ pledged: server.pledged }), { host: otherHost })
  const staff = createFeed(async () => ({ offers: [...server.offers] }), { host: staffHost })
  for (const f of [resident, other, staff]) { f.start(); f.setSession('s') }
  await settle()
  // The first view submits a six-coat offer and refreshes itself.
  server.pledged += 6; server.offers.push({ name: 'Dee', quantity: 6 })
  resident.refresh(); await settle()
  assert.equal(resident.get().data.pledged, 6)
  assert.equal(other.get().data.pledged, 0)
  otherHost.poll(); staffHost.poll(); await settle()
  assert.equal(other.get().data.pledged, 6)
  assert.equal(staff.get().data.offers.length, 1)
  // Returning focus also pulls immediately.
  server.pledged += 4
  otherHost.focus(); await settle()
  assert.equal(other.get().data.pledged, 10)
  for (const f of [resident, other, staff]) f.stop()
})

test('a refresh asked for mid-request runs again once that request settles', async () => {
  const calls = []
  const feed = createFeed(() => new Promise(resolve => calls.push(resolve)), { host: fakeHost() })
  feed.setSession('s')
  feed.refresh()
  assert.equal(calls.length, 1)
  calls[0]({ n: 1 }); await settle()
  assert.equal(calls.length, 2)
  calls[1]({ n: 2 }); await settle()
  assert.equal(feed.get().data.n, 2)
})

test('the monthly counter describes offers, not people', () => {
  assert.equal(offersLabel(1), 'offer of help made this month.')
  assert.equal(offersLabel(2), 'offers of help made this month.')
})
