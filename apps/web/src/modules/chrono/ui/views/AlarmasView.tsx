// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import { CHRONO_COLORS as C } from '../ChronoPage';
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

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
const DAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const SONIDO_OPTIONS = ['default', 'bell', 'chime', 'alert', 'none'] as const;

const SONIDO_LABELS: Record<string, string> = {
  default: 'chrono.sonidoDefault',
  bell: 'chrono.sonidoBell',
  chime: 'chrono.sonidoChime',
  alert: 'chrono.sonidoAlert',
  none: 'chrono.sonidoNone',
};

const CHANNEL_ICONS: Record<string, string> = {
  push: '🔔',
  email: '✉',
  slack: '💬',
  sms: '📱',
};

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
  const dialog = useDialog();
  const [alarmas, setAlarmas] = useState<Alarma[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Notification channel toggles (local UI state)
  const [channels, setChannels] = useState({ push: true, email: true, slack: false, sms: false });

  // Advance reminders (local UI state)
  const [advanceReminders, setAdvanceReminders] = useState({ fiveMin: true, fifteenMin: false, thirtyMin: false });

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
    if (!(await dialog.confirm(t('chrono.confirmarEliminar'), { danger: true }))) return;
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
            {t('chrono.alarmas')}
          </h2>
          <p className="mono" style={{ fontSize: 12, color: C.txMuted, marginTop: 4, letterSpacing: '.08em' }}>
            {t('chrono.alarmasSubtitulo')}
          </p>
        </div>
        {!showNew && !editingId && (
          <button className="ch-btn ch-btn-amber" onClick={openNew}>
            + {t('chrono.nuevaAlarma')}
          </button>
        )}
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

      {/* ── Notification channels card ─────────────────────────────────────── */}
      <div className="ch-card" style={{ marginBottom: 20 }}>
        <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, marginBottom: 14 }}>
          {t('chrono.canales')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {(['push', 'email', 'slack', 'sms'] as const).map(ch => (
            <div key={ch} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px', borderRadius: 6, background: C.bg, border: `1px solid ${C.bd}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{CHANNEL_ICONS[ch]}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: C.tx, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {t(`chrono.${ch}`)}
                </span>
              </div>
              <button
                className={`ch-toggle ${channels[ch] ? 'on' : ''}`}
                onClick={() => setChannels(prev => ({ ...prev, [ch]: !prev[ch] }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── New / Edit form ────────────────────────────────────────────────── */}
      {(showNew || editingId) && (
        <div className="ch-card fade-in" style={{ marginBottom: 20, borderColor: C.amber }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 16 }}>
            {editingId ? t('chrono.editarAlarma') : t('chrono.nuevaAlarma')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
                {t('chrono.label')}
              </label>
              <input
                type="text" value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              />
            </div>
            <div>
              <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
                {t('chrono.hora')}
              </label>
              <input
                type="time" value={form.hora}
                onChange={e => setForm(p => ({ ...p, hora: e.target.value }))}
              />
            </div>
            <div>
              <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
                {t('chrono.tipoAlarma')}
              </label>
              <select
                value={form.tipo}
                onChange={e => setForm(p => ({ ...p, tipo: e.target.value as TipoAlarma }))}
              >
                {TIPO_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{t(TIPO_LABELS[opt])}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 6 }}>
                {t('chrono.sonido')}
              </label>
              <select
                value={form.sonido}
                onChange={e => setForm(p => ({ ...p, sonido: e.target.value }))}
              >
                {SONIDO_OPTIONS.map(s => (
                  <option key={s} value={s}>{t(SONIDO_LABELS[s])}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Days */}
          <div style={{ marginBottom: 14 }}>
            <label className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, display: 'block', marginBottom: 8 }}>
              {t('chrono.diasSemana')}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DAYS.map((day, i) => {
                const active = form.dias.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className="mono"
                    style={{
                      width: 32, height: 32, borderRadius: 4, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', border: 'none',
                      background: active ? C.amber : C.bg,
                      color: active ? '#000' : C.txMuted,
                      transition: 'all .15s',
                    }}
                  >
                    {DAY_SHORT[i]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="ch-btn ch-btn-amber"
              style={{ opacity: submitting ? 0.6 : 1 }}
              disabled={submitting}
              onClick={handleSave}
            >
              {editingId ? t('chrono.guardarAlarma') : t('chrono.crearBtn')}
            </button>
            <button
              className="ch-btn ch-btn-ghost"
              onClick={() => { setEditingId(null); setShowNew(false); }}
              disabled={submitting}
            >
              {t('chrono.cancelarBtn')}
            </button>
            {editingId && (
              <button className="ch-btn ch-btn-red" style={{ padding: '5px 12px', fontSize: 11 }} onClick={() => handleDelete(editingId)} disabled={submitting}>
                {t('chrono.eliminarAlarma')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Alarm list ─────────────────────────────────────────────────────── */}
      {alarmas.length === 0 && !showNew ? (
        <div className="ch-card" style={{ textAlign: 'center', padding: 40, color: C.txMuted }}>
          <span className="mono" style={{ fontSize: 12, letterSpacing: '.08em' }}>{t('chrono.sinAlarmas')}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alarmas.map(a => (
            <div
              key={a.id}
              className="ch-card"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                opacity: a.activa ? 1 : 0.45, transition: 'opacity .2s',
                padding: '14px 20px',
              }}
            >
              {/* Toggle */}
              <button
                className={`ch-toggle ${a.activa ? 'on' : ''}`}
                onClick={() => handleToggle(a.id, !a.activa)}
                style={{ flexShrink: 0 }}
              />

              {/* Label + day badges */}
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 700, color: C.tx, fontSize: 14, marginBottom: 6 }}>
                  {a.label || t(TIPO_LABELS[a.tipo])}
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {DAYS.map((day, i) => {
                    const active = a.dias.includes(day);
                    return (
                      <span
                        key={day}
                        className="mono"
                        style={{
                          width: 22, height: 22, borderRadius: 3, display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700,
                          background: active ? C.amberGlow : C.bg,
                          color: active ? C.amber : C.txMuted,
                          border: `1px solid ${active ? C.amberDim : C.bd}`,
                        }}
                      >
                        {DAY_SHORT[i]}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Time */}
              <input
                type="time"
                value={a.hora}
                readOnly
                style={{
                  width: 90, textAlign: 'center', fontWeight: 700,
                  fontSize: 15, background: C.bg, border: `1px solid ${C.bd}`,
                  color: C.tx, padding: '6px 10px', borderRadius: 5,
                  fontFamily: "'IBM Plex Mono',monospace",
                }}
              />

              {/* Sound select */}
              <select
                value={a.sonido}
                disabled
                style={{ width: 100, opacity: 0.7 }}
              >
                {SONIDO_OPTIONS.map(s => (
                  <option key={s} value={s}>{t(SONIDO_LABELS[s])}</option>
                ))}
              </select>

              {/* Edit + Delete */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="ch-btn ch-btn-ghost"
                  style={{ padding: '5px 12px', fontSize: 11 }}
                  onClick={() => openEdit(a)}
                >
                  {t('chrono.editarAlarma')}
                </button>
                <button
                  className="ch-btn ch-btn-red"
                  style={{ padding: '5px 12px', fontSize: 11 }}
                  onClick={() => handleDelete(a.id)}
                >
                  {t('chrono.eliminarAlarma')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Advance reminders section ──────────────────────────────────────── */}
      <div className="ch-card" style={{ marginTop: 20 }}>
        <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txMuted, marginBottom: 14 }}>
          {t('chrono.avisoAnticipado')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { key: 'fiveMin', label: '5 min' },
            { key: 'fifteenMin', label: '15 min' },
            { key: 'thirtyMin', label: '30 min' },
          ] as const).map(item => (
            <div key={item.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 6, background: C.bg, border: `1px solid ${C.bd}`,
            }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 500, color: C.tx }}>
                {item.label} {t('chrono.antes')}
              </span>
              <button
                className={`ch-toggle ${advanceReminders[item.key] ? 'on' : ''}`}
                onClick={() => setAdvanceReminders(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
