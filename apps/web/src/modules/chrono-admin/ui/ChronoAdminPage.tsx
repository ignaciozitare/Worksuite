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
// Stitch-inspired design tokens shared with the Chrono module. Now
// consumed by the topbar tab bar; the rest of the view still uses the
// legacy `C` object below and will migrate in follow-up commits.
import { CHRONO_THEME as T } from '../../chrono/shared/theme';

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
import { CHRONO_ADMIN_COLORS } from '../shared/adminColors';
const C = CHRONO_ADMIN_COLORS;
export { CHRONO_ADMIN_COLORS };

/* ─── CSS ─────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&family=Inter:wght@300;400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
.ch .material-symbols-outlined{font-family:'Material Symbols Outlined';font-variation-settings:'FILL' 0,'wght' 300,'GRAD' 0,'opsz' 24;display:inline-block;line-height:1;text-transform:none;letter-spacing:normal;word-wrap:normal;white-space:nowrap;direction:ltr;vertical-align:middle;}
.ch{font-family:'Inter','IBM Plex Sans',sans-serif;background:${C.bg};color:${C.tx};min-height:100%;}
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
@keyframes chPulse{0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(77,142,255,.5)}70%{transform:scale(1);box-shadow:0 0 0 20px rgba(77,142,255,0)}100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(77,142,255,0)}}
.ch .ch-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;font-family:'IBM Plex Mono',monospace;letter-spacing:.05em;text-transform:uppercase;}
.ch .ch-badge-green{background:${C.greenDim};color:${C.green};}
.ch .ch-badge-red{background:${C.redDim};color:${C.red};}
.ch .ch-badge-amber{background:${T.color.primaryDim};color:${T.color.primary};}
.ch .ch-badge-blue{background:${C.blueDim};color:${C.blue};}
.ch .ch-badge-muted{background:#1e1e1e;color:${C.txDim};}
.ch .ch-card{background:${T.color.surface};border:1px solid ${T.color.surfaceHigh};border-radius:${T.radius.lg};padding:20px;}
.ch .ch-stat{background:${C.sf};border:1px solid ${C.bd};border-radius:8px;padding:18px 20px;position:relative;overflow:hidden;}
.ch .ch-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,${C.amberDim});}
.ch .ch-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:'IBM Plex Mono',monospace;letter-spacing:.05em;text-transform:uppercase;transition:all .15s;}
/* Primary action button — repainted from amber to the Stitch primary. */
.ch .ch-btn-amber{background:linear-gradient(135deg,${T.color.primary},${T.color.primaryStrong});color:${T.color.primaryOn};border-color:transparent;box-shadow:0 4px 20px ${T.color.primaryDim};}
.ch .ch-btn-amber:hover{background:linear-gradient(135deg,${T.color.primaryStrong},${T.color.primary});color:#fff;box-shadow:0 4px 24px ${T.color.primaryStrong}55;}
.ch .ch-btn-ghost{background:${T.color.surfaceHigh}80;color:${T.color.textMuted};border-color:${T.color.border}50;backdrop-filter:blur(8px);}
.ch .ch-btn-ghost:hover{border-color:${T.color.primary};color:${T.color.primary};background:${T.color.primaryDim};}
.ch .ch-btn-red{background:linear-gradient(135deg,${T.color.danger},${T.color.dangerStrong});color:#fff;border-color:transparent;box-shadow:0 4px 20px ${T.color.dangerDim};}
.ch .ch-btn-red:hover{box-shadow:0 4px 24px ${T.color.dangerStrong}55;}
.ch .ch-btn-green{background:linear-gradient(135deg,${T.color.secondary},${T.color.secondaryStrong});color:${T.color.primaryOn};border-color:transparent;box-shadow:0 4px 20px ${T.color.secondaryDim};}
.ch .ch-btn-green:hover{box-shadow:0 4px 24px ${T.color.secondaryStrong}55;}
.ch table{width:100%;border-collapse:collapse;}
.ch th{text-align:left;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${T.color.textDim};padding:12px 16px;border-bottom:1px solid ${T.color.surfaceHigh};background:${T.color.surfaceLow};font-family:${T.font.body};position:sticky;top:0;z-index:1;}
.ch td{padding:14px 16px;font-size:13px;color:${T.color.text};border-bottom:1px solid ${T.color.surfaceHigh};vertical-align:middle;font-family:${T.font.body};}
.ch tr:last-child td{border-bottom:none;}
.ch tbody tr{transition:background .12s;}
.ch tbody tr:hover td{background:${T.color.surfaceHigh};}
.ch select,.ch input[type="time"],.ch input[type="text"],.ch input[type="number"],.ch input[type="month"],.ch textarea{background:${C.bg};border:1px solid ${C.bd};color:${C.tx};padding:8px 12px;border-radius:5px;font-size:13px;font-family:'IBM Plex Mono',monospace;outline:none;transition:border-color .15s;}
.ch select:focus,.ch input:focus,.ch textarea:focus{border-color:${C.amber};}
.ch .ch-toggle{position:relative;width:36px;height:20px;background:${C.bd};border-radius:10px;cursor:pointer;transition:background .2s;}
.ch .ch-toggle.active{background:${C.amber};}
.ch .ch-toggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;}
.ch .ch-toggle.active::after{transform:translateX(16px);}
`;

/* ─── Tab definitions ─────────────────────────────────────────────────────── */
type Tab = 'dashboard' | 'empleados' | 'equipos' | 'aprobaciones' | 'jira' | 'informes' | 'config';

const TABS: { id: Tab; labelKey: string; icon: string }[] = [
  { id: 'dashboard',    labelKey: 'chronoAdmin.dashboard',    icon: 'dashboard' },
  { id: 'empleados',    labelKey: 'chronoAdmin.empleados',    icon: 'badge' },
  { id: 'equipos',      labelKey: 'chronoAdmin.equipos',      icon: 'groups' },
  { id: 'aprobaciones', labelKey: 'chronoAdmin.aprobaciones', icon: 'task_alt' },
  { id: 'jira',         labelKey: 'chronoAdmin.jira',         icon: 'integration_instructions' },
  { id: 'informes',     labelKey: 'chronoAdmin.informes',     icon: 'analytics' },
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
    <div className="ch" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── Sidebar (Stitch / Environments style) ──────────── */}
      <aside style={{
        position: 'sticky', top: 0, width: 240, minWidth: 240, height: '100%',
        minHeight: 'calc(100vh - 52px)', alignSelf: 'stretch',
        background: 'rgba(14,14,14,.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,.05)',
        boxShadow: '0 0 60px rgba(77,142,255,.04)',
        display: 'flex', flexDirection: 'column', padding: 16, gap: 4,
        zIndex: 30, overflowY: 'auto', fontFamily: T.font.body,
      }}>
        {/* Brand header */}
        <div style={{ padding: '24px 12px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'rgba(77,142,255,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(77,142,255,.3)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#4d8eff' }}>group</span>
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: '#e5e2e1', letterSpacing: '-0.01em', lineHeight: 1, margin: 0 }}>
              RRHH
            </h1>
            <p style={{ fontSize: 10, color: '#e5e2e1', opacity: .4, fontWeight: 700, letterSpacing: '.1em', marginTop: 4, textTransform: 'uppercase' }}>
              MANAGEMENT MODULE
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '16px 0' }}>
          {TABS.map(tab => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 500,
                  letterSpacing: '.02em', cursor: 'pointer', border: 'none',
                  background: active ? 'rgba(77,142,255,.1)' : 'transparent',
                  color: active ? '#4d8eff' : '#e5e2e1',
                  opacity: active ? 1 : .6, transition: 'all .2s', textAlign: 'left',
                  width: '100%', fontFamily: 'inherit',
                  boxShadow: active ? '0 0 20px rgba(77,142,255,.1)' : 'none',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = '#1c1b1b'; e.currentTarget.style.transform = 'translateX(2px)'; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'none'; }}}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{tab.icon}</span>
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '28px 32px', fontFamily: T.font.body }}>
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
