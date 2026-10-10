/** Maidenhead grid locator (6 characters, e.g. JN58td). */
export function maidenhead(lat: number, lon: number): string {
  const lo = Math.min(Math.max(lon + 180, 0), 359.999999)
  const la = Math.min(Math.max(lat + 90, 0), 179.999999)
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWX'
  const a = 'abcdefghijklmnopqrstuvwx'
  const f1 = Math.floor(lo / 20)
  const f2 = Math.floor(la / 10)
  const s1 = Math.floor((lo % 20) / 2)
  const s2 = Math.floor(la % 10)
  const u1 = Math.floor(((lo % 2) * 60) / 5)
  const u2 = Math.floor(((la % 1) * 60) / 2.5)
  return A[f1] + A[f2] + s1 + s2 + a[u1] + a[u2]
}

export function fmtLat(lat: number): string {
  return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}`
}
export function fmtLon(lon: number): string {
  return `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`
}
