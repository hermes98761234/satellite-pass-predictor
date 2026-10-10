import { degreesLat, degreesLong, degreesToRadians, ecfToLookAngles, eciToEcf, eciToGeodetic, gstime, propagate, radiansToDegrees, twoline2satrec, type SatRec } from 'satellite.js'
import type { Observer } from './model'
import type { Tle } from './tle'

export const C_KM_S = 299792.458
export const EARTH_R_KM = 6378.137

export type Sample = { t: number; az: number; el: number; rangeKm: number }
export type SubPoint = { t: number; lat: number; lon: number; altKm: number }
export type Pass = {
  norad: number
  name: string
  aos: number
  aosAz: number
  tca: number
  maxEl: number
  maxElAz: number
  los: number
  losAz: number
  /** True when the satellite was already above the horizon at the start of the search. */
  inProgress: boolean
}

export function makeSatrec(t: Pick<Tle, 'line1' | 'line2'>): SatRec {
  return twoline2satrec(t.line1, t.line2)
}

const obsGeo = (o: Observer) => ({ latitude: degreesToRadians(o.lat), longitude: degreesToRadians(o.lon), height: o.altM / 1000 })

/** Look angles (degrees) from the observer to the satellite at time `ms`, or null if SGP4 fails. */
export function lookAt(rec: SatRec, o: Observer, ms: number): Sample | null {
  const d = new Date(ms)
  const pv = propagate(rec, d)
  if (!pv) return null
  const ecf = eciToEcf(pv.position, gstime(d))
  const la = ecfToLookAngles(obsGeo(o), ecf)
  return { t: ms, az: (radiansToDegrees(la.azimuth) + 360) % 360, el: radiansToDegrees(la.elevation), rangeKm: la.rangeSat }
}

/** Sub-satellite point at time `ms`. */
export function subPoint(rec: SatRec, ms: number): SubPoint | null {
  const d = new Date(ms)
  const pv = propagate(rec, d)
  if (!pv) return null
  const g = eciToGeodetic(pv.position, gstime(d))
  return { t: ms, lat: degreesLat(g.latitude), lon: degreesLong(g.longitude), altKm: g.height }
}

/** Range rate in km/s (positive = receding), by central difference over ±0.5 s. */
export function rangeRate(rec: SatRec, o: Observer, ms: number): number | null {
  const a = lookAt(rec, o, ms - 500)
  const b = lookAt(rec, o, ms + 500)
  return a && b ? b.rangeKm - a.rangeKm : null
}

/** Frequency received for a transmitted `freqHz` given range rate (km/s): f(1 - rr/c). */
export function dopplerReceived(freqHz: number, rrKmS: number): number {
  return freqHz * (1 - rrKmS / C_KM_S)
}

/** Frequency to transmit so that the satellite receives `freqHz`: f / (1 - rr/c). */
export function dopplerTransmit(freqHz: number, rrKmS: number): number {
  return freqHz / (1 - rrKmS / C_KM_S)
}

const elAt = (rec: SatRec, o: Observer, ms: number): number => lookAt(rec, o, ms)?.el ?? -90

/** Bisects the horizon crossing between `lo` (el sign `loUp`) and `hi` to ~0.5 s. */
function bisectHorizon(rec: SatRec, o: Observer, lo: number, hi: number, rising: boolean): number {
  while (hi - lo > 500) {
    const mid = (lo + hi) / 2
    const above = elAt(rec, o, mid) > 0
    if (above === rising) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/** Time of maximum elevation in [a, b] by golden-section search (elevation is unimodal within a pass). */
function maxElevation(rec: SatRec, o: Observer, a: number, b: number): number {
  const g = (Math.sqrt(5) - 1) / 2
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  let fc = elAt(rec, o, c)
  let fd = elAt(rec, o, d)
  while (b - a > 500) {
    if (fc > fd) {
      b = d
      d = c
      fd = fc
      c = b - g * (b - a)
      fc = elAt(rec, o, c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + g * (b - a)
      fd = elAt(rec, o, d)
    }
  }
  return (a + b) / 2
}

/**
 * Passes of one satellite between `startMs` and `endMs`. AOS/LOS are the geometric horizon crossings
 * (elevation 0); passes whose peak elevation is below `minEl` are dropped.
 */
export function findPasses(tle: Tle, rec: SatRec, o: Observer, startMs: number, endMs: number, minEl: number, stepMs = 30000): Pass[] {
  const out: Pass[] = []
  let prevT = startMs
  const first = lookAt(rec, o, startMs)
  let prevUp = !!first && first.el > 0
  let aos = prevUp ? startMs : NaN
  let inProgress = prevUp
  const finish = (los: number) => {
    const tca = maxElevation(rec, o, aos, los)
    const peak = lookAt(rec, o, tca)
    const a = lookAt(rec, o, aos)
    const l = lookAt(rec, o, los)
    if (peak && a && l && peak.el >= minEl) {
      out.push({ norad: tle.norad, name: tle.name, aos, aosAz: a.az, tca, maxEl: peak.el, maxElAz: peak.az, los, losAz: l.az, inProgress })
    }
  }
  for (let t = startMs + stepMs; t <= endMs + stepMs; t += stepMs) {
    const tt = Math.min(t, endMs)
    const up = elAt(rec, o, tt) > 0
    if (up && !prevUp) {
      aos = bisectHorizon(rec, o, prevT, tt, true)
      inProgress = false
    } else if (!up && prevUp) {
      finish(bisectHorizon(rec, o, prevT, tt, false))
    }
    prevUp = up
    prevT = tt
    if (tt >= endMs) break
  }
  // Pass still in progress at the end of the window: report it up to the window end.
  if (prevUp && !Number.isNaN(aos)) finish(endMs)
  return out
}

/** Sky track (az/el) for a pass, every `stepS` seconds including both end points. */
export function skyTrack(rec: SatRec, o: Observer, p: Pick<Pass, 'aos' | 'los'>, stepS = 10): Sample[] {
  const out: Sample[] = []
  for (let t = p.aos; t < p.los; t += stepS * 1000) {
    const s = lookAt(rec, o, t)
    if (s) out.push(s)
  }
  const e = lookAt(rec, o, p.los)
  if (e) out.push(e)
  return out
}

/** Sub-satellite points every `stepS` seconds from `fromMs` to `toMs`. */
export function groundTrack(rec: SatRec, fromMs: number, toMs: number, stepS = 30): SubPoint[] {
  const out: SubPoint[] = []
  for (let t = fromMs; t <= toMs; t += stepS * 1000) {
    const s = subPoint(rec, t)
    if (s) out.push(s)
  }
  return out
}

/** Splits a track into polylines wherever it wraps across the antimeridian. */
export function splitAtAntimeridian<T extends { lon: number }>(pts: T[]): T[][] {
  const parts: T[][] = []
  let cur: T[] = []
  for (const p of pts) {
    if (cur.length && Math.abs(p.lon - cur[cur.length - 1].lon) > 180) {
      parts.push(cur)
      cur = []
    }
    cur.push(p)
  }
  if (cur.length) parts.push(cur)
  return parts
}

/** Earth central angle (radians) from the sub-satellite point to where the satellite is seen at `elDeg`. */
export function footprintAngle(altKm: number, elDeg = 0): number {
  const el = degreesToRadians(elDeg)
  return Math.acos((EARTH_R_KM / (EARTH_R_KM + altKm)) * Math.cos(el)) - el
}

/** Points (lat/lon degrees) of a small circle of angular radius `ang` around a centre. */
export function circlePoints(latDeg: number, lonDeg: number, ang: number, n = 72): { lat: number; lon: number }[] {
  const lat0 = degreesToRadians(latDeg)
  const lon0 = degreesToRadians(lonDeg)
  const pts: { lat: number; lon: number }[] = []
  for (let i = 0; i <= n; i++) {
    const brg = (2 * Math.PI * i) / n
    const lat = Math.asin(Math.sin(lat0) * Math.cos(ang) + Math.cos(lat0) * Math.sin(ang) * Math.cos(brg))
    const lon = lon0 + Math.atan2(Math.sin(brg) * Math.sin(ang) * Math.cos(lat0), Math.cos(ang) - Math.sin(lat0) * Math.sin(lat))
    pts.push({ lat: radiansToDegrees(lat), lon: ((radiansToDegrees(lon) + 540) % 360) - 180 })
  }
  return pts
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export function compass(azDeg: number): string {
  return COMPASS[Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16]
}

/** All passes for a list of satellites, sorted by AOS. */
export function allPasses(tles: Tle[], o: Observer, startMs: number, endMs: number, minEl: number): Pass[] {
  const out: Pass[] = []
  for (const t of tles) {
    try {
      out.push(...findPasses(t, makeSatrec(t), o, startMs, endMs, minEl))
    } catch {
      /* a malformed element set must not break the others */
    }
  }
  return out.sort((a, b) => a.aos - b.aos)
}
