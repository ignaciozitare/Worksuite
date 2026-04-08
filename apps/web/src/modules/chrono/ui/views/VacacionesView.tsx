// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
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

const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#f59e0b',
  aprobado: '#22c55e',
  rechazado: '#ef4444',
  cancelado: '#6b7280',
};

export function VacacionesView({ vacacionRepo, currentUser }: VacacionesViewProps) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  const [vacaciones, setVacaciones] = useState<Vacacion[]>([]);
  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  // Auto-calculate working days (simple: exclude weekends)
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
    if (!confirm(t('chrono.confirmarCancelar'))) return;
    try {
      await vacacionRepo.cancelar(vacacionId);
      await loadData();
    } catch (e) {
      console.error('VacacionesView cancel error:', e);
    }
  }, [vacacionRepo, loadData, t]);

  /* ── Styles ─────────────────────────────────────────────────────────────────── */
  const card: React.CSSProperties = {
    background: 'var(--sf2, #1b1b22)', borderRadius: 12,
    border: '1px solid var(--bd, #2a2a38)', padding: 16, marginBottom: 16,
  };
  const statBox: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '10px 16px', borderRadius: 8, background: 'var(--sf, #14141b)',
    border: '1px solid var(--bd, #2a2a38)', minWidth: 90, flex: 1,
  };
  const inputStyle: React.CSSProperties = {
    background: 'var(--sf, #14141b)', border: '1px solid var(--bd, #2a2a38)',
    borderRadius: 8, padding: '6px 10px', color: 'var(--tx, #e2e2e8)',
    fontSize: 13, fontFamily: 'inherit', width: '100%',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' };
  const btnPrimary: React.CSSProperties = {
    background: 'var(--ac, #4f6ef7)', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 18px', fontWeight: 600, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const btnGhost: React.CSSProperties = {
    background: 'var(--sf2, #1b1b22)', color: 'var(--tx3, #50506a)',
    border: '1px solid var(--bd, #2a2a38)', borderRadius: 8,
    padding: '8px 18px', fontWeight: 600, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const btnDanger: React.CSSProperties = {
    background: 'rgba(239,68,68,.12)', color: '#ef4444',
    border: '1px solid rgba(239,68,68,.3)', borderRadius: 8,
    padding: '4px 12px', fontWeight: 600, fontSize: 12,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const badge = (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11,
    fontWeight: 600, background: `${color}22`, color, whiteSpace: 'nowrap',
  });

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 32, color: 'var(--tx3, #50506a)' }}>{t('chrono.cargando')}</div>;
  }

  return (
    <div>
      {/* ── Balance card ───────────────────────────────────────────────────── */}
      {saldo && (
        <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.diasTotales')}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--tx, #e2e2e8)' }}>{saldo.diasTotales}</span>
          </div>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.diasExtra')}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#8b5cf6' }}>{saldo.diasExtra}</span>
          </div>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.diasDisfrutados')}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{saldo.diasDisfrutados}</span>
          </div>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.diasAprobados')}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#06b6d4' }}>{saldo.diasAprobadosFuturos}</span>
          </div>
          <div style={statBox}>
            <span style={{ fontSize: 11, color: 'var(--tx3, #50506a)' }}>{t('chrono.diasDisponibles')}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{saldo.diasDisponibles}</span>
          </div>
        </div>
      )}

      {/* ── Message ────────────────────────────────────────────────────────── */}
      {message && (
        <div style={{
          ...card, padding: 12,
          background: message.type === 'ok' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
          borderColor: message.type === 'ok' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)',
          color: message.type === 'ok' ? '#22c55e' : '#ef4444',
          fontSize: 13, fontWeight: 600,
        }}>
          {message.text}
        </div>
      )}

      {/* ── Request button / Form ──────────────────────────────────────────── */}
      {!showForm ? (
        <button style={{ ...btnPrimary, marginBottom: 16 }} onClick={() => setShowForm(true)}>
          {t('chrono.solicitarVacacion')}
        </button>
      ) : (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx, #e2e2e8)', marginBottom: 12 }}>
            {t('chrono.solicitarVacacion')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx3, #50506a)', display: 'block', marginBottom: 4 }}>
                {t('chrono.tipoVacacion')}
              </label>
              <select style={selectStyle} value={tipo} onChange={e => setTipo(e.target.value as TipoVacacion)}>
                {TIPO_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{t(TIPO_LABELS[opt] as any)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx3, #50506a)', display: 'block', marginBottom: 4 }}>
                {t('chrono.fechaInicio')}
              </label>
              <input type="date" style={inputStyle} value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx3, #50506a)', display: 'block', marginBottom: 4 }}>
                {t('chrono.fechaFin')}
              </label>
              <input type="date" style={inputStyle} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--tx3, #50506a)', display: 'block', marginBottom: 4 }}>
                {t('chrono.diasHabiles')}
              </label>
              <input
                type="number" min={0} style={inputStyle}
                value={diasHabiles} onChange={e => setDiasHabiles(Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--tx3, #50506a)', display: 'block', marginBottom: 4 }}>
              {t('chrono.motivo')}
            </label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder={t('chrono.motivo')}
            />
          </div>

          {saldo && tipo === 'vacaciones' && diasHabiles > saldo.diasDisponibles && (
            <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8, fontWeight: 600 }}>
              {t('chrono.saldoInsuficiente')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}
              disabled={submitting}
              onClick={handleSubmit}
            >
              {t('chrono.solicitarVacacion')}
            </button>
            <button style={btnGhost} onClick={resetForm} disabled={submitting}>
              {t('chrono.cancelarBtn')}
            </button>
          </div>
        </div>
      )}

      {/* ── History table ──────────────────────────────────────────────────── */}
      {vacaciones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--tx3, #50506a)' }}>{t('chrono.sinVacaciones')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bd, #2a2a38)' }}>
                {[t('chrono.tipoVacacion'), t('chrono.fechaInicio'), t('chrono.fechaFin'), t('chrono.diasHabiles'), t('chrono.motivo'), t('chrono.estado'), ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--tx3, #50506a)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vacaciones.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--bd, #2a2a38)' }}>
                  <td style={{ padding: '8px 6px', color: 'var(--tx, #e2e2e8)' }}>
                    {t(TIPO_LABELS[v.tipo] as any)}
                  </td>
                  <td style={{ padding: '8px 6px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx, #e2e2e8)' }}>{v.fechaInicio}</td>
                  <td style={{ padding: '8px 6px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx, #e2e2e8)' }}>{v.fechaFin}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, color: 'var(--tx, #e2e2e8)' }}>{v.diasHabiles}</td>
                  <td style={{ padding: '8px 6px', color: 'var(--tx3, #50506a)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.motivo || '—'}
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    <span style={badge(ESTADO_COLORS[v.estado] || '#6b7280')}>
                      {t(`chrono.${v.estado}` as any)}
                    </span>
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    {v.estado === 'pendiente' && (
                      <button style={btnDanger} onClick={() => handleCancel(v.id)}>
                        {t('chrono.cancelarSolicitud')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
