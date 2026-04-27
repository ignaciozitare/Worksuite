// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { useAuth } from '@/shared/hooks/useAuth';
import type { ConfigEmpresa } from '../../domain/entities/ConfigEmpresa';
import { configRepo } from '../../container';

const lblStyle = {
  fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5,
};
const inpStyle = (extra = {}) => ({
  width: '100%', padding: '7px 10px', fontSize: 'var(--fs-xs)', fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)',
  borderRadius: 8, color: 'var(--tx)', outline: 'none',
  boxSizing: 'border-box', ...extra,
});

export function ChronoConfigSection() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [config, setConfig] = useState<ConfigEmpresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Form state
  const [horasJornada, setHorasJornada] = useState(480);
  const [pausaMin, setPausaMin] = useState(30);
  const [pausaMax, setPausaMax] = useState(90);
  const [tolerancia, setTolerancia] = useState(10);
  const [diasVacaciones, setDiasVacaciones] = useState(22);
  const [requiereGeo, setRequiereGeo] = useState(false);
  const [requiereAprobacion, setRequiereAprobacion] = useState(true);
  const [slackWebhook, setSlackWebhook] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const cfg = await configRepo.getConfig();
        setConfig(cfg);
        setHorasJornada(cfg.horasJornadaMinutos);
        setPausaMin(cfg.pausaComidaMinMinutos);
        setPausaMax(cfg.pausaComidaMaxMinutos);
        setTolerancia(cfg.toleranciaEntradaMinutos);
        setDiasVacaciones(cfg.diasVacacionesBase);
        setRequiereGeo(cfg.requiereGeo);
        setRequiereAprobacion(cfg.requiereAprobacionFichaje);
        setSlackWebhook(cfg.slackWebhookUrl ?? '');
      } catch (err) {
        console.error('Error loading config:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const updated = await configRepo.update({
        horasJornadaMinutos: horasJornada,
        pausaComidaMinMinutos: pausaMin,
        pausaComidaMaxMinutos: pausaMax,
        toleranciaEntradaMinutos: tolerancia,
        diasVacacionesBase: diasVacaciones,
        requiereGeo,
        requiereAprobacionFichaje: requiereAprobacion,
        slackWebhookUrl: slackWebhook.trim() || null,
      }, currentUser?.id ?? 'unknown');
      setConfig(updated);
      setSaveMsg('OK');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (err) {
      console.error('Error saving config:', err);
      setSaveMsg('Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 20, color: 'var(--tx3)', fontSize: 'var(--fs-xs)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--tx)' }}>
        {t('chronoAdmin.configuracion')}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Jornada hours */}
        <div>
          <label style={lblStyle}>{t('chronoAdmin.horasJornada')}</label>
          <input
            type="number"
            value={horasJornada}
            onChange={e => setHorasJornada(Number(e.target.value))}
            style={inpStyle()}
          />
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', marginTop: 3 }}>
            {Math.floor(horasJornada / 60)}h {horasJornada % 60}m
          </div>
        </div>

        {/* Lunch break min */}
        <div>
          <label style={lblStyle}>{t('chronoAdmin.pausaComidaMin')}</label>
          <input
            type="number"
            value={pausaMin}
            onChange={e => setPausaMin(Number(e.target.value))}
            style={inpStyle()}
          />
        </div>

        {/* Lunch break max */}
        <div>
          <label style={lblStyle}>{t('chronoAdmin.pausaComidaMax')}</label>
          <input
            type="number"
            value={pausaMax}
            onChange={e => setPausaMax(Number(e.target.value))}
            style={inpStyle()}
          />
        </div>

        {/* Clock-in tolerance */}
        <div>
          <label style={lblStyle}>{t('chronoAdmin.toleranciaEntrada')}</label>
          <input
            type="number"
            value={tolerancia}
            onChange={e => setTolerancia(Number(e.target.value))}
            style={inpStyle()}
          />
        </div>

        {/* Base vacation days */}
        <div>
          <label style={lblStyle}>{t('chronoAdmin.diasVacacionesBase')}</label>
          <input
            type="number"
            value={diasVacaciones}
            onChange={e => setDiasVacaciones(Number(e.target.value))}
            style={inpStyle()}
          />
        </div>

        {/* Geolocation required */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={requiereGeo}
            onChange={e => setRequiereGeo(e.target.checked)}
            style={{ accentColor: 'var(--ac)', width: 16, height: 16, cursor: 'pointer' }}
          />
          <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx)', cursor: 'pointer' }}
            onClick={() => setRequiereGeo(!requiereGeo)}>
            {t('chronoAdmin.requiereGeo')}
          </label>
        </div>

        {/* Approval required */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={requiereAprobacion}
            onChange={e => setRequiereAprobacion(e.target.checked)}
            style={{ accentColor: 'var(--ac)', width: 16, height: 16, cursor: 'pointer' }}
          />
          <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx)', cursor: 'pointer' }}
            onClick={() => setRequiereAprobacion(!requiereAprobacion)}>
            {t('chronoAdmin.requiereAprobacion')}
          </label>
        </div>

        {/* Slack webhook */}
        <div>
          <label style={lblStyle}>{t('chronoAdmin.slackWebhook')}</label>
          <input
            type="text"
            value={slackWebhook}
            onChange={e => setSlackWebhook(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            style={inpStyle()}
          />
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 8, fontWeight: 600, fontSize: 'var(--fs-sm)',
              cursor: saving ? 'not-allowed' : 'pointer', border: 'none',
              fontFamily: 'inherit', background: 'var(--ac)', color: '#fff',
              opacity: saving ? 0.6 : 1, transition: 'all .15s',
            }}
          >
            {saving ? '...' : 'Guardar'}
          </button>
          {saveMsg && (
            <span style={{
              fontSize: 'var(--fs-xs)', fontWeight: 600,
              color: saveMsg === 'OK' ? '#22c55e' : '#ef4444',
            }}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
