import { describe, expect, it } from 'vitest'
import { parseTles, tleChecksum, tleEpochMs, validLine } from './tle'
import { SAMPLE_TLE } from './sample'

const L1 = '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927'
const L2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537'

describe('tle', () => {
  it('validates the well-known ISS example lines by checksum', () => {
    expect(tleChecksum(L1)).toBe(7)
    expect(tleChecksum(L2)).toBe(7)
    expect(validLine(L1, 1)).toBe(true)
    expect(validLine(L2, 2)).toBe(true)
    expect(validLine(L2.slice(0, 68) + '8', 2)).toBe(false)
  })
  it('reads the epoch', () => {
    // 2008 day 264.51782528 = 20 Sep 2008 12:25:40.1 UTC
    expect(tleEpochMs(L1)).toBeCloseTo(Date.UTC(2008, 8, 20, 12, 25, 40, 104), -2)
  })
  it('parses 3-line and 2-line text and skips junk', () => {
    const t = parseTles(`ISS (ZARYA)\r\n${L1}\r\n${L2}\r\ngarbage\r\n${L1}\r\n${L2}\r\n1 99999U bad\r\n2 99999 bad`)
    expect(t.map((x) => [x.name, x.norad])).toEqual([['ISS (ZARYA)', 25544], ['garbage', 25544]])
  })
  it('names unnamed element sets after the catalog number', () => {
    expect(parseTles(`${L1}\n${L2}`)[0].name).toBe('NORAD 25544')
  })
  it('parses the bundled sample', () => {
    const t = parseTles(SAMPLE_TLE)
    expect(t.length).toBe(11)
    expect(t.some((x) => x.norad === 25544)).toBe(true)
  })
})
