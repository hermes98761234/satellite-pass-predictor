import { parseTles, type Tle } from './tle'

export type Query = { kind: 'group'; value: string } | { kind: 'name'; value: string } | { kind: 'catnr'; value: string }

export const GROUPS = ['stations', 'amateur', 'weather', 'cubesat', 'visual', 'geo'] as const

/** CelesTrak GP API (CORS-enabled): https://celestrak.org/NORAD/documentation/gp-data-formats.php */
export function queryUrl(q: Query): string {
  const key = q.kind === 'group' ? 'GROUP' : q.kind === 'name' ? 'NAME' : 'CATNR'
  return `https://celestrak.org/NORAD/elements/gp.php?${key}=${encodeURIComponent(q.value.trim())}&FORMAT=tle`
}

export const CACHE_TTL_MS = 2 * 3600 * 1000 // CelesTrak updates data about every 2 hours and asks clients not to poll faster.
const PREFIX = 'satellite-pass-predictor:tle:'

type Cached = { at: number; text: string }

export type FetchResult = { tles: Tle[]; fromCache: boolean; stale: boolean; at: number }

export async function fetchTles(q: Query, opts: { force?: boolean; now?: number; fetchFn?: typeof fetch; store?: Pick<Storage, 'getItem' | 'setItem'> } = {}): Promise<FetchResult> {
  const now = opts.now ?? Date.now()
  const store = opts.store ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  const key = PREFIX + q.kind + ':' + q.value.trim().toLowerCase()
  let cached: Cached | null = null
  try {
    const raw = store?.getItem(key)
    if (raw) cached = JSON.parse(raw) as Cached
  } catch {
    cached = null
  }
  if (cached && !opts.force && now - cached.at < CACHE_TTL_MS) {
    return { tles: parseTles(cached.text), fromCache: true, stale: false, at: cached.at }
  }
  try {
    const res = await (opts.fetchFn ?? fetch)(queryUrl(q))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const tles = parseTles(text)
    if (tles.length === 0) throw new Error(text.trim().slice(0, 120) || 'No satellites found')
    try {
      store?.setItem(key, JSON.stringify({ at: now, text } satisfies Cached))
    } catch {
      /* quota */
    }
    return { tles, fromCache: false, stale: false, at: now }
  } catch (e) {
    if (cached) {
      const tles = parseTles(cached.text)
      if (tles.length) return { tles, fromCache: true, stale: true, at: cached.at }
    }
    throw e
  }
}
