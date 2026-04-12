// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { CHRONO_COLORS as C } from '../ChronoPage';
import { CHRONO_THEME as T } from '../../shared/theme';
import { ChronoStatCard } from '../components/ChronoStatCard';
import type { IFichajeRepository } from '../../domain/ports/IFichajeRepository';
import type { IBolsaHorasRepository } from '../../domain/ports/IBolsaHorasRepository';
import type { IIncidenciaRepository } from '../../domain/ports/IIncidenciaRepository';
import type { IConfigEmpresaRepository } from '../../domain/ports/IConfigEmpresaRepository';
import type { Fichaje } from '../../domain/entities/Fichaje';
import type { CategoriaIncidencia } from '../../domain/entities/Incidencia';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function minutesWorkedSoFar(f: Fichaje | null): number {
  if (!f?.entradaAt) return 0;
  const now = new Date();
  const entrada = new Date(f.entradaAt);
  let totalMs = now.getTime() - entrada.getTime();
  if (f.comidaIniAt && f.comidaFinAt) {
    totalMs -= new Date(f.comidaFinAt).getTime() - new Date(f.comidaIniAt).getTime();
  } else if (f.comidaIniAt && !f.comidaFinAt) {
    totalMs -= now.getTime() - new Date(f.comidaIniAt).getTime();
  }
  return Math.max(0, Math.round(totalMs / 60000));
}

function secondsWorkedSoFar(f: Fichaje | null): number {
  if (!f?.entradaAt) return 0;
  const now = new Date();
  const entrada = new Date(f.entradaAt);
  let totalMs = now.getTime() - entrada.getTime();
  if (f.comidaIniAt && f.comidaFinAt) {
    totalMs -= new Date(f.comidaFinAt).getTime() - new Date(f.comidaIniAt).getTime();
  } else if (f.comidaIniAt && !f.comidaFinAt) {
    totalMs -= now.getTime() - new Date(f.comidaIniAt).getTime();
  }
  return Math.max(0, Math.round(totalMs / 1000));
}

function fmtHMS(totalSec: number): { h: string; m: string; s: string } {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
  };
}

function fmtHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/* ── StatusDot ────────────────────────────────────────────────────────────── */

function StatusDot({ status }: { status: 'working' | 'lunch' | 'off' }) {
  const color = status === 'working' ? C.green : status === 'lunch' ? C.amber : C.txMuted;
  const cls = status === 'working' ? 'pulse-green' : '';
  return (
    <span
      className={cls}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
      }}
    />
  );
}

/* ── Modal backdrop ───────────────────────────────────────────────────────── */

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        className="ch-card fade-in"
        onClick={e => e.stopPropagation()}
        style={{ minWidth: 380, maxWidth: 480, padding: 28 }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */

interface DashboardViewProps {
  fichajeRepo: IFichajeRepository;
  bolsaRepo: IBolsaHorasRepository;
  incidenciaRepo: IIncidenciaRepository;
  configEmpresaRepo: IConfigEmpresaRepository;
  currentUser: { id: string; name?: string; [key: string]: unknown };
}

export function DashboardView({ fichajeRepo, bolsaRepo, incidenciaRepo, configEmpresaRepo, currentUser }: DashboardViewProps) {
  const { t } = useTranslation();

  /* ── State ──────────────────────────────────────────────────────────────── */
  const [fichaje, setFichaje] = useState<Fichaje | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsNow, setSecondsNow] = useState(0);
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [incompletosCount, setIncompletosCount] = useState(0);
  const [saldoBolsa, setSaldoBolsa] = useState(0);
  const [clockTime, setClockTime] = useState(new Date());
  const [showExitModal, setShowExitModal] = useState(false);
  const [showIncModal, setShowIncModal] = useState(false);
  const [incCategoria, setIncCategoria] = useState<CategoriaIncidencia>('medico');
  const [incDescripcion, setIncDescripcion] = useState('');
  const [jornadaMin, setJornadaMin] = useState(480);
  const [cityName, setCityName] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Load data ──────────────────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    try {
      const [hoy, incompletos, saldo, horasJornada] = await Promise.all([
        fichajeRepo.getFichajeHoy(currentUser.id),
        fichajeRepo.getFichajesIncompletos(currentUser.id),
        bolsaRepo.getSaldo(currentUser.id),
        configEmpresaRepo.getHorasJornadaMinutos(),
      ]);
      setFichaje(hoy);
      setIncompletosCount(incompletos.length);
      setSaldoBolsa(saldo.saldoNeto);
      if (horasJornada != null) setJornadaMin(horasJornada);
      if (hoy) setSecondsNow(secondsWorkedSoFar(hoy));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo, bolsaRepo, configEmpresaRepo, currentUser.id]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Weekly summary ─────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const resumen = await fichajeRepo.getResumenMes(currentUser.id, mes);
        setWeekMinutes(resumen.minutosTotales);
      } catch {
        // silent
      }
    })();
  }, [fichajeRepo, currentUser.id]);

  /* ── Detect city via browser geolocation ─────────────────────────────── */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=10`)
          .then(r => r.json())
          .then(data => {
            const city = data.address?.city || data.address?.town || data.address?.village || '';
            if (city) setCityName(city);
          })
          .catch(() => {});
      },
      () => {},
      { timeout: 5000 },
    );
  }, []);

  /* ── Live clock + timer ─────────────────────────────────────────────────── */
  useEffect(() => {
    clockRef.current = setInterval(() => setClockTime(new Date()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  useEffect(() => {
    if (fichaje?.entradaAt && !fichaje.salidaAt) {
      timerRef.current = setInterval(() => {
        setSecondsNow(secondsWorkedSoFar(fichaje));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fichaje]);

  /* ── Derived state ──────────────────────────────────────────────────────── */
  const isOpen = !!fichaje?.entradaAt && !fichaje.salidaAt;
  const isOnLunch = isOpen && !!fichaje?.comidaIniAt && !fichaje.comidaFinAt;
  const canClockIn = !fichaje || !!fichaje.salidaAt;
  const canStartLunch = isOpen && !fichaje.comidaIniAt && !isOnLunch;
  const canClockOut = isOpen && !isOnLunch;
  const minutesNow = Math.floor(secondsNow / 60);
  const pct = Math.min(100, Math.round((minutesNow / jornadaMin) * 100));
  const timer = fmtHMS(secondsNow);

  /* Clock formatting */
  const clockHH = String(clockTime.getHours()).padStart(2, '0');
  const clockMM = String(clockTime.getMinutes()).padStart(2, '0');
  const clockDate = clockTime.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /* ── Actions ────────────────────────────────────────────────────────────── */
  const act = async (fn: () => Promise<Fichaje>) => {
    setActing(true);
    setError(null);
    try {
      const updated = await fn();
      setFichaje(updated);
      setSecondsNow(secondsWorkedSoFar(updated));
    } catch {
      setError(t('chrono.errorAccion'));
    } finally {
      setActing(false);
    }
  };

  const clockIn = () => act(() => fichajeRepo.ficharEntrada(currentUser.id));
  const clockOut = () => {
    setShowExitModal(false);
    act(() => fichajeRepo.ficharSalida(fichaje!.id));
  };
  const startLunch = () => act(() => fichajeRepo.iniciarComida(fichaje!.id));
  const endLunch = () => act(() => fichajeRepo.finalizarComida(fichaje!.id));

  const handleMainButton = () => {
    if (canClockIn) { clockIn(); return; }
    if (canClockOut) { setShowExitModal(true); return; }
  };

  const handleCreateIncidencia = async () => {
    if (!fichaje?.id) return;
    setActing(true);
    try {
      await incidenciaRepo.crear({
        fichajeId: fichaje.id,
        userId: currentUser.id,
        categoria: incCategoria,
        inicioAt: new Date().toISOString(),
        descripcion: incDescripcion || undefined,
      });
      setShowIncModal(false);
      setIncDescripcion('');
    } catch {
      setError(t('chrono.errorAccion'));
    } finally {
      setActing(false);
    }
  };

  /* ── Main button style ──────────────────────────────────────────────────── */
  // "Ready to clock in" uses the Stitch primary (was amber). Lunch and clock-out
  // keep their semantic colors (green / red).
  const mainBtnBg = canClockIn ? T.color.primary : C.red;
  const mainBtnLabel = canClockIn
    ? t('chrono.ficharEntradaBtn')
    : t('chrono.ficharSalidaBtn');

  /* ── Alerts ─────────────────────────────────────────────────────────────── */
  const alerts: { color: string; text: string }[] = [];
  if (incompletosCount > 0) {
    alerts.push({ color: C.red, text: `${t('chrono.fichajePendienteAlert')} (${incompletosCount})` });
  }
  if (minutesNow > jornadaMin) {
    alerts.push({ color: C.amber, text: t('chrono.horasExcedidas') });
  }

  /* ── Team data — should come from admin fichaje repo in the future ─────── */
  const teamMembers: { name: string; status: 'working' | 'lunch' | 'off' }[] = [];

  /* ── Stat cards data ────────────────────────────────────────────────────── */
  // Weekly progress: assume a 5-day standard week against the configured
  // daily quota. Clamp to 100 so the bar never overflows.
  const weekTargetMin = jornadaMin * 5;
  const weekPct = weekTargetMin > 0 ? Math.min(100, Math.round((weekMinutes / weekTargetMin) * 100)) : 0;

  interface StatCardDef {
    icon: string;
    label: string;
    value: string;
    accent: string;
    subtext?: string;
    trend?: string;
    progressBar?: { pct: number };
    bars?: number[];
  }

  const stats: StatCardDef[] = [
    {
      icon: '◷',
      label: t('chrono.horasHoy'),
      value: fmtHM(minutesNow),
      accent: C.amber,
      progressBar: { pct },
      ...(pct >= 100 && { trend: t('chrono.completa') }),
    },
    {
      icon: '▤',
      label: t('chrono.estaSemana'),
      value: `${fmtHM(weekMinutes)} / ${fmtHM(weekTargetMin)}`,
      accent: C.blue,
      progressBar: { pct: weekPct },
    },
    {
      icon: '⚖',
      label: t('chrono.bolsaHoras'),
      value: `${saldoBolsa >= 0 ? '+' : ''}${fmtHM(Math.abs(saldoBolsa))}`,
      accent: saldoBolsa >= 0 ? C.green : C.red,
      subtext: t('chrono.bolsaHorasHint'),
    },
    {
      icon: '◈',
      label: t('chrono.vacRestantes'),
      value: '—',
      accent: C.purple || '#a855f7',
      subtext: t('chrono.vacRestantesHint'),
    },
  ];

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ color: C.txDim, padding: 60, textAlign: 'center' }}>
        <span className="mono" style={{ letterSpacing: '.1em' }}>{t('chrono.cargando')}</span>
      </div>
    );
  }

  /* ── Greeting based on time of day ──────────────────────────────────────── */
  const hour = clockTime.getHours();
  const greetingKey = hour < 12 ? 'chrono.buenosDias' : hour < 19 ? 'chrono.buenosTardes' : 'chrono.buenasNoches';
  const userName = currentUser.name || currentUser.id.slice(0, 8);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header section — pixel-match to Stitch HTML ────────────────── */}
      <div style={{
        marginBottom: 10, display: 'flex', flexDirection: 'row',
        alignItems: 'flex-end', justifyContent: 'space-between', gap: 24,
      }}>
        <div>
          <span style={{
            color: T.color.primaryStrong,
            fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.2em',
            fontFamily: T.font.body,
          }}>
            {t('chrono.sesionEnVivo')}
          </span>
          <h2 style={{
            fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.025em',
            color: '#fff', marginTop: 4, lineHeight: 1.15,
            fontFamily: T.font.body,
          }}>
            {t(greetingKey, { name: userName })}
          </h2>
          <p style={{
            color: T.color.textMuted, marginTop: 8, fontSize: 14,
            maxWidth: 420, lineHeight: 1.5,
          }}>
            {t('chrono.dashboardDesc')}
          </p>
        </div>
        {/* Current time + date + location widget */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: T.color.surfaceLow, padding: 8, borderRadius: T.radius.lg,
        }}>
          <div style={{ textAlign: 'right', padding: '0 16px' }}>
            <p style={{
              fontSize: '0.65rem', textTransform: 'uppercase',
              color: T.color.textMuted, fontWeight: 700, letterSpacing: '0.1em',
            }}>
              {t('chrono.horaActualLabel')}
            </p>
            <p style={{
              fontSize: '1.25rem', fontWeight: 700, color: '#fff',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {clockHH}:{clockMM}:{String(clockTime.getSeconds()).padStart(2, '0')}
            </p>
          </div>
          <div style={{ width: 1, height: 32, background: `${T.color.border}30` }} />
          <div style={{ padding: '0 16px' }}>
            <p style={{
              fontSize: '0.65rem', textTransform: 'uppercase',
              color: T.color.textMuted, fontWeight: 700, letterSpacing: '0.1em',
            }}>
              {t('chrono.fechaLabel', { defaultValue: 'Fecha' })}
            </p>
            <p style={{
              fontSize: '1.25rem', fontWeight: 700, color: '#fff',
              textTransform: 'capitalize',
            }}>
              {clockDate}
            </p>
          </div>
          {cityName && (
            <>
              <div style={{ width: 1, height: 32, background: `${T.color.border}30` }} />
              <div style={{ textAlign: 'left', padding: '0 16px' }}>
                <p style={{
                  fontSize: '0.65rem', textTransform: 'uppercase',
                  color: T.color.textMuted, fontWeight: 700, letterSpacing: '0.1em',
                }}>
                  {t('chrono.ubicacionLabel')}
                </p>
                <p style={{
                  fontSize: '1.25rem', fontWeight: 700, color: '#fff',
                }}>
                  {cityName}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: T.color.dangerDim,
            border: `1px solid rgba(239,68,68,0.3)`,
            borderRadius: T.radius.lg,
            padding: '10px 16px',
            color: T.color.danger,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Bento grid: Hero (8 cols) + Stats stack (4 cols) ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 24 }}>

        {/* ── Hero timer card (8 cols) ──────────────────────────────────────── */}
        <div
          style={{
            gridColumn: 'span 8',
            background: T.color.surface,
            borderRadius: T.radius.xl,
            position: 'relative',
            overflow: 'hidden',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {/* Background radial glow */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(ellipse at 50% 30%, ${T.color.primaryStrong}18 0%, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />

          {/* Giant session timer — 5.5rem like Stitch */}
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <div style={{
              fontSize: '5.5rem',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              color: '#fff',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: T.font.body,
            }}>
              {timer.h}:{timer.m}:{timer.s}
            </div>
            <div style={{
              color: T.color.primary,
              fontWeight: 700,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              fontSize: 12,
              marginTop: 8,
            }}>
              {t('chrono.duracionSesion')}
            </div>
          </div>

          {/* Action buttons — rectangular with gradient like Stitch */}
          <div style={{ display: 'flex', gap: 16, marginTop: 24, position: 'relative' }}>
            {/* Main: Clock In / Clock Out — disabled during lunch */}
            <button
              disabled={acting || isOnLunch}
              onClick={handleMainButton}
              style={{
                background: canClockIn
                  ? `linear-gradient(135deg, ${T.color.primary}, ${T.color.primaryStrong})`
                  : `linear-gradient(135deg, ${T.color.danger}, ${T.color.dangerStrong})`,
                color: canClockIn ? T.color.primaryOn : '#fff',
                padding: '16px 40px',
                borderRadius: T.radius.lg,
                border: 'none',
                fontWeight: 700,
                fontSize: 18,
                cursor: (acting || isOnLunch) ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: canClockIn
                  ? `0 4px 20px ${T.color.primaryStrong}44`
                  : `0 4px 20px ${T.color.dangerStrong}44`,
                transition: 'transform .15s, box-shadow .15s',
                opacity: (acting || isOnLunch) ? 0.4 : 1,
              }}
              onMouseEnter={e => { if (!acting && !isOnLunch) e.currentTarget.style.transform = 'scale(1.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <span style={{ fontSize: 20 }}>⏱</span>
              {mainBtnLabel}
            </button>

            {/* Lunch button: "Salir a comer" or "Volver de comida" */}
            <button
              disabled={(!canStartLunch && !isOnLunch) || acting}
              onClick={isOnLunch ? endLunch : startLunch}
              style={{
                background: isOnLunch
                  ? `linear-gradient(135deg, ${T.color.secondary}, ${T.color.secondaryStrong})`
                  : `${T.color.surfaceHigh}80`,
                border: isOnLunch ? 'none' : `1px solid ${T.color.border}50`,
                color: isOnLunch ? T.color.primaryOn : '#fff',
                padding: '16px 32px',
                borderRadius: T.radius.lg,
                fontWeight: 700,
                fontSize: 18,
                cursor: (canStartLunch || isOnLunch) ? 'pointer' : 'default',
                transition: 'background .15s',
                opacity: (canStartLunch || isOnLunch) ? 1 : 0.4,
              }}
              onMouseEnter={e => { if (canStartLunch && !isOnLunch) e.currentTarget.style.background = T.color.surfaceHigh; }}
              onMouseLeave={e => { if (!isOnLunch) e.currentTarget.style.background = `${T.color.surfaceHigh}80`; }}
            >
              {isOnLunch ? t('chrono.volverComida') : t('chrono.tomarDescanso')}
            </button>

            {/* Add incident — small ghost */}
            <button
              className="ch-btn ch-btn-ghost"
              disabled={!isOpen || acting}
              onClick={() => setShowIncModal(true)}
              style={{ opacity: isOpen ? 1 : 0.4, alignSelf: 'center' }}
            >
              {t('chrono.anadirIncidencia')}
            </button>
          </div>

          {/* Status indicators */}
          <div style={{
            display: 'flex', gap: 32, marginTop: 32,
            color: T.color.textMuted, fontSize: 14, position: 'relative',
          }}>
            {isOpen && fichaje?.entradaAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className="pulse-green"
                  style={{
                    display: 'inline-block', width: 8, height: 8,
                    borderRadius: '50%', background: T.color.secondary,
                  }}
                />
                {t('chrono.fichadoALas', {
                  time: new Date(fichaje.entradaAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                })}
              </div>
            )}
            {isOnLunch && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🍽</span>
                {t('chrono.enPausaComida')}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', maxWidth: 500, marginTop: 20, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{
                fontSize: 10, color: T.color.textMuted,
                letterSpacing: '.08em', textTransform: 'uppercase',
              }}>
                {t('chrono.jornadaLabel')}
              </span>
              <span className="mono" style={{ fontSize: 10, color: T.color.textDim }}>{pct}%</span>
            </div>
            <div style={{
              height: 6, background: T.color.surfaceLow,
              borderRadius: T.radius.full, overflow: 'hidden',
            }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: T.radius.full,
                background: pct >= 100
                  ? `linear-gradient(90deg, ${T.color.secondary}, ${T.color.secondaryStrong})`
                  : `linear-gradient(90deg, ${T.color.primary}, ${T.color.primaryStrong})`,
                transition: 'width .4s ease',
              }} />
            </div>
          </div>
        </div>

        {/* ── Secondary stat stack (4 cols) ─────────────────────────────────── */}
        <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Hours Today card */}
          <div style={{
            background: T.color.surfaceHigh,
            padding: 24,
            borderRadius: T.radius.xl,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Color accent bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: stats[0].accent,
            }} />
            <p style={{
              fontSize: 11, fontWeight: 700, color: T.color.textMuted,
              textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 16,
            }}>
              {stats[0].label}
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 36, fontWeight: 700, color: '#fff', margin: 0, fontFamily: T.font.body }}>
                {stats[0].value}
              </h3>
              {pct >= 100 ? (
                <div style={{ color: T.color.secondary, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>
                  <span>↗</span> {t('chrono.completa')}
                </div>
              ) : (
                <div style={{ color: T.color.secondary, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>
                  <span>↗</span> On Track
                </div>
              )}
            </div>
            {/* Progress bar */}
            <div style={{
              marginTop: 16, width: '100%', height: 6,
              background: T.color.surfaceLow, borderRadius: T.radius.full, overflow: 'hidden',
            }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: T.color.secondary, borderRadius: T.radius.full,
                transition: 'width .4s ease',
              }} />
            </div>
          </div>

          {/* This Week card */}
          <div style={{
            background: T.color.surfaceHigh,
            padding: 24,
            borderRadius: T.radius.xl,
            border: `1px solid ${T.color.primaryDim}`,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Color accent bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: stats[1].accent,
            }} />
            <p style={{
              fontSize: 11, fontWeight: 700, color: T.color.textMuted,
              textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 16,
            }}>
              {stats[1].label}
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 36, fontWeight: 700, color: '#fff', margin: 0, fontFamily: T.font.body }}>
                {fmtHM(weekMinutes)} <span style={{ fontSize: 18, color: T.color.textMuted, fontWeight: 400 }}>/ {fmtHM(weekTargetMin)}</span>
              </h3>
            </div>
            {/* Mini bar chart (sparkline for weekdays) */}
            <div style={{ marginTop: 16, display: 'flex', gap: 4, height: 24, alignItems: 'flex-end' }}>
              {[60, 80, 90, 75, weekPct, 0, 0].map((h, i) => (
                <div key={i} style={{
                  flex: 1,
                  height: h > 0 ? `${Math.max(4, h)}%` : 4,
                  background: i < 4
                    ? `${T.color.primary}33`
                    : i === 4
                      ? `${T.color.primary}99`
                      : T.color.surfaceLow,
                  borderRadius: 2,
                  transition: 'height .3s ease',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom row: 3 + 3 + 6 cols ─────────────────────────────────────── */}

        {/* Hours Bank */}
        <div style={{
          gridColumn: 'span 3',
          background: T.color.surfaceLow,
          padding: 24,
          borderRadius: T.radius.xl,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: T.color.tertiary,
          }} />
          <span style={{ fontSize: 30, marginBottom: 16, display: 'block', color: T.color.tertiary }}>⚖</span>
          <p style={{
            fontSize: 11, fontWeight: 700, color: T.color.textMuted,
            textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4,
          }}>
            {stats[2].label}
          </p>
          <h3 style={{ fontSize: 30, fontWeight: 700, color: '#fff', margin: 0, fontFamily: T.font.body }}>
            {stats[2].value}
          </h3>
          <p style={{ fontSize: 11, color: T.color.textDim, marginTop: 8 }}>
            {t('chrono.bolsaHorasHint')}
          </p>
        </div>

        {/* Remaining Holidays */}
        <div style={{
          gridColumn: 'span 3',
          background: T.color.surfaceLow,
          padding: 24,
          borderRadius: T.radius.xl,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: T.color.warning,
          }} />
          <span style={{ fontSize: 30, marginBottom: 16, display: 'block', color: T.color.warning }}>◈</span>
          <p style={{
            fontSize: 11, fontWeight: 700, color: T.color.textMuted,
            textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4,
          }}>
            {stats[3].label}
          </p>
          <h3 style={{ fontSize: 30, fontWeight: 700, color: '#fff', margin: 0, fontFamily: T.font.body }}>
            {stats[3].value}
          </h3>
          <p style={{ fontSize: 11, color: T.color.textDim, marginTop: 8 }}>
            {t('chrono.vacRestantesHint')}
          </p>
        </div>

        {/* Alerts & Incidents — Stitch style with border-left */}
        <div style={{
          gridColumn: 'span 6',
          background: T.color.surfaceLow,
          padding: 24,
          borderRadius: T.radius.xl,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: T.color.textMuted,
            textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 16,
          }}>
            {t('chrono.alertas')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.length === 0 && (
              <div style={{ fontSize: 13, color: T.color.textDim }}>—</div>
            )}
            {alerts.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12, background: `${T.color.bg}66`,
                borderRadius: T.radius.lg,
                borderLeft: `3px solid ${a.color}`,
              }}>
                <span style={{ fontSize: 18, color: a.color }}>⚠</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: 0 }}>{a.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Today */}
        <div style={{
          gridColumn: 'span 12',
          background: T.color.surface,
          borderRadius: T.radius.xl,
          padding: 24,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.12em', color: T.color.textMuted, marginBottom: 14,
          }}>
            {t('chrono.equipoHoy')}
          </div>
          {teamMembers.length === 0 ? (
            <div style={{ fontSize: 13, color: T.color.textDim }}>{t('chrono.proximaVista')}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {teamMembers.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${T.color.primaryDim}, ${T.color.primaryOn})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: T.color.primary,
                    fontFamily: T.font.mono,
                    position: 'relative',
                  }}>
                    {m.name.slice(0, 2).toUpperCase()}
                    <span style={{ position: 'absolute', bottom: -1, right: -1 }}>
                      <StatusDot status={m.status} />
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: T.color.text }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: T.color.textDim }}>
                      {m.status === 'working' ? t('chrono.trabajando')
                        : m.status === 'lunch' ? t('chrono.enPausa')
                        : t('chrono.noFichado')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Exit confirmation modal ───────────────────────────────────────── */}
      <Modal open={showExitModal} onClose={() => setShowExitModal(false)}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 12 }}>
          {t('chrono.confirmarSalida')}
        </div>
        <div style={{ fontSize: 13, color: C.txDim, marginBottom: 24 }}>
          {t('chrono.confirmarSalidaMsg', { hours: fmtHM(minutesNow) })}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="ch-btn ch-btn-ghost" onClick={() => setShowExitModal(false)}>
            {t('chrono.cancelarBtn')}
          </button>
          <button className="ch-btn ch-btn-red" onClick={clockOut} disabled={acting}>
            {t('chrono.confirmar')}
          </button>
        </div>
      </Modal>

      {/* ── Incident creation modal ───────────────────────────────────────── */}
      <Modal open={showIncModal} onClose={() => setShowIncModal(false)}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 18 }}>
          {t('chrono.nuevaIncidencia')}
        </div>

        {/* Category */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.txMuted, marginBottom: 6 }}>
            {t('chrono.categoriaInc')}
          </label>
          <select value={incCategoria} onChange={e => setIncCategoria(e.target.value as CategoriaIncidencia)}>
            {(['medico', 'comida', 'gestion', 'formacion', 'teletrabajo', 'viaje'] as CategoriaIncidencia[]).map(cat => (
              <option key={cat} value={cat}>{t(`chrono.${cat}`)}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.txMuted, marginBottom: 6 }}>
            {t('chrono.descripcionInc')}
          </label>
          <textarea
            value={incDescripcion}
            onChange={e => setIncDescripcion(e.target.value)}
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="ch-btn ch-btn-ghost" onClick={() => setShowIncModal(false)}>
            {t('chrono.cancelarBtn')}
          </button>
          <button className="ch-btn ch-btn-amber" onClick={handleCreateIncidencia} disabled={acting}>
            {t('chrono.crearIncidencia')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
