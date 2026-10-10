import type { Sample } from '../lib/passes'
import { compass } from '../lib/passes'
import type { T } from '../i18n'

type Props = { track: Sample[]; maxEl: Sample | null; live: { az: number; el: number } | null; t: T }

const CX = 190
const CY = 190
const R = 150
const pt = (az: number, el: number): [number, number] => {
  const r = (R * (90 - Math.max(0, el))) / 90
  const a = (az * Math.PI) / 180
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)]
}

/** Polar sky plot: zenith at the centre, horizon at the rim, north up, east right. */
export default function SkyPlot({ track, maxEl, live, t }: Props) {
  const d = track.map((s, i) => `${i ? 'L' : 'M'}${pt(s.az, s.el).map((v) => v.toFixed(1)).join(' ')}`).join('')
  const first = track[0]
  const last = track[track.length - 1]
  const label = (s: Sample, text: string, cls: string) => {
    const [x, y] = pt(s.az, s.el)
    const dx = x > CX ? -9 : 9
    return (
      <g className={cls}>
        <circle cx={x} cy={y} r={5} />
        <text x={x + dx} y={y + 4} textAnchor={x > CX ? 'end' : 'start'}>{text} {compass(s.az)}</text>
      </g>
    )
  }
  return (
    <svg className="chart" viewBox="0 0 380 380" role="img" aria-label={t('Sky plot of the selected pass')}>
      <circle cx={CX} cy={CY} r={R} className="sky-bg" />
      {[0, 30, 60].map((el) => (
        <g key={el}>
          <circle cx={CX} cy={CY} r={(R * (90 - el)) / 90} className="grid" />
          {el > 0 && <text x={CX + 3} y={CY - (R * (90 - el)) / 90 + 11} className="tick">{el}°</text>}
        </g>
      ))}
      {[0, 45, 90, 135].map((az) => {
        const [x1, y1] = pt(az, 0)
        const [x2, y2] = pt(az + 180, 0)
        return <line key={az} x1={x1} y1={y1} x2={x2} y2={y2} className="grid" />
      })}
      {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, az]) => {
        const a = ((az as number) * Math.PI) / 180
        return <text key={l} x={CX + (R + 15) * Math.sin(a)} y={CY - (R + 15) * Math.cos(a) + 5} textAnchor="middle" className="cardinal">{l}</text>
      })}
      {d && <path d={d} className="sky-track" />}
      {first && label(first, t('AOS'), 'mark aos')}
      {last && last !== first && label(last, t('LOS'), 'mark los')}
      {maxEl && (
        <g className="mark peak">
          <circle cx={pt(maxEl.az, maxEl.el)[0]} cy={pt(maxEl.az, maxEl.el)[1]} r={4} />
          <text x={pt(maxEl.az, maxEl.el)[0] + 7} y={pt(maxEl.az, maxEl.el)[1] - 7}>{maxEl.el.toFixed(0)}°</text>
        </g>
      )}
      {live && live.el > 0 && (
        <g className="mark live">
          <circle cx={pt(live.az, live.el)[0]} cy={pt(live.az, live.el)[1]} r={7} />
        </g>
      )}
    </svg>
  )
}
