// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import { CHRONO_COLORS as C } from '../ChronoPage';
import { DateRangePicker } from '@worksuite/ui';
import type { IVacacionRepository } from '../../domain/ports/IVacacionRepository';
import type { Vacacion, SaldoVacaciones, TipoVacacion } from '../../domain/entities/Vacacion';

interface VacacionesViewProps {
  vacacionRepo: IVacacionRepository;
  currentUser: { id: string };
}

const TIPO_OPTIONS: TipoVacacion[] = ['vacaciones', 'asunto_propio', 'baja_medica', 'maternidad', 'paternidad'];

const TIPO_LABELS: Record<TipoVacacion, string> = {
  vacaciones: 'chrono.vacacionesTipo',
  asunto_propio: 'chrono.asuntoPropio',
  baja_medica: 'chrono.bajaMedica',
  maternidad: 'chrono.maternidad',
  paternidad: 'chrono.paternidad',
};

const ESTADO_BADGE: Record<string, string> = {
  pendiente: 'ch-badge ch-badge-amber',
  aprobado: 'ch-badge ch-badge-green',
  rechazado: 'ch-badge ch-badge-red',
  cancelado: 'ch-badge ch-badge-muted',
};


export function VacacionesView({ vacacionRepo, currentUser }: VacacionesViewProps) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const currentYear = new Date().getFullYear();

  const [vacaciones, setVacaciones] = useState<Vacacion[]>([]);
  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<'solicitudes' | 'equipo'>('solicitudes');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Form state
  const [tipo, setTipo] = useState<TipoVacacion>('vacaciones');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [diasHabiles, setDiasHabiles] = useState(0);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [v, s] = await Promise.all([
        vacacionRepo.getVacaciones(currentUser.id),
        vacacionRepo.getSaldo(currentUser.id, currentYear),
      ]);
      setVacaciones(v);
      setSaldo(s);
    } catch (e) {
      console.error('VacacionesView load error:', e);
    } finally {
      setLoading(false);
    }
  }, [vacacionRepo, currentUser.id, currentYear]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-calculate working days (exclude weekends)
  useEffect(() => {
    if (!fechaInicio || !fechaFin) { setDiasHabiles(0); return; }
    const start = new Date(fechaInicio);
    const end = new Date(fechaFin);
    if (end < start) { setDiasHabiles(0); return; }
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    setDiasHabiles(count);
  }, [fechaInicio, fechaFin]);

  const resetForm = useCallback(() => {
    setTipo('vacaciones');
    setFechaInicio('');
    setFechaFin('');
    setDiasHabiles(0);
    setMotivo('');
    setShowForm(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    setMessage(null);
    if (!fechaInicio) { setMessage({ type: 'err', text: t('chrono.fechaInicioReq') }); return; }
    if (!fechaFin) { setMessage({ type: 'err', text: t('chrono.fechaFinReq') }); return; }
    if (new Date(fechaFin) < new Date(fechaInicio)) { setMessage({ type: 'err', text: t('chrono.fechaFinAnterior') }); return; }
    if (saldo && diasHabiles > saldo.diasDisponibles && tipo === 'vacaciones') {
      setMessage({ type: 'err', text: t('chrono.saldoInsuficiente') }); return;
    }
    setSubmitting(true);
    try {
      await vacacionRepo.solicitar({
        userId: currentUser.id,
        tipo,
        fechaInicio,
        fechaFin,
        diasHabiles,
        motivo: motivo || null,
      });
      setMessage({ type: 'ok', text: t('chrono.vacacionCreada') });
      resetForm();
      await loadData();
    } catch (e) {
      console.error('VacacionesView submit error:', e);
      setMessage({ type: 'err', text: t('chrono.errorEnvio') });
    } finally {
      setSubmitting(false);
    }
  }, [vacacionRepo, currentUser.id, tipo, fechaInicio, fechaFin, diasHabiles, motivo, saldo, resetForm, loadData, t]);

  const handleCancel = useCallback(async (vacacionId: string) => {
    if (!(await dialog.confirm(t('chrono.confirmarCancelar'), { danger: true }))) return;
    try {
      await vacacionRepo.cancelar(vacacionId);
      await loadData();
    } catch (e) {
      console.error('VacacionesView cancel error:', e);
    }
  }, [vacacionRepo, loadData, t]);

  /* ── Distribution bar helpers ─────────────────────────────────────────────── */
  const barData = useMemo(() => {
    if (!saldo || saldo.diasTotales === 0) return { enjoyed: 0, approved: 0, available: 0 };
    const total = saldo.diasTotales + saldo.diasExtra;
    return {
      enjoyed: Math.round((saldo.diasDisfrutados / total) * 100),
      approved: Math.round((saldo.diasAprobadosFuturos / total) * 100),
      available: Math.round((saldo.diasDisponibles / total) * 100),
    };
  }, [saldo]);

  if (loading) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: 48, color: C.txDim }}>
        <span className="mono" style={{ fontSize: 13, letterSpacing: '.1em' }}>{t('chrono.cargando')}</span>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.tx, margin: 0, letterSpacing: '-.02em' }}>
            {t('chrono.vacaciones')}
          </h2>
          <p className="mono" style={{ fontSize: 12, color: C.txMuted, marginTop: 4, letterSpacing: '.08em' }}>
            {currentYear}
          </p>
        </div>
        <button className="ch-btn ch-btn-amber" onClick={() => setShowForm(true)}>
          + {t('chrono.solicitarVacacion')}
        </button>
      </div>

      {/* ── Message ────────────────────────────────────────────────────────── */}
      {message && (
        <div
          className="ch-card fade-in"
          style={{
            marginBottom: 16, padding: 14,
            background: message.type === 'ok' ? C.greenDim : C.redDim,
            borderColor: message.type === 'ok' ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)',
            color: message.type === 'ok' ? C.green : C.red,
            fontSize: 13, fontWeight: 600,
          }}
        >
          {message.text}
        </div>
      )}

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      {saldo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div className="ch-stat" style={{ '--accent': C.tx } as any}>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.tx }}>{saldo.diasTotales + saldo.diasExtra}</div>
            <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, marginTop: 4 }}>
              {t('chrono.diasTotales')}
            </div>
          </div>
          <div className="ch-stat" style={{ '--accent': C.amber } as any}>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.amber }}>{saldo.diasDisfrutados}</div>
            <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, marginTop: 4 }}>
              {t('chrono.diasDisfrutados')}
            </div>
          </div>
          <div className="ch-stat" style={{ '--accent': C.green } as any}>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.green }}>{saldo.diasAprobadosFuturos}</div>
            <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, marginTop: 4 }}>
              {t('chrono.diasAprobados')}
            </div>
          </div>
          <div className="ch-stat" style={{ '--accent': C.blue } as any}>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: C.blue }}>{saldo.diasDisponibles}</div>
            <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, marginTop: 4 }}>
              {t('chrono.diasDisponibles')}
            </div>
          </div>
        </div>
      )}

      {/* ── Annual distribution bar ────────────────────────────────────────── */}
      {saldo && (
        <div className="ch-card" style={{ marginBottom: 20 }}>
          <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, marginBottom: 10 }}>
            {t('chrono.distribucionAnual')}
          </div>
          <div style={{ height: 10, borderRadius: 5, background: C.bd, overflow: 'hidden', display: 'flex' }}>
            {barData.enjoyed > 0 && (
              <div style={{ width: `${barData.enjoyed}%`, background: C.amber, transition: 'width .4s' }} />
            )}
            {barData.approved > 0 && (
              <div style={{ width: `${barData.approved}%`, background: C.green, transition: 'width .4s' }} />
            )}
            {barData.available > 0 && (
              <div style={{ width: `${barData.available}%`, background: C.blue, borderRight: `2px solid ${C.sf}`, transition: 'width .4s' }} />
            )}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.amber, display: 'inline-block' }} />
              <span className="mono" style={{ fontSize: 11, color: C.txDim }}>{t('chrono.diasDisfrutados')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
              <span className="mono" style={{ fontSize: 11, color: C.txDim }}>{t('chrono.diasAprobados')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue, display: 'inline-block' }} />
              <span className="mono" style={{ fontSize: 11, color: C.txDim }}>{t('chrono.diasDisponibles')}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── New request form (modal-like card) ─────────────────────────────── */}
      {showForm && (
        <div className="ch-card fade-in" style={{ marginBottom: 20, borderColor: C.amber }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 16 }}>
            {t('chrono.solicitarVacacion')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14, alignItems: 'end' }}>
            <div>
              <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
                {t('chrono.tipoVacacion')}
              </label>
              <select value={tipo} onChange={e => setTipo(e.target.value as TipoVacacion)} style={{ width: '100%' }}>
                {TIPO_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{t(TIPO_LABELS[opt] as any)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
                {t('chrono.fechaInicio')}
              </label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
                {t('chrono.fechaFin')}
              </label>
              <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
                {t('chrono.diasHabiles')}
              </label>
              <input type="text" readOnly value={diasHabiles}
                style={{ background: C.bg, border: `1px solid ${C.bd}`, color: C.amber, padding: '8px 12px', borderRadius: 5, fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", outline: 'none', width: '100%', fontWeight: 700 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
              {t('chrono.motivo')}
            </label>
            <textarea
              value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder={t('chrono.motivo')}
              style={{ minHeight: 60, resize: 'vertical', width: '100%' }}
            />
          </div>

          {saldo && tipo === 'vacaciones' && diasHabiles > saldo.diasDisponibles && (
            <div className="mono" style={{ fontSize: 12, color: C.red, marginBottom: 10, fontWeight: 600 }}>
              {t('chrono.saldoInsuficiente')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="ch-btn ch-btn-amber"
              style={{ opacity: submitting ? 0.6 : 1 }}
              disabled={submitting}
              onClick={handleSubmit}
            >
              {t('chrono.solicitarVacacion')}
            </button>
            <button className="ch-btn ch-btn-ghost" onClick={resetForm} disabled={submitting}>
              {t('chrono.cancelarBtn')}
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`ch-btn ${tab === 'solicitudes' ? 'ch-btn-amber' : 'ch-btn-ghost'}`}
          onClick={() => setTab('solicitudes')}
        >
          {t('chrono.misSolicitudes')}
        </button>
        <button
          className={`ch-btn ${tab === 'equipo' ? 'ch-btn-amber' : 'ch-btn-ghost'}`}
          onClick={() => setTab('equipo')}
        >
          {t('chrono.calendarioEquipo')}
        </button>
      </div>

      {/* ── Tab: Mis solicitudes ───────────────────────────────────────────── */}
      {tab === 'solicitudes' && (
        <div className="ch-card fade-in" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
          {vacaciones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.txMuted }}>
              <span className="mono" style={{ fontSize: 12, letterSpacing: '.08em' }}>{t('chrono.sinVacaciones')}</span>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('chrono.tipoVacacion')}</th>
                  <th>{t('chrono.fechaInicio')}</th>
                  <th>{t('chrono.fechaFin')}</th>
                  <th>{t('chrono.diasHabiles')}</th>
                  <th>{t('chrono.estado')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vacaciones.map(v => (
                  <tr key={v.id}>
                    <td style={{ color: C.tx, fontWeight: 500 }}>
                      {t(TIPO_LABELS[v.tipo] as any)}
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: C.txDim }}>{v.fechaInicio}</span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: C.txDim }}>{v.fechaFin}</span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>{v.diasHabiles}</span>
                    </td>
                    <td>
                      <span className={ESTADO_BADGE[v.estado] || 'ch-badge ch-badge-muted'}>
                        {t(`chrono.${v.estado}` as any)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {v.estado === 'pendiente' && (
                        <button className="ch-btn ch-btn-red" style={{ padding: '5px 12px', fontSize: 11 }} onClick={() => handleCancel(v.id)}>
                          {t('chrono.cancelarSolicitud')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Calendario equipo ─────────────────────────────────────────── */}
      {tab === 'equipo' && (
        <div className="ch-card fade-in" style={{ textAlign: 'center', padding: 40, color: C.txMuted }}>
          <span className="mono" style={{ fontSize: 12, letterSpacing: '.08em' }}>{t('chrono.proximaVista')}</span>
        </div>
      )}
    </div>
  );
}
