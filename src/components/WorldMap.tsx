import { LAND_PATH } from '../lib/land'
import { circlePoints, splitAtAntimeridian, type SubPoint } from '../lib/passes'
import type { Observer } from '../lib/model'
import type { T } from '../i18n'

type Props = {
  observer: Observer
  /** Track points before, during and after the pass; `from`/`to` mark the pass part. */
  track: SubPoint[]
  from: number
  to: number
  footprint: { lat: number; lon: number; ang: number } | null
  live: { lat: number; lon: number } | null
  onPick: (lat: number, lon: number) => void
  t: T
}

const X = (lon: number) => lon + 180
const Y = (lat: number) => 90 - lat

function path(parts: { lat: number; lon: number }[][]): string {
  return parts.map((p) => p.map((q, i) => `${i ? 'L' : 'M'}${X(q.lon).toFixed(2)} ${Y(q.lat).toFixed(2)}`).join('')).join('')
}

/** Equirectangular world map with the ground track, footprint and observer; click to move the observer. */
export default function WorldMap({ observer, track, from, to, footprint, live, onPick, t }: Props) {
  const whole = path(splitAtAntimeridian(track))
  const during = path(splitAtAntimeridian(track.filter((p) => p.t >= from && p.t <= to)))
  const ring = footprint ? path(splitAtAntimeridian(circlePoints(footprint.lat, footprint.lon, footprint.ang))) : ''
  return (
    <svg
      className="chart map"
      viewBox="0 0 360 180"
      role="img"
      aria-label={t('Ground track map. Click to set your location.')}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const lon = ((e.clientX - r.left) / r.width) * 360 - 180
        const lat = 90 - ((e.clientY - r.top) / r.height) * 180
        onPick(Math.round(lat * 100) / 100, Math.round(lon * 100) / 100)
      }}
    >
      <rect width="360" height="180" className="sea" />
      {[-60, -30, 0, 30, 60].map((l) => <line key={l} x1="0" x2="360" y1={Y(l)} y2={Y(l)} className="grid" />)}
      {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((l) => <line key={l} y1="0" y2="180" x1={X(l)} x2={X(l)} className="grid" />)}
      <path d={LAND_PATH} className="land" />
      {ring && <path d={ring} className="footprint" />}
      <path d={whole} className="track" />
      <path d={during} className="track pass" />
      {live && <circle cx={X(live.lon)} cy={Y(live.lat)} r="2.6" className="live-dot" />}
      <g className="obs">
        <circle cx={X(observer.lon)} cy={Y(observer.lat)} r="2.4" />
        <circle cx={X(observer.lon)} cy={Y(observer.lat)} r="5" className="halo" />
      </g>
    </svg>
  )
}
