// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { CHRONO_COLORS as C } from '../ChronoPage';
import type { IFichajeRepository } from '../../domain/ports/IFichajeRepository';
import type { Fichaje, ResumenMes } from '../../domain/entities/Fichaje';

interface RegistrosViewProps {
  fichajeRepo: IFichajeRepository;
  currentUser: { id: string };
}

const DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function RegistrosView({ fichajeRepo, currentUser }: RegistrosViewProps) {
  const { t } = useTranslation();
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [resumen, setResumen] = useState<ResumenMes | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        fichajeRepo.getFichajesMes(currentUser.id, mes),
        fichajeRepo.getResumenMes(currentUser.id, mes),
      ]);
      setFichajes(f);
      setResumen(r);
    } catch (e) {
      console.error('RegistrosView load error:', e);
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo, currentUser.id, mes]);

  useEffect(() => { loadData(); }, [loadData]);

  const cambiarMes = useCallback((dir: -1 | 1) => {
    setMes(prev => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const mesLabel = useMemo(() => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
  }, [mes]);

  const fmtTime = (v: string | null) => {
    if (!v) return '—';
    const d = new Date(v);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const fmtHours = (mins: number | null) => {
    if (mins == null) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
  };

  const fmtDate = (fecha: string) => {
    const d = new Date(fecha + 'T00:00:00');
    const day = DAY_ABBR[d.getDay()];
    const num = d.getDate();
    const month = d.toLocaleDateString('es-ES', { month: 'short' });
    return { day, full: `${num} ${month}` };
  };

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case 'completo':
      case 'aprobado':
        return 'ch-badge ch-badge-green';
      case 'incompleto':
      case 'rechazado':
        return 'ch-badge ch-badge-red';
      case 'abierto':
      case 'pendiente_aprobacion':
        return 'ch-badge ch-badge-amber';
      default:
        return 'ch-badge ch-badge-muted';
    }
  };

  const tipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'teletrabajo': return 'ch-badge ch-badge-blue';
      case 'medico': return 'ch-badge ch-badge-red';
      case 'formacion': return 'ch-badge ch-badge-amber';
      default: return 'ch-badge ch-badge-muted';
    }
  };

  const stats = resumen ? [
    { label: t('chrono.diasTrabajados'), value: resumen.diasTrabajados, color: C.amber },
    { label: t('chrono.horasTotales'), value: fmtHours(resumen.minutosTotales), color: C.amber },
    { label: t('chrono.horasExtra'), value: fmtHours(resumen.minutosExtra), color: C.amber },
    { label: t('chrono.incidenciasCount'), value: resumen.incidencias, color: C.orange },
    { label: t('chrono.incompletosCount'), value: resumen.incompletos, color: C.red },
  ] : [];

  return (
    <div className="fade-in">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: C.tx, marginBottom: 2 }}>
            {t('chrono.registroFichajes')}
          </div>
          <div className="mono" style={{ fontSize: 'var(--fs-xs)', color: C.txDim, textTransform: 'capitalize' }}>
            {mesLabel}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="ch-btn ch-btn-ghost" onClick={() => cambiarMes(-1)} title={t('chrono.mesAnterior')}>
            &#8249;
          </button>
          <button className="ch-btn ch-btn-ghost" onClick={() => cambiarMes(1)} title={t('chrono.mesSiguiente')}>
            &#8250;
          </button>
          <button className="ch-btn ch-btn-amber" style={{ marginLeft: 8 }}>
            ⬇ {t('chrono.exportarPdf')}
          </button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      {resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          {stats.map((s, i) => (
            <div key={i} className="ch-stat" style={{ '--accent': s.color } as React.CSSProperties}>
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, marginBottom: 8 }}>
                {s.label}
              </div>
              <div className="mono" style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: C.txMuted }}>{t('chrono.cargando')}</div>
      ) : fichajes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: C.txMuted }}>{t('chrono.sinRegistros')}</div>
      ) : (
        <div className="ch-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
          <table>
            <thead>
              <tr>
                <th>{t('chrono.fecha')}</th>
                <th>{t('chrono.entrada')}</th>
                <th>{t('chrono.comidaIni')}</th>
                <th>{t('chrono.comidaFin')}</th>
                <th>{t('chrono.salida')}</th>
                <th>{t('chrono.horas')}</th>
                <th>{t('chrono.tipo')}</th>
                <th>{t('chrono.estado')}</th>
              </tr>
            </thead>
            <tbody>
              {fichajes.map(f => {
                const { day, full } = fmtDate(f.fecha);
                return (
                  <tr key={f.id}>
                    <td>
                      <span className="mono" style={{ color: C.amber, fontWeight: 600, marginRight: 6 }}>{day}</span>
                      <span style={{ color: C.txDim }}>{full}</span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: f.entradaAt ? C.tx : C.txMuted }}>
                        {fmtTime(f.entradaAt)}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: f.comidaIniAt ? C.tx : C.txMuted }}>
                        {fmtTime(f.comidaIniAt)}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: f.comidaFinAt ? C.tx : C.txMuted }}>
                        {fmtTime(f.comidaFinAt)}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: f.salidaAt ? C.tx : C.txMuted }}>
                        {fmtTime(f.salidaAt)}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: C.amber, fontWeight: 700, fontSize: 'var(--fs-sm)' }}>
                        {fmtHours(f.minutosTrabajados)}
                      </span>
                    </td>
                    <td>
                      <span className={tipoBadge(f.tipo)}>
                        {t(`chrono.${f.tipo}` as any)}
                      </span>
                    </td>
                    <td>
                      <span className={estadoBadge(f.estado)}>
                        {t(`chrono.${f.estado}` as any)}
                      </span>
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
