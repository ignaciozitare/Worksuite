// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { EmpleadoResumen, EstadoPresencia } from '../../domain/entities/EmpleadoResumen';

const STATUS_COLORS: Record<EstadoPresencia, { bg: string; color: string }> = {
  oficina:     { bg: 'rgba(34,197,94,.12)',  color: '#22c55e' },
  teletrabajo: { bg: 'rgba(96,165,250,.12)', color: '#60a5fa' },
  vacaciones:  { bg: 'rgba(168,85,247,.12)', color: '#a855f7' },
  medico:      { bg: 'rgba(251,146,60,.12)', color: '#fb923c' },
  ausente:     { bg: 'rgba(239,68,68,.12)',  color: '#ef4444' },
  sin_fichar:  { bg: 'rgba(113,113,122,.12)', color: '#71717a' },
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
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtHours(minutos: number | null): string {
  if (minutos == null) return '—';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

const thStyle = {
  textAlign: 'left' as const, padding: '8px 12px', fontSize: 11, fontWeight: 700,
  color: 'var(--tx3,#50506a)', textTransform: 'uppercase' as const,
  letterSpacing: '.05em', borderBottom: '1px solid var(--bd,#2a2a38)',
};

const tdStyle = {
  padding: '10px 12px', fontSize: 13, color: 'var(--tx,#e4e4ef)',
  borderBottom: '1px solid var(--bd,#2a2a38)',
};

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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
          {t('chronoAdmin.equipoHoy')}
        </h3>
        <button
          onClick={load}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px',
            borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', border: 'none',
            fontFamily: 'inherit', background: 'var(--sf2,#1b1b22)', color: 'var(--tx3,#50506a)',
            border: '1px solid var(--bd,#2a2a38)', transition: 'all .15s',
          }}
        >
          ↻ Reload
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3,#50506a)', fontSize: 13 }}>
          {t('chronoAdmin.equipoHoy')}...
        </div>
      ) : equipo.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3,#50506a)', fontSize: 13 }}>
          —
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={thStyle}>{t('chronoAdmin.empleado')}</th>
                <th style={thStyle}>{t('chronoAdmin.estadoPresencia')}</th>
                <th style={thStyle}>Entrada</th>
                <th style={thStyle}>Horas hoy</th>
              </tr>
            </thead>
            <tbody>
              {equipo.map(emp => {
                const sc = STATUS_COLORS[emp.estadoHoy] ?? STATUS_COLORS.sin_fichar;
                return (
                  <tr key={emp.userId} style={{ transition: 'background .1s' }}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'var(--ac,#4f6ef7)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                        }}>
                          {emp.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)' }}>{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                        fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color,
                      }}>
                        {t(STATUS_I18N[emp.estadoHoy] ?? 'chronoAdmin.sinFicharLabel')}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {emp.fichajeHoyId ? fmtTime(emp.fichajeHoyId) : '—'}
                    </td>
                    <td style={tdStyle}>
                      {fmtHours(emp.minutosHoy)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
