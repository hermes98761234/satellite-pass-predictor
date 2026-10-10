import { describe, expect, it } from 'vitest'
import { fmtLat, fmtLon, maidenhead } from './geo'

describe('maidenhead', () => {
  it('matches the Wikipedia example for Munich', () => {
    expect(maidenhead(48.14666, 11.60833)).toBe('JN58td')
  })
  it('handles the hemispheres and edges', () => {
    expect(maidenhead(-90, -180)).toBe('AA00aa')
    expect(maidenhead(50.45, 30.52)).toBe('KO50gk')
    expect(maidenhead(90, 180)).toBe('RR99xx')
  })
  it('formats coordinates', () => {
    expect(fmtLat(-12.3456)).toBe('12.346°S')
    expect(fmtLon(30.5)).toBe('30.500°E')
  })
})
