// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { WorldCity } from '../../domain/entities/WorldCity';
import { worldCityRepo, userSettingsRepo } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

/**
 * Header clock pill + popover.
 *
 * Shows the user's home city time as a compact pill; clicking expands a
 * popover with all saved cities (each rendered with time + an offset chip
 * relative to the home timezone, e.g. "+4h30"). Cities can be added
 * inline (no native prompt()) and removed with a close button.
 */
export function WorldClock({ currentUser }: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState<Date>(new Date());
  const [homeTimezone, setHomeTimezone] = useState<string>('UTC');
  const [homeCity, setHomeCity] = useState<string>('—');
  const [cities, setCities] = useState<WorldCity[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTz, setNewTz] = useState('');
  const [newCity, setNewCity] = useState('');

  useEffect(() => {
    const h = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(h);
  }, []);

  /** Validate an IANA timezone string by trying to construct a DateTimeFormat with it. */
  const isValidTz = (tz: string): boolean => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
    catch { return false; }
  };

  useEffect(() => {
    (async () => {
      const [settings, cs] = await Promise.all([
        userSettingsRepo.get(currentUser.id),
        worldCityRepo.list(currentUser.id),
      ]);
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
      if (settings && isValidTz(settings.homeTimezone)) {
        setHomeTimezone(settings.homeTimezone);
        setHomeCity(settings.homeCity || settings.homeTimezone.split('/').pop()?.replaceAll('_', ' ') || settings.homeTimezone);
      } else {
        // No settings, or stored homeTimezone is invalid (e.g. "buenos aires"
        // instead of "America/Argentina/Buenos_Aires") — fall back to the
        // browser's resolved zone so nothing crashes.
        setHomeTimezone(browserTz);
        setHomeCity(browserTz.split('/').pop()?.replaceAll('_', ' ') ?? browserTz);
      }
      // Silently drop cities with an invalid timezone so the popover
      // stays usable even if the DB has legacy rows.
      setCities(cs.filter(c => isValidTz(c.timezone)));
    })();
  }, [currentUser.id]);

  /** Full IANA timezone list when supported; small fallback otherwise. */
  const allZones = useMemo<string[]>(() => {
    try {
      const fn = (Intl as any).supportedValuesOf;
      if (typeof fn === 'function') return fn('timeZone');
    } catch { /* ignore */ }
    return [
      'UTC',
      'America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
      'Europe/London', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin',
      'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Shanghai',
      'Asia/Tokyo', 'Asia/Hong_Kong', 'Australia/Sydney',
    ];
  }, []);

  const formatTime = (tz: string): string => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
      }).format(now);
    } catch {
      return '—';
    }
  };

  /**
   * Offset in minutes of `tz` relative to `baseTz` at the given instant.
   * Positive = ahead, negative = behind. DST-aware for the given moment.
   */
  const diffMinutes = (baseTz: string, tz: string, at: Date = now): number => {
    const ref = new Date(Date.UTC(2020, 0, 1, 12, 0, 0));
    const fmt = (t: string) => new Date(ref.toLocaleString('en-US', { timeZone: t }));
    try {
      return Math.round((fmt(tz).getTime() - fmt(baseTz).getTime()) / 60_000);
    } catch { return 0; }
  };

  const formatDiff = (minutes: number): string => {
    if (minutes === 0) return t('vectorLogic.sameTime');
    const sign = minutes > 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m === 0 ? `${sign}${h}h` : `${sign}${h}h${String(m).padStart(2, '0')}`;
  };

  const handleAdd = async () => {
    const tz = newTz.trim();
    if (!tz) return;
    if (!isValidTz(tz)) {
      // Show a lightweight inline hint by resetting to empty — the Add
      // button remains disabled until a valid zone is typed.
      // eslint-disable-next-line no-console
      console.warn('[WorldClock] invalid IANA timezone rejected:', tz);
      return;
    }
    const city = newCity.trim() || tz.split('/').pop()?.replaceAll('_', ' ') || tz;
    try {
      const created = await worldCityRepo.create({
        userId: currentUser.id,
        cityName: city,
        timezone: tz,
        sortOrder: cities.length,
      });
      setCities((prev) => [...prev, created]);
      setNewTz('');
      setNewCity('');
      setAdding(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[WorldClock] failed to create city', err);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 8, fontFamily: 'inherit',
          background: 'var(--sf2)', border: '1px solid var(--bd)',
          color: 'var(--tx)', cursor: 'pointer', fontSize: 12,
        }}
        title={t('vectorLogic.worldClock')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ac)' }}>
          schedule
        </span>
        <span style={{ fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}>
          {formatTime(homeTimezone)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{homeCity}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--tx3)' }}>
          public
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
            width: 320, background: 'var(--sf)', border: '1px solid var(--bd)',
            borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.1em', marginBottom: 8 }}>
            {t('vectorLogic.worldClockCities')}
          </div>

          {/* Home row — always shown first, not deletable */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 8, background: 'var(--ac-dim)',
            marginBottom: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ac)' }}>home</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 600 }}>{homeCity}</span>
              <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{homeTimezone}</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", color: 'var(--tx)' }}>
              {formatTime(homeTimezone)}
            </span>
          </div>

          {cities.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: '12px 0', opacity: .7 }}>
              {t('vectorLogic.noWorldCities')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cities.map((c) => {
                const diff = diffMinutes(homeTimezone, c.timezone);
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 6, background: 'var(--sf2)',
                  }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{c.cityName}</span>
                      <span style={{ fontSize: 9, color: 'var(--tx3)' }}>{c.timezone}</span>
                    </div>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 3,
                      background: 'var(--sf3)', color: 'var(--tx2)',
                      fontWeight: 700, letterSpacing: '.02em', minWidth: 36, textAlign: 'center',
                    }}>
                      {formatDiff(diff)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", color: 'var(--tx)', minWidth: 44, textAlign: 'right' }}>
                      {formatTime(c.timezone)}
                    </span>
                    <button
                      onClick={async () => {
                        await worldCityRepo.remove(c.id);
                        setCities((prev) => prev.filter((x) => x.id !== c.id));
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 0, display: 'flex' }}
                      title={t('common.delete')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {adding ? (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                list="vl-tz-list"
                autoFocus
                value={newTz}
                onChange={(e) => setNewTz(e.target.value)}
                placeholder={t('vectorLogic.promptTimezoneIana')}
                style={addInp}
              />
              <datalist id="vl-tz-list">
                {allZones.map((z) => <option key={z} value={z} />)}
              </datalist>
              <input
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                placeholder={t('vectorLogic.promptCityName')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  else if (e.key === 'Escape') { setAdding(false); setNewTz(''); setNewCity(''); }
                }}
                style={addInp}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleAdd} disabled={!isValidTz(newTz.trim())} style={{
                  flex: 1, padding: '6px 10px', borderRadius: 6,
                  background: isValidTz(newTz.trim()) ? 'var(--ac)' : 'var(--sf3)',
                  color: isValidTz(newTz.trim()) ? 'var(--ac-on)' : 'var(--tx3)',
                  border: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                  cursor: isValidTz(newTz.trim()) ? 'pointer' : 'not-allowed',
                }}>
                  {t('common.create')}
                </button>
                <button onClick={() => { setAdding(false); setNewTz(''); setNewCity(''); }} style={{
                  padding: '6px 10px', borderRadius: 6, background: 'transparent',
                  color: 'var(--tx2)', border: '1px solid var(--bd)',
                  fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
                }}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              style={{
                marginTop: 8, width: '100%', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', gap: 6, padding: '6px 10px', borderRadius: 6,
                background: 'var(--ac-dim)', color: 'var(--ac)', border: 'none',
                fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
              {t('vectorLogic.addCity')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const addInp = {
  width: '100%', padding: '6px 10px', fontSize: 11, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
  color: 'var(--tx)', outline: 'none',
};
