// Lend a Hand offer and progress checks. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 authored these Node tests.
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateOffer, progress } from '../src/helpout/board.ts'

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
