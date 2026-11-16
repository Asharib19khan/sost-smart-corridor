import { useCallback, useEffect, useRef, useState } from 'react'

export interface Async<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => Promise<void>
}

/** Runs `fn` on mount and whenever `key` changes. Keeps the last good data while reloading. */
export function useAsync<T>(fn: () => Promise<T>, key: string): Async<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const gen = useRef(0)
  const reload = useCallback(async () => {
    const g = ++gen.current
    setLoading(true)
    try {
      const d = await fnRef.current()
      if (g === gen.current) {
        setData(d)
        setError(null)
      }
    } catch (e) {
      if (g === gen.current) setError((e as Error).message)
    } finally {
      if (g === gen.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    setData(undefined)
    void reload()
  }, [key, reload])
  return { data, error, loading, reload }
}
