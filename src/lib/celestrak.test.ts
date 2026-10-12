import { describe, expect, it } from 'vitest'
import { fetchOwners, fetchTles, parseOwners, queryUrl, CACHE_TTL_MS, GROUPS, OWNERS_TTL_MS } from './celestrak'
import { OWNER_NAMES, ownerName } from './owners'
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
  it('lists every group once', () => {
    const ids = GROUPS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('military')
    expect(ids.length).toBeGreaterThan(40)
  })
  const SATCAT = 'OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,LAUNCH_DATE\n"ISS (ZARYA)",1998-067A,25544,PAY,+,ISS,1998-11-20\n"SICH-2, TEST",2011-044A,37810,PAY,-,UKR,2011-08-17\n'
  it('parses SATCAT owners, including quoted names with commas', () => {
    expect(parseOwners(SATCAT)).toEqual({ 25544: 'ISS', 37810: 'UKR' })
    expect(() => parseOwners('No SATCAT data found')).toThrow('No SATCAT data found')
  })
  it('caches owners for a week', async () => {
    const store = mem()
    const calls: string[] = []
    await fetchOwners({ store, now: 0, fetchFn: ok(SATCAT, calls) })
    await fetchOwners({ store, now: OWNERS_TTL_MS - 1, fetchFn: ok(SATCAT, calls) })
    expect(calls.length).toBe(1)
    const failing = (async () => { throw new Error('offline') }) as typeof fetch
    expect(await fetchOwners({ store, now: OWNERS_TTL_MS + 1, fetchFn: failing })).toEqual({ 25544: 'ISS', 37810: 'UKR' })
  })
  it('names owners', () => {
    expect(ownerName('UKR', 'en')).toBe('Ukraine')
    expect(ownerName('ESA', 'uk')).toBe('European Space Agency')
    expect(ownerName('XYZ', 'en')).toBe('XYZ')
    for (const [iso] of Object.values(OWNER_NAMES)) expect(iso === '' || /^[A-Z]{2}$/.test(iso)).toBe(true)
  })
  it('evicts other cached groups when storage is full', async () => {
    const m = new Map<string, string>()
    const store = {
      get length() { return m.size },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      removeItem: (k: string) => void m.delete(k),
      setItem: (k: string, v: string) => {
        const used = [...m.entries()].filter(([x]) => x !== k).reduce((n, [, x]) => n + x.length, 0)
        if (used + v.length > SAMPLE_TLE.length * 1.5) throw new Error('QuotaExceededError')
        m.set(k, v)
      },
    } as unknown as Storage
    await fetchTles({ kind: 'group', value: 'a' }, { store, now: 0, fetchFn: ok(SAMPLE_TLE, []) })
    await fetchTles({ kind: 'group', value: 'b' }, { store, now: 0, fetchFn: ok(SAMPLE_TLE, []) })
    expect([...m.keys()]).toEqual(['satellite-pass-predictor:tle:group:b'])
  })
})
