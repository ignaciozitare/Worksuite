// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { EmpleadoResumen } from '../../domain/entities/EmpleadoResumen';

const C = { amber:'#f59e0b', amberDim:'#92400e', amberGlow:'rgba(245,158,11,0.12)', tx:'#e8e8e8', txDim:'#888', txMuted:'#555', green:'#10b981', greenDim:'rgba(16,185,129,0.15)', red:'#ef4444', redDim:'rgba(239,68,68,0.15)', blue:'#3b82f6', blueDim:'rgba(59,130,246,0.15)', orange:'#f97316', purple:'#a855f7', sf:'#161616', sfHover:'#1e1e1e', bd:'#2a2a2a', bg:'#0d0d0d' };

const STAT_ICONS = ['👥', '⏱', '⚠️', '🏖'];

interface Props {
  fichajeRepo: IAdminFichajeRepository;
}

export function DashboardAdminView({ fichajeRepo }: Props) {
  const { t } = useTranslation();
  const [equipo, setEquipo] = useState<EmpleadoResumen[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fichajeRepo.getEquipoHoy();
      setEquipo(data);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo]);

  useEffect(() => { load(); }, [load]);

  /* ── Derived stats ─── */
  const totalEmpleados = equipo.length;
  const fichandoHoy = equipo.filter(e => e.estadoHoy !== 'sin_fichar' && e.estadoHoy !== 'vacaciones' && e.estadoHoy !== 'ausente').length;
  const incompletosPendientes = equipo.filter(e => e.fichajesIncompletos > 0).length;
  const vacacionesPendientes = equipo.filter(e => e.estadoHoy === 'vacaciones').length;

  const stats = [
    { icon: STAT_ICONS[0], label: t('chronoAdmin.totalEmpleados'), value: totalEmpleados, accent: C.amber },
    { icon: STAT_ICONS[1], label: t('chronoAdmin.fichandoHoy'), value: fichandoHoy, accent: C.green },
    { icon: STAT_ICONS[2], label: t('chronoAdmin.incompletosPendientes'), value: incompletosPendientes, accent: C.red },
    { icon: STAT_ICONS[3], label: t('chronoAdmin.vacacionesPendientes'), value: vacacionesPendientes, accent: C.purple },
  ];

  /* ── Alerts: employees with incomplete fichajes ─── */
  const alertas = equipo.filter(e => e.fichajesIncompletos > 0);

  return (
    <div className="fade-in">
      {/* ── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('chronoAdmin.dashboardTitle')}</div>
          <div style={{ fontSize: 12, color: C.txDim, marginTop: 2 }}>{t('chronoAdmin.dashboardSubtitle')}</div>
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
              <div key={s.label} className="ch-card" style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: s.accent }}>
                  {s.value}
                </div>
                <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── Alerts section ─── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{t('chronoAdmin.alertasTitle')}</div>
          </div>

          {alertas.length === 0 ? (
            <div className="ch-card" style={{ textAlign: 'center', padding: '32px 0', color: C.txDim, fontSize: 13 }}>
              {t('chronoAdmin.sinAlertas')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alertas.map(emp => (
                <div key={emp.userId} className="ch-card fade-in" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: C.redDim,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, color: C.red, fontFamily: "'IBM Plex Mono',monospace", fontSize: 14,
                  }}>
                    {emp.nombre.charAt(0).toUpperCase()}
                  </div>

                  {/* Name + email */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {emp.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: C.txDim }}>{emp.email}</div>
                  </div>

                  {/* Incomplete count */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="ch-badge" style={{ background: C.redDim, color: C.red, fontSize: 11, padding: '3px 8px' }}>
                      {emp.fichajesIncompletos} {t('chronoAdmin.incompletos')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
