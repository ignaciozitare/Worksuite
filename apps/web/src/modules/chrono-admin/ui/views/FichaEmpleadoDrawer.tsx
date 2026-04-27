// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@worksuite/i18n';
import type { IFichaEmpleadoRepository } from '../../domain/ports/IFichaEmpleadoRepository';
import type { FichaEmpleado } from '../../domain/entities/FichaEmpleado';
import { CHRONO_THEME as T } from '../../../chrono/shared/theme';

const C = {
  tx: T.color.text,
  txDim: T.color.textDim,
  txMuted: T.color.textMuted,
  red: T.color.dangerStrong,
  redDim: T.color.dangerDim,
  sf: T.color.surface,
  sfHover: T.color.surfaceHigh,
  bd: T.color.surfaceHigh,
  bg: T.color.bg,
};

const SENIORITY_OPTIONS = ['junior', 'mid', 'senior', 'lead', 'principal', 'manager', 'director'];

interface Props {
  userId: string;
  userName: string;
  userEmail: string;
  fichaRepo: IFichaEmpleadoRepository;
  onClose: () => void;
}

type Draft = Omit<FichaEmpleado, 'id' | 'userId'>;

const emptyDraft: Draft = {
  clienteAsignado: '', valorHora: '', contactoTelefono: '', contactoEmailPersonal: '',
  seniority: '', notas: '', fechaIncorporacion: '', fechaBaja: '', razonBaja: '', nss: '',
  allowedBookingZones: '',
};

export function FichaEmpleadoDrawer({ userId, userName, userEmail, fichaRepo, onClose }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ficha = await fichaRepo.getByUserId(userId);
      if (ficha) {
        setDraft({
          clienteAsignado: ficha.clienteAsignado ?? '',
          valorHora: ficha.valorHora ?? '',
          contactoTelefono: ficha.contactoTelefono ?? '',
          contactoEmailPersonal: ficha.contactoEmailPersonal ?? '',
          seniority: ficha.seniority ?? '',
          notas: ficha.notas ?? '',
          allowedBookingZones: ficha.allowedBookingZones ?? '',
          fechaIncorporacion: ficha.fechaIncorporacion ?? '',
          fechaBaja: ficha.fechaBaja ?? '',
          razonBaja: ficha.razonBaja ?? '',
          nss: ficha.nss ?? '',
        });
      }
    } catch (err) {
      console.error('Error loading ficha:', err);
    } finally {
      setLoading(false);
    }
  }, [fichaRepo, userId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fichaRepo.upsert(userId, draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Error saving ficha:', err);
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof Draft, value: string) {
    setDraft(prev => ({ ...prev, [field]: value }));
  }

  const inputStyle: React.CSSProperties = {
    background: T.color.surfaceLow,
    border: `1px solid ${T.color.surfaceHigh}`,
    borderRadius: T.radius.md,
    padding: '9px 12px',
    color: T.color.text,
    fontSize: 'var(--fs-xs)',
    width: '100%',
    outline: 'none',
    fontFamily: T.font.body,
    transition: 'border-color .15s, box-shadow .15s',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--fs-2xs)', color: T.color.textDim, display: 'block', marginBottom: 5,
    textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600,
  };

  return createPortal(
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 9998, animation: 'chFadeIn .2s ease forwards',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
        background: T.color.surface,
        borderLeft: `1px solid ${T.color.surfaceHigh}`,
        zIndex: 9999, display: 'flex', flexDirection: 'column',
        animation: 'chSlideIn .25s ease forwards',
        fontFamily: T.font.body,
      }}>
        <style>{`
          @keyframes chSlideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: `1px solid ${C.bd}`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: T.radius.md,
            background: `linear-gradient(135deg, ${T.color.primary}, ${T.color.primaryStrong})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: T.color.primaryOn, fontSize: 'var(--fs-body)',
            fontFamily: T.font.body,
            boxShadow: `0 0 14px ${T.color.primaryDim}`,
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: C.tx }}>{userName}</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: C.txDim }}>{userEmail}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 6,
              color: C.txDim, cursor: 'pointer', padding: '6px 10px', fontSize: 'var(--fs-sm)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.txDim, fontSize: 'var(--fs-xs)' }}>
              {t('chronoAdmin.cargando')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Sección: Datos profesionales */}
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: T.color.primary, textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: -6 }}>
                {t('chronoAdmin.fichaSeccionProfesional')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Cliente asignado */}
                <div>
                  <label style={labelStyle}>{t('chronoAdmin.fichaClienteAsignado')}</label>
                  <input type="text" value={draft.clienteAsignado} onChange={e => set('clienteAsignado', e.target.value)} style={inputStyle} />
                </div>

                {/* Valor hora */}
                <div>
                  <label style={labelStyle}>{t('chronoAdmin.fichaValorHora')}</label>
                  <input type="text" value={draft.valorHora} onChange={e => set('valorHora', e.target.value)} style={inputStyle} placeholder="€/h" />
                </div>

                {/* Seniority */}
                <div>
                  <label style={labelStyle}>{t('chronoAdmin.fichaSeniority')}</label>
                  <select value={draft.seniority} onChange={e => set('seniority', e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {SENIORITY_OPTIONS.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Fecha incorporación */}
                <div>
                  <label style={labelStyle}>{t('chronoAdmin.fichaFechaIncorporacion')}</label>
                  <input type="date" value={draft.fechaIncorporacion} onChange={e => set('fechaIncorporacion', e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Sección: Contacto */}
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: T.color.primary, textTransform: 'uppercase', letterSpacing: '.12em', marginTop: 6, marginBottom: -6 }}>
                {t('chronoAdmin.fichaSeccionContacto')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Teléfono */}
                <div>
                  <label style={labelStyle}>{t('chronoAdmin.fichaTelefono')}</label>
                  <input type="tel" value={draft.contactoTelefono} onChange={e => set('contactoTelefono', e.target.value)} style={inputStyle} />
                </div>

                {/* Email personal */}
                <div>
                  <label style={labelStyle}>{t('chronoAdmin.fichaEmailPersonal')}</label>
                  <input type="email" value={draft.contactoEmailPersonal} onChange={e => set('contactoEmailPersonal', e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Sección: Seguridad Social */}
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: T.color.primary, textTransform: 'uppercase', letterSpacing: '.12em', marginTop: 6, marginBottom: -6 }}>
                {t('chronoAdmin.fichaSeccionLegal')}
              </div>

              <div>
                <label style={labelStyle}>{t('chronoAdmin.fichaNSS')}</label>
                <input type="text" value={draft.nss} onChange={e => set('nss', e.target.value)} style={inputStyle} placeholder="XX-XXXXXXXX-XX" />
              </div>

              {/* Sección: Baja */}
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '.12em', marginTop: 6, marginBottom: -6 }}>
                {t('chronoAdmin.fichaSeccionBaja')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>{t('chronoAdmin.fichaFechaBaja')}</label>
                  <input type="date" value={draft.fechaBaja} onChange={e => set('fechaBaja', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{t('chronoAdmin.fichaRazonBaja')}</label>
                  <input type="text" value={draft.razonBaja} onChange={e => set('razonBaja', e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Zonas de reserva permitidas */}
              <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: T.color.tertiary, textTransform: 'uppercase', letterSpacing: '.12em', marginTop: 6, marginBottom: -6 }}>
                {t('hotdesk.allowedZones')}
              </div>
              <div>
                <label style={labelStyle}>{t('hotdesk.allowedZonesDesc')}</label>
                <textarea
                  value={draft.allowedBookingZones}
                  onChange={e => set('allowedBookingZones', e.target.value)}
                  rows={3}
                  placeholder={t('hotdesk.allZonesAllowed')}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: T.font.mono, fontSize: 'var(--fs-2xs)' }}
                />
                <p style={{ fontSize: 'var(--fs-2xs)', color: C.txDim, marginTop: 4, lineHeight: 1.4 }}>
                  {t('hotdesk.allowedZonesDesc')}
                </p>
              </div>

              {/* Notas */}
              <div style={{ marginTop: 6 }}>
                <label style={labelStyle}>{t('chronoAdmin.fichaNotas')}</label>
                <textarea
                  value={draft.notas}
                  onChange={e => set('notas', e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: `1px solid ${C.bd}`,
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button className="ch-btn ch-btn-ghost" onClick={onClose}>
            {t('chronoAdmin.cancelar')}
          </button>
          <button className="ch-btn ch-btn-amber" onClick={handleSave} disabled={saving || loading}>
            {saving ? t('chronoAdmin.guardando') : saved ? '✓' : t('chronoAdmin.guardar')}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
