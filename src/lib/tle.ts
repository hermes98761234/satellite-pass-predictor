export type Tle = { name: string; line1: string; line2: string; norad: number; epochMs: number }

/** Modulo-10 checksum of a TLE line (digits count as themselves, '-' as 1). */
export function tleChecksum(line: string): number {
  let sum = 0
  for (let i = 0; i < 68; i++) {
    const c = line[i]
    if (c >= '0' && c <= '9') sum += +c
    else if (c === '-') sum += 1
  }
  return sum % 10
}

export function validLine(line: string, n: 1 | 2): boolean {
  return line.length >= 69 && line[0] === String(n) && line[1] === ' ' && tleChecksum(line) === +line[68]
}

/** Epoch from TLE line 1: columns 19-20 two-digit year, 21-32 day of year with fraction. */
export function tleEpochMs(line1: string): number {
  const yy = +line1.slice(18, 20)
  const day = parseFloat(line1.slice(20, 32))
  const year = yy < 57 ? 2000 + yy : 1900 + yy
  return Date.UTC(year, 0, 1) + (day - 1) * 86400000
}

/** Parses 2-line and 3-line (name first) TLE text; invalid entries are skipped. */
export function parseTles(text: string): Tle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '')
  const out: Tle[] = []
  let name = ''
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('1 ') && i + 1 < lines.length && lines[i + 1].startsWith('2 ')) {
      const l2 = lines[i + 1]
      if (validLine(l, 1) && validLine(l2, 2)) {
        const norad = +l.slice(2, 7)
        out.push({ name: (name || `NORAD ${norad}`).replace(/^0 /, '').trim(), line1: l, line2: l2, norad, epochMs: tleEpochMs(l) })
      }
      name = ''
      i++
    } else {
      name = l.trim()
    }
  }
  return out
}
