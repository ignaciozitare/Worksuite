// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAdminFichajeRepository } from '../../domain/ports/IAdminFichajeRepository';
import type { IAdminVacacionRepository } from '../../domain/ports/IAdminVacacionRepository';

const C = {
  bg:'#0d0d0d', sf:'#161616', sfHover:'#1e1e1e', bd:'#2a2a2a',
  amber:'#f59e0b', amberDim:'#92400e', amberGlow:'rgba(245,158,11,0.12)',
  tx:'#e8e8e8', txDim:'#888', txMuted:'#555',
  green:'#10b981', greenDim:'rgba(16,185,129,0.15)',
  red:'#ef4444', redDim:'rgba(239,68,68,0.15)',
  purple:'#a855f7',
};

function fmtDate(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '--:--';
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
      justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)',
    }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="ch-card fade-in" style={{
        width: '100%', maxWidth: 420, padding: 24,
        boxShadow: '0 24px 80px rgba(0,0,0,.6)', borderRadius: 10,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {t('chronoAdmin.razonRechazo')}
        </div>
        <div style={{ fontSize: 12, color: C.txDim, marginBottom: 16 }}>
          {t('chronoAdmin.razonRechazoDesc')}
        </div>
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError(''); }}
          rows={3}
          placeholder={t('chronoAdmin.motivoPlaceholder')}
          style={{ width: '100%', resize: 'vertical' }}
        />
        {error && <div style={{ color: C.red, fontSize: 12, marginTop: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="ch-btn ch-btn-ghost" onClick={onCancel}>
            {t('chronoAdmin.cancelar')}
          </button>
          <button className="ch-btn ch-btn-red" onClick={handleConfirm}>
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
  const [rejectTarget, setRejectTarget] = useState(null);

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
    <div className="fade-in">
      {/* ── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('chronoAdmin.aprobaciones')}</div>
          <div style={{ fontSize: 12, color: C.txDim, marginTop: 2 }}>{t('chronoAdmin.aprobacionesDesc')}</div>
        </div>
        <button className="ch-btn ch-btn-ghost" onClick={load}>
          ↻ {t('chronoAdmin.recargar')}
        </button>
      </div>

      {/* ── Stat badges ─── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        <div className="ch-stat" style={{ flex: 1, '--accent': C.amber }}>
          <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            {t('chronoAdmin.fichajesPendientes')}
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.amber, marginTop: 6 }}>
            {fichajesPend.length}
          </div>
        </div>
        <div className="ch-stat" style={{ flex: 1, '--accent': C.purple }}>
          <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            {t('chronoAdmin.vacacionesPendientes')}
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.purple, marginTop: 6 }}>
            {vacacionesPend.length}
          </div>
        </div>
      </div>

      {/* ── Sub-tabs ─── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {subTabs.map(st => (
          <button
            key={st.id}
            onClick={() => setSubTab(st.id)}
            className={`nav-item ${subTab === st.id ? 'active' : ''}`}
            style={{ padding: '8px 16px', borderRadius: 6 }}
          >
            <span>{st.label}</span>
            <span className="ch-badge ch-badge-amber" style={{ fontSize: 10, padding: '2px 6px' }}>{st.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.txDim, fontSize: 13 }}>
          {t('chronoAdmin.cargando')}
        </div>
      ) : (
        <>
          {/* ── Fichajes pendientes ─── */}
          {subTab === 'fichajes' && (
            fichajesPend.length === 0 ? (
              <div className="ch-card" style={{ textAlign: 'center', padding: '40px 0', color: C.txDim }}>
                {t('chronoAdmin.sinPendientes')}
              </div>
            ) : (
              <div className="ch-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('chronoAdmin.empleado')}</th>
                      <th>{t('chronoAdmin.fecha')}</th>
                      <th>{t('chronoAdmin.entrada')}</th>
                      <th>{t('chronoAdmin.comida')}</th>
                      <th>{t('chronoAdmin.salida')}</th>
                      <th>{t('chronoAdmin.justificacion')}</th>
                      <th>{t('chronoAdmin.acciones')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fichajesPend.map(f => (
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
                        <td><span style={{ fontSize: 12, color: C.txDim }}>{f.justificacion || '--'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="ch-btn ch-btn-green" onClick={() => handleAproveFichaje(f.id)}>
                              {t('chronoAdmin.aprobar')}
                            </button>
                            <button className="ch-btn ch-btn-red" onClick={() => setRejectTarget({ type: 'fichaje', id: f.id })}>
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

          {/* ── Vacaciones pendientes ─── */}
          {subTab === 'vacaciones' && (
            vacacionesPend.length === 0 ? (
              <div className="ch-card" style={{ textAlign: 'center', padding: '40px 0', color: C.txDim }}>
                {t('chronoAdmin.sinPendientes')}
              </div>
            ) : (
              <div className="ch-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('chronoAdmin.empleado')}</th>
                      <th>{t('chronoAdmin.tipo')}</th>
                      <th>{t('chronoAdmin.desde')}</th>
                      <th>{t('chronoAdmin.hasta')}</th>
                      <th>{t('chronoAdmin.dias')}</th>
                      <th>{t('chronoAdmin.motivo')}</th>
                      <th>{t('chronoAdmin.acciones')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacacionesPend.map(v => (
                      <tr key={v.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: `linear-gradient(135deg,${C.amberDim},#78350f)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, color: C.amber, fontSize: 11, fontFamily: "'IBM Plex Mono',monospace",
                            }}>
                              {(v.userName || '?').charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600 }}>{v.userName}</span>
                          </div>
                        </td>
                        <td>
                          <span className="ch-badge" style={{ background: 'rgba(168,85,247,0.15)', color: C.purple }}>{v.tipo}</span>
                        </td>
                        <td><span className="mono" style={{ color: C.txDim }}>{fmtDate(v.fechaInicio)}</span></td>
                        <td><span className="mono" style={{ color: C.txDim }}>{fmtDate(v.fechaFin)}</span></td>
                        <td><span className="mono" style={{ fontWeight: 600, color: C.amber }}>{v.diasHabiles}</span></td>
                        <td><span style={{ fontSize: 12, color: C.txDim }}>{v.motivo || '--'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="ch-btn ch-btn-green" onClick={() => handleApproveVacacion(v.id)}>
                              {t('chronoAdmin.aprobar')}
                            </button>
                            <button className="ch-btn ch-btn-red" onClick={() => setRejectTarget({ type: 'vacacion', id: v.id })}>
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
        <RejectModal t={t} onConfirm={handleReject} onCancel={() => setRejectTarget(null)} />
      )}
    </div>
  );
}
