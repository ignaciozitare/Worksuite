import React from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { SEATS } from '../domain/entities/seats';
import { TODAY } from '@/shared/lib/constants';
import { CHRONO_THEME as T } from '../../chrono/shared/theme';
import { OfficeSVG } from './OfficeSVG';

const MOCK_TODAY = TODAY;

/* ─── Local design tokens (derived from CHRONO_THEME) ─────────────────────── */
const C = {
  bg: T.color.bg, sf: T.color.surface, sfHigh: T.color.surfaceHigh,
  sfBright: T.color.surfaceBright, sfLow: T.color.surfaceLow,
  tx: T.color.text, txMuted: T.color.textMuted, txDim: T.color.textDim,
  primary: T.color.primary, primaryStrong: T.color.primaryStrong,
  primaryDim: T.color.primaryDim, primaryOn: T.color.primaryOn,
  green: T.color.secondary, greenStrong: T.color.secondaryStrong,
  greenDim: T.color.secondaryDim,
  red: T.color.dangerStrong, redDim: T.color.dangerDim,
  amber: T.color.warning, amberDim: T.color.warningDim,
  purple: T.color.tertiary, purpleDim: T.color.tertiaryDim,
};

const HD_CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
.hd-ch .material-symbols-outlined{font-family:'Material Symbols Outlined';font-variation-settings:'FILL' 0,'wght' 300,'GRAD' 0,'opsz' 24;display:inline-block;line-height:1;text-transform:none;letter-spacing:normal;word-wrap:normal;white-space:nowrap;direction:ltr;vertical-align:middle;}
.hd-ch{font-family:${T.font.body};color:${C.tx};}
.hd-ch *{box-sizing:border-box;margin:0;padding:0;}
.hd-ch .mono{font-family:'IBM Plex Mono',monospace;}
.hd-ch .fade-in{animation:hdFadeIn .3s ease forwards;}
@keyframes hdFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes hdPulseGreen{0%{box-shadow:0 0 0 0 rgba(74,225,118,.5)}70%{box-shadow:0 0 0 14px rgba(74,225,118,0)}100%{box-shadow:0 0 0 0 rgba(74,225,118,0)}}
.hd-ch .pulse-green{animation:hdPulseGreen 2s cubic-bezier(.215,.61,.355,1) infinite;}
.hd-ch .hd-stat{background:${C.sf};border:1px solid ${C.sfHigh};border-radius:${T.radius.lg};padding:16px 18px;position:relative;overflow:hidden;transition:border-color .2s,transform .15s;}
.hd-ch .hd-stat:hover{border-color:${C.primary};transform:translateY(-1px);}
.hd-ch .hd-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,${C.primaryStrong});}
.hd-ch .hd-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:'IBM Plex Mono',monospace;letter-spacing:.05em;text-transform:uppercase;transition:all .15s;}
.hd-ch .hd-btn-primary{background:linear-gradient(135deg,${C.primary},${C.primaryStrong});color:${C.primaryOn};border-color:transparent;box-shadow:0 4px 20px ${C.primaryDim};}
.hd-ch .hd-btn-primary:hover{background:linear-gradient(135deg,${C.primaryStrong},${C.primary});color:#fff;box-shadow:0 4px 24px rgba(77,142,255,.35);}
.hd-ch .hd-btn-ghost{background:${C.sfHigh}80;color:${C.txMuted};border-color:${T.color.border}50;backdrop-filter:blur(8px);}
.hd-ch .hd-btn-ghost:hover{border-color:${C.primary};color:${C.primary};background:${C.primaryDim};}
.hd-ch .hd-btn-green{background:linear-gradient(135deg,${C.green},${C.greenStrong});color:${C.primaryOn};border-color:transparent;box-shadow:0 4px 20px ${C.greenDim};}
.hd-ch .hd-btn-green:hover{box-shadow:0 4px 24px rgba(0,185,84,.35);}
`;

function HDMapView({ hd, onSeat, currentUser, onConfirmPresence, children }: {
  hd: any;
  onSeat: (id: string) => void;
  currentUser: any;
  onConfirmPresence?: (seatId: string, date: string) => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [panning, setPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState({ x: 0, y: 0, px: 0, py: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const MIN_ZOOM = 0.4, MAX_ZOOM = 3;
  const clamp = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v));

  const blockedSeats = hd.blockedSeats || {};

  // Seat counts
  const freeCount    = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations, blockedSeats) === SeatStatus.FREE).length;
  const occCount     = SEATS.filter(s => {
    const st = ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations, blockedSeats);
    return st === SeatStatus.OCCUPIED || st === SeatStatus.PENDING || st === SeatStatus.DELEGATED;
  }).length;
  const fixCount     = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations, blockedSeats) === SeatStatus.FIXED).length;
  const blockedCount = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations, blockedSeats) === SeatStatus.BLOCKED).length;
  const pendingCount = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations, blockedSeats) === SeatStatus.PENDING).length;

  // My pending reservation for today (for CHECK IN button)
  const myPendingRes = hd.reservations.find(
    (r: any) => r.userId === currentUser.id && r.date === MOCK_TODAY && r.status === 'pending'
  );

  // My seat for today (any status)
  const myTodayRes = hd.reservations.find(
    (r: any) => r.userId === currentUser.id && r.date === MOCK_TODAY
  );

  // Wheel zoom
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => clamp(Math.round((z + delta) * 100) / 100));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Pan with mouse drag
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!panning) return;
    setPan({ x: panStart.px + (e.clientX - panStart.x), y: panStart.py + (e.clientY - panStart.y) });
  };
  const onMouseUp = () => setPanning(false);
  const fitMap = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleCheckIn = () => {
    if (!myPendingRes) return;
    if (onConfirmPresence) {
      onConfirmPresence(myPendingRes.seatId, MOCK_TODAY);
    }
  };

  /* ── Stat card data ──────────────────────────────────────────────────────── */
  const stats = [
    { label: t('hotdesk.free'),     value: freeCount,    accent: C.green,       icon: 'event_seat' },
    { label: t('hotdesk.occupied'), value: occCount,     accent: C.primaryStrong, icon: 'person' },
    { label: t('hotdesk.fixed'),    value: fixCount,     accent: C.red,         icon: 'push_pin' },
    { label: t('hotdesk.mine'),     value: myTodayRes ? 1 : 0, accent: C.amber, icon: 'star' },
    { label: t('hotdesk.pending'),  value: pendingCount, accent: C.amber,       icon: 'hourglass_top' },
    { label: t('hotdesk.blocked'),  value: blockedCount, accent: C.txDim,       icon: 'block' },
  ];

  return (
    <div className="hd-ch fade-in">
      <style>{HD_CSS}</style>

      {/* ── Stat cards row ─────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        {stats.map(s => (
          <div
            key={s.label}
            className="hd-stat"
            style={{ '--accent': s.accent } as React.CSSProperties}
          >
            {/* Subtle accent glow */}
            <div aria-hidden style={{
              position: 'absolute', top: -40, right: -40,
              width: 120, height: 120,
              background: `radial-gradient(circle, ${s.accent}22 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />

            {/* Icon + label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: T.radius.md,
                  background: `${s.accent}1a`, color: s.accent, fontSize: 15,
                }}
              >
                {s.icon}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.12em', color: C.txMuted,
              }}>
                {s.label}
              </span>
            </div>

            {/* Value */}
            <div style={{ position: 'relative' }}>
              <span className="mono" style={{
                fontSize: 28, fontWeight: 700, lineHeight: 1.1,
                color: C.tx, letterSpacing: '-0.01em',
              }}>
                {s.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── CHECK IN banner (only if user has a pending reservation today) ── */}
      {myPendingRes && onConfirmPresence && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: '16px 24px', marginBottom: 20,
          background: C.sf, border: `1px solid ${C.sfHigh}`,
          borderRadius: T.radius.lg, position: 'relative', overflow: 'hidden',
        }}>
          {/* Green glow background */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse at center, ${C.greenDim} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', textAlign: 'center' }}>
            <div style={{
              fontSize: 11, color: C.txMuted, marginBottom: 8,
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: '.08em', textTransform: 'uppercase',
            }}>
              {t('hotdesk.checkInDesc')}
            </div>
            <button
              className="hd-btn hd-btn-green pulse-green"
              onClick={handleCheckIn}
              style={{
                padding: '12px 40px', fontSize: 14, fontWeight: 700,
                borderRadius: T.radius.lg, letterSpacing: '.08em',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>login</span>
              {t('hotdesk.checkIn')} — {myPendingRes.seatId}
            </button>
          </div>
        </div>
      )}

      {/* ── Legend row ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: 14, marginBottom: 12,
      }}>
        {[
          { label: t('hotdesk.free'),     color: C.green },
          { label: t('hotdesk.occupied'), color: C.primaryStrong },
          { label: t('hotdesk.fixed'),    color: C.red },
          { label: t('hotdesk.mine'),     color: C.amber },
          { label: t('hotdesk.pending'),  color: C.amber },
          { label: t('hotdesk.blocked'),  color: C.txDim },
        ].map(leg => (
          <div key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.txMuted }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: leg.color }} />
            {leg.label}
          </div>
        ))}
      </div>

      {/* ── Zoom controls ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', marginBottom: 8 }}>
        <button
          className="hd-btn hd-btn-ghost"
          onClick={() => setZoom(z => clamp(Math.round((z + 0.1) * 100) / 100))}
          style={{ padding: '4px 10px', fontSize: 14 }}
        >+</button>
        <button
          className="hd-btn hd-btn-ghost"
          onClick={() => setZoom(z => clamp(Math.round((z - 0.1) * 100) / 100))}
          style={{ padding: '4px 10px', fontSize: 14 }}
        >-</button>
        <button
          className="hd-btn hd-btn-ghost"
          onClick={fitMap}
          title={t('hotdesk.fitMap')}
          style={{ padding: '4px 12px', fontSize: 11 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>fit_screen</span>
          {t('hotdesk.fitMap')}
        </button>
        <span className="mono" style={{ fontSize: 11, color: C.txDim, marginLeft: 4 }}>
          {Math.round(zoom * 100)}%
        </span>
        <span style={{ fontSize: 10, color: C.txDim, marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace" }}>
          {t('hotdesk.scrollZoomHint')}
        </span>
      </div>

      {/* ── Map container ──────────────────────────────────────── */}
      {children ? (
        <div style={{
          flex: 1, minHeight: 0, borderRadius: T.radius.lg,
          border: `1px solid ${C.sfHigh}`,
          background: C.sfLow, overflow: 'hidden',
        }}>
          {children}
        </div>
      ) : (
        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            overflow: 'hidden', borderRadius: T.radius.lg,
            border: `1px solid ${C.sfHigh}`,
            cursor: panning ? 'grabbing' : 'grab',
            background: C.sfLow, userSelect: 'none',
          }}
        >
          <div style={{
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            transformOrigin: 'top left',
            transition: panning ? 'none' : 'transform .15s ease',
          }}>
            <OfficeSVG hd={hd} onSeat={onSeat} currentUser={currentUser} />
          </div>
        </div>
      )}

      {/* ── Footer hint ────────────────────────────────────────── */}
      <div style={{
        marginTop: 10, fontSize: 11, color: C.txDim,
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: '.05em',
      }}>
        {t('hotdesk.reserve')} · <span style={{ color: C.amber }}>● {t('hotdesk.mine')}</span>
      </div>
    </div>
  );
}

export { HDMapView };
