// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { EmpleadoResumen, EstadoPresencia } from '../../domain/entities/EmpleadoResumen';

const C = {
  amber:'#f59e0b', amberDim:'#92400e', amberGlow:'rgba(245,158,11,0.12)',
  tx:'#e8e8e8', txDim:'#888', txMuted:'#555',
  green:'#10b981', red:'#ef4444', blue:'#3b82f6', purple:'#a855f7', orange:'#f97316',
  sf:'#161616', bd:'#2a2a2a',
};

const STATUS_DOT: Record<EstadoPresencia, string> = {
  oficina: C.green, teletrabajo: C.blue, vacaciones: C.purple,
  medico: C.orange, ausente: C.red, sin_fichar: C.txMuted,
};

const STATUS_BADGE: Record<EstadoPresencia, { bg: string; color: string }> = {
  oficina:     { bg: 'rgba(16,185,129,0.15)', color: C.green },
  teletrabajo: { bg: 'rgba(59,130,246,0.15)', color: C.blue },
  vacaciones:  { bg: 'rgba(168,85,247,0.15)', color: C.purple },
  medico:      { bg: 'rgba(249,115,22,0.15)', color: C.orange },
  ausente:     { bg: 'rgba(239,68,68,0.15)',  color: C.red },
  sin_fichar:  { bg: '#1e1e1e',               color: C.txMuted },
};

const STATUS_I18N: Record<EstadoPresencia, string> = {
  oficina:     'chronoAdmin.oficina',
  teletrabajo: 'chronoAdmin.teletrabajoLabel',
  vacaciones:  'chronoAdmin.vacacionesLabel',
  medico:      'chronoAdmin.medicoLabel',
  ausente:     'chronoAdmin.ausente',
  sin_fichar:  'chronoAdmin.sinFicharLabel',
};

function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtHours(minutos: number | null): string {
  if (minutos == null) return '0h 00m';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

interface Props {
  fichajeRepo: IAdminFichajeRepository;
}

export function EquipoHoyView({ fichajeRepo }: Props) {
  const { t } = useTranslation();
  const [equipo, setEquipo] = useState<EmpleadoResumen[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fichajeRepo.getEquipoHoy();
      setEquipo(data);
    } catch (err) {
      console.error('Error loading team today:', err);
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo]);

  useEffect(() => { load(); }, [load]);

  /* ── Stat counters ─── */
  const countByStatus = (s: EstadoPresencia) => equipo.filter(e => e.estadoHoy === s).length;
  const stats = [
    { label: t('chronoAdmin.totalEquipo'),  value: equipo.length, accent: C.amber },
    { label: t('chronoAdmin.oficina'),       value: countByStatus('oficina'), accent: C.green },
    { label: t('chronoAdmin.teletrabajoLabel'), value: countByStatus('teletrabajo'), accent: C.blue },
    { label: t('chronoAdmin.sinFicharLabel'), value: countByStatus('sin_fichar'), accent: C.red },
  ];

  return (
    <div className="fade-in">
      {/* ── Title + reload ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('chronoAdmin.equipoHoy')}</div>
          <div style={{ fontSize: 12, color: C.txDim, marginTop: 2 }}>{t('chronoAdmin.resumenEquipo')}</div>
        </div>
        <button className="ch-btn ch-btn-ghost" onClick={load}>
          ↻ {t('chronoAdmin.recargar')}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.txDim, fontSize: 13 }}>
          {t('chronoAdmin.cargando')}
        </div>
      ) : (
        <>
          {/* ── Stat cards ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
            {stats.map(s => (
              <div key={s.label} className="ch-stat" style={{ '--accent': s.accent }}>
                <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  {s.label}
                </div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: s.accent, marginTop: 6 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* ── Team grid ─── */}
          {equipo.length === 0 ? (
            <div className="ch-card" style={{ textAlign: 'center', padding: '40px 0', color: C.txDim }}>
              {t('chronoAdmin.sinDatos')}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {equipo.map(emp => {
                const dotColor = STATUS_DOT[emp.estadoHoy] ?? C.txMuted;
                const badge = STATUS_BADGE[emp.estadoHoy] ?? STATUS_BADGE.sin_fichar;
                return (
                  <div key={emp.userId} className="ch-card fade-in" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Avatar + status dot */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: `linear-gradient(135deg,${C.amberDim},#78350f)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, color: C.amber, fontFamily: "'IBM Plex Mono',monospace", fontSize: 15,
                      }}>
                        {emp.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
                        borderRadius: '50%', background: dotColor, border: `2px solid ${C.sf}`,
                      }} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp.nombre}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span className="ch-badge" style={{ background: badge.bg, color: badge.color, fontSize: 10, padding: '2px 6px' }}>
                          {t(STATUS_I18N[emp.estadoHoy] ?? 'chronoAdmin.sinFicharLabel')}
                        </span>
                      </div>
                    </div>

                    {/* Hours */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: C.amber }}>
                        {fmtHours(emp.minutosHoy)}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: C.txMuted, marginTop: 2 }}>
                        {emp.minutosHoy != null ? t('chronoAdmin.entrada') : '--:--'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
