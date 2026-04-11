// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '@/shared/lib/supabaseClient';
import { SupabaseUserRepo } from '@/shared/infra/SupabaseUserRepo';
import { SupabaseNotificationRepo } from '@/shared/infra/SupabaseNotificationRepo';
import { AdminFichajeSupabaseRepository } from '../infra/supabase/AdminFichajeSupabaseRepository';
import { AdminVacacionSupabaseRepository } from '../infra/supabase/AdminVacacionSupabaseRepository';
import { ConfigSupabaseRepository } from '../infra/supabase/ConfigSupabaseRepository';
import { EquipoSupabaseRepository } from '../infra/supabase/EquipoSupabaseRepository';
import { EmpleadoConfigSupabaseRepository } from '../infra/supabase/EmpleadoConfigSupabaseRepository';
import { FichaEmpleadoSupabaseRepository } from '../infra/supabase/FichaEmpleadoSupabaseRepository';
import { JiraResumenSupabaseRepository } from '../infra/supabase/JiraResumenSupabaseRepository';
import { AprobacionesView } from './views/AprobacionesView';
import { InformesEmpresaView } from './views/InformesEmpresaView';
import { DashboardAdminView } from './views/DashboardAdminView';
import { EmpleadosView } from './views/EmpleadosView';
import { EquiposView } from './views/EquiposView';
import { JiraView } from './views/JiraView';
import { ChronoConfigSection } from './sections/ChronoConfigSection';
// Stitch-inspired design tokens shared with the Chrono module. Imported
// but not yet consumed — we'll migrate piece by piece from the legacy `C`
// object below. See ../../chrono/shared/theme.ts for the full palette.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CHRONO_THEME } from '../../chrono/shared/theme';

/* ─── Repository instances ────────────────────────────────────────────────── */
const fichajeRepo = new AdminFichajeSupabaseRepository(supabase);
const vacacionRepo = new AdminVacacionSupabaseRepository(supabase);
const configRepo = new ConfigSupabaseRepository(supabase);
const equipoRepo = new EquipoSupabaseRepository(supabase);
const empleadoConfigRepo = new EmpleadoConfigSupabaseRepository(supabase);
const fichaEmpleadoRepo = new FichaEmpleadoSupabaseRepository(supabase);
const notificacionRepo = new SupabaseNotificationRepo(supabase);
const jiraResumenRepo = new JiraResumenSupabaseRepository(supabase);
const userRepo = new SupabaseUserRepo(supabase);

/* ─── Design tokens ───────────────────────────────────────────────────────── */
const C = {
  bg: '#0d0d0d', sf: '#161616', sfHover: '#1e1e1e', bd: '#2a2a2a',
  amber: '#f59e0b', amberDim: '#92400e', amberGlow: 'rgba(245,158,11,0.12)',
  tx: '#e8e8e8', txDim: '#888', txMuted: '#555',
  green: '#10b981', greenDim: 'rgba(16,185,129,0.15)',
  red: '#ef4444', redDim: 'rgba(239,68,68,0.15)',
  blue: '#3b82f6', blueDim: 'rgba(59,130,246,0.15)',
  orange: '#f97316', purple: '#a855f7',
};
export { C as CHRONO_ADMIN_COLORS };

/* ─── CSS ─────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
.ch{font-family:'IBM Plex Sans',sans-serif;background:${C.bg};color:${C.tx};min-height:100%;}
.ch *{box-sizing:border-box;margin:0;padding:0;}
.ch ::-webkit-scrollbar{width:4px;height:4px;}
.ch ::-webkit-scrollbar-track{background:${C.sf};}
.ch ::-webkit-scrollbar-thumb{background:${C.amberDim};border-radius:2px;}
.ch .mono{font-family:'IBM Plex Mono',monospace;}
.ch .fade-in{animation:chFadeIn .3s ease forwards;}
@keyframes chFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.ch .blink{animation:chBlink 1s step-end infinite;}
@keyframes chBlink{0%,100%{opacity:1}50%{opacity:0}}
.ch .pulse-ring{animation:chPulse 2s cubic-bezier(.215,.61,.355,1) infinite;}
@keyframes chPulse{0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(245,158,11,.5)}70%{transform:scale(1);box-shadow:0 0 0 20px rgba(245,158,11,0)}100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(245,158,11,0)}}
.ch .ch-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;font-family:'IBM Plex Mono',monospace;letter-spacing:.05em;text-transform:uppercase;}
.ch .ch-badge-green{background:${C.greenDim};color:${C.green};}
.ch .ch-badge-red{background:${C.redDim};color:${C.red};}
.ch .ch-badge-amber{background:${C.amberGlow};color:${C.amber};}
.ch .ch-badge-blue{background:${C.blueDim};color:${C.blue};}
.ch .ch-badge-muted{background:#1e1e1e;color:${C.txDim};}
.ch .ch-card{background:${C.sf};border:1px solid ${C.bd};border-radius:8px;padding:20px;}
.ch .ch-stat{background:${C.sf};border:1px solid ${C.bd};border-radius:8px;padding:18px 20px;position:relative;overflow:hidden;}
.ch .ch-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,${C.amberDim});}
.ch .ch-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:'IBM Plex Mono',monospace;letter-spacing:.05em;text-transform:uppercase;transition:all .15s;}
.ch .ch-btn-amber{background:${C.amber};color:#000;border-color:${C.amber};}
.ch .ch-btn-amber:hover{background:#fbbf24;}
.ch .ch-btn-ghost{background:transparent;color:${C.txDim};border-color:${C.bd};}
.ch .ch-btn-ghost:hover{border-color:${C.amber};color:${C.amber};}
.ch .ch-btn-red{background:${C.redDim};color:${C.red};border-color:rgba(239,68,68,.3);}
.ch .ch-btn-green{background:${C.greenDim};color:${C.green};border-color:rgba(16,185,129,.3);}
.ch table{width:100%;border-collapse:collapse;}
.ch th{text-align:left;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${C.txMuted};padding:10px 14px;border-bottom:1px solid ${C.bd};font-family:'IBM Plex Mono',monospace;}
.ch td{padding:12px 14px;font-size:13px;border-bottom:1px solid #1a1a1a;vertical-align:middle;}
.ch tr:last-child td{border-bottom:none;}
.ch tr:hover td{background:${C.sfHover};}
.ch select,.ch input[type="time"],.ch input[type="text"],.ch input[type="number"],.ch input[type="month"],.ch textarea{background:${C.bg};border:1px solid ${C.bd};color:${C.tx};padding:8px 12px;border-radius:5px;font-size:13px;font-family:'IBM Plex Mono',monospace;outline:none;transition:border-color .15s;}
.ch select:focus,.ch input:focus,.ch textarea:focus{border-color:${C.amber};}
.ch .ch-toggle{position:relative;width:36px;height:20px;background:${C.bd};border-radius:10px;cursor:pointer;transition:background .2s;}
.ch .ch-toggle.active{background:${C.amber};}
.ch .ch-toggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;}
.ch .ch-toggle.active::after{transform:translateX(16px);}
`;

/* ─── Tab definitions ─────────────────────────────────────────────────────── */
type Tab = 'dashboard' | 'empleados' | 'equipos' | 'aprobaciones' | 'jira' | 'informes' | 'config';

const TABS: { id: Tab; labelKey: string }[] = [
  { id: 'dashboard',    labelKey: 'chronoAdmin.dashboard' },
  { id: 'empleados',    labelKey: 'chronoAdmin.empleados' },
  { id: 'equipos',      labelKey: 'chronoAdmin.equipos' },
  { id: 'aprobaciones', labelKey: 'chronoAdmin.aprobaciones' },
  { id: 'jira',         labelKey: 'chronoAdmin.jira' },
  { id: 'informes',     labelKey: 'chronoAdmin.informes' },
];

/* ─── Placeholder for views not yet implemented ───────────────────────────── */
function ComingSoonPlaceholder({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="mono" style={{ fontSize: 40, color: C.amberDim, marginBottom: 16 }}>{ '◎' }</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.tx, marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, color: C.txDim, letterSpacing: '.05em' }}>
        {t('chronoAdmin.comingSoon')}
      </div>
    </div>
  );
}

/* ─── Props ────────────────────────────────────────────────────────────────── */
interface Props {
  currentUser: { id: string; name?: string; email: string; role?: string };
}

/* ─── Main component ──────────────────────────────────────────────────────── */
function ChronoAdminPage({ currentUser }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<Tab>('dashboard');
  const [users, setUsers] = useState<any[]>([]);

  // Load all users for team/employee management
  useEffect(() => {
    userRepo.findAll()
      .then(rows => setUsers(rows.filter(u => u.active)))
      .catch(err => console.error('Error loading users:', err));
  }, []);

  return (
    <div className="ch">
      <style>{CSS}</style>

      <div style={{ padding: '28px 32px' }}>
        {/* ── Tab bar ────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 20,
          background: C.sf, border: `1px solid ${C.bd}`,
          borderRadius: 10, padding: 4, width: 'fit-content',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                background: view === tab.id ? C.amber : 'transparent',
                color: view === tab.id ? '#000' : C.txDim,
                border: 'none',
                padding: '8px 16px',
                borderRadius: 7,
                fontSize: 13,
                fontWeight: view === tab.id ? 600 : 500,
                cursor: 'pointer',
                fontFamily: "'IBM Plex Sans', sans-serif",
                letterSpacing: '.02em',
                transition: 'all .15s',
                whiteSpace: 'nowrap',
              }}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* ── View content ───────────────────────────────────── */}
        <div className="fade-in" key={view}>
          {view === 'dashboard' && (
            <DashboardAdminView fichajeRepo={fichajeRepo} />
          )}

          {view === 'empleados' && (
            <EmpleadosView fichajeRepo={fichajeRepo} empleadoConfigRepo={empleadoConfigRepo} equipoRepo={equipoRepo} fichaEmpleadoRepo={fichaEmpleadoRepo} users={users} />
          )}

          {view === 'equipos' && (
            <EquiposView equipoRepo={equipoRepo} users={users} />
          )}

          {view === 'aprobaciones' && (
            <AprobacionesView fichajeRepo={fichajeRepo} vacacionRepo={vacacionRepo} currentUser={currentUser} />
          )}

          {view === 'jira' && (
            <JiraView jiraRepo={jiraResumenRepo} notifRepo={notificacionRepo} />
          )}

          {view === 'informes' && (
            <InformesEmpresaView fichajeRepo={fichajeRepo} vacacionRepo={vacacionRepo} jiraRepo={jiraResumenRepo} />
          )}

        </div>
      </div>
    </div>
  );
}

export { ChronoAdminPage };
