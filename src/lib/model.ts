export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export type TimeZoneMode = 'local' | 'utc'

export type Observer = { lat: number; lon: number; altM: number; name: string }

export type Settings = {
  lang: Lang
  theme: Theme
  tz: TimeZoneMode
  hours: number
  minEl: number
}

export type AppState = {
  observer: Observer
  settings: Settings
  /** NORAD ids of the satellites included in the pass list. */
  selected: number[]
  /** Downlink / uplink in MHz by NORAD id, as typed by the user. */
  freqs: Record<number, { down?: number; up?: number }>
}

export const DEFAULT_STATE: AppState = {
  observer: { lat: 50.45, lon: 30.52, altM: 180, name: 'Kyiv' },
  settings: { lang: 'en', theme: 'auto', tz: 'local', hours: 48, minEl: 10 },
  selected: [25544, 57166, 59051, 27607, 44909],
  freqs: {},
}

const KEY = 'satellite-pass-predictor:v1'

function num(v: unknown, lo: number, hi: number, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d
}

/** Merges stored JSON over the defaults, dropping anything malformed. */
export function sanitizeState(raw: unknown): AppState {
  const d = DEFAULT_STATE
  if (typeof raw !== 'object' || raw === null) return d
  const r = raw as Record<string, any>
  const o = r.observer ?? {}
  const s = r.settings ?? {}
  const freqs: AppState['freqs'] = {}
  if (typeof r.freqs === 'object' && r.freqs !== null) {
    for (const [k, v] of Object.entries(r.freqs as Record<string, any>)) {
      const id = Number(k)
      if (!Number.isInteger(id) || typeof v !== 'object' || v === null) continue
      const down = num(v.down, 0.001, 100000, NaN)
      const up = num(v.up, 0.001, 100000, NaN)
      freqs[id] = { ...(Number.isNaN(down) ? {} : { down }), ...(Number.isNaN(up) ? {} : { up }) }
    }
  }
  return {
    observer: {
      lat: num(o.lat, -90, 90, d.observer.lat),
      lon: num(o.lon, -180, 180, d.observer.lon),
      altM: num(o.altM, -500, 9000, d.observer.altM),
      name: typeof o.name === 'string' ? o.name.slice(0, 60) : d.observer.name,
    },
    settings: {
      lang: s.lang === 'uk' ? 'uk' : s.lang === 'en' ? 'en' : defaultLang(),
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto',
      tz: s.tz === 'utc' ? 'utc' : 'local',
      hours: [12, 24, 48, 72, 168].includes(s.hours) ? s.hours : d.settings.hours,
      minEl: num(s.minEl, 0, 80, d.settings.minEl),
    },
    selected: Array.isArray(r.selected) ? r.selected.filter((x: unknown) => Number.isInteger(x)).slice(0, 400) : d.selected,
    freqs,
  }
}

function defaultLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en'
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return sanitizeState(JSON.parse(raw))
  } catch {
    /* fall through to defaults */
  }
  return sanitizeState({ settings: { lang: defaultLang() } })
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage may be full or blocked */
  }
}
