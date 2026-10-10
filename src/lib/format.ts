import type { Lang, TimeZoneMode } from './model'

const loc = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'en-GB')

export function fmtTime(ms: number, tz: TimeZoneMode, lang: Lang, seconds = true): string {
  return new Intl.DateTimeFormat(loc(lang), { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false, timeZone: tz === 'utc' ? 'UTC' : undefined }).format(ms)
}

export function fmtDay(ms: number, tz: TimeZoneMode, lang: Lang): string {
  return new Intl.DateTimeFormat(loc(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz === 'utc' ? 'UTC' : undefined }).format(ms)
}

/** m:ss */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Compact countdown such as 5 min, 2 h 10 min, 1 d 3 h. Negative values are not expected. */
export function fmtCountdown(ms: number, h: string, m: string, d: string): string {
  const mins = Math.max(0, Math.round(ms / 60000))
  if (mins < 60) return `${mins} ${m}`
  if (mins < 1440) return `${Math.floor(mins / 60)} ${h} ${mins % 60} ${m}`
  return `${Math.floor(mins / 1440)} ${d} ${Math.floor((mins % 1440) / 60)} ${h}`
}

export function fmtAge(ms: number, h: string, d: string): string {
  const hours = ms / 3600000
  return hours < 48 ? `${Math.max(0, hours).toFixed(hours < 10 ? 1 : 0)} ${h}` : `${(hours / 24).toFixed(1)} ${d}`
}

/** Frequency in MHz with sensible digits, e.g. 145.800 or 1698.000. */
export function fmtMHz(hz: number): string {
  return (hz / 1e6).toFixed(4)
}

export function fmtKHz(hz: number): string {
  const k = hz / 1000
  return `${k >= 0 ? '+' : '−'}${Math.abs(k).toFixed(2)}`
}
