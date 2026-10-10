import type { T } from '../i18n'

export type DopplerPoint = { t: number; hz: number }
type Props = { points: DopplerPoint[]; tca: number; fmtT: (ms: number) => string; t: T }

const W = 420
const H = 200
const L = 52
const B = 24

/** Doppler offset (kHz) from the nominal downlink over the pass. */
export default function DopplerChart({ points, tca, fmtT, t }: Props) {
  if (points.length < 2) return null
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const peak = Math.max(...points.map((p) => Math.abs(p.hz)), 1)
  const nice = niceCeil(peak / 1000)
  const x = (ms: number) => L + ((ms - t0) / (t1 - t0)) * (W - L - 8)
  const y = (hz: number) => 8 + ((nice * 1000 - hz) / (2 * nice * 1000)) * (H - B - 8)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.hz).toFixed(1)}`).join('')
  const ticks = [-nice, -nice / 2, 0, nice / 2, nice]
  return (
    <svg className="chart doppler" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Doppler shift over the pass')}>
      {ticks.map((k) => (
        <g key={k}>
          <line x1={L} x2={W - 8} y1={y(k * 1000)} y2={y(k * 1000)} className={k === 0 ? 'grid strong' : 'grid'} />
          <text x={L - 5} y={y(k * 1000) + 4} textAnchor="end" className="tick">{k > 0 ? '+' : ''}{+k.toFixed(2)}</text>
        </g>
      ))}
      <line x1={x(tca)} x2={x(tca)} y1={8} y2={H - B} className="grid strong" strokeDasharray="3 3" />
      <path d={d} className="dop-line" />
      <text x={L} y={H - 6} className="tick">{fmtT(t0)}</text>
      <text x={x(tca)} y={H - 6} textAnchor="middle" className="tick">{fmtT(tca)}</text>
      <text x={W - 8} y={H - 6} textAnchor="end" className="tick">{fmtT(t1)}</text>
      <text x={4} y={12} className="tick">kHz</text>
    </svg>
  )
}

function niceCeil(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / e
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e
}
