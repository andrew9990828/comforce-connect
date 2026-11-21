import assert from 'node:assert/strict'
import test from 'node:test'
import { pendingOperation } from '../src/team/pendingOperation.ts'

class MemoryStorage {
  values = new Map()
  get length() { return this.values.size }
  key(index) { return [...this.values.keys()][index] ?? null }
  getItem(name) { return this.values.get(name) ?? null }
  setItem(name, value) { this.values.set(name, value) }
  removeItem(name) { this.values.delete(name) }
}

test('an unconfirmed update reuses its operation key after a reload', async () => {
  const storage = new MemoryStorage()
  const params = { p_need: 'need-1', p_action: 'refer', p_value: 'Fictional partner', p_token: 'workspace' }
  const beforeReload = await pendingOperation(params, storage, 1000)
  const afterReload = await pendingOperation({ ...params }, storage, 2000)
  assert.equal(afterReload.key, beforeReload.key)
  assert.equal(storage.length, 1)

  afterReload.confirm()
  const nextReferral = await pendingOperation(params, storage, 3000)
  assert.notEqual(nextReferral.key, beforeReload.key)
})

test('different update payloads never share a pending operation key', async () => {
  const storage = new MemoryStorage()
  const first = await pendingOperation({ p_need: 'need-1', p_action: 'refer', p_value: 'Partner A' }, storage, 1000)
  const second = await pendingOperation({ p_need: 'need-1', p_action: 'refer', p_value: 'Partner B' }, storage, 1000)
  assert.notEqual(first.key, second.key)
  assert.equal(storage.length, 2)
  assert.ok([...storage.values.values()].every(value => !value.includes('Partner')))
})

test('stale unconfirmed operations expire', async () => {
  const storage = new MemoryStorage()
  const params = { p_need: 'need-1', p_action: 'direct' }
  const stale = await pendingOperation(params, storage, 1000)
  const replacement = await pendingOperation(params, storage, 24 * 60 * 60 * 1000 + 1001)
  assert.notEqual(replacement.key, stale.key)
  assert.equal(storage.length, 1)
})
