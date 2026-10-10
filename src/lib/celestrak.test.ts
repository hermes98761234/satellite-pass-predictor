import { describe, expect, it } from 'vitest'
import { fetchTles, queryUrl, CACHE_TTL_MS } from './celestrak'
import { SAMPLE_TLE } from './sample'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const ok = (text: string, calls: string[]) => (async (u: string | URL | Request) => (calls.push(String(u)), new Response(text))) as typeof fetch

describe('celestrak', () => {
  it('builds GP API URLs', () => {
    expect(queryUrl({ kind: 'group', value: 'stations' })).toBe('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle')
    expect(queryUrl({ kind: 'name', value: 'SO 50' })).toContain('NAME=SO%2050')
    expect(queryUrl({ kind: 'catnr', value: '25544' })).toContain('CATNR=25544')
  })
  it('caches for two hours, then refetches, and falls back to stale cache offline', async () => {
    const store = mem()
    const calls: string[] = []
    const q = { kind: 'group', value: 'stations' } as const
    const a = await fetchTles(q, { store, now: 1000, fetchFn: ok(SAMPLE_TLE, calls) })
    expect(a.fromCache).toBe(false)
    const b = await fetchTles(q, { store, now: 2000, fetchFn: ok(SAMPLE_TLE, calls) })
    expect(b.fromCache).toBe(true)
    expect(calls.length).toBe(1)
    const failing = (async () => { throw new Error('offline') }) as typeof fetch
    const c = await fetchTles(q, { store, now: 1000 + CACHE_TTL_MS + 1, fetchFn: failing })
    expect(c.stale).toBe(true)
    expect(c.tles.length).toBe(11)
  })
  it('rejects error pages', async () => {
    await expect(fetchTles({ kind: 'name', value: 'zzz' }, { store: mem(), fetchFn: ok('No GP data found', []) })).rejects.toThrow('No GP data found')
  })
})
