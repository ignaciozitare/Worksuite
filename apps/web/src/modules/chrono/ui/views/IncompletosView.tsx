// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { CHRONO_COLORS as C } from '../ChronoPage';
import type { IFichajeRepository } from '../../domain/ports/IFichajeRepository';
import type { Fichaje } from '../../domain/entities/Fichaje';

interface IncompletosViewProps {
  fichajeRepo: IFichajeRepository;
  currentUser: { id: string };
}

const FIELDS = ['entradaAt', 'comidaIniAt', 'comidaFinAt', 'salidaAt'] as const;
type FieldKey = typeof FIELDS[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  entradaAt: 'chrono.entrada',
  comidaIniAt: 'chrono.comidaIni',
  comidaFinAt: 'chrono.comidaFin',
  salidaAt: 'chrono.salida',
};

const DAY_ABBR = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

export function IncompletosView({ fichajeRepo, currentUser }: IncompletosViewProps) {
  const { t } = useTranslation();
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<FieldKey, string>>({ entradaAt: '', comidaIniAt: '', comidaFinAt: '', salidaAt: '' });
  const [justificacion, setJustificacion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fichajeRepo.getFichajesIncompletos(currentUser.id);
      setFichajes(data);
    } catch (e) {
      console.error('IncompletosView load error:', e);
    } finally {
      setLoading(false);
    }
  }, [fichajeRepo, currentUser.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const openEdit = useCallback((f: Fichaje) => {
    setEditId(f.id);
    setForm({
      entradaAt: f.entradaAt || '',
      comidaIniAt: f.comidaIniAt || '',
      comidaFinAt: f.comidaFinAt || '',
      salidaAt: f.salidaAt || '',
    });
    setJustificacion('');
    setMessage(null);
  }, []);

  const handleSubmit = useCallback(async (fichajeId: string) => {
    if (!justificacion.trim()) {
      setMessage({ type: 'err', text: t('chrono.justificacionReq') });
      return;
    }
    setSubmitting(true);
    try {
      const campos: Partial<Pick<Fichaje, 'entradaAt' | 'comidaIniAt' | 'comidaFinAt' | 'salidaAt'>> = {};
      for (const key of FIELDS) {
        if (form[key]) campos[key] = new Date(form[key]).toISOString();
      }
      await fichajeRepo.completarFichaje(fichajeId, campos, justificacion);
      setMessage({ type: 'ok', text: t('chrono.solicitudEnviada') });
      setEditId(null);
      await loadData();
    } catch (e) {
      console.error('IncompletosView submit error:', e);
      setMessage({ type: 'err', text: t('chrono.errorEnvio') });
    } finally {
      setSubmitting(false);
    }
  }, [fichajeRepo, form, justificacion, loadData, t]);

  const fmtTime = (v: string | null) => {
    if (!v) return null;
    const d = new Date(v);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const fmtDate = (fecha: string) => {
    const d = new Date(fecha + 'T00:00:00');
    const day = DAY_ABBR[d.getDay()];
    const num = d.getDate();
    const month = d.toLocaleDateString('es-ES', { month: 'long' });
    const year = d.getFullYear();
    return { day, full: `${num} de ${month}, ${year}` };
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48, color: C.txMuted }}>{t('chrono.cargando')}</div>;
  }

  if (fichajes.length === 0) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: 48, color: C.txMuted }}>
        {t('chrono.sinIncompletos')}
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: C.tx }}>
          {t('chrono.fichajesIncompletos')}
        </div>
        <span className="ch-badge ch-badge-red">{fichajes.length}</span>
      </div>

      {/* ── Warning banner ─────────────────────────────────────────────────── */}
      <div style={{
        background: C.redDim,
        border: `1px solid rgba(239,68,68,.3)`,
        borderRadius: 8,
        padding: '14px 20px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 'var(--fs-md)' }}>⚠</span>
        <div>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: C.red }}>
            {t('chrono.deadlineWarning')}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: C.txDim, marginTop: 2 }}>
            {t('chrono.deadlineDetail')}
          </div>
        </div>
      </div>

      {/* ── Message toast ──────────────────────────────────────────────────── */}
      {message && (
        <div className="ch-card" style={{
          marginBottom: 16,
          background: message.type === 'ok' ? C.greenDim : C.redDim,
          borderColor: message.type === 'ok' ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)',
          color: message.type === 'ok' ? C.green : C.red,
          fontSize: 'var(--fs-xs)', fontWeight: 600,
        }}>
          {message.text}
        </div>
      )}

      {/* ── Fichaje cards ──────────────────────────────────────────────────── */}
      {fichajes.map(f => {
        const isPending = f.estado === 'pendiente_aprobacion';
        const isEditing = editId === f.id;
        const { day, full } = fmtDate(f.fecha);
        const missingFields = FIELDS.filter(k => !f[k]);

        return (
          <div
            key={f.id}
            className="ch-card"
            style={{
              marginBottom: 16,
              borderColor: `rgba(239,68,68,.35)`,
              borderLeft: `3px solid ${C.red}`,
            }}
          >
            {/* ── Card header ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="mono" style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: C.amber }}>
                  {day}
                </span>
                <span style={{ fontSize: 'var(--fs-sm)', color: C.txDim }}>{full}</span>
                {isPending ? (
                  <span className="ch-badge ch-badge-amber">{t('chrono.pendienteAprobacion')}</span>
                ) : (
                  <span className="ch-badge ch-badge-red">{t('chrono.incompleto')}</span>
                )}
              </div>
              {!isPending && !isEditing && (
                <button className="ch-btn ch-btn-amber" onClick={() => openEdit(f)}>
                  {t('chrono.completar')}
                </button>
              )}
            </div>

            {/* ── Field cards grid ────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: isEditing ? 16 : 0 }}>
              {FIELDS.map(key => {
                const filled = !!f[key];
                const time = fmtTime(f[key]);
                const isEditingThis = isEditing && !filled;
                const cardBg = filled ? C.sf : C.redDim;
                const cardBorder = filled ? C.bd : 'rgba(239,68,68,.3)';

                return (
                  <div key={key} style={{
                    background: cardBg,
                    border: `1px solid ${cardBorder}`,
                    borderRadius: 6,
                    padding: '12px 14px',
                    position: 'relative',
                  }}>
                    <div className="mono" style={{
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: 600,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: filled ? C.txMuted : C.red,
                      marginBottom: 6,
                    }}>
                      {t(FIELD_LABELS[key] as any)}
                    </div>

                    {isEditingThis ? (
                      <input
                        type="time"
                        style={{
                          width: '100%',
                          fontSize: 'var(--fs-body)',
                          padding: '4px 8px',
                        }}
                        value={form[key] ? form[key].slice(11, 16) : ''}
                        onChange={e => {
                          const base = f.fecha + 'T' + e.target.value + ':00';
                          setForm(prev => ({ ...prev, [key]: base }));
                        }}
                      />
                    ) : (
                      <div className="mono" style={{
                        fontSize: 'var(--fs-md)',
                        fontWeight: 700,
                        color: filled ? C.tx : C.red,
                      }}>
                        {time || '——:——'}
                      </div>
                    )}

                    {!filled && !isEditing && (
                      <div style={{ fontSize: 'var(--fs-2xs)', color: C.red, marginTop: 4, fontWeight: 500 }}>
                        {t('chrono.faltaRegistro')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Edit form: justification + submit ───────────────────────── */}
            {isEditing && (
              <div style={{ marginTop: 4 }}>
                <div style={{ marginBottom: 12 }}>
                  <label className="mono" style={{
                    fontSize: 'var(--fs-2xs)',
                    fontWeight: 600,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: C.txMuted,
                    display: 'block',
                    marginBottom: 6,
                  }}>
                    {t('chrono.justificacion')} *
                  </label>
                  <input
                    type="text"
                    style={{ width: '100%' }}
                    value={justificacion}
                    onChange={e => setJustificacion(e.target.value)}
                    placeholder={t('chrono.justificacionPlaceholder')}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="ch-btn ch-btn-green"
                    disabled={submitting}
                    style={{ opacity: submitting ? 0.6 : 1 }}
                    onClick={() => handleSubmit(f.id)}
                  >
                    {t('chrono.guardarYEnviar')}
                  </button>
                  <button
                    className="ch-btn ch-btn-ghost"
                    onClick={() => setEditId(null)}
                    disabled={submitting}
                  >
                    {t('chrono.cancelarBtn')}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
