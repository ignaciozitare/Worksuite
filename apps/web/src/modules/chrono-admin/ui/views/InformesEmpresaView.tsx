// @ts-nocheck
import { useTranslation } from '@worksuite/i18n';

const REPORTS = [
  { key: 'chronoAdmin.informeMensual',     icon: '📊', desc: 'Resumen mensual de fichajes de toda la empresa' },
  { key: 'chronoAdmin.informeVacaciones',  icon: '🏖️', desc: 'Estado de vacaciones por empleado' },
  { key: 'chronoAdmin.informeIncidencias', icon: '⚠️', desc: 'Incidencias y fichajes incompletos' },
  { key: 'chronoAdmin.informeBolsa',       icon: '⏱️', desc: 'Saldo de bolsa de horas por empleado' },
];

export function InformesEmpresaView() {
  const { t } = useTranslation();

  const handleDownload = (reportKey: string) => {
    // Placeholder — will be connected to actual export logic
    console.log('Download report:', reportKey);
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
        {t('chronoAdmin.informesEmpresa')}
      </h3>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {REPORTS.map(report => (
          <div
            key={report.key}
            style={{
              background: 'var(--sf,#141418)', border: '1px solid var(--bd,#2a2a38)',
              borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>{report.icon}</span>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--tx,#e4e4ef)' }}>
                {t(report.key)}
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--tx3,#50506a)', lineHeight: 1.5 }}>
              {report.desc}
            </p>
            <button
              onClick={() => handleDownload(report.key)}
              style={{
                marginTop: 'auto', padding: '8px 16px', borderRadius: 8,
                fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none',
                fontFamily: 'inherit', background: 'var(--sf2,#1b1b22)',
                color: 'var(--tx3,#50506a)', border: '1px solid var(--bd,#2a2a38)',
                transition: 'all .15s', alignSelf: 'flex-start',
              }}
            >
              Descargar CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
