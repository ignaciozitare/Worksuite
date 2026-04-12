// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';

import { CHRONO_ADMIN_COLORS as C } from '../../shared/adminColors';

const ESTADO_BADGE = {
  abierto:              { bg: 'rgba(59,130,246,0.15)',  color: C.blue },
  completo:             { bg: 'rgba(16,185,129,0.15)',  color: C.green },
  incompleto:           { bg: 'rgba(249,115,22,0.15)',  color: C.orange },
  pendiente_aprobacion: { bg: C.amberGlow,              color: C.amber },
  aprobado:             { bg: 'rgba(16,185,129,0.15)',  color: C.green },
  rechazado:            { bg: 'rgba(239,68,68,0.15)',   color: C.red },
};

function fmtDate(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtHours(minutos) {
  if (minutos == null) return '0h 00m';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1);
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Props {
  fichajeRepo: IAdminFichajeRepository;
}

export function FichajesEquipoView({ fichajeRepo }: Props) {
  const { t } = useTranslation();
  const [mes, setMes] = useState(getCurrentMonth());
  const [filterUserId, setFilterUserId] = useState('');
  const [fichajes, setFichajes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fichajeRepo.getFichajesEquipo(mes, filterUserId || undefined);
      setFichajes(data);
      const map = new Map();
      for (const f of data) {
        if (!map.has(f.userId)) {
          map.set(f.userId, { userId: f.userId, userName: f.userName });
        }
      }
      if (!filterUserId) setEmployees([...map.values()]);
    } catch (err) {
      console.error('Error loading team records:', err);
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo, mes, filterUserId]);

  useEffect(() => { load(); }, [load]);

  /* ── Stats ─── */
  const totalHoras = fichajes.reduce((s, f) => s + (f.minutosTrabajados || 0), 0);
  const totalRegistros = fichajes.length;

  return (
    <div className="fade-in">
      {/* ── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('chronoAdmin.fichajesEquipo')}</div>
          <div style={{ fontSize: 12, color: C.txDim, marginTop: 2 }}>{t('chronoAdmin.fichajesEquipoDesc')}</div>
        </div>
      </div>

      {/* ── Month navigation ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <button className="ch-btn ch-btn-ghost" onClick={() => setMes(shiftMonth(mes, -1))}>
          ← {t('chronoAdmin.mesAnterior')}
        </button>
        <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: C.amber, letterSpacing: '.02em', textTransform: 'capitalize' }}>
          {getMonthLabel(mes)}
        </div>
        <button className="ch-btn ch-btn-ghost" onClick={() => setMes(shiftMonth(mes, 1))}>
          {t('chronoAdmin.mesSiguiente')} →
        </button>

        {/* Employee filter */}
        <div style={{ marginLeft: 'auto' }}>
          <select value={filterUserId} onChange={e => setFilterUserId(e.target.value)} style={{ width: 220 }}>
            <option value="">— {t('chronoAdmin.todos')} —</option>
            {employees.map(emp => (
              <option key={emp.userId} value={emp.userId}>{emp.userName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Stat cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
        <div className="ch-stat" style={{ '--accent': C.amber }}>
          <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            {t('chronoAdmin.totalRegistros')}
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.amber, marginTop: 6 }}>{totalRegistros}</div>
        </div>
        <div className="ch-stat" style={{ '--accent': C.green }}>
          <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            {t('chronoAdmin.horasTotales')}
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.green, marginTop: 6 }}>{fmtHours(totalHoras)}</div>
        </div>
        <div className="ch-stat" style={{ '--accent': C.blue }}>
          <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            {t('chronoAdmin.empleadosActivos')}
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.blue, marginTop: 6 }}>{employees.length}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.txDim, fontSize: 13 }}>
          {t('chronoAdmin.cargando')}
        </div>
      ) : fichajes.length === 0 ? (
        <div className="ch-card" style={{ textAlign: 'center', padding: '40px 0', color: C.txDim }}>
          {t('chronoAdmin.sinDatos')}
        </div>
      ) : (
        <div className="ch-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
          <table>
            <thead>
              <tr>
                <th>{t('chronoAdmin.empleado')}</th>
                <th>{t('chronoAdmin.fecha')}</th>
                <th>{t('chronoAdmin.entrada')}</th>
                <th>{t('chronoAdmin.comida')}</th>
                <th>{t('chronoAdmin.salida')}</th>
                <th>{t('chronoAdmin.horas')}</th>
                <th>{t('chronoAdmin.tipo')}</th>
                <th>{t('chronoAdmin.estado')}</th>
              </tr>
            </thead>
            <tbody>
              {fichajes.map(f => {
                const ec = ESTADO_BADGE[f.estado] ?? ESTADO_BADGE.abierto;
                return (
                  <tr key={f.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: `linear-gradient(135deg,${C.amberDim},#78350f)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, color: C.amber, fontSize: 11, fontFamily: "'IBM Plex Mono',monospace",
                        }}>
                          {(f.userName || '?').charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600 }}>{f.userName}</span>
                      </div>
                    </td>
                    <td><span className="mono" style={{ color: C.txDim }}>{fmtDate(f.fecha)}</span></td>
                    <td><span className="mono">{fmtTime(f.entradaAt)}</span></td>
                    <td><span className="mono" style={{ color: C.txDim }}>{fmtTime(f.comidaIniAt)} - {fmtTime(f.comidaFinAt)}</span></td>
                    <td><span className="mono">{fmtTime(f.salidaAt)}</span></td>
                    <td><span className="mono" style={{ fontWeight: 600, color: C.amber }}>{fmtHours(f.minutosTrabajados)}</span></td>
                    <td>
                      <span className="ch-badge ch-badge-blue">{f.tipo}</span>
                    </td>
                    <td>
                      <span className="ch-badge" style={{ background: ec.bg, color: ec.color }}>{f.estado}</span>
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
