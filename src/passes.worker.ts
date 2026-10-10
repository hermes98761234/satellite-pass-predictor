import { allPasses, type Pass } from './lib/passes'
import type { Observer } from './lib/model'
import type { Tle } from './lib/tle'

export type WorkerRequest = { id: number; tles: Tle[]; observer: Observer; startMs: number; endMs: number; minEl: number }
export type WorkerResponse = { id: number; passes: Pass[] } | { id: number; error: string }

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, tles, observer, startMs, endMs, minEl } = e.data
  try {
    self.postMessage({ id, passes: allPasses(tles, observer, startMs, endMs, minEl) } satisfies WorkerResponse)
  } catch (err) {
    self.postMessage({ id, error: String(err) } satisfies WorkerResponse)
  }
}
