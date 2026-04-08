// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IFichajeRepository } from '../../domain/ports/IFichajeRepository';
import type { IBolsaHorasRepository } from '../../domain/ports/IBolsaHorasRepository';
import type { Fichaje } from '../../domain/entities/Fichaje';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const JORNADA_MIN = 480; // 8 h in minutes

function minutesWorkedSoFar(f: Fichaje | null): number {
  if (!f?.entradaAt) return 0;
  const now = new Date();
  const entrada = new Date(f.entradaAt);
  let totalMs = now.getTime() - entrada.getTime();

  // Subtract completed lunch
  if (f.comidaIniAt && f.comidaFinAt) {
    totalMs -= new Date(f.comidaFinAt).getTime() - new Date(f.comidaIniAt).getTime();
  }
  // Subtract ongoing lunch
  else if (f.comidaIniAt && !f.comidaFinAt) {
    totalMs -= now.getTime() - new Date(f.comidaIniAt).getTime();
  }

  return Math.max(0, Math.round(totalMs / 60000));
}

function fmtHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/* ── Inline style helpers (matching existing app pattern) ─────────────── */

const cardStyle: React.CSSProperties = {
  background: 'var(--sf,#141418)',
  border: '1px solid var(--bd,#2a2a38)',
  borderRadius: 14,
  padding: 20,
};

const actionBtn = (
  variant: 'green' | 'red' | 'amber' | 'disabled',
  extra: React.CSSProperties = {},
): React.CSSProperties => {
  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 24px',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 'none',
    transition: 'all .15s',
    flex: 1,
    minWidth: 160,
  };
  if (variant === 'green')
    return { ...base, background: 'rgba(34,197,94,.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,.35)', ...extra };
  if (variant === 'red')
    return { ...base, background: 'rgba(239,68,68,.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,.35)', ...extra };
  if (variant === 'amber')
    return { ...base, background: 'rgba(245,158,11,.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.35)', ...extra };
  return { ...base, background: 'var(--sf2,#1b1b22)', color: 'var(--tx3,#50506a)', cursor: 'not-allowed', border: '1px solid var(--bd,#2a2a38)', ...extra };
};

const statLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const,
  letterSpacing: '.05em', color: 'var(--tx3,#50506a)', marginBottom: 4,
};

const statValue: React.CSSProperties = {
  fontSize: 26, fontWeight: 800, color: 'var(--tx,#e4e4ef)',
};

/* ── Component ────────────────────────────────────────────────────────────── */

interface DashboardViewProps {
  fichajeRepo: IFichajeRepository;
  bolsaRepo: IBolsaHorasRepository;
  currentUser: { id: string; [key: string]: unknown };
}

export function DashboardView({ fichajeRepo, bolsaRepo, currentUser }: DashboardViewProps) {
  const { t } = useTranslation();
  const [fichaje, setFichaje] = useState<Fichaje | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minutesNow, setMinutesNow] = useState(0);
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [incompletosCount, setIncompletosCount] = useState(0);
  const [saldoBolsa, setSaldoBolsa] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Load today's fichaje ──────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    try {
      const [hoy, incompletos, saldo] = await Promise.all([
        fichajeRepo.getFichajeHoy(currentUser.id),
        fichajeRepo.getFichajesIncompletos(currentUser.id),
        bolsaRepo.getSaldo(currentUser.id),
      ]);
      setFichaje(hoy);
      setIncompletosCount(incompletos.length);
      setSaldoBolsa(saldo.saldoNeto);
      if (hoy) setMinutesNow(minutesWorkedSoFar(hoy));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo, bolsaRepo, currentUser.id]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Load weekly summary ───────────────────────────────────────────────── */
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

  /* ── Live timer ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fichaje?.entradaAt && !fichaje.salidaAt) {
      timerRef.current = setInterval(() => {
        setMinutesNow(minutesWorkedSoFar(fichaje));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fichaje]);

  /* ── State derivations ──────────────────────────────────────────────────── */
  const isOpen = !!fichaje?.entradaAt && !fichaje.salidaAt;
  const isOnLunch = isOpen && !!fichaje?.comidaIniAt && !fichaje.comidaFinAt;
  const canClockIn = !fichaje || !!fichaje.salidaAt;
  const canStartLunch = isOpen && !fichaje.comidaIniAt && !isOnLunch;
  const canEndLunch = isOnLunch;
  const canClockOut = isOpen && !isOnLunch;
  const pct = Math.min(100, Math.round((minutesNow / JORNADA_MIN) * 100));

  /* ── Actions ────────────────────────────────────────────────────────────── */
  const act = async (fn: () => Promise<Fichaje>) => {
    setActing(true);
    setError(null);
    try {
      const updated = await fn();
      setFichaje(updated);
      setMinutesNow(minutesWorkedSoFar(updated));
    } catch {
      setError(t('chrono.errorAccion'));
    } finally {
      setActing(false);
    }
  };

  const clockIn = () => act(() => fichajeRepo.ficharEntrada(currentUser.id));
  const clockOut = () => act(() => fichajeRepo.ficharSalida(fichaje!.id));
  const startLunch = () => act(() => fichajeRepo.iniciarComida(fichaje!.id));
  const endLunch = () => act(() => fichajeRepo.finalizarComida(fichaje!.id));

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ color: 'var(--tx3,#50506a)', padding: 40, textAlign: 'center' }}>
        {t('chrono.cargando')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Incomplete alert banner */}
      {incompletosCount > 0 && (
        <div
          style={{
            background: 'rgba(245,158,11,.1)',
            border: '1px solid rgba(245,158,11,.3)',
            borderRadius: 12,
            padding: '12px 18px',
            color: '#f59e0b',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>!</span>
          {t('chrono.fichajePendiente')} ({incompletosCount})
        </div>
      )}

      {/* Status + timer card */}
      <div style={{ ...cardStyle, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Current status */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={statLabel}>
            {t('chrono.estado')}
          </div>
          <div style={{ ...statValue, color: isOpen ? '#22c55e' : 'var(--tx3,#50506a)', fontSize: 18 }}>
            {isOnLunch
              ? t('chrono.enComida')
              : isOpen
                ? t('chrono.jornadaActiva')
                : t('chrono.sinFichar')}
          </div>
          {fichaje?.entradaAt && (
            <div style={{ fontSize: 12, color: 'var(--tx3,#50506a)', marginTop: 4 }}>
              {t('chrono.entrada')}: {new Date(fichaje.entradaAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* Timer */}
        <div style={{ textAlign: 'center', minWidth: 160 }}>
          <div style={statLabel}>{t('chrono.tiempoTrabajado')}</div>
          <div style={{ ...statValue, fontSize: 36, fontVariantNumeric: 'tabular-nums' }}>
            {fmtHM(minutesNow)}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...statLabel, marginBottom: 8 }}>
            {t('chrono.progresoDia')} - {pct}%
          </div>
          <div
            style={{
              height: 10,
              background: 'var(--sf2,#1b1b22)',
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid var(--bd,#2a2a38)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: pct >= 100 ? '#22c55e' : 'var(--ac,#4f6ef7)',
                borderRadius: 6,
                transition: 'width .3s',
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx3,#50506a)', marginTop: 4 }}>
            {t('chrono.horasRestantes')}: {fmtHM(Math.max(0, JORNADA_MIN - minutesNow))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          disabled={!canClockIn || acting}
          onClick={clockIn}
          style={actionBtn(canClockIn ? 'green' : 'disabled')}
        >
          {t('chrono.ficharEntrada')}
        </button>
        <button
          disabled={!canStartLunch || acting}
          onClick={startLunch}
          style={actionBtn(canStartLunch ? 'amber' : 'disabled')}
        >
          {t('chrono.iniciarComida')}
        </button>
        <button
          disabled={!canEndLunch || acting}
          onClick={endLunch}
          style={actionBtn(canEndLunch ? 'amber' : 'disabled')}
        >
          {t('chrono.finComida')}
        </button>
        <button
          disabled={!canClockOut || acting}
          onClick={clockOut}
          style={actionBtn(canClockOut ? 'red' : 'disabled')}
        >
          {t('chrono.ficharSalida')}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,.1)',
            border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 10,
            padding: '10px 16px',
            color: '#ef4444',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Weekly summary + hours bank */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ ...cardStyle, flex: 1, minWidth: 220 }}>
          <div style={statLabel}>{t('chrono.resumenSemana')}</div>
          <div style={statValue}>{fmtHM(weekMinutes)}</div>
        </div>
        <div style={{ ...cardStyle, flex: 1, minWidth: 220 }}>
          <div style={statLabel}>{t('chrono.saldoBolsa')}</div>
          <div
            style={{
              ...statValue,
              color: saldoBolsa >= 0 ? '#22c55e' : '#ef4444',
            }}
          >
            {saldoBolsa >= 0 ? '+' : ''}{fmtHM(Math.abs(saldoBolsa))}
          </div>
        </div>
        <div style={{ ...cardStyle, flex: 1, minWidth: 220 }}>
          <div style={statLabel}>{t('chrono.incompletosCount')}</div>
          <div
            style={{
              ...statValue,
              color: incompletosCount > 0 ? '#f59e0b' : 'var(--tx,#e4e4ef)',
            }}
          >
            {incompletosCount}
          </div>
        </div>
      </div>
    </div>
  );
}
