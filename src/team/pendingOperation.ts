import { submissionKey } from '../intake/form.ts'

const prefix = 'comforce.pending-operation.v1.'
const lifetime = 24 * 60 * 60 * 1000
type StoredOperation = { key: string; createdAt: number }
type OperationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

function stablePayload(params: Record<string, string | null>) {
  return JSON.stringify(Object.entries(params).sort(([left], [right]) => left.localeCompare(right)))
}

async function digest(payload: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
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

export async function pendingOperation(
  params: Record<string, string | null>,
  storage: OperationStorage = sessionStorage,
  now = Date.now(),
) {
  try {
    prune(storage, now)
    const name = prefix + await digest(stablePayload(params))
    const existing = storage.getItem(name)
    if (existing) {
      const saved = JSON.parse(existing) as StoredOperation
      if (saved.key && now - saved.createdAt <= lifetime) {
        return { key: saved.key, confirm: () => storage.removeItem(name) }
      }
    }
    const saved = { key: submissionKey(), createdAt: now }
    storage.setItem(name, JSON.stringify(saved))
    return { key: saved.key, confirm: () => storage.removeItem(name) }
  } catch {
    return { key: submissionKey(), confirm: () => undefined }
  }
}
