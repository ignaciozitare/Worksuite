// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminVacacionRepository } from '../../domain/ports/IAdminVacacionRepository';

const lblStyle = {
  fontSize: 11, fontWeight: 700, color: 'var(--tx3,#50506a)',
  textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5,
};
const inpStyle = (extra = {}) => ({
  width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
  borderRadius: 8, color: 'var(--tx,#e4e4ef)', outline: 'none',
  boxSizing: 'border-box', ...extra,
});
const thStyle = {
  textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700,
  color: 'var(--tx3,#50506a)', textTransform: 'uppercase',
  letterSpacing: '.05em', borderBottom: '1px solid var(--bd,#2a2a38)',
};
const tdStyle = {
  padding: '10px 12px', fontSize: 13, color: 'var(--tx,#e4e4ef)',
  borderBottom: '1px solid var(--bd,#2a2a38)',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const ESTADO_COLORS = {
  pendiente: { bg: 'rgba(251,191,36,.12)', color: '#fbbf24' },
  aprobado:  { bg: 'rgba(34,197,94,.12)', color: '#22c55e' },
  rechazado: { bg: 'rgba(239,68,68,.12)', color: '#ef4444' },
  cancelado: { bg: 'rgba(113,113,122,.12)', color: '#71717a' },
};

interface Props {
  vacacionRepo: IAdminVacacionRepository;
}

export function GestionVacacionesView({ vacacionRepo }: Props) {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [saldo, setSaldo] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  // Adjustment forms
  const [diasExtra, setDiasExtra] = useState(0);
  const [diasMotivo, setDiasMotivo] = useState('');
  const [diasError, setDiasError] = useState('');

  const [horasMinutos, setHorasMinutos] = useState(0);
  const [horasMotivo, setHorasMotivo] = useState('');
  const [horasError, setHorasError] = useState('');

  // Load employees list (from all vacaciones to get unique users)
  useEffect(() => {
    (async () => {
      try {
        const all = await vacacionRepo.getTodas();
        const map = new Map();
        for (const v of all) {
          if (!map.has(v.userId)) {
            map.set(v.userId, { userId: v.userId, userName: v.userName });
          }
        }
        setEmployees([...map.values()]);
      } catch (err) { console.error(err); }
    })();
  }, [vacacionRepo]);

  const loadEmployee = useCallback(async (userId) => {
    if (!userId) { setSaldo(null); setHistory([]); return; }
    setLoadingSaldo(true);
    try {
      const anyo = new Date().getFullYear();
      const [s, h] = await Promise.all([
        vacacionRepo.getSaldoEmpleado(userId, anyo),
        vacacionRepo.getTodas({ userId }),
      ]);
      setSaldo(s);
      setHistory(h);
    } catch (err) { console.error(err); }
    setLoadingSaldo(false);
  }, [vacacionRepo]);

  useEffect(() => { loadEmployee(selectedUserId); }, [selectedUserId, loadEmployee]);

  const handleAjustarSaldo = async () => {
    if (!diasMotivo.trim()) { setDiasError(t('chronoAdmin.motivoRequerido')); return; }
    try {
      const anyo = new Date().getFullYear();
      await vacacionRepo.ajustarSaldo(selectedUserId, anyo, diasExtra, diasMotivo.trim());
      setDiasExtra(0);
      setDiasMotivo('');
      setDiasError('');
      loadEmployee(selectedUserId);
    } catch (err) { console.error(err); }
  };

  const handleAjustarBolsa = async () => {
    if (!horasMotivo.trim()) { setHorasError(t('chronoAdmin.motivoRequerido')); return; }
    try {
      await vacacionRepo.ajustarBolsaHoras(selectedUserId, horasMinutos, horasMotivo.trim());
      setHorasMinutos(0);
      setHorasMotivo('');
      setHorasError('');
      loadEmployee(selectedUserId);
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
        {t('chronoAdmin.gestionVacaciones')}
      </h3>

      {/* Employee selector */}
      <div style={{ marginBottom: 20, maxWidth: 400 }}>
        <label style={lblStyle}>{t('chronoAdmin.empleado')}</label>
        <select
          value={selectedUserId}
          onChange={e => setSelectedUserId(e.target.value)}
          style={inpStyle()}
        >
          <option value="">— {t('chronoAdmin.empleado')} —</option>
          {employees.map(emp => (
            <option key={emp.userId} value={emp.userId}>{emp.userName}</option>
          ))}
        </select>
      </div>

      {selectedUserId && (
        <>
          {/* Balance display */}
          {loadingSaldo ? (
            <div style={{ color: 'var(--tx3,#50506a)', fontSize: 13, marginBottom: 16 }}>Loading...</div>
          ) : saldo && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12, marginBottom: 24,
            }}>
              {[
                { label: 'Total', value: saldo.diasTotales },
                { label: 'Extra', value: saldo.diasExtra },
                { label: 'Disfrutados', value: saldo.diasDisfrutados },
                { label: 'Futuros', value: saldo.diasAprobadosFuturos },
                { label: 'Disponibles', value: saldo.diasDisponibles },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tx,#e4e4ef)', marginTop: 4 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Adjustment forms */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Adjust vacation days */}
            <div style={{
              background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
              borderRadius: 12, padding: 16,
            }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
                {t('chronoAdmin.ajustarSaldo')}
              </h4>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>{t('chronoAdmin.diasExtraLabel')}</label>
                <input
                  type="number"
                  value={diasExtra}
                  onChange={e => setDiasExtra(Number(e.target.value))}
                  style={inpStyle()}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>{t('chronoAdmin.motivoAjuste')}</label>
                <input
                  type="text"
                  value={diasMotivo}
                  onChange={e => { setDiasMotivo(e.target.value); setDiasError(''); }}
                  style={inpStyle()}
                />
                {diasError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{diasError}</div>}
              </div>
              <button
                onClick={handleAjustarSaldo}
                disabled={!diasExtra}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                  cursor: diasExtra ? 'pointer' : 'not-allowed', border: 'none',
                  fontFamily: 'inherit', background: 'var(--ac,#4f6ef7)', color: '#fff',
                  opacity: diasExtra ? 1 : 0.5, transition: 'all .15s',
                }}
              >
                {t('chronoAdmin.ajustarSaldo')}
              </button>
            </div>

            {/* Adjust hours bank */}
            <div style={{
              background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
              borderRadius: 12, padding: 16,
            }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
                {t('chronoAdmin.ajustarBolsa')}
              </h4>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>{t('chronoAdmin.minutosLabel')}</label>
                <input
                  type="number"
                  value={horasMinutos}
                  onChange={e => setHorasMinutos(Number(e.target.value))}
                  style={inpStyle()}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>{t('chronoAdmin.motivoAjuste')}</label>
                <input
                  type="text"
                  value={horasMotivo}
                  onChange={e => { setHorasMotivo(e.target.value); setHorasError(''); }}
                  style={inpStyle()}
                />
                {horasError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{horasError}</div>}
              </div>
              <button
                onClick={handleAjustarBolsa}
                disabled={!horasMinutos}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                  cursor: horasMinutos ? 'pointer' : 'not-allowed', border: 'none',
                  fontFamily: 'inherit', background: 'var(--ac,#4f6ef7)', color: '#fff',
                  opacity: horasMinutos ? 1 : 0.5, transition: 'all .15s',
                }}
              >
                {t('chronoAdmin.ajustarBolsa')}
              </button>
            </div>
          </div>

          {/* History table */}
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
            Historial
          </h4>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--tx3,#50506a)', fontSize: 13 }}>
              —
            </div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tipo</th>
                    <th style={thStyle}>Desde</th>
                    <th style={thStyle}>Hasta</th>
                    <th style={thStyle}>Dias</th>
                    <th style={thStyle}>{t('chronoAdmin.estadoPresencia')}</th>
                    <th style={thStyle}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(v => {
                    const ec = ESTADO_COLORS[v.estado] ?? ESTADO_COLORS.pendiente;
                    return (
                      <tr key={v.id}>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                            fontSize: 11, fontWeight: 600,
                            background: 'rgba(168,85,247,.12)', color: '#a855f7',
                          }}>
                            {v.tipo}
                          </span>
                        </td>
                        <td style={tdStyle}>{fmtDate(v.fechaInicio)}</td>
                        <td style={tdStyle}>{fmtDate(v.fechaFin)}</td>
                        <td style={tdStyle}>{v.diasHabiles}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                            fontSize: 11, fontWeight: 600, background: ec.bg, color: ec.color,
                          }}>
                            {v.estado}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 12, color: 'var(--tx3,#50506a)' }}>
                            {v.motivo || '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
