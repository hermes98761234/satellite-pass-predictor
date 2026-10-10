import { useEffect, useRef, useState } from 'react'
import type { Pass } from './lib/passes'
import type { Observer } from './lib/model'
import type { Tle } from './lib/tle'
import type { WorkerRequest, WorkerResponse } from './passes.worker'

export type PassState = { passes: Pass[]; busy: boolean; error: string | null; startMs: number }

/** Computes passes in a Web Worker; a newer request supersedes an older one. */
export function usePasses(tles: Tle[], observer: Observer, hours: number, minEl: number, nonce: number): PassState {
  const [state, setState] = useState<PassState>({ passes: [], busy: true, error: null, startMs: 0 })
  const worker = useRef<Worker | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    const w = new Worker(new URL('./passes.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== seq.current) return
      setState((s) => ('error' in e.data ? { ...s, busy: false, error: e.data.error } : { ...s, busy: false, error: null, passes: e.data.passes }))
    }
    w.onerror = (e) => setState((s) => ({ ...s, busy: false, error: e.message }))
    return () => w.terminate()
  }, [])
  useEffect(() => {
    const id = ++seq.current
    const startMs = Date.now()
    const req: WorkerRequest = { id, tles, observer, startMs, endMs: startMs + hours * 3600e3, minEl }
    // Debounced so typing coordinates does not start a search per keystroke.
    const h = setTimeout(() => {
      setState((s) => ({ ...s, busy: true, startMs }))
      worker.current?.postMessage(req)
    }, 250)
    return () => clearTimeout(h)
  }, [tles, observer, hours, minEl, nonce])
  return state
}
