/** Typical downlink / uplink frequencies (MHz) by NORAD id, as defaults for the Doppler panel. Always verify current operating status. */
export const FREQS: Record<number, { name: string; down?: number; up?: number }> = {
  25544: { name: 'ISS FM voice / APRS', down: 145.8, up: 145.2 },
  27607: { name: 'SO-50 FM', down: 436.795, up: 145.85 },
  44909: { name: 'RS-44 linear', down: 435.64, up: 145.965 },
  24278: { name: 'FO-29 linear', down: 435.85, up: 145.9 },
  7530: { name: 'AO-7 mode B', down: 145.95, up: 432.125 },
  39444: { name: 'AO-73 FUNcube', down: 145.935 },
  57166: { name: 'Meteor-M2 3 LRPT', down: 137.9 },
  59051: { name: 'Meteor-M2 4 LRPT', down: 137.9 },
  40069: { name: 'Meteor-M2 LRPT', down: 137.1 },
  25338: { name: 'NOAA 15 APT', down: 137.62 },
  28654: { name: 'NOAA 18 APT', down: 137.9125 },
  33591: { name: 'NOAA 19 APT', down: 137.1 },
}
