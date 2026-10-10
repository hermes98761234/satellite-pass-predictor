import { describe, expect, it } from 'vitest'
import { circlePoints, compass, dopplerReceived, dopplerTransmit, findPasses, footprintAngle, lookAt, makeSatrec, rangeRate, skyTrack, splitAtAntimeridian, subPoint, EARTH_R_KM, C_KM_S } from './passes'
import { parseTles } from './tle'
import { SAMPLE_TLE } from './sample'

const iss = parseTles(SAMPLE_TLE).find((t) => t.norad === 25544)!
const rec = makeSatrec(iss)
const kyiv = { lat: 50.45, lon: 30.52, altM: 180, name: 'Kyiv' }

describe('geometry', () => {
  it('sees a satellite overhead at 90 degrees with range equal to its altitude', () => {
    const t = iss.epochMs + 3600e3
    const sp = subPoint(rec, t)!
    const s = lookAt(rec, { lat: sp.lat, lon: sp.lon, altM: 0, name: '' }, t)!
    expect(s.el).toBeGreaterThan(89.5)
    expect(s.rangeKm).toBeCloseTo(sp.altKm, 0)
  })
  it('keeps the ISS at LEO altitude within its inclination band', () => {
    for (let m = 0; m < 200; m += 7) {
      const sp = subPoint(rec, iss.epochMs + m * 60e3)!
      expect(sp.altKm).toBeGreaterThan(380)
      expect(sp.altKm).toBeLessThan(440)
      expect(Math.abs(sp.lat)).toBeLessThanOrEqual(51.9)
    }
  })
  it('horizon footprint of a 400 km orbit is about 2200 km in radius', () => {
    const ang = footprintAngle(400, 0)
    expect(ang).toBeCloseTo(Math.acos(EARTH_R_KM / (EARTH_R_KM + 400)), 12)
    expect(ang * EARTH_R_KM).toBeGreaterThan(2150)
    expect(ang * EARTH_R_KM).toBeLessThan(2250)
    expect(footprintAngle(400, 30)).toBeLessThan(ang)
  })
  it('circle points lie at the requested angular distance', () => {
    const ang = 0.3
    for (const p of circlePoints(50, 30, ang, 24)) {
      const r = (x: number) => (x * Math.PI) / 180
      const d = Math.acos(Math.sin(r(50)) * Math.sin(r(p.lat)) + Math.cos(r(50)) * Math.cos(r(p.lat)) * Math.cos(r(p.lon - 30)))
      expect(d).toBeCloseTo(ang, 9)
    }
  })
  it('splits tracks at the antimeridian', () => {
    const parts = splitAtAntimeridian([{ lon: 170 }, { lon: 179 }, { lon: -178 }, { lon: -170 }])
    expect(parts.map((p) => p.length)).toEqual([2, 2])
  })
  it('names compass points', () => {
    expect([0, 90, 180, 270, 359, 45].map(compass)).toEqual(['N', 'E', 'S', 'W', 'N', 'NE'])
  })
})

describe('Doppler', () => {
  it('shifts a 145.8 MHz downlink by +3.4 kHz at 7 km/s approach', () => {
    expect(dopplerReceived(145.8e6, -7) - 145.8e6).toBeCloseTo((145.8e6 * 7) / C_KM_S, 3)
    expect(dopplerReceived(145.8e6, -7) - 145.8e6).toBeCloseTo(3404.4, 0)
  })
  it('lowers the received frequency when receding and is inverted by the transmit correction', () => {
    expect(dopplerReceived(437e6, 5)).toBeLessThan(437e6)
    expect(dopplerReceived(dopplerTransmit(437e6, 5), 5)).toBeCloseTo(437e6, 3)
  })
})

describe('pass prediction', () => {
  const start = iss.epochMs + 3 * 3600e3
  const passes = findPasses(iss, rec, kyiv, start, start + 48 * 3600e3, 0)

  it('finds several ISS passes in 48 h, in order, with sane durations', () => {
    expect(passes.length).toBeGreaterThanOrEqual(4)
    expect(passes.length).toBeLessThan(25)
    passes.forEach((p, i) => {
      expect(p.aos).toBeLessThan(p.tca)
      expect(p.tca).toBeLessThan(p.los)
      expect(p.los - p.aos).toBeLessThan(16 * 60e3)
      expect(p.maxEl).toBeGreaterThan(0)
      if (i) expect(p.aos).toBeGreaterThan(passes[i - 1].los)
    })
  })
  it('puts AOS/LOS on the horizon and the peak at the maximum', () => {
    for (const p of passes.filter((x) => !x.inProgress)) {
      expect(Math.abs(lookAt(rec, kyiv, p.aos)!.el)).toBeLessThan(0.3)
      expect(Math.abs(lookAt(rec, kyiv, p.los)!.el)).toBeLessThan(0.3)
      expect(lookAt(rec, kyiv, p.tca - 20e3)!.el).toBeLessThanOrEqual(p.maxEl + 1e-6)
      expect(lookAt(rec, kyiv, p.tca + 20e3)!.el).toBeLessThanOrEqual(p.maxEl + 1e-6)
    }
  })
  it('filters by minimum elevation', () => {
    const hi = findPasses(iss, rec, kyiv, start, start + 48 * 3600e3, 30)
    expect(hi.length).toBeLessThan(passes.length)
    expect(hi.every((p) => p.maxEl >= 30)).toBe(true)
  })
  it('range rate goes from approaching to receding across the pass', () => {
    const p = passes.find((x) => x.maxEl > 20)!
    expect(rangeRate(rec, kyiv, p.aos + 5e3)!).toBeLessThan(-3)
    expect(Math.abs(rangeRate(rec, kyiv, p.tca)!)).toBeLessThan(2.5)
    expect(rangeRate(rec, kyiv, p.los - 5e3)!).toBeGreaterThan(3)
    expect(Math.abs(rangeRate(rec, kyiv, p.aos)!)).toBeLessThan(8)
  })
  it('sky track starts and ends near the horizon', () => {
    const p = passes[0]
    const tr = skyTrack(rec, kyiv, p, 10)
    expect(tr[0].el).toBeLessThan(1)
    expect(tr[tr.length - 1].el).toBeLessThan(1)
    expect(Math.max(...tr.map((s) => s.el))).toBeLessThanOrEqual(p.maxEl + 1e-6)
  })
  it('marks a pass already under way at the start of the window', () => {
    const p = passes[0]
    const mid = findPasses(iss, rec, kyiv, p.tca, p.tca + 3600e3, 0)
    expect(mid[0].inProgress).toBe(true)
    expect(mid[0].aos).toBe(p.tca)
  })
})
