// @ts-nocheck
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@worksuite/i18n';
import { DashboardView } from './views/DashboardView';
import { RegistrosView } from './views/RegistrosView';
import { IncompletosView } from './views/IncompletosView';
import { VacacionesView } from './views/VacacionesView';
import { AlarmasView } from './views/AlarmasView';
import { CHRONO_THEME as T } from '../shared/theme';
import {
  fichajeRepo, bolsaRepo, vacacionRepo,
  incidenciaRepo, alarmaRepo, configEmpresaRepo, geoService,
} from '../container';

/* ─── Design tokens ─────────────────────────────────────────────────────────── */
const C = {
  bg: T.color.bg, sf: T.color.surface, sfHover: T.color.surfaceHigh, bd: T.color.surfaceHigh,
  // "amber" is now the Stitch primary — all 30+ downstream refs get the
  // new palette without any code changes. The name stays for compat.
  amber: T.color.primary, amberDim: T.color.primaryStrong, amberGlow: T.color.primaryDim,
  tx: T.color.text, txDim: T.color.textDim, txMuted: T.color.textMuted,
  green: T.color.secondary, greenDim: T.color.secondaryDim,
  red: T.color.dangerStrong, redDim: T.color.dangerDim,
  blue:'#3b82f6', blueDim:'rgba(59,130,246,0.15)',
  orange: T.color.warning, purple: T.color.tertiary,
};
export { C as CHRONO_COLORS };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&family=Inter:wght@300;400;500;600;700&display=swap');
.ch .material-symbols-outlined{font-family:'Material Symbols Outlined';font-variation-settings:'FILL' 0,'wght' 300,'GRAD' 0,'opsz' 24;display:inline-block;line-height:1;text-transform:none;letter-spacing:normal;word-wrap:normal;white-space:nowrap;direction:ltr;vertical-align:middle;}
.ch{font-family:'Inter','IBM Plex Sans',sans-serif;background:${C.bg};color:${C.tx};height:100%;overflow:hidden;display:flex;}
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
.ch .pulse-green{animation:chPulseG 2s cubic-bezier(.215,.61,.355,1) infinite;}
@keyframes chPulseG{0%{box-shadow:0 0 0 0 rgba(16,185,129,.5)}70%{box-shadow:0 0 0 12px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}
/* Nav items — Stitch look: surface-high when active, subtle primary glow */
.ch .nav-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:${T.radius.md};cursor:pointer;font-size:13px;font-weight:500;color:${T.color.textDim};transition:background .15s, color .15s, box-shadow .15s;border:1px solid transparent;letter-spacing:.01em;}
.ch .nav-item:hover{background:${T.color.surfaceLow};color:${T.color.textMuted};}
.ch .nav-item.active{background:${T.color.surfaceHigh};color:${T.color.primary};box-shadow:0 0 10px ${T.color.primaryDim};}
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
.ch .ch-toggle{position:relative;width:40px;height:22px;background:${C.bd};border-radius:11px;cursor:pointer;transition:background .2s;border:none;}
.ch .ch-toggle.on{background:${C.amber};}
.ch .ch-toggle::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;background:white;border-radius:50%;transition:transform .2s;}
.ch .ch-toggle.on::after{transform:translateX(18px);}
.ch select,.ch input[type="time"],.ch input[type="text"],.ch textarea{background:${C.bg};border:1px solid ${C.bd};color:${C.tx};padding:8px 12px;border-radius:5px;font-size:13px;font-family:'IBM Plex Mono',monospace;outline:none;transition:border-color .15s;}
.ch select:focus,.ch input:focus,.ch textarea:focus{border-color:${C.amber};}
.ch .tl-bar{height:6px;background:${C.bd};border-radius:3px;overflow:hidden;}
.ch .tl-fill{height:100%;border-radius:3px;transition:width .3s;}
`;

type Tab = 'dashboard' | 'registros' | 'incompletos' | 'vacaciones' | 'alarmas' | 'informes';

const NAV_ITEMS: { id: Tab; labelKey: string; icon: string; badge?: boolean }[] = [
  { id: 'dashboard',   labelKey: 'chrono.dashboard',   icon: 'dashboard' },
  { id: 'registros',   labelKey: 'chrono.registros',   icon: 'schedule' },
  { id: 'incompletos', labelKey: 'chrono.incompletos', icon: 'warning', badge: true },
  { id: 'vacaciones',  labelKey: 'chrono.vacaciones',  icon: 'beach_access' },
  { id: 'alarmas',     labelKey: 'chrono.alarmas',     icon: 'notifications_active' },
  { id: 'informes',    labelKey: 'chrono.informes',    icon: 'analytics' },
];

interface Props { currentUser: { id: string; name?: string; email: string; role?: string; [k: string]: unknown }; }

const VALID_TABS: Tab[] = ['dashboard', 'registros', 'incompletos', 'vacaciones', 'alarmas', 'informes'];

export function ChronoPage({ currentUser }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView: Tab = (() => {
    const v = searchParams.get('view');
    return v && (VALID_TABS as string[]).includes(v) ? (v as Tab) : 'dashboard';
  })();
  const [view, setViewState] = useState<Tab>(initialView);
  const [incompletosCount, setIncompletosCount] = useState(0);

  // Sync URL → state when navigating to a new ?view
  useEffect(() => {
    const v = searchParams.get('view');
    if (v && (VALID_TABS as string[]).includes(v) && v !== view) {
      setViewState(v as Tab);
    }
  }, [searchParams]);

  // Sync state → URL when user clicks tabs
  const setView = (next: Tab) => {
    setViewState(next);
    setSearchParams(next === 'dashboard' ? {} : { view: next }, { replace: true });
  };

  useEffect(() => {
    if (!currentUser?.id) return;
    fichajeRepo.getFichajesIncompletos(currentUser.id).then(d => setIncompletosCount(d.length)).catch(() => {});
  }, [currentUser?.id]);

  return (
    <div className="ch">
      <style>{CSS}</style>

      {/* ── Sidebar (Stitch / Environments style) ──────────── */}
      <aside style={{
        position: 'sticky', top: 0, width: 240, minWidth: 240, height: '100%',
        minHeight: 'calc(100vh - 52px)', alignSelf: 'stretch',
        background: T.color.surfaceLowest, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRight: `1px solid ${T.color.surfaceHigh}`,
        boxShadow: `0 0 60px ${T.color.primaryDim}`,
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
            <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-lg)', color: 'var(--ac-strong)' }}>timer</span>
          </div>
          <div>
            <h1 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--tx)', letterSpacing: '-0.01em', lineHeight: 1, margin: 0 }}>
              {t('chrono.title')}
            </h1>
            <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx)', opacity: .4, fontWeight: 700, letterSpacing: '.1em', marginTop: 4, textTransform: 'uppercase' }}>
              {t('chrono.moduleSubtitle')}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '16px 0' }}>
          {NAV_ITEMS.map(item => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 8, fontSize: 'var(--fs-xs)', fontWeight: active ? 600 : 500,
                  letterSpacing: '.02em', cursor: 'pointer', border: 'none',
                  background: active ? 'rgba(77,142,255,.1)' : 'transparent',
                  color: active ? 'var(--ac)' : 'var(--tx)',
                  opacity: active ? 1 : .6, transition: 'all .2s', textAlign: 'left',
                  width: '100%', fontFamily: 'inherit',
                  boxShadow: active ? '0 0 20px rgba(79,110,247,.1)' : 'none',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--sf2)'; e.currentTarget.style.transform = 'translateX(2px)'; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'none'; }}}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{t(item.labelKey)}</span>
                {item.badge && incompletosCount > 0 && (
                  <span className="ch-badge ch-badge-red" style={{ fontSize: 'var(--fs-2xs)', padding: '2px 6px' }}>{incompletosCount}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 'var(--fs-2xs)', color: C.txMuted, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.1em', marginBottom: 24 }}>
          {t('chrono.breadcrumb')} / {t(NAV_ITEMS.find(n => n.id === view)?.labelKey || '').toUpperCase()}
        </div>

        {view === 'dashboard' && <DashboardView fichajeRepo={fichajeRepo} bolsaRepo={bolsaRepo} incidenciaRepo={incidenciaRepo} configEmpresaRepo={configEmpresaRepo} geoService={geoService} currentUser={currentUser} />}
        {view === 'registros' && <RegistrosView fichajeRepo={fichajeRepo} currentUser={currentUser} />}
        {view === 'incompletos' && <IncompletosView fichajeRepo={fichajeRepo} currentUser={currentUser} />}
        {view === 'vacaciones' && <VacacionesView vacacionRepo={vacacionRepo} currentUser={currentUser} />}
        {view === 'alarmas' && <AlarmasView alarmaRepo={alarmaRepo} currentUser={currentUser} />}
        {view === 'informes' && <InformesPlaceholder />}
      </div>

    </div>
  );
}

function InformesPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="fade-in">
      <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, marginBottom: 4 }}>{t('chrono.informes')}</div>
      <div style={{ fontSize: 'var(--fs-xs)', color: C.txDim, marginBottom: 20 }}>{t('chrono.proximaVista')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { icon: '📄', titleKey: 'chrono.horasTotales', fmt: 'PDF / Excel' },
          { icon: '🏖️', titleKey: 'chrono.vacaciones', fmt: 'PDF' },
          { icon: '📋', titleKey: 'chrono.incidenciasCount', fmt: 'PDF / Excel' },
          { icon: '⚖️', titleKey: 'chrono.bolsaHoras', fmt: 'PDF / Excel' },
        ].map((r, i) => (
          <div key={i} className="ch-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 'var(--fs-xl)' }}>{r.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{t(r.titleKey)}</div>
              <span className="ch-badge ch-badge-muted" style={{ marginTop: 6 }}>{r.fmt}</span>
            </div>
            <button className="ch-btn ch-btn-amber">⬇ {t('chrono.exportarPdf')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
