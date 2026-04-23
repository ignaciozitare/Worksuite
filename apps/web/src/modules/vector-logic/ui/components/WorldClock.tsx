// @ts-nocheck
import { useEffect, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { WorldCity } from '../../domain/entities/WorldCity';
import { worldCityRepo, userSettingsRepo } from '../../container';

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

/**
 * Header clock pill + popover with user's saved cities.
 * Tick updates every minute. Time rendered via Intl.DateTimeFormat
 * using the city's IANA timezone.
 */
export function WorldClock({ currentUser }: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState<Date>(new Date());
  const [homeTimezone, setHomeTimezone] = useState<string>('UTC');
  const [homeCity, setHomeCity] = useState<string>('—');
  const [cities, setCities] = useState<WorldCity[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const [settings, cs] = await Promise.all([
        userSettingsRepo.get(currentUser.id),
        worldCityRepo.list(currentUser.id),
      ]);
      if (settings) {
        setHomeTimezone(settings.homeTimezone);
        if (settings.homeCity) setHomeCity(settings.homeCity);
      } else {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
        setHomeTimezone(tz);
        setHomeCity(tz.split('/').pop()?.replaceAll('_', ' ') ?? tz);
      }
      setCities(cs);
    })();
  }, [currentUser.id]);

  const formatTime = (tz: string) =>
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(now);

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
            width: 280, background: 'var(--sf2)', border: '1px solid var(--bd)',
            borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.1em', marginBottom: 8 }}>
            {t('vectorLogic.worldClockCities')}
          </div>
          {cities.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: '12px 0', opacity: .7 }}>
              {t('vectorLogic.noWorldCities')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cities.map((c) => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 6, background: 'var(--bg)',
                }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--tx)' }}>{c.cityName}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}>
                    {formatTime(c.timezone)}
                  </span>
                  <button
                    onClick={async () => {
                      await worldCityRepo.remove(c.id);
                      setCities((prev) => prev.filter((x) => x.id !== c.id));
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)' }}
                    title={t('common.delete')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Add-city input handled by Dev Agent — stub for now */}
          <button
            onClick={async () => {
              const tz = prompt(t('vectorLogic.promptTimezoneIana'));
              const name = prompt(t('vectorLogic.promptCityName'));
              if (!tz || !name) return;
              const created = await worldCityRepo.create({
                userId: currentUser.id,
                cityName: name,
                timezone: tz,
                sortOrder: cities.length,
              });
              setCities((prev) => [...prev, created]);
            }}
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
        </div>
      )}
    </div>
  );
}
