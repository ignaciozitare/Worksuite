// @ts-nocheck
import { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '@/shared/lib/supabaseClient';
import { AdminFichajeSupabaseRepository } from '../infra/supabase/AdminFichajeSupabaseRepository';
import { AdminVacacionSupabaseRepository } from '../infra/supabase/AdminVacacionSupabaseRepository';
import { EquipoHoyView } from './views/EquipoHoyView';
import { FichajesEquipoView } from './views/FichajesEquipoView';
import { AprobacionesView } from './views/AprobacionesView';
import { GestionVacacionesView } from './views/GestionVacacionesView';
import { InformesEmpresaView } from './views/InformesEmpresaView';

const fichajeRepo = new AdminFichajeSupabaseRepository(supabase);
const vacacionRepo = new AdminVacacionSupabaseRepository(supabase);

/* ─── Design tokens (same as ChronoPage) ───────────────────────────────────── */
const C = {
  bg:'#0d0d0d', sf:'#161616', sfHover:'#1e1e1e', bd:'#2a2a2a',
  amber:'#f59e0b', amberDim:'#92400e', amberGlow:'rgba(245,158,11,0.12)',
  tx:'#e8e8e8', txDim:'#888', txMuted:'#555',
  green:'#10b981', greenDim:'rgba(16,185,129,0.15)',
  red:'#ef4444', redDim:'rgba(239,68,68,0.15)',
  blue:'#3b82f6', blueDim:'rgba(59,130,246,0.15)',
  orange:'#f97316', purple:'#a855f7',
};
export { C as CHRONO_ADMIN_COLORS };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
.ch{font-family:'IBM Plex Sans',sans-serif;background:${C.bg};color:${C.tx};height:100%;overflow:hidden;display:flex;}
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
.ch .nav-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;color:${C.txDim};transition:all .15s;border:1px solid transparent;letter-spacing:.02em;}
.ch .nav-item:hover{background:${C.sfHover};color:${C.tx};}
.ch .nav-item.active{background:${C.amberGlow};color:${C.amber};border-color:${C.amberDim};}
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
`;

type Tab = 'equipo' | 'fichajes' | 'aprobaciones' | 'vacaciones' | 'informes';

const NAV_ITEMS: { id: Tab; labelKey: string; icon: string }[] = [
  { id: 'equipo',       labelKey: 'chronoAdmin.equipoHoy',           icon: '◎' },
  { id: 'fichajes',     labelKey: 'chronoAdmin.fichajesEquipo',      icon: '◷' },
  { id: 'aprobaciones', labelKey: 'chronoAdmin.aprobaciones',        icon: '✓' },
  { id: 'vacaciones',   labelKey: 'chronoAdmin.gestionVacaciones',   icon: '◈' },
  { id: 'informes',     labelKey: 'chronoAdmin.informesEmpresa',     icon: '▤' },
];

interface Props { currentUser: { id: string; name?: string; email: string; role?: string; [k: string]: unknown }; }

export function ChronoAdminPage({ currentUser }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<Tab>('equipo');

  return (
    <div className="ch">
      <style>{CSS}</style>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0, background: C.sf, borderRight: `1px solid ${C.bd}`, display: 'flex', flexDirection: 'column' }}>
        {/* Logo */}
        <div style={{ padding: '22px 20px', borderBottom: `1px solid ${C.bd}` }}>
          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: C.amber, letterSpacing: '.05em' }}>
            CHRONO<span style={{ color: C.txDim }}>.</span>ADMIN
          </div>
          <div style={{ fontSize: 10, color: C.txMuted, marginTop: 3, letterSpacing: '.12em', textTransform: 'uppercase' }}>
            {t('chronoAdmin.panelAdmin')}
          </div>
        </div>

        {/* User */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.bd}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${C.amberDim},#78350f)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: C.amber, fontFamily: "'IBM Plex Mono',monospace", fontSize: 14 }}>
              {(currentUser.name || currentUser.email || 'A').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name || currentUser.email}</div>
              <div style={{ fontSize: 11, color: C.txDim }}>{currentUser.role || 'admin'}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 10px', flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <div key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
              <span className="mono" style={{ fontSize: 16 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{t(item.labelKey)}</span>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.bd}` }}>
          <div className="mono" style={{ fontSize: 10, color: C.txMuted, letterSpacing: '.08em' }}>v1.0 · WorkSuite</div>
        </div>
      </div>

      {/* ── Main ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 11, color: C.txMuted, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.1em', marginBottom: 24 }}>
          CHRONO.ADMIN / {t(NAV_ITEMS.find(n => n.id === view)?.labelKey || '').toUpperCase()}
        </div>

        {view === 'equipo' && (
          <EquipoHoyView fichajeRepo={fichajeRepo} />
        )}
        {view === 'fichajes' && (
          <FichajesEquipoView fichajeRepo={fichajeRepo} />
        )}
        {view === 'aprobaciones' && (
          <AprobacionesView fichajeRepo={fichajeRepo} vacacionRepo={vacacionRepo} currentUser={currentUser} />
        )}
        {view === 'vacaciones' && (
          <GestionVacacionesView vacacionRepo={vacacionRepo} />
        )}
        {view === 'informes' && (
          <InformesEmpresaView />
        )}
      </div>
    </div>
  );
}
