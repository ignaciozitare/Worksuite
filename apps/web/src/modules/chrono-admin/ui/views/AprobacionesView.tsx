// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { IAdminVacacionRepository } from '../../domain/ports/IAdminVacacionRepository';

const thStyle = {
  textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700,
  color: 'var(--tx3,#50506a)', textTransform: 'uppercase',
  letterSpacing: '.05em', borderBottom: '1px solid var(--bd,#2a2a38)',
};
const tdStyle = {
  padding: '10px 12px', fontSize: 13, color: 'var(--tx,#e4e4ef)',
  borderBottom: '1px solid var(--bd,#2a2a38)',
};
const btnApprove = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  borderRadius: 6, fontWeight: 600, fontSize: 11, cursor: 'pointer', border: 'none',
  fontFamily: 'inherit', background: 'rgba(34,197,94,.12)', color: '#22c55e',
  border: '1px solid rgba(34,197,94,.3)', transition: 'all .15s',
};
const btnReject = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  borderRadius: 6, fontWeight: 600, fontSize: 11, cursor: 'pointer', border: 'none',
  fontFamily: 'inherit', background: 'rgba(239,68,68,.12)', color: '#ef4444',
  border: '1px solid rgba(239,68,68,.3)', transition: 'all .15s',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function RejectModal({ onConfirm, onCancel, t }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!reason.trim()) { setError(t('chronoAdmin.razonRequerida')); return; }
    onConfirm(reason.trim());
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
    }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{
        background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
        borderRadius: 16, width: '100%', maxWidth: 400, padding: 20,
        boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
          {t('chronoAdmin.razonRechazo')}
        </h3>
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError(''); }}
          rows={3}
          style={{
            width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
            background: 'var(--sf2,#1b1b22)', border: '1px solid var(--bd,#2a2a38)',
            borderRadius: 8, color: 'var(--tx,#e4e4ef)', outline: 'none', resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '6px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13,
            cursor: 'pointer', border: '1px solid var(--bd,#2a2a38)',
            background: 'var(--sf2,#1b1b22)', color: 'var(--tx3,#50506a)', fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button onClick={handleConfirm} style={{
            padding: '6px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13,
            cursor: 'pointer', border: 'none', background: 'rgba(239,68,68,.12)',
            color: '#ef4444', border: '1px solid rgba(239,68,68,.3)', fontFamily: 'inherit',
          }}>
            {t('chronoAdmin.rechazar')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  fichajeRepo: IAdminFichajeRepository;
  vacacionRepo: IAdminVacacionRepository;
  currentUser: { id: string; role?: string };
}

export function AprobacionesView({ fichajeRepo, vacacionRepo, currentUser }: Props) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState('fichajes');
  const [fichajesPend, setFichajesPend] = useState([]);
  const [vacacionesPend, setVacacionesPend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null); // { type: 'fichaje'|'vacacion', id: string }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fp, vp] = await Promise.all([
        fichajeRepo.getPendientesAprobacion(),
        vacacionRepo.getPendientes(),
      ]);
      setFichajesPend(fp);
      setVacacionesPend(vp);
    } catch (err) {
      console.error('Error loading approvals:', err);
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo, vacacionRepo]);

  useEffect(() => { load(); }, [load]);

  const handleAproveFichaje = async (id) => {
    try {
      await fichajeRepo.aprobar(id, currentUser.id);
      setFichajesPend(prev => prev.filter(f => f.id !== id));
    } catch (err) { console.error(err); }
  };

  const handleApproveVacacion = async (id) => {
    try {
      await vacacionRepo.aprobar(id, currentUser.id);
      setVacacionesPend(prev => prev.filter(v => v.id !== id));
    } catch (err) { console.error(err); }
  };

  const handleReject = async (reason) => {
    if (!rejectTarget) return;
    try {
      if (rejectTarget.type === 'fichaje') {
        await fichajeRepo.rechazar(rejectTarget.id, currentUser.id, reason);
        setFichajesPend(prev => prev.filter(f => f.id !== rejectTarget.id));
      } else {
        await vacacionRepo.rechazar(rejectTarget.id, currentUser.id, reason);
        setVacacionesPend(prev => prev.filter(v => v.id !== rejectTarget.id));
      }
    } catch (err) { console.error(err); }
    setRejectTarget(null);
  };

  const subTabs = [
    { id: 'fichajes', label: t('chronoAdmin.fichajesPendientes'), count: fichajesPend.length },
    { id: 'vacaciones', label: t('chronoAdmin.vacacionesPendientes'), count: vacacionesPend.length },
  ];

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
        {t('chronoAdmin.aprobaciones')}
      </h3>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--sf2,#1b1b22)',
        border: '1px solid var(--bd,#2a2a38)', borderRadius: 8, padding: 3,
        marginBottom: 16, width: 'fit-content',
      }}>
        {subTabs.map(st => (
          <button
            key={st.id}
            onClick={() => setSubTab(st.id)}
            style={{
              padding: '4px 12px', fontSize: 12, borderRadius: 6,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: subTab === st.id ? 600 : 400,
              background: subTab === st.id ? 'var(--ac,#4f6ef7)' : 'transparent',
              color: subTab === st.id ? '#fff' : 'var(--tx3,#50506a)',
              boxShadow: subTab === st.id ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
              transition: 'all .15s',
            }}
          >
            {st.label} ({st.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3,#50506a)', fontSize: 13 }}>
          Loading...
        </div>
      ) : (
        <>
          {/* Fichajes pendientes */}
          {subTab === 'fichajes' && (
            fichajesPend.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3,#50506a)', fontSize: 13 }}>
                —
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>{t('chronoAdmin.empleado')}</th>
                      <th style={thStyle}>Fecha</th>
                      <th style={thStyle}>Entrada</th>
                      <th style={thStyle}>Comida</th>
                      <th style={thStyle}>Salida</th>
                      <th style={thStyle}>Justificacion</th>
                      <th style={thStyle}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fichajesPend.map(f => (
                      <tr key={f.id}>
                        <td style={tdStyle}>{f.userName}</td>
                        <td style={tdStyle}>{fmtDate(f.fecha)}</td>
                        <td style={tdStyle}>{fmtTime(f.entradaAt)}</td>
                        <td style={tdStyle}>
                          {fmtTime(f.comidaIniAt)} - {fmtTime(f.comidaFinAt)}
                        </td>
                        <td style={tdStyle}>{fmtTime(f.salidaAt)}</td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 12, color: 'var(--tx3,#50506a)' }}>
                            {f.justificacion || '—'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={btnApprove} onClick={() => handleAproveFichaje(f.id)}>
                              {t('chronoAdmin.aprobar')}
                            </button>
                            <button style={btnReject} onClick={() => setRejectTarget({ type: 'fichaje', id: f.id })}>
                              {t('chronoAdmin.rechazar')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Vacaciones pendientes */}
          {subTab === 'vacaciones' && (
            vacacionesPend.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3,#50506a)', fontSize: 13 }}>
                —
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>{t('chronoAdmin.empleado')}</th>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Desde</th>
                      <th style={thStyle}>Hasta</th>
                      <th style={thStyle}>Dias</th>
                      <th style={thStyle}>Motivo</th>
                      <th style={thStyle}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacacionesPend.map(v => (
                      <tr key={v.id}>
                        <td style={tdStyle}>{v.userName}</td>
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
                          <span style={{ fontSize: 12, color: 'var(--tx3,#50506a)' }}>
                            {v.motivo || '—'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={btnApprove} onClick={() => handleApproveVacacion(v.id)}>
                              {t('chronoAdmin.aprobar')}
                            </button>
                            <button style={btnReject} onClick={() => setRejectTarget({ type: 'vacacion', id: v.id })}>
                              {t('chronoAdmin.rechazar')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {rejectTarget && (
        <RejectModal
          t={t}
          onConfirm={handleReject}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  );
}
