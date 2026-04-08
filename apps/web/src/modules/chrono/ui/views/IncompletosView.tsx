// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
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

  /* ── Styles ─────────────────────────────────────────────────────────────────── */
  const card: React.CSSProperties = {
    background: 'var(--sf2, #1b1b22)', borderRadius: 12,
    border: '1px solid var(--bd, #2a2a38)', padding: 16, marginBottom: 12,
  };
  const fieldDot = (filled: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
    borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: filled ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
    color: filled ? '#22c55e' : '#ef4444',
  });
  const inputStyle: React.CSSProperties = {
    background: 'var(--sf, #14141b)', border: '1px solid var(--bd, #2a2a38)',
    borderRadius: 8, padding: '6px 10px', color: 'var(--tx, #e2e2e8)',
    fontSize: 13, fontFamily: 'inherit', width: '100%',
  };
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
  const pendingBadge: React.CSSProperties = {
    display: 'inline-block', padding: '2px 8px', borderRadius: 6,
    fontSize: 11, fontWeight: 600, background: 'rgba(167,139,250,.12)',
    color: '#a78bfa',
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 32, color: 'var(--tx3, #50506a)' }}>{t('chrono.cargando')}</div>;
  }

  if (fichajes.length === 0) {
    return <div style={{ textAlign: 'center', padding: 32, color: 'var(--tx3, #50506a)' }}>{t('chrono.sinIncompletos')}</div>;
  }

  return (
    <div>
      {message && (
        <div style={{
          ...card,
          background: message.type === 'ok' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
          borderColor: message.type === 'ok' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)',
          color: message.type === 'ok' ? '#22c55e' : '#ef4444',
          fontSize: 13, fontWeight: 600,
        }}>
          {message.text}
        </div>
      )}

      {fichajes.map(f => {
        const isPending = f.estado === 'pendiente_aprobacion';
        const isEditing = editId === f.id;

        return (
          <div key={f.id} style={card}>
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--tx, #e2e2e8)' }}>
                {f.fecha}
              </span>
              {isPending && <span style={pendingBadge}>{t('chrono.pendienteAprobacion')}</span>}
            </div>

            {/* ── Field status dots ────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {FIELDS.map(key => (
                <span key={key} style={fieldDot(!!f[key])}>
                  {t(FIELD_LABELS[key] as any)}: {f[key] ? t('chrono.campoCompleto') : t('chrono.campoFaltante')}
                </span>
              ))}
            </div>

            {/* ── Edit form ────────────────────────────────────────────────── */}
            {!isPending && !isEditing && (
              <button style={btnPrimary} onClick={() => openEdit(f)}>
                {t('chrono.completar')}
              </button>
            )}

            {isEditing && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
                  {FIELDS.map(key => (
                    <div key={key}>
                      <label style={{ fontSize: 11, color: 'var(--tx3, #50506a)', display: 'block', marginBottom: 4 }}>
                        {t(FIELD_LABELS[key] as any)}
                      </label>
                      <input
                        type="datetime-local"
                        style={inputStyle}
                        value={form[key] ? form[key].slice(0, 16) : ''}
                        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--tx3, #50506a)', display: 'block', marginBottom: 4 }}>
                    {t('chrono.justificacion')} *
                  </label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                    value={justificacion}
                    onChange={e => setJustificacion(e.target.value)}
                    placeholder={t('chrono.justificacion')}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}
                    disabled={submitting}
                    onClick={() => handleSubmit(f.id)}
                  >
                    {t('chrono.enviarAprobacion')}
                  </button>
                  <button style={btnGhost} onClick={() => setEditId(null)} disabled={submitting}>
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
