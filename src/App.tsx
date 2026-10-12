import { useEffect, useMemo, useState } from 'react'
import { loadState, saveState, type AppState, type Lang, type Observer, type Settings, type Theme, type TimeZoneMode } from './lib/model'
import { tr, type T } from './i18n'
import { ALL_ACTIVE, CATEGORIES, fetchOwners, fetchTles, type Query } from './lib/celestrak'
import { ownerName } from './lib/owners'
import { parseTles, type Tle } from './lib/tle'
import { SAMPLE_TLE } from './lib/sample'
import { FREQS } from './lib/freqs'
import { compass, dopplerReceived, dopplerTransmit, footprintAngle, groundTrack, lookAt, makeSatrec, rangeRate, skyTrack, subPoint, type Pass } from './lib/passes'
import { fmtAge, fmtCountdown, fmtDay, fmtDuration, fmtKHz, fmtMHz, fmtTime } from './lib/format'
import { fmtLat, fmtLon, maidenhead } from './lib/geo'
import { usePasses } from './usePasses'
import NumberField from './components/NumberField'
import FreqField from './components/FreqField'
import SkyPlot from './components/SkyPlot'
import WorldMap from './components/WorldMap'
import DopplerChart from './components/DopplerChart'

const REPO = 'https://github.com/hermes98761234/satellite-pass-predictor'
const passKey = (p: Pass) => `${p.norad}:${Math.round(p.aos / 1000)}`

function mergeTles(base: Tle[], add: Tle[]): Tle[] {
  const m = new Map(base.map((t) => [t.norad, t]))
  for (const t of add) {
    const old = m.get(t.norad)
    if (!old || t.epochMs >= old.epochMs) m.set(t.norad, t)
  }
  return [...m.values()]
}

function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(h)
  }, [ms])
  return now
}

type Status = { kind: 'info' | 'err' | 'ok'; text: string } | null

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const { observer, settings, selected, freqs } = state
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const [catalog, setCatalog] = useState<Tle[]>(() => parseTles(SAMPLE_TLE))
  const [groups, setGroups] = useState<Record<string, number[]>>({})
  const [source, setSource] = useState<{ text: string; stale: boolean }>({ text: 'bundled sample', stale: true })
  const [status, setStatus] = useState<Status>(null)
  const [busyLoad, setBusyLoad] = useState(false)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [country, setCountry] = useState('')
  const [owners, setOwners] = useState<Record<number, string> | null>(null)
  const [lookup, setLookup] = useState('')
  const [paste, setPaste] = useState('')
  const [nonce, setNonce] = useState(0)
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const now = useNow()

  const update = (patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch }))
  const setSettings = (patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  const setObserver = (patch: Partial<Observer>) => setState((s) => ({ ...s, observer: { ...s.observer, ...patch } }))

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])

  const load = async (q: Query, opts: { force?: boolean; select?: boolean; quiet?: boolean } = {}) => {
    if (!opts.quiet) setBusyLoad(true)
    try {
      const r = await fetchTles(q, { force: opts.force })
      setCatalog((c) => mergeTles(c, r.tles))
      if (q.kind === 'group') setGroups((g) => ({ ...g, [q.value]: r.tles.map((x) => x.norad) }))
      if (opts.select) setState((s) => ({ ...s, selected: [...new Set(r.tles.map((x) => x.norad))].slice(0, 400) }))
      setSource({ text: new Date(r.at).toISOString(), stale: r.stale })
      if (!opts.quiet) setStatus({ kind: r.stale ? 'err' : 'ok', text: r.stale ? t('Offline: using cached elements from {0}.', new Date(r.at).toLocaleString()) : t('Loaded {0} satellites from CelesTrak.', r.tles.length) })
      return r.tles
    } catch (e) {
      if (!opts.quiet) setStatus({ kind: 'err', text: t('Could not load from CelesTrak: {0}', e instanceof Error ? e.message : String(e)) })
      return []
    } finally {
      if (!opts.quiet) setBusyLoad(false)
    }
  }

  // Refresh the common groups in the background (cached for 2 h by fetchTles).
  useEffect(() => {
    void (async () => {
      for (const g of ['stations', 'amateur', 'weather']) await load({ kind: 'group', value: g }, { quiet: true })
      // Owner codes for the country filter (cached for a week).
      try {
        setOwners(await fetchOwners())
      } catch {
        /* the country filter stays empty until the next visit */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selSet = useMemo(() => new Set(selected), [selected])
  const tles = useMemo(() => catalog.filter((c) => selSet.has(c.norad)), [catalog, selSet])
  const { passes: allPasses, busy, error, startMs } = usePasses(tles, observer, settings.hours, settings.minEl, nonce)
  const passes = useMemo(() => allPasses.filter((p) => p.los > now), [allPasses, now])
  const pass = passes.find((p) => passKey(p) === pickedKey) ?? passes[0]
  const tle = pass ? catalog.find((c) => c.norad === pass.norad) : undefined

  const toggle = (id: number) => update({ selected: selSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id] })

  const catIds = useMemo(() => new Set(catalog.map((c) => c.norad)), [catalog])
  const typeIds = typeFilter ? groups[typeFilter] : undefined
  const q = filter.trim().toLowerCase()
  const matches = useMemo(() => {
    const typeSet = typeFilter ? new Set(typeIds ?? []) : null
    return catalog
      .filter((c) => (!q || c.name.toLowerCase().includes(q) || String(c.norad) === q) && (!typeSet || typeSet.has(c.norad)) && (!country || owners?.[c.norad] === country))
      .sort((a, b) => Number(selSet.has(b.norad)) - Number(selSet.has(a.norad)) || a.name.localeCompare(b.name))
  }, [catalog, q, typeFilter, typeIds, country, owners, selSet])
  const shown = matches.slice(0, 150)
  const countries = useMemo(() => {
    const n: Record<string, number> = {}
    for (const o of Object.values(owners ?? {})) n[o] = (n[o] ?? 0) + 1
    return Object.entries(n)
      .map(([code, count]) => ({ code, count, name: ownerName(code, settings.lang) }))
      .sort((a, b) => a.name.localeCompare(b.name, settings.lang))
  }, [owners, settings.lang])

  const onType = (g: string) => {
    setTypeFilter(g)
    if (g && !groups[g]) void load({ kind: 'group', value: g })
  }
  const onCountry = (c: string) => {
    setCountry(c)
    // A country's satellites are spread over many groups, so pull in the whole active catalog once.
    if (c && !groups[ALL_ACTIVE]) void load({ kind: 'group', value: ALL_ACTIVE })
  }

  const onLocate = () => {
    if (!navigator.geolocation) return setStatus({ kind: 'err', text: t('Geolocation is not available in this browser.') })
    setStatus({ kind: 'info', text: t('Locating…') })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObserver({ lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4), altM: pos.coords.altitude != null ? Math.round(pos.coords.altitude) : observer.altM, name: t('My location') })
        setStatus({ kind: 'ok', text: t('Location set.') })
      },
      (err) => setStatus({ kind: 'err', text: t('Could not get your location: {0}', err.message) }),
      { enableHighAccuracy: false, timeout: 15000 },
    )
  }

  const onLookup = () => {
    const v = lookup.trim()
    if (!v) return
    void load(/^\d+$/.test(v) ? { kind: 'catnr', value: v } : { kind: 'name', value: v }).then((r) => {
      if (r.length) update({ selected: [...new Set([...selected, ...r.slice(0, 20).map((x) => x.norad)])] })
    })
  }

  const onPaste = () => {
    const r = parseTles(paste)
    if (!r.length) return setStatus({ kind: 'err', text: t('No valid TLE found in the pasted text.') })
    setCatalog((c) => mergeTles(c, r))
    update({ selected: [...new Set([...selected, ...r.map((x) => x.norad)])] })
    setStatus({ kind: 'ok', text: t('Added {0} satellites from pasted text.', r.length) })
    setPaste('')
  }

  const quick = async (group: string) => {
    const ids = groups[group] ?? (await load({ kind: 'group', value: group })).map((x) => x.norad)
    if (ids.length) update({ selected: [...new Set(ids)].slice(0, 400) })
  }

  const fmtT = (ms: number, secs = true) => fmtTime(ms, settings.tz, settings.lang, secs)
  const cd = (ms: number) => fmtCountdown(ms, t('h'), t('min'), t('d'))
  const tzLabel = settings.tz === 'utc' ? 'UTC' : t('local time')

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Satellite pass predictor')}</span>
        <span className="hint grow">{t('When can you see or hear a satellite? Passes, sky plot, ground track and Doppler.')}</span>
        <label className="inline">
          {t('Time')}
          <select value={settings.tz} onChange={(e) => setSettings({ tz: e.target.value as TimeZoneMode })}>
            <option value="local">{t('Local')}</option>
            <option value="utc">UTC</option>
          </select>
        </label>
        <label className="inline">
          {t('Language')}
          <select value={settings.lang} onChange={(e) => setSettings({ lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}
          <select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as Theme })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <section className="section">
              <h3>{t('Your location')}</h3>
              <div className="grid2">
                <NumberField label={t('Latitude (°)')} value={observer.lat} min={-90} max={90} onChange={(v) => setObserver({ lat: v, name: '' })} />
                <NumberField label={t('Longitude (°)')} value={observer.lon} min={-180} max={180} onChange={(v) => setObserver({ lon: v, name: '' })} />
              </div>
              <NumberField label={t('Altitude (m)')} value={observer.altM} min={-500} max={9000} onChange={(v) => setObserver({ altM: v })} />
              <div className="row">
                <button onClick={onLocate}>{t('Use my location')}</button>
                <span className="hint">
                  {observer.name ? `${observer.name} · ` : ''}
                  {fmtLat(observer.lat)} {fmtLon(observer.lon)} · {maidenhead(observer.lat, observer.lon)}
                </span>
              </div>
              <p className="hint">{t('Or click anywhere on the map to move yourself there.')}</p>
            </section>

            <section className="section">
              <h3>{t('Search')}</h3>
              <div className="grid2">
                <label className="field">
                  <span>{t('Look ahead')}</span>
                  <select value={settings.hours} onChange={(e) => setSettings({ hours: +e.target.value })}>
                    {[12, 24, 48, 72, 168].map((h) => <option key={h} value={h}>{h} {t('h')}</option>)}
                  </select>
                </label>
                <NumberField label={t('Min. peak elevation (°)')} value={settings.minEl} min={0} max={80} onChange={(v) => setSettings({ minEl: v })} />
              </div>
            </section>

            <section className="section">
              <h3>{t('Satellites')} ({selected.filter((id) => catIds.has(id)).length})</h3>
              <div className="row">
                <button className="small" onClick={() => update({ selected: [25544] })}>ISS</button>
                <button className="small" disabled={busyLoad} onClick={() => void quick('weather')}>{t('Weather')}</button>
                <button className="small" disabled={busyLoad} onClick={() => void quick('amateur')}>{t('Amateur')}</button>
                <button className="small" onClick={() => update({ selected: [...new Set([...selected, ...matches.map((s) => s.norad)])].slice(0, 400) })}>{t('Select shown')}</button>
                <button className="small" onClick={() => update({ selected: [] })}>{t('Clear')}</button>
              </div>
              <div className="grid2">
                <label className="field">
                  <span>{t('Type')}</span>
                  <select value={typeFilter} disabled={busyLoad} onChange={(e) => onType(e.target.value)}>
                    <option value="">{t('All types')}</option>
                    {CATEGORIES.map((c) => (
                      <optgroup key={c.label} label={t(c.label)}>
                        {c.groups.map((g) => <option key={g.id} value={g.id}>{t(g.label)}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t('Country / owner')}</span>
                  <select value={country} disabled={busyLoad} onChange={(e) => onCountry(e.target.value)}>
                    <option value="">{owners ? t('All countries') : t('Loading countries…')}</option>
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.count})</option>)}
                  </select>
                </label>
              </div>
              <input type="search" className="wide" placeholder={t('Filter by name or NORAD id')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('Filter by name or NORAD id')} />
              <ul className="satlist">
                {shown.map((c) => (
                  <li key={c.norad}>
                    <label className="check">
                      <input type="checkbox" checked={selSet.has(c.norad)} onChange={() => toggle(c.norad)} />
                      <span className="nm">{c.name}</span>
                      {owners?.[c.norad] && <span className="age" title={ownerName(owners[c.norad], settings.lang)}>{owners[c.norad]}</span>}
                      <span className={`age ${now - c.epochMs > 10 * 86400e3 ? 'warn-text' : ''}`}>{fmtAge(now - c.epochMs, t('h'), t('d'))}</span>
                    </label>
                  </li>
                ))}
                {shown.length === 0 && <li className="hint">{t('Nothing matches. Load a group or fetch by name below.')}</li>}
              </ul>
              <p className="hint">{t('{0} matching, {1} loaded.', matches.length, catalog.length)} {t('Age is the time since the element set epoch. Passes get less accurate after a few days.')}</p>
              <div className="row">
                <button className="small" disabled={busyLoad || !!groups[ALL_ACTIVE]} onClick={() => void load({ kind: 'group', value: ALL_ACTIVE })}>{t('Load all active satellites')}</button>
                {typeFilter && <button className="small" disabled={busyLoad} onClick={() => void load({ kind: 'group', value: typeFilter }, { force: true })}>{t('Refresh this type')}</button>}
              </div>
              <div className="row nowrap">
                <input className="grow" placeholder={t('Name or NORAD id')} value={lookup} onChange={(e) => setLookup(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onLookup()} aria-label={t('Name or NORAD id')} />
                <button disabled={busyLoad || !lookup.trim()} onClick={onLookup}>{t('Fetch')}</button>
              </div>
              <details>
                <summary>{t('Paste TLE text')}</summary>
                <textarea rows={5} className="wide mono" placeholder={'ISS (ZARYA)\n1 25544U 98067A   ...\n2 25544  51.6314 ...'} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label={t('Paste TLE text')} />
                <button disabled={!paste.trim()} onClick={onPaste}>{t('Use pasted TLEs')}</button>
              </details>
              {status && <p className={`hint ${status.kind === 'err' ? 'err-text' : status.kind === 'ok' ? 'ok-text' : ''}`} role="status">{status.text}</p>}
              <p className="hint">
                {t('Data: CelesTrak GP API, cached for 2 h in this browser.')}{' '}
                {source.stale && t('Showing the bundled sample from {0} until CelesTrak answers.', '2026-10-10')}
              </p>
            </section>
          </div>
        </aside>

        <main className="main">
          <section className="box">
            <div className="row">
              <h3 className="grow">{t('Upcoming passes')} · {tzLabel}</h3>
              <button className="small" onClick={() => setNonce((n) => n + 1)}>{t('Recalculate')}</button>
            </div>
            {error && <p className="err-text">{t('Error: {0}', error)}</p>}
            {tles.length === 0 && <p className="hint">{t('Select at least one satellite.')}</p>}
            {tles.length > 0 && busy && passes.length === 0 && <p className="hint">{t('Calculating…')}</p>}
            {tles.length > 0 && !busy && passes.length === 0 && !error && <p className="hint">{t('No passes above {0}° in the next {1} h. Lower the minimum elevation or look further ahead.', settings.minEl, settings.hours)}</p>}
            {passes.length > 0 && (
              <div className="tablewrap passes-wrap">
                <table className="data passes">
                  <thead>
                    <tr>
                      <th>{t('Satellite')}</th>
                      <th>{t('Rise (AOS)')}</th>
                      <th>{t('Duration')}</th>
                      <th>{t('Max el.')}</th>
                      <th className="hide-sm">{t('Path')}</th>
                      <th>{t('In')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passes.slice(0, 120).map((p) => (
                      <tr key={passKey(p)} className={passKey(p) === (pass && passKey(pass)) ? 'active' : undefined} onClick={() => setPickedKey(passKey(p))}>
                        <td>
                          <button className="link" onClick={() => setPickedKey(passKey(p))}>{p.name}</button>
                        </td>
                        <td>{p.inProgress ? t('now') : `${fmtDay(p.aos, settings.tz, settings.lang)} ${fmtT(p.aos, false)}`}</td>
                        <td>{fmtDuration(p.los - Math.max(p.aos, now))}</td>
                        <td><span className={`el el${p.maxEl >= 60 ? 3 : p.maxEl >= 30 ? 2 : 1}`}>{p.maxEl.toFixed(0)}°</span></td>
                        <td className="hide-sm">{compass(p.aosAz)} → {compass(p.maxElAz)} → {compass(p.losAz)}</td>
                        <td>{p.aos <= now ? t('in progress') : cd(p.aos - now)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {passes.length > 0 && <p className="hint">{t('AOS and LOS are where the satellite crosses your geometric horizon. Search started {0}.', fmtT(startMs, false))}</p>}
          </section>

          {pass && tle && (
            <PassDetail
              key={passKey(pass)}
              pass={pass}
              tle={tle}
              state={state}
              now={now}
              fmtT={fmtT}
              t={t}
              onFreq={(down, up) => update({ freqs: { ...freqs, [pass.norad]: { down, up } } })}
              onPick={(lat, lon) => setObserver({ lat, lon, name: '' })}
            />
          )}
          {!pass && (
            <section className="box">
              <WorldMap observer={observer} track={[]} from={0} to={0} footprint={null} live={null} onPick={(lat, lon) => setObserver({ lat, lon, name: '' })} t={t} />
            </section>
          )}
        </main>
      </div>
      <p className="hint foot">
        {t('Predictions use SGP4 with public element sets. Check the age of the data before planning a contact.')}{' '}
        <a href={REPO}>{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}

type DetailProps = {
  pass: Pass
  tle: Tle
  state: AppState
  now: number
  fmtT: (ms: number, secs?: boolean) => string
  t: T
  onFreq: (down: number | undefined, up: number | undefined) => void
  onPick: (lat: number, lon: number) => void
}

function PassDetail({ pass, tle, state, now, fmtT, t, onFreq, onPick }: DetailProps) {
  const { observer } = state
  const rec = useMemo(() => makeSatrec(tle), [tle])
  const def = FREQS[pass.norad]
  const user = state.freqs[pass.norad]
  const down = user?.down ?? def?.down
  const up = user?.up ?? def?.up

  const geom = useMemo(() => {
    const sky = skyTrack(rec, observer, pass, 10)
    const peak = lookAt(rec, observer, pass.tca)
    const track = groundTrack(rec, pass.tca - 50 * 60e3, pass.tca + 50 * 60e3, 30)
    const sp = subPoint(rec, pass.tca)
    const footprint = sp ? { lat: sp.lat, lon: sp.lon, ang: footprintAngle(sp.altKm, 0) } : null
    const dop: { t: number; rr: number }[] = []
    for (let ms = pass.aos; ms < pass.los; ms += 10000) dop.push({ t: ms, rr: rangeRate(rec, observer, ms) ?? 0 })
    dop.push({ t: pass.los, rr: rangeRate(rec, observer, pass.los) ?? 0 })
    return { sky, peak, track, footprint, dop }
  }, [rec, observer, pass])

  const live = lookAt(rec, observer, now)
  const liveRr = rangeRate(rec, observer, now)
  const liveSub = subPoint(rec, now)

  const keyPts = [
    { label: t('AOS'), ms: pass.aos, az: pass.aosAz, el: 0 },
    { label: t('Max'), ms: pass.tca, az: pass.maxElAz, el: pass.maxEl },
    { label: t('LOS'), ms: pass.los, az: pass.losAz, el: 0 },
  ].map((k) => {
    const s = lookAt(rec, observer, k.ms)
    const rr = rangeRate(rec, observer, k.ms)
    return { ...k, range: s?.rangeKm ?? NaN, rr: rr ?? NaN }
  })

  return (
    <>
      <section className="box">
        <h3>{tle.name} · {fmtT(pass.aos, false)}–{fmtT(pass.los, false)}</h3>
        <div className="detail">
          <div className="plot">
            <SkyPlot track={geom.sky} maxEl={geom.peak} live={live} t={t} />
          </div>
          <div className="plot wide2">
            <WorldMap observer={observer} track={geom.track} from={pass.aos} to={pass.los} footprint={geom.footprint} live={liveSub} onPick={onPick} t={t} />
            <p className="hint">{t('Ground track ±50 min around the pass; the ring is the horizon footprint at maximum elevation. The dot is the satellite now.')}</p>
          </div>
        </div>
      </section>

      <section className="box">
        <h3>{t('Right now')}</h3>
        {live ? (
          <table className="data kv">
            <tbody>
              <tr><td>{t('Azimuth / elevation')}</td><td>{live.az.toFixed(1)}° {compass(live.az)} / {live.el.toFixed(1)}°{live.el < 0 ? ` (${t('below horizon')})` : ''}</td></tr>
              <tr><td>{t('Range')}</td><td>{live.rangeKm.toFixed(0)} km{liveRr != null ? `, ${liveRr.toFixed(2)} km/s` : ''}</td></tr>
              {liveSub && <tr><td>{t('Sub-satellite point')}</td><td>{fmtLat(liveSub.lat)} {fmtLon(liveSub.lon)}, {liveSub.altKm.toFixed(0)} km</td></tr>}
              {down !== undefined && liveRr != null && <tr><td>{t('Receive at')}</td><td>{fmtMHz(dopplerReceived(down * 1e6, liveRr))} MHz ({fmtKHz(dopplerReceived(down * 1e6, liveRr) - down * 1e6)} kHz)</td></tr>}
            </tbody>
          </table>
        ) : (
          <p className="err-text">{t('The orbit could not be propagated for this time.')}</p>
        )}
      </section>

      <section className="box">
        <h3>{t('Doppler')}</h3>
        <div className="grid2 freqs">
          <FreqField label={t('Downlink (MHz)')} value={user?.down} placeholder={def?.down !== undefined ? String(def.down) : t('e.g. 145.800')} onCommit={(v) => onFreq(v, user?.up)} />
          <FreqField label={t('Uplink (MHz), optional')} value={user?.up} placeholder={def?.up !== undefined ? String(def.up) : t('e.g. 145.200')} onCommit={(v) => onFreq(user?.down, v)} />
        </div>
        {def && <p className="hint">{t('Defaults for {0}: typical frequencies, verify the current status.', def.name)}</p>}
        {down === undefined ? (
          <p className="hint">{t('Enter the satellite downlink frequency to see the Doppler shift.')}</p>
        ) : (
          <>
            <div className="plot narrow">
              <DopplerChart points={geom.dop.map((d) => ({ t: d.t, hz: dopplerReceived(down * 1e6, d.rr) - down * 1e6 }))} tca={pass.tca} fmtT={(ms) => fmtT(ms, false)} t={t} />
            </div>
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th></th>
                    <th>{t('Time')}</th>
                    <th>{t('Az / el')}</th>
                    <th>{t('Range (km)')}</th>
                    <th>{t('Range rate (km/s)')}</th>
                    <th>{t('Receive (MHz)')}</th>
                    <th>{t('Shift (kHz)')}</th>
                    {up !== undefined && <th>{t('Transmit (MHz)')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {keyPts.map((k) => (
                    <tr key={k.label}>
                      <td>{k.label}</td>
                      <td>{fmtT(k.ms)}</td>
                      <td>{k.az.toFixed(0)}° / {k.el.toFixed(0)}°</td>
                      <td>{k.range.toFixed(0)}</td>
                      <td>{k.rr.toFixed(2)}</td>
                      <td>{fmtMHz(dopplerReceived(down * 1e6, k.rr))}</td>
                      <td>{fmtKHz(dopplerReceived(down * 1e6, k.rr) - down * 1e6)}</td>
                      {up !== undefined && <td>{fmtMHz(dopplerTransmit(up * 1e6, k.rr))}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">{t('Receive: the frequency you hear for a nominal downlink. Transmit: what to send so the satellite receives your nominal uplink.')}</p>
          </>
        )}
      </section>
    </>
  )
}
