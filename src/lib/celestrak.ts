import { parseTles, type Tle } from './tle'

export type Query = { kind: 'group'; value: string } | { kind: 'name'; value: string } | { kind: 'catnr'; value: string }

/** Every CelesTrak GP group, by satellite type. `label` is the English UI string (translated in i18n.ts). */
export const CATEGORIES: { label: string; groups: { id: string; label: string }[] }[] = [
  { label: 'Special interest', groups: [
    { id: 'stations', label: 'Space stations' },
    { id: 'visual', label: '100 (or so) brightest' },
    { id: 'last-30-days', label: 'Launched in the last 30 days' },
    { id: 'analyst', label: 'Analyst objects' },
  ] },
  { label: 'Military', groups: [
    { id: 'military', label: 'Miscellaneous military' },
    { id: 'radar', label: 'Radar calibration' },
  ] },
  { label: 'Weather & Earth observation', groups: [
    { id: 'weather', label: 'Weather' },
    { id: 'resource', label: 'Earth resources' },
    { id: 'sar', label: 'Synthetic aperture radar' },
    { id: 'planet', label: 'Planet' },
    { id: 'spire', label: 'Spire' },
    { id: 'dmc', label: 'Disaster Monitoring' },
    { id: 'argos', label: 'ARGOS data collection' },
    { id: 'sarsat', label: 'Search & rescue (SARSAT)' },
  ] },
  { label: 'Communications', groups: [
    { id: 'geo', label: 'Active geosynchronous' },
    { id: 'starlink', label: 'Starlink' },
    { id: 'oneweb', label: 'OneWeb' },
    { id: 'kuiper', label: 'Kuiper' },
    { id: 'qianfan', label: 'Qianfan' },
    { id: 'hulianwang', label: 'Hulianwang' },
    { id: 'iridium-NEXT', label: 'Iridium NEXT' },
    { id: 'globalstar', label: 'Globalstar' },
    { id: 'orbcomm', label: 'Orbcomm' },
    { id: 'intelsat', label: 'Intelsat' },
    { id: 'ses', label: 'SES' },
    { id: 'eutelsat', label: 'Eutelsat' },
    { id: 'telesat', label: 'Telesat' },
    { id: 'tdrss', label: 'Tracking and Data Relay' },
    { id: 'x-comm', label: 'Experimental comm' },
    { id: 'other-comm', label: 'Other comm' },
    { id: 'satnogs', label: 'SatNOGS' },
  ] },
  { label: 'Amateur & education', groups: [
    { id: 'amateur', label: 'Amateur radio' },
    { id: 'cubesat', label: 'CubeSats' },
    { id: 'education', label: 'Education' },
  ] },
  { label: 'Navigation', groups: [
    { id: 'gnss', label: 'All GNSS' },
    { id: 'gps-ops', label: 'GPS operational' },
    { id: 'glo-ops', label: 'GLONASS operational' },
    { id: 'galileo', label: 'Galileo' },
    { id: 'beidou', label: 'BeiDou' },
    { id: 'sbas', label: 'SBAS' },
  ] },
  { label: 'Science', groups: [
    { id: 'science', label: 'Space & Earth science' },
    { id: 'geodetic', label: 'Geodetic' },
    { id: 'engineering', label: 'Engineering' },
  ] },
  { label: 'Debris', groups: [
    { id: 'fengyun-1c-debris', label: 'Fengyun 1C debris' },
    { id: 'iridium-33-debris', label: 'Iridium 33 debris' },
    { id: 'cosmos-2251-debris', label: 'Cosmos 2251 debris' },
  ] },
]

export const GROUPS = CATEGORIES.flatMap((c) => c.groups)
/** All active satellites (~17 000 objects, ~2.7 MB of TLEs). */
export const ALL_ACTIVE = 'active'

/** CelesTrak GP API (CORS-enabled): https://celestrak.org/NORAD/documentation/gp-data-formats.php */
export function queryUrl(q: Query): string {
  const key = q.kind === 'group' ? 'GROUP' : q.kind === 'name' ? 'NAME' : 'CATNR'
  return `https://celestrak.org/NORAD/elements/gp.php?${key}=${encodeURIComponent(q.value.trim())}&FORMAT=tle`
}

export const CACHE_TTL_MS = 2 * 3600 * 1000 // CelesTrak updates data about every 2 hours and asks clients not to poll faster.
const PREFIX = 'satellite-pass-predictor:tle:'

type Cached = { at: number; text: string }

/** setItem; on quota errors drop the other cached element sets and try again. */
function putEvicting(store: Pick<Storage, 'getItem' | 'setItem'> | undefined, key: string, value: string) {
  try {
    store?.setItem(key, value)
    return
  } catch {
    /* quota */
  }
  if (!store || !('removeItem' in store) || !('key' in store)) return
  const s = store as Storage
  const keys: string[] = []
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i)
    if (k && k.startsWith(PREFIX) && k !== key) keys.push(k)
  }
  for (const k of keys) s.removeItem(k)
  try {
    s.setItem(key, value)
  } catch {
    /* still too big */
  }
}

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
    // CelesTrak refuses (HTTP 403) a repeat download within 2 h, so the cache must hold even the big groups.
    putEvicting(store, key, JSON.stringify({ at: now, text } satisfies Cached))
    return { tles, fromCache: false, stale: false, at: now }
  } catch (e) {
    if (cached) {
      const tles = parseTles(cached.text)
      if (tles.length) return { tles, fromCache: true, stale: true, at: cached.at }
    }
    throw e
  }
}

/** SATCAT owner codes for the active catalog, from https://celestrak.org/satcat/records.php (CORS-enabled). */
export const OWNERS_URL = 'https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=csv'
export const OWNERS_TTL_MS = 7 * 86400e3 // Ownership almost never changes; new launches show up within a week.
const OWNERS_KEY = 'satellite-pass-predictor:owners'

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** NORAD id → owner code from SATCAT CSV. */
export function parseOwners(csv: string): Record<number, string> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  const head = splitCsv(lines[0] ?? '')
  const iId = head.indexOf('NORAD_CAT_ID')
  const iOwner = head.indexOf('OWNER')
  if (iId < 0 || iOwner < 0) throw new Error(csv.trim().slice(0, 120) || 'Unexpected SATCAT response')
  const out: Record<number, string> = {}
  for (const l of lines.slice(1)) {
    const f = splitCsv(l)
    const id = Number(f[iId])
    const owner = f[iOwner]?.trim()
    if (Number.isInteger(id) && id > 0 && owner) out[id] = owner
  }
  return out
}

export async function fetchOwners(opts: { now?: number; fetchFn?: typeof fetch; store?: Pick<Storage, 'getItem' | 'setItem'> } = {}): Promise<Record<number, string>> {
  const now = opts.now ?? Date.now()
  const store = opts.store ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  type CachedOwners = { at: number; owners: Record<number, string> }
  let cached: CachedOwners | null = null
  try {
    const raw = store?.getItem(OWNERS_KEY)
    if (raw) cached = JSON.parse(raw) as CachedOwners
  } catch {
    cached = null
  }
  if (cached && now - cached.at < OWNERS_TTL_MS) return cached.owners
  try {
    const res = await (opts.fetchFn ?? fetch)(OWNERS_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const owners = parseOwners(await res.text())
    try {
      store?.setItem(OWNERS_KEY, JSON.stringify({ at: now, owners }))
    } catch {
      /* quota */
    }
    return owners
  } catch (e) {
    if (cached) return cached.owners
    throw e
  }
}
