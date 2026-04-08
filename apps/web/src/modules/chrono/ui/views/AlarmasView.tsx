// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { IAlarmaRepository } from '../../domain/ports/IAlarmaRepository';
import type { Alarma, TipoAlarma } from '../../domain/entities/Alarma';

interface AlarmasViewProps {
  alarmaRepo: IAlarmaRepository;
  currentUser: { id: string; [key: string]: unknown };
}

const TIPO_OPTIONS: TipoAlarma[] = ['entrada', 'comida_ini', 'comida_fin', 'salida', 'recordatorio'];

const TIPO_LABELS: Record<TipoAlarma, string> = {
  entrada: 'chrono.ficharEntrada',
  comida_ini: 'chrono.iniciarComida',
  comida_fin: 'chrono.finComida',
  salida: 'chrono.ficharSalida',
  recordatorio: 'chrono.recordatorio',
};

const TIPO_COLORS: Record<TipoAlarma, string> = {
  entrada: '#22c55e',
  comida_ini: '#f59e0b',
  comida_fin: '#06b6d4',
  salida: '#ef4444',
  recordatorio: '#8b5cf6',
};

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

const SONIDO_OPTIONS = ['default', 'bell', 'chime', 'alert', 'none'];

const EMPTY_FORM = {
  label: '',
  hora: '09:00',
  dias: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] as string[],
  tipo: 'entrada' as TipoAlarma,
  sonido: 'default',
  canales: { push: true, email: false, slack: false },
};

export function AlarmasView({ alarmaRepo, currentUser }: AlarmasViewProps) {
  const { t } = useTranslation();
  const [alarmas, setAlarmas] = useState<Alarma[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await alarmaRepo.getAlarmas(currentUser.id);
      setAlarmas(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [alarmaRepo, currentUser.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowNew(true);
    setMessage(null);
  };

  const openEdit = (a: Alarma) => {
    setShowNew(false);
    setEditingId(a.id);
    setForm({
      label: a.label,
      hora: a.hora,
      dias: [...a.dias],
      tipo: a.tipo,
      sonido: a.sonido,
      canales: { ...a.canales },
    });
    setMessage(null);
  };

  const toggleDay = (day: string) => {
    setForm(prev => ({
      ...prev,
      dias: prev.dias.includes(day)
        ? prev.dias.filter(d => d !== day)
        : [...prev.dias, day],
    }));
  };

  const toggleCanal = (canal: 'push' | 'email' | 'slack') => {
    setForm(prev => ({
      ...prev,
      canales: { ...prev.canales, [canal]: !prev.canales[canal] },
    }));
  };

  const handleSave = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      if (editingId) {
        await alarmaRepo.actualizar(editingId, {
          label: form.label,
          hora: form.hora,
          dias: form.dias,
          tipo: form.tipo,
          sonido: form.sonido,
          canales: form.canales,
        });
        setMessage({ type: 'ok', text: t('chrono.alarmaActualizada') });
        setEditingId(null);
      } else {
        await alarmaRepo.crear({
          userId: currentUser.id,
          label: form.label,
          hora: form.hora,
          dias: form.dias,
          activa: true,
          tipo: form.tipo,
          sonido: form.sonido,
          canales: form.canales,
        });
        setMessage({ type: 'ok', text: t('chrono.alarmaCreada') });
        setShowNew(false);
      }
      setForm({ ...EMPTY_FORM });
      await loadData();
    } catch {
      setMessage({ type: 'err', text: t('chrono.errorAccion') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('chrono.confirmarEliminar'))) return;
    try {
      await alarmaRepo.eliminar(id);
      setMessage({ type: 'ok', text: t('chrono.alarmaEliminada') });
      if (editingId === id) setEditingId(null);
      await loadData();
    } catch {
      setMessage({ type: 'err', text: t('chrono.errorAccion') });
    }
  };

  const handleToggle = async (id: string, activa: boolean) => {
    try {
      await alarmaRepo.toggle(id, activa);
      await loadData();
    } catch {
      // silent
    }
  };

  /* -- Styles ------------------------------------------------------------ */
  const card: React.CSSProperties = {
    background: 'var(--sf2,#1b1b22)', borderRadius: 12,
    border: '1px solid var(--bd,#2a2a38)', padding: 16, marginBottom: 12,
  };
  const inputStyle: React.CSSProperties = {
    background: 'var(--sf,#14141b)', border: '1px solid var(--bd,#2a2a38)',
    borderRadius: 8, padding: '6px 10px', color: 'var(--tx,#e2e2e8)',
    fontSize: 13, fontFamily: 'inherit', width: '100%',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' as const };
  const lblStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--tx3,#50506a)', display: 'block', marginBottom: 4,
  };
  const btnPrimary: React.CSSProperties = {
    background: 'var(--ac,#4f6ef7)', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 18px', fontWeight: 600, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const btnGhost: React.CSSProperties = {
    background: 'var(--sf2,#1b1b22)', color: 'var(--tx3,#50506a)',
    border: '1px solid var(--bd,#2a2a38)', borderRadius: 8,
    padding: '8px 18px', fontWeight: 600, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const btnDanger: React.CSSProperties = {
    background: 'rgba(239,68,68,.12)', color: '#ef4444',
    border: '1px solid rgba(239,68,68,.3)', borderRadius: 8,
    padding: '4px 12px', fontWeight: 600, fontSize: 12,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const dayBtn = (active: boolean): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: 8, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', border: 'none', fontFamily: 'inherit',
    background: active ? 'var(--ac,#4f6ef7)' : 'var(--sf,#14141b)',
    color: active ? '#fff' : 'var(--tx3,#50506a)',
    transition: 'all .15s',
  });

  /* -- Form component ----------------------------------------------------- */
  const renderForm = () => (
    <div style={{ ...card, borderColor: 'var(--ac,#4f6ef7)' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx,#e2e2e8)', marginBottom: 12 }}>
        {editingId ? t('chrono.editarAlarma') : t('chrono.nuevaAlarma')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lblStyle}>{t('chrono.label')}</label>
          <input
            type="text" style={inputStyle} value={form.label}
            onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
          />
        </div>
        <div>
          <label style={lblStyle}>{t('chrono.hora')}</label>
          <input
            type="time" style={inputStyle} value={form.hora}
            onChange={e => setForm(p => ({ ...p, hora: e.target.value }))}
          />
        </div>
        <div>
          <label style={lblStyle}>{t('chrono.tipoAlarma')}</label>
          <select
            style={selectStyle} value={form.tipo}
            onChange={e => setForm(p => ({ ...p, tipo: e.target.value as TipoAlarma }))}
          >
            {TIPO_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{t(TIPO_LABELS[opt])}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lblStyle}>{t('chrono.sonido')}</label>
          <select
            style={selectStyle} value={form.sonido}
            onChange={e => setForm(p => ({ ...p, sonido: e.target.value }))}
          >
            {SONIDO_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Days */}
      <div style={{ marginBottom: 12 }}>
        <label style={lblStyle}>{t('chrono.diasSemana')}</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {DAYS.map(day => (
            <button key={day} style={dayBtn(form.dias.includes(day))} onClick={() => toggleDay(day)}>
              {t(`chrono.${day}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Channels */}
      <div style={{ marginBottom: 12 }}>
        <label style={lblStyle}>{t('chrono.canales')}</label>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['push', 'email', 'slack'] as const).map(canal => (
            <label
              key={canal}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--tx,#e2e2e8)' }}
            >
              <input
                type="checkbox"
                checked={form.canales[canal]}
                onChange={() => toggleCanal(canal)}
                style={{ accentColor: 'var(--ac,#4f6ef7)' }}
              />
              {t(`chrono.${canal}`)}
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}
          disabled={submitting}
          onClick={handleSave}
        >
          {editingId ? t('chrono.guardarAlarma') : t('chrono.crearBtn')}
        </button>
        <button
          style={btnGhost}
          onClick={() => { setEditingId(null); setShowNew(false); }}
          disabled={submitting}
        >
          {t('chrono.cancelarBtn')}
        </button>
        {editingId && (
          <button style={btnDanger} onClick={() => handleDelete(editingId)} disabled={submitting}>
            {t('chrono.eliminarAlarma')}
          </button>
        )}
      </div>
    </div>
  );

  /* -- Render ------------------------------------------------------------- */
  if (loading) {
    return <div style={{ textAlign: 'center', padding: 32, color: 'var(--tx3,#50506a)' }}>{t('chrono.cargando')}</div>;
  }

  return (
    <div>
      {/* Message */}
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

      {/* New alarm button */}
      {!showNew && !editingId && (
        <button style={{ ...btnPrimary, marginBottom: 16 }} onClick={openNew}>
          {t('chrono.nuevaAlarma')}
        </button>
      )}

      {/* Form */}
      {(showNew || editingId) && renderForm()}

      {/* Alarm list */}
      {alarmas.length === 0 && !showNew ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--tx3,#50506a)' }}>
          {t('chrono.sinAlarmas')}
        </div>
      ) : (
        alarmas.map(a => (
          <div
            key={a.id}
            style={{
              ...card,
              opacity: a.activa ? 1 : 0.5,
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            }}
          >
            {/* Toggle */}
            <div
              onClick={() => handleToggle(a.id, !a.activa)}
              style={{
                width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                background: a.activa ? 'var(--ac,#4f6ef7)' : 'var(--sf,#14141b)',
                border: '1px solid var(--bd,#2a2a38)', position: 'relative',
                transition: 'background .2s', flexShrink: 0,
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2,
                left: a.activa ? 20 : 2, transition: 'left .2s',
              }} />
            </div>

            {/* Time */}
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx,#e2e2e8)', fontVariantNumeric: 'tabular-nums', minWidth: 60 }}>
              {a.hora}
            </span>

            {/* Label + type */}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontWeight: 600, color: 'var(--tx,#e2e2e8)', fontSize: 14 }}>
                {a.label || t(TIPO_LABELS[a.tipo])}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3,#50506a)' }}>
                {a.dias.map(d => t(`chrono.${d}`)).join(' ')}
              </div>
            </div>

            {/* Type badge */}
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 6,
              fontSize: 11, fontWeight: 600,
              background: `${TIPO_COLORS[a.tipo]}22`, color: TIPO_COLORS[a.tipo],
            }}>
              {t(TIPO_LABELS[a.tipo])}
            </span>

            {/* Channels */}
            <div style={{ display: 'flex', gap: 6 }}>
              {a.canales.push && <span style={{ fontSize: 11, color: 'var(--tx3,#50506a)', padding: '2px 6px', background: 'var(--sf,#14141b)', borderRadius: 4 }}>{t('chrono.push')}</span>}
              {a.canales.email && <span style={{ fontSize: 11, color: 'var(--tx3,#50506a)', padding: '2px 6px', background: 'var(--sf,#14141b)', borderRadius: 4 }}>{t('chrono.email')}</span>}
              {a.canales.slack && <span style={{ fontSize: 11, color: 'var(--tx3,#50506a)', padding: '2px 6px', background: 'var(--sf,#14141b)', borderRadius: 4 }}>{t('chrono.slack')}</span>}
            </div>

            {/* Edit + Delete */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ ...btnGhost, padding: '4px 12px', fontSize: 12 }}
                onClick={() => openEdit(a)}
              >
                {t('chrono.editarAlarma')}
              </button>
              <button
                style={btnDanger}
                onClick={() => handleDelete(a.id)}
              >
                {t('chrono.eliminarAlarma')}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
