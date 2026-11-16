import { useCallback, useEffect, useState } from 'react'
import { api } from '../../shared/api'
import { getOrCreateKey, deleteKey, type DeviceKey } from '../../shared/crypto/keys'

/** Loads (or creates and registers) this browser's signing key for the user. */
export async function ensureDeviceKey(userId: string, label: string): Promise<DeviceKey> {
  const { key, created } = await getOrCreateKey(userId)
  if (created) {
    try {
      await api('/keys', { body: { public_key: key.publicKey, label } })
    } catch (e) {
      // Don't keep a key the server never learned about; the next attempt creates and registers a fresh one.
      await deleteKey(userId)
      throw e
    }
  }
  return key
}

export function useDeviceKey(userId: string | undefined, label: string) {
  const [key, setKey] = useState<DeviceKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!userId) return null
    try {
      const k = await ensureDeviceKey(userId, label)
      setKey(k)
      setError(null)
      return k
    } catch (e) {
      setError(`This browser's signing key could not be set up: ${(e as Error).message}`)
      return null
    }
  }, [userId, label])
  useEffect(() => {
    void load()
  }, [load])
  return { key, error, retry: load }
}
