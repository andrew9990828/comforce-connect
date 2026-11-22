// Request status lookup checks. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 authored these Node tests.
import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeReference, validateLookup, stageMessageKey } from '../src/status/lookup.ts'

test('references are accepted with or without the CF prefix', () => {
  assert.equal(normalizeReference('CF-1042'), 'CF-1042')
  assert.equal(normalizeReference(' cf 1042 '), 'CF-1042')
  assert.equal(normalizeReference('1042'), 'CF-1042')
  assert.equal(normalizeReference('CF-'), null)
  assert.equal(normalizeReference('hello'), null)
})
test('the contact check takes four phone digits or an email', () => {
  assert.deepEqual(validateLookup('CF-1042', '0100'), {})
  assert.deepEqual(validateLookup('CF-1042', '01-00'), {})
  assert.deepEqual(validateLookup('CF-1042', 'resident@example.com'), {})
  assert.ok(validateLookup('CF-1042', '555-0100').check)
  assert.ok(validateLookup('CF-1042', 'call 0100').check)
  assert.ok(validateLookup('CF-1042', 'person@').check)
  assert.ok(validateLookup('CF-1042', '').check)
  assert.ok(validateLookup('', '0100').reference)
})
test('delivered needs credit the partner and ComForce', () => {
  const base = { service: 'food', partner: null, updated_at: '2026-11-21T00:00:00Z' }
  assert.match(stageMessageKey({ ...base, stage: 'delivered', provider: 'Hunger Task Force' }), /\{provider\}, coordinated by ComForce/)
  assert.match(stageMessageKey({ ...base, stage: 'delivered', provider: 'ComForce' }), /^ComForce delivered/)
  assert.match(stageMessageKey({ ...base, stage: 'in_progress', provider: null, partner: 'Demo Pantry' }), /\{partner\}/)
})
