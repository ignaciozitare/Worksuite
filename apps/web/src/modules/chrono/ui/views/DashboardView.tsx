// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { CHRONO_COLORS as C } from '../ChronoPage';
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
    if (isOnLunch) { endLunch(); return; }
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
  const mainBtnBg = canClockIn ? C.amber : isOnLunch ? C.green : C.red;
  const mainBtnLabel = canClockIn
    ? t('chrono.ficharEntradaBtn')
    : isOnLunch
      ? t('chrono.volverComida')
      : t('chrono.ficharSalidaBtn');
  const mainBtnClass = canClockIn ? '' : isOnLunch ? '' : 'pulse-ring';

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
  const stats = [
    { icon: '◷', label: t('chrono.horasHoy'), value: fmtHM(minutesNow), accent: C.amber },
    { icon: '▤', label: t('chrono.estaSemana'), value: fmtHM(weekMinutes), accent: C.blue },
    { icon: '⚖', label: t('chrono.bolsaHoras'), value: `${saldoBolsa >= 0 ? '+' : ''}${fmtHM(Math.abs(saldoBolsa))}`, accent: saldoBolsa >= 0 ? C.green : C.red },
    { icon: '◈', label: t('chrono.vacRestantes'), value: '—', accent: C.purple || '#a855f7' },
  ];

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ color: C.txDim, padding: 60, textAlign: 'center' }}>
        <span className="mono" style={{ letterSpacing: '.1em' }}>{t('chrono.cargando')}</span>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Top amber line ─────────────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)', marginBottom: -12 }} />

      {/* ── Giant clock + main button area ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '40px 0 20px',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.05) 0%, transparent 60%)',
        }}
      >
        {/* Giant clock */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="mono" style={{ fontSize: 52, fontWeight: 300, color: C.amber, letterSpacing: '.04em' }}>
            {clockHH}<span className="blink">:</span>{clockMM}
          </div>
          <div style={{ fontSize: 13, color: C.txDim, marginTop: 4, textTransform: 'capitalize' }}>
            {clockDate}
          </div>
        </div>

        {/* Big circular button */}
        <button
          className={mainBtnClass}
          disabled={acting}
          onClick={handleMainButton}
          style={{
            width: 160,
            height: 160,
            borderRadius: '50%',
            background: mainBtnBg,
            border: 'none',
            cursor: acting ? 'wait' : 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'transform .15s, box-shadow .15s',
            boxShadow: `0 0 40px ${mainBtnBg}33`,
            opacity: acting ? 0.7 : 1,
          }}
          onMouseEnter={e => { if (!acting) e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#000', letterSpacing: '.08em', textAlign: 'center', lineHeight: 1.3, padding: '0 12px' }}>
            {mainBtnLabel}
          </span>
        </button>

        {/* Live timer */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <div className="mono" style={{ fontSize: 28, fontWeight: 500, color: C.green, letterSpacing: '.02em' }}>
            {timer.h}:{timer.m}:{timer.s}
          </div>
          <div style={{ fontSize: 11, color: C.txDim, marginTop: 4, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {t('chrono.tiempoTrabajadoHoy')}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', maxWidth: 400, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {t('chrono.jornadaLabel')}
            </span>
            <span className="mono" style={{ fontSize: 10, color: C.txDim }}>{pct}%</span>
          </div>
          <div className="tl-bar">
            <div
              className="tl-fill"
              style={{
                width: `${pct}%`,
                background: pct >= 100
                  ? `linear-gradient(90deg, ${C.green}, #34d399)`
                  : `linear-gradient(90deg, ${C.amber}, #fbbf24)`,
              }}
            />
          </div>
        </div>

        {/* Quick action buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            className="ch-btn ch-btn-ghost"
            disabled={!canStartLunch || acting}
            onClick={startLunch}
            style={{ opacity: canStartLunch ? 1 : 0.4 }}
          >
            {t('chrono.iniciarComida')}
          </button>
          <button
            className="ch-btn ch-btn-ghost"
            disabled={!isOpen || acting}
            onClick={() => setShowIncModal(true)}
            style={{ opacity: isOpen ? 1 : 0.4 }}
          >
            {t('chrono.anadirIncidencia')}
          </button>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: C.redDim,
            border: `1px solid rgba(239,68,68,0.3)`,
            borderRadius: 8,
            padding: '10px 16px',
            color: C.red,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* ── 4 stat cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {stats.map((s, i) => (
          <div
            key={i}
            className="ch-stat"
            style={{ '--accent': s.accent } as React.CSSProperties}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 18, color: s.accent }}>{s.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.08em', color: C.txMuted,
              }}>
                {s.label}
              </span>
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: C.tx }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Two columns: Alerts + Team ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Alerts */}
        <div className="ch-card">
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.08em', color: C.txMuted, marginBottom: 14,
          }}>
            {t('chrono.alertas')}
          </div>
          {alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: C.txMuted }}>—</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: a.color }}>{a.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team today */}
        <div className="ch-card">
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.08em', color: C.txMuted, marginBottom: 14,
          }}>
            {t('chrono.equipoHoy')}
          </div>
          {teamMembers.length === 0 ? (
            <div style={{ fontSize: 13, color: C.txMuted }}>{t('chrono.proximaVista')}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
              {teamMembers.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${C.amberDim}, #78350f)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: C.amber,
                    fontFamily: "'IBM Plex Mono', monospace",
                    position: 'relative',
                  }}>
                    {m.name.slice(0, 2).toUpperCase()}
                    <span style={{ position: 'absolute', bottom: -1, right: -1 }}>
                      <StatusDot status={m.status} />
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.tx }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: C.txDim }}>
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
