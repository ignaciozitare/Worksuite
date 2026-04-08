// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IFichajeRepository } from '../../domain/ports/IFichajeRepository';
import type { Fichaje, ResumenMes } from '../../domain/entities/Fichaje';

interface RegistrosViewProps {
  fichajeRepo: IFichajeRepository;
  currentUser: { id: string };
}

const TIPO_COLORS: Record<string, string> = {
  normal: 'var(--ac, #4f6ef7)',
  teletrabajo: '#8b5cf6',
  medico: '#ef4444',
  formacion: '#f59e0b',
  viaje: '#06b6d4',
  asunto_propio: '#ec4899',
};

const ESTADO_COLORS: Record<string, string> = {
  abierto: '#f59e0b',
  completo: '#22c55e',
  incompleto: '#ef4444',
  pendiente_aprobacion: '#a78bfa',
  aprobado: '#22c55e',
  rechazado: '#ef4444',
};

export function RegistrosView({ fichajeRepo, currentUser }: RegistrosViewProps) {
  const { t } = useTranslation();
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [resumen, setResumen] = useState<ResumenMes | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
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

  /* ── Styles ─────────────────────────────────────────────────────────────────── */
  const card: React.CSSProperties = {
    background: 'var(--sf2, #1b1b22)', borderRadius: 12,
    border: '1px solid var(--bd, #2a2a38)', padding: 16, marginBottom: 16,
  };
  const badge = (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11,
    fontWeight: 600, background: `${color}22`, color, whiteSpace: 'nowrap',
  });
  const statBox: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 14px', borderRadius: 8, background: 'var(--sf, #14141b)',
    border: '1px solid var(--bd, #2a2a38)', minWidth: 80,
  };
  const navBtn: React.CSSProperties = {
    background: 'var(--sf2, #1b1b22)', color: 'var(--tx, #e2e2e8)',
    border: '1px solid var(--bd, #2a2a38)', borderRadius: 8,
    padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
  };

  return (
    <div>
      {/* ── Month selector ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button style={navBtn} onClick={() => cambiarMes(-1)} title={t('chrono.mesAnterior')}>&#8249;</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx, #e2e2e8)', textTransform: 'capitalize' }}>
          {mesLabel}
        </span>
        <button style={navBtn} onClick={() => cambiarMes(1)} title={t('chrono.mesSiguiente')}>&#8250;</button>
      </div>

      {/* ── Summary ────────────────────────────────────────────────────────── */}
      {resumen && (
        <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.diasTrabajados')}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ac, #4f6ef7)' }}>{resumen.diasTrabajados}</span>
          </div>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.horasTotales')}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx, #e2e2e8)' }}>{fmtHours(resumen.minutosTotales)}</span>
          </div>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.horasExtra')}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: resumen.minutosExtra > 0 ? '#f59e0b' : 'var(--tx, #e2e2e8)' }}>
              {fmtHours(resumen.minutosExtra)}
            </span>
          </div>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.incidenciasCount')}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: resumen.incidencias > 0 ? '#ef4444' : 'var(--tx, #e2e2e8)' }}>
              {resumen.incidencias}
            </span>
          </div>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.incompletosCount')}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: resumen.incompletos > 0 ? '#ef4444' : 'var(--tx, #e2e2e8)' }}>
              {resumen.incompletos}
            </span>
          </div>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--tx3, #50506a)' }}>{t('chrono.cargando')}</div>
      ) : fichajes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--tx3, #50506a)' }}>{t('chrono.sinRegistros')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bd, #2a2a38)' }}>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{t('chrono.fecha')}</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{t('chrono.entrada')}</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{t('chrono.comidaIni')}</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{t('chrono.comidaFin')}</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{t('chrono.salida')}</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{t('chrono.horas')}</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{t('chrono.tipo')}</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{t('chrono.estado')}</th>
              </tr>
            </thead>
            <tbody>
              {fichajes.map(f => {
                const isIncomplete = f.estado === 'incompleto';
                const isSelected = selectedId === f.id;
                return (
                  <tr
                    key={f.id}
                    onClick={() => isIncomplete && setSelectedId(isSelected ? null : f.id)}
                    style={{
                      borderBottom: '1px solid var(--bd, #2a2a38)',
                      cursor: isIncomplete ? 'pointer' : 'default',
                      background: isSelected ? 'rgba(239,68,68,.08)' : 'transparent',
                      transition: 'background .15s',
                    }}
                  >
                    <td style={{ padding: '8px 6px', color: 'var(--tx, #e2e2e8)', fontFamily: 'var(--mono)', fontSize: 12 }}>{f.fecha}</td>
                    <td style={{ padding: '8px 6px', color: f.entradaAt ? 'var(--tx, #e2e2e8)' : 'var(--tx3, #50506a)' }}>{fmtTime(f.entradaAt)}</td>
                    <td style={{ padding: '8px 6px', color: f.comidaIniAt ? 'var(--tx, #e2e2e8)' : 'var(--tx3, #50506a)' }}>{fmtTime(f.comidaIniAt)}</td>
                    <td style={{ padding: '8px 6px', color: f.comidaFinAt ? 'var(--tx, #e2e2e8)' : 'var(--tx3, #50506a)' }}>{fmtTime(f.comidaFinAt)}</td>
                    <td style={{ padding: '8px 6px', color: f.salidaAt ? 'var(--tx, #e2e2e8)' : 'var(--tx3, #50506a)' }}>{fmtTime(f.salidaAt)}</td>
                    <td style={{ padding: '8px 6px', color: 'var(--tx, #e2e2e8)', fontWeight: 600 }}>{fmtHours(f.minutosTrabajados)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={badge(TIPO_COLORS[f.tipo] || 'var(--ac, #4f6ef7)')}>
                        {t(`chrono.${f.tipo}` as any)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={badge(ESTADO_COLORS[f.estado] || 'var(--tx3, #50506a)')}>
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
