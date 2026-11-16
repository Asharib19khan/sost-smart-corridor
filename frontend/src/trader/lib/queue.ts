// Offline checkpoint queue (IndexedDB). Stores the signed FIELDS, not a stale envelope, so a flush
// re-fetches the head and re-signs keeping signed_at / lat_e6 / lng_e6 / nonce.
import { openDB } from 'idb'
import { ApiError } from '../../shared/api'
import { loadKey } from '../../shared/crypto/keys'
import { signAndPost } from './device'

export interface QueuedCheckpoint {
  id: string; userId: string; shipmentId: string; checkpoint: string
  lat_e6: number; lng_e6: number; signed_at: string; nonce: string; lastError?: string
}

const dbp = () => openDB('sost-queue', 1, { upgrade(db) { db.createObjectStore('checkpoints', { keyPath: 'id' }) } })
const changed = () => window.dispatchEvent(new Event('sost-queue'))

export async function enqueue(q: QueuedCheckpoint) { await (await dbp()).put('checkpoints', q); changed() }
export async function dropQueued(id: string) { await (await dbp()).delete('checkpoints', id); changed() }
export async function listQueued(shipmentId?: string): Promise<QueuedCheckpoint[]> {
  const all = (await (await dbp()).getAll('checkpoints')) as QueuedCheckpoint[]
  return shipmentId ? all.filter((q) => q.shipmentId === shipmentId) : all
}

export async function postCheckpoint(q: QueuedCheckpoint) {
  const key = await loadKey(q.userId)
  if (!key) throw new ApiError(400, 'This device has no signing key. Register this device again.')
  return signAndPost({
    key, shipmentId: q.shipmentId, type: 'checkpoint', payload: { checkpoint: q.checkpoint },
    path: `/shipments/${q.shipmentId}/events`,
    fields: { lat_e6: q.lat_e6, lng_e6: q.lng_e6, signed_at: q.signed_at, nonce: q.nonce },
  })
}

let flushing = false
/** Send every queued checkpoint. No signal → stays queued; a server refusal is kept with its message. */
export async function flushQueue(): Promise<{ sent: number; left: number }> {
  if (flushing) return { sent: 0, left: (await listQueued()).length }
  flushing = true
  let sent = 0
  try {
    const db = await dbp()
    for (const q of await listQueued()) {
      try {
        await postCheckpoint(q)
        await db.delete('checkpoints', q.id)
        sent++
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break
        await db.put('checkpoints', { ...q, lastError: (e as Error).message })
      }
    }
  } finally {
    flushing = false
    changed()
  }
  return { sent, left: (await listQueued()).length }
}
