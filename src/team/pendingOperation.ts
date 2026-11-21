// Pending case updates. OpenAI Codex (GPT-6) fixed retry tracking on HTTP and when storage is unavailable.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { submissionKey } from '../intake/form.ts'

const prefix = 'comforce.pending-operation.v1.'
const lifetime = 24 * 60 * 60 * 1000
type StoredOperation = { key: string; createdAt: number }
type OperationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

function stablePayload(params: Record<string, string | null>) {
  return JSON.stringify(Object.entries(params).sort(([left], [right]) => left.localeCompare(right)))
}

function prune(storage: OperationStorage, now: number) {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const name = storage.key(index)
    if (!name?.startsWith(prefix)) continue
    try {
      const saved = JSON.parse(storage.getItem(name) || '') as StoredOperation
      if (!saved.key || !saved.createdAt || now - saved.createdAt > lifetime) storage.removeItem(name)
    } catch {
      storage.removeItem(name)
    }
  }
}

const pendingInPage = new Map<string, StoredOperation>()

export function pendingOperation(
  params: Record<string, string | null>,
  storage?: OperationStorage,
  now = Date.now(),
) {
  const name = prefix + bytesToHex(sha256(new TextEncoder().encode(stablePayload(params))))
  for (const [id, operation] of pendingInPage) {
    if (now - operation.createdAt > lifetime) pendingInPage.delete(id)
  }
  let saved = pendingInPage.get(name)
  try {
    storage ??= sessionStorage
    prune(storage, now)
    const existing = storage.getItem(name)
    if (existing) saved = JSON.parse(existing) as StoredOperation
    saved ??= { key: submissionKey(), createdAt: now }
    storage.setItem(name, JSON.stringify(saved))
  } catch {
    // A browser can block storage access. Retain the key for retries in this page.
    saved ??= { key: submissionKey(), createdAt: now }
  }
  pendingInPage.set(name, saved)
  const { key } = saved
  return { key, confirm() {
    if (pendingInPage.get(name)?.key === key) pendingInPage.delete(name)
    try {
      const existing = storage?.getItem(name)
      if (existing && JSON.parse(existing).key === key) storage?.removeItem(name)
    } catch {
      // The server already confirmed the write even if browser storage became unavailable.
    }
  } }
}
