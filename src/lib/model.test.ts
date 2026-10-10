import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, sanitizeState } from './model'

describe('sanitizeState', () => {
  it('falls back to defaults on garbage', () => {
    expect(sanitizeState(null)).toEqual(DEFAULT_STATE)
    expect(sanitizeState({ observer: { lat: 999 }, settings: { hours: 5 } }).observer.lat).toBe(DEFAULT_STATE.observer.lat)
    expect(sanitizeState({ settings: { hours: 5 } }).settings.hours).toBe(DEFAULT_STATE.settings.hours)
  })
  it('keeps valid values and frequencies', () => {
    const s = sanitizeState({ observer: { lat: 10, lon: -20, altM: 5, name: 'X' }, freqs: { '25544': { down: 145.8, up: -1 } }, selected: [1, 'a', 2] })
    expect(s.observer).toEqual({ lat: 10, lon: -20, altM: 5, name: 'X' })
    expect(s.freqs[25544]).toEqual({ down: 145.8 })
    expect(s.selected).toEqual([1, 2])
  })
})
