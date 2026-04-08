// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';

const thStyle = {
  textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700,
  color: 'var(--tx3,#50506a)', textTransform: 'uppercase',
  letterSpacing: '.05em', borderBottom: '1px solid var(--bd,#2a2a38)',
};
const tdStyle = {
  padding: '10px 12px', fontSize: 13, color: 'var(--tx,#e4e4ef)',
  borderBottom: '1px solid var(--bd,#2a2a38)',
};
const inpStyle = (extra = {}) => ({
  padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
  borderRadius: 8, color: 'var(--tx,#e4e4ef)', outline: 'none', ...extra,
});
const lblStyle = {
  fontSize: 11, fontWeight: 700, color: 'var(--tx3,#50506a)',
  textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5,
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function fmtHours(minutos) {
  if (minutos == null) return '—';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

const ESTADO_COLORS = {
  abierto:              { bg: 'rgba(96,165,250,.12)', color: '#60a5fa' },
  completo:             { bg: 'rgba(34,197,94,.12)', color: '#22c55e' },
  incompleto:           { bg: 'rgba(251,146,60,.12)', color: '#fb923c' },
  pendiente_aprobacion: { bg: 'rgba(251,191,36,.12)', color: '#fbbf24' },
  aprobado:             { bg: 'rgba(34,197,94,.12)', color: '#22c55e' },
  rechazado:            { bg: 'rgba(239,68,68,.12)', color: '#ef4444' },
};

function getCurrentMonth() {
  const d = new Date();
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

      // Extract unique employees for filter dropdown
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

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
        {t('chronoAdmin.fichajesEquipo')}
      </h3>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={lblStyle}>Mes</label>
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            style={inpStyle({ width: 180 })}
          />
        </div>
        <div>
          <label style={lblStyle}>{t('chronoAdmin.empleado')}</label>
          <select
            value={filterUserId}
            onChange={e => setFilterUserId(e.target.value)}
            style={inpStyle({ width: 220 })}
          >
            <option value="">— Todos —</option>
            {employees.map(emp => (
              <option key={emp.userId} value={emp.userId}>{emp.userName}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3,#50506a)', fontSize: 13 }}>
          Loading...
        </div>
      ) : fichajes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3,#50506a)', fontSize: 13 }}>
          —
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={thStyle}>{t('chronoAdmin.empleado')}</th>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Entrada</th>
                <th style={thStyle}>Comida</th>
                <th style={thStyle}>Salida</th>
                <th style={thStyle}>Horas</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>{t('chronoAdmin.estadoPresencia')}</th>
              </tr>
            </thead>
            <tbody>
              {fichajes.map(f => {
                const ec = ESTADO_COLORS[f.estado] ?? ESTADO_COLORS.abierto;
                return (
                  <tr key={f.id}>
                    <td style={tdStyle}>{f.userName}</td>
                    <td style={tdStyle}>{fmtDate(f.fecha)}</td>
                    <td style={tdStyle}>{fmtTime(f.entradaAt)}</td>
                    <td style={tdStyle}>
                      {fmtTime(f.comidaIniAt)} - {fmtTime(f.comidaFinAt)}
                    </td>
                    <td style={tdStyle}>{fmtTime(f.salidaAt)}</td>
                    <td style={tdStyle}>{fmtHours(f.minutosTrabajados)}</td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                        fontSize: 11, fontWeight: 600,
                        background: 'rgba(96,165,250,.12)', color: '#60a5fa',
                      }}>
                        {f.tipo}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                        fontSize: 11, fontWeight: 600, background: ec.bg, color: ec.color,
                      }}>
                        {f.estado}
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
