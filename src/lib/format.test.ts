import { describe, expect, it } from 'vitest'
import { fmtAge, fmtCountdown, fmtDuration, fmtKHz, fmtMHz, fmtTime } from './format'

describe('format', () => {
  it('formats UTC time in 24 h', () => {
    expect(fmtTime(Date.UTC(2026, 9, 10, 7, 5, 9), 'utc', 'en')).toBe('07:05:09')
    expect(fmtTime(Date.UTC(2026, 9, 10, 19, 5, 9), 'utc', 'uk', false)).toBe('19:05')
  })
  it('formats durations and countdowns', () => {
    expect(fmtDuration(125000)).toBe('2:05')
    expect(fmtCountdown(5 * 60000, 'h', 'min', 'd')).toBe('5 min')
    expect(fmtCountdown(130 * 60000, 'h', 'min', 'd')).toBe('2 h 10 min')
    expect(fmtCountdown(27 * 3600000, 'h', 'min', 'd')).toBe('1 d 3 h')
  })
  it('formats ages and frequencies', () => {
    expect(fmtAge(3.5 * 3600000, 'h', 'd')).toBe('3.5 h')
    expect(fmtAge(72 * 3600000, 'h', 'd')).toBe('3.0 d')
    expect(fmtMHz(145.8e6)).toBe('145.8000')
    expect(fmtKHz(3404.4)).toBe('+3.40')
    expect(fmtKHz(-1500)).toBe('−1.50')
  })
})
