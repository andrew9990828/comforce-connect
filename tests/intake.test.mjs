// Intake validation and retry-key checks. Codex (GPT-6) authored these Node tests.
import assert from 'node:assert/strict'
import test from 'node:test'
import { validate, submissionKey } from '../src/intake/form.ts'

const draft = { services: ['food', 'transportation'], neighborhood: 'Unknown', description: 'A fictional ride and groceries.', method: 'text', contact: '(414) 555-0103' }

test('multi-need intake accepts a fictional phone number and unknown neighborhood', () => {
  assert.deepEqual(validate(draft), {})
})
test('invalid fields have individual errors', () => {
  const errors = validate({ ...draft, services: [], description: ' ', neighborhood: '', contact: 'abc5550103' })
  assert.deepEqual(Object.keys(errors), ['services', 'description', 'neighborhood', 'contact'])
})
test('only the selected contact method is validated', () => {
  assert.ok(validate({ ...draft, method: 'email' }).contact)
  assert.deepEqual(validate({ ...draft, method: 'email', contact: 'student@example.org' }), {})
})
test('HTTP LAN submissions have distinct version 4 UUIDs', () => {
  const keys = Array.from({ length: 50 }, submissionKey)
  for (const key of keys) assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(new Set(keys).size, keys.length)
})
