// @ts-nocheck
import React, { useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SS } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { SEATS } from '../domain/entities/seats';
import { TODAY } from '@/shared/lib/constants';
import { CHRONO_THEME as T } from '../../chrono/shared/theme';

/* ─── Tokens (same palette as Time Clock) ──────────────────────────────────── */
const C = {
  bg: T.color.bg, sf: T.color.surface, sfHigh: T.color.surfaceHigh,
  sfLow: T.color.surfaceLow, sfLowest: T.color.surfaceLowest,
  tx: T.color.text, txMuted: T.color.textMuted, txDim: T.color.textDim,
  primary: T.color.primary, primaryStrong: T.color.primaryStrong,
  primaryDim: T.color.primaryDim, primaryOn: T.color.primaryOn,
  green: T.color.secondary, greenStrong: T.color.secondaryStrong, greenDim: T.color.secondaryDim,
  red: T.color.dangerStrong, redDim: T.color.dangerDim,
  amber: T.color.warning, amberDim: T.color.warningDim,
  purple: T.color.tertiary, purpleDim: T.color.tertiaryDim,
  border: T.color.border,
};

/* ─── CSS (mirrors .ch in ChronoPage) ──────────────────────────────────────── */
const CSS = `
.hd{font-family:${T.font.body};background:${C.bg};color:${C.tx};height:100%;overflow:hidden;display:flex;}
.hd *{box-sizing:border-box;margin:0;padding:0;}
.hd .mono{font-family:${T.font.mono};}
.hd .fade-in{animation:hdFade .3s ease forwards;}
@keyframes hdFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes hdPulse{0%{box-shadow:0 0 0 0 rgba(74,225,118,.5)}70%{box-shadow:0 0 0 16px rgba(74,225,118,0)}100%{box-shadow:0 0 0 0 rgba(74,225,118,0)}}
.hd .pulse-green{animation:hdPulse 2s cubic-bezier(.215,.61,.355,1) infinite;}
.hd .nav-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:${T.radius.md};cursor:pointer;font-size:13px;font-weight:500;color:${C.txDim};transition:background .15s,color .15s,box-shadow .15s;border:1px solid transparent;letter-spacing:.01em;width:100%;background:transparent;font-family:inherit;text-align:left;}
.hd .nav-item:hover{background:${C.sfLow};color:${C.txMuted};}
.hd .nav-item.active{background:${C.sfHigh};color:${C.primary};box-shadow:0 0 10px ${C.primaryDim};}
.hd .hd-card{background:${C.sf};border:1px solid ${C.sfHigh};border-radius:${T.radius.lg};padding:20px;position:relative;overflow:hidden;}
.hd .hd-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,${C.primaryStrong});}
.hd .hd-stat{background:${C.sf};border:1px solid ${C.sfHigh};border-radius:${T.radius.lg};padding:18px 20px;position:relative;overflow:hidden;}
.hd .hd-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,${C.primaryStrong});}
.hd .hd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:${T.radius.lg};font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:${T.font.mono};letter-spacing:.04em;text-transform:uppercase;transition:all .2s;}
.hd .hd-btn-green{background:linear-gradient(135deg,${C.green},${C.greenStrong});color:${C.primaryOn};box-shadow:0 4px 24px ${C.greenDim};}
.hd .hd-btn-green:hover{box-shadow:0 6px 32px rgba(0,185,84,.4);transform:translateY(-1px);}
.hd .hd-btn-primary{background:linear-gradient(135deg,${C.primary},${C.primaryStrong});color:${C.primaryOn};box-shadow:0 4px 20px ${C.primaryDim};}
.hd .hd-btn-primary:hover{box-shadow:0 6px 28px rgba(77,142,255,.35);transform:translateY(-1px);}
.hd .hd-btn-ghost{background:${C.sfHigh}80;color:${C.txMuted};border:1px solid ${C.border}40;backdrop-filter:blur(8px);}
.hd .hd-btn-ghost:hover{border-color:${C.primary};color:${C.primary};background:${C.primaryDim};}
.hd select{width:100%;padding:8px 12px;background:${C.bg};border:1px solid ${C.sfHigh};border-radius:5px;color:${C.tx};font-size:13px;font-family:${T.font.mono};outline:none;appearance:none;cursor:pointer;transition:border-color .15s;}
.hd select:focus{border-color:${C.primaryStrong};}
`;

type View = 'map' | 'table';

interface Props {
  hd: any;
  onSeat: (id: string) => void;
  currentUser: any;
  onConfirmPresence?: (seatId: string, date: string) => void;
  children?: React.ReactNode;
  view?: View;
  onViewChange?: (v: View) => void;
  buildingFloorSelector?: React.ReactNode;
}

function HDMapView({ hd, onSeat, currentUser, onConfirmPresence, children, view = 'map', onViewChange, buildingFloorSelector }: Props) {
  const { t } = useTranslation();
  const blockedSeats = hd.blockedSeats || {};

  const counts = useMemo(() => {
    const r = { free: 0, occupied: 0, fixed: 0, blocked: 0, pending: 0 };
    SEATS.forEach(s => {
      const st = ReservationService.statusOf(s.id, TODAY, hd.fixed, hd.reservations, blockedSeats);
      if (st === SS.FREE) r.free++; else if (st === SS.FIXED) r.fixed++;
      else if (st === SS.BLOCKED) r.blocked++; else if (st === SS.PENDING) r.pending++;
      else r.occupied++;
    });
    return r;
  }, [hd.fixed, hd.reservations, blockedSeats]);

  const totalSeats = SEATS.length;
  const freeP = totalSeats > 0 ? Math.round((counts.free / totalSeats) * 100) : 0;
  const occP  = totalSeats > 0 ? Math.round((counts.occupied / totalSeats) * 100) : 0;
  const fixP  = totalSeats > 0 ? Math.round((counts.fixed / totalSeats) * 100) : 0;

  const myPending = hd.reservations.find((r: any) => r.userId === currentUser.id && r.date === TODAY && r.status === 'pending');
  const myToday = hd.reservations.find((r: any) => r.userId === currentUser.id && r.date === TODAY);

  const handleCheckIn = () => { if (myPending && onConfirmPresence) onConfirmPresence(myPending.seatId, TODAY); };

  const NAV = [
    { id: 'map' as View,   label: t('hotdesk.officeMap'),   icon: 'map' },
    { id: 'table' as View, label: t('hotdesk.monthlyView'), icon: 'calendar_month' },
  ];

  return (
    <div className="hd">
      <style>{CSS}</style>

      {/* ═══════════ Sidebar (Time Clock pattern) ═══════════ */}
      <aside style={{
        position: 'sticky', top: 0, width: 240, minWidth: 240, height: '100%',
        minHeight: 'calc(100vh - 52px)', alignSelf: 'stretch',
        background: 'rgba(14,14,14,.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,.05)',
        boxShadow: '0 0 60px rgba(77,142,255,.04)',
        display: 'flex', flexDirection: 'column', padding: 16, gap: 4,
        zIndex: 30, overflowY: 'auto',
      }}>
        {/* Brand */}
        <div style={{ padding: '24px 12px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'rgba(74,225,118,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(74,225,118,.25)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: C.green }}>event_seat</span>
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: C.tx, letterSpacing: '-0.01em', lineHeight: 1 }}>
              Hot Desk
            </h1>
            <p style={{ fontSize: 10, color: C.tx, opacity: .4, fontWeight: 700, letterSpacing: '.1em', marginTop: 4, textTransform: 'uppercase' }}>
              {t('hotdesk.moduleSubtitle')}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '16px 0' }}>
          {NAV.map(item => (
            <button
              key={item.id}
              className={`nav-item${view === item.id ? ' active' : ''}`}
              onClick={() => onViewChange?.(item.id)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* ── Campus Filter card ── */}
        {buildingFloorSelector && (
          <div className="hd-card" style={{ '--accent': C.primaryStrong, padding: 16 } as React.CSSProperties}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 80, height: 80, background: `radial-gradient(circle, ${C.primaryDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <h3 style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: C.txDim, marginBottom: 12, position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: C.primary }}>apartment</span>
              {t('hotdesk.campusFilter')}
            </h3>
            <div style={{ position: 'relative' }}>
              {buildingFloorSelector}
            </div>
          </div>
        )}

        {/* ── Live Status card ── */}
        <div className="hd-card" style={{ '--accent': C.green, marginTop: buildingFloorSelector ? 8 : 0 } as React.CSSProperties}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 80, height: 80, background: `radial-gradient(circle, ${C.greenDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
          <h3 style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: C.txDim, marginBottom: 14, position: 'relative' }}>
            {t('hotdesk.liveStatus')}
          </h3>
          {[
            { label: t('hotdesk.free'), pct: freeP, color: C.green, val: counts.free },
            { label: t('hotdesk.occupied'), pct: occP, color: C.primaryStrong, val: counts.occupied },
            { label: t('hotdesk.fixed'), pct: fixP, color: C.red, val: counts.fixed },
            { label: t('hotdesk.mine'), pct: null, color: C.amber, val: myToday ? 1 : 0 },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.color }} />
                <span style={{ fontSize: 12, color: C.tx }}>{row.label}</span>
              </div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: C.txMuted }}>
                {row.pct !== null ? `${row.pct}%` : row.val}
              </span>
            </div>
          ))}
        </div>

        {/* ── CHECK IN card ── */}
        {myPending && onConfirmPresence && (
          <div className="hd-card fade-in" style={{ '--accent': C.greenStrong, textAlign: 'center', marginTop: 8 } as React.CSSProperties}>
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, ${C.greenDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: C.green, marginBottom: 8, display: 'block', position: 'relative' }}>login</span>
            <div style={{ fontSize: 11, color: C.txMuted, marginBottom: 12, lineHeight: 1.5, position: 'relative' }}>
              {t('hotdesk.checkInDesc')}
            </div>
            <button className="hd-btn hd-btn-green pulse-green" onClick={handleCheckIn} style={{ width: '100%', padding: '14px 0', fontSize: 14, position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
              {t('hotdesk.checkIn')}
            </button>
            <div className="mono" style={{ fontSize: 11, color: C.green, marginTop: 8, fontWeight: 600, position: 'relative' }}>
              {myPending.seatId}
            </div>
          </div>
        )}

        {/* ── Instant Booking card ── */}
        {!myToday && (
          <div className="hd-card" style={{ '--accent': C.primaryStrong, marginTop: 8 } as React.CSSProperties}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 80, height: 80, background: `radial-gradient(circle, ${C.primaryDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <h3 style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 4, position: 'relative' }}>
              {t('hotdesk.instantBooking')}
            </h3>
            <p style={{ fontSize: 11, color: C.txDim, lineHeight: 1.5, marginBottom: 14, position: 'relative' }}>
              {t('hotdesk.instantBookingDesc')}
            </p>
            <button className="hd-btn hd-btn-primary" style={{ width: '100%', position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
              {t('hotdesk.quickReserve')}
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 'auto', padding: '14px 12px', fontSize: 10, color: C.txDim, letterSpacing: '.08em', fontFamily: T.font.mono }}>
          &copy; {new Date().getFullYear()} WorkSuite
        </div>
      </aside>

      {/* ═══════════ Main content ═══════════ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header bar */}
        <div style={{
          padding: '20px 28px 16px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${C.sfHigh}`,
        }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: C.tx, letterSpacing: '-0.01em' }}>
              {view === 'map' ? t('hotdesk.officeMap') : t('hotdesk.monthlyView')}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div className="hd-stat" style={{ '--accent': C.green, padding: '10px 16px' } as React.CSSProperties}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txDim }}>{t('hotdesk.availableDesks')}</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: C.green, marginTop: 2 }}>{counts.free} / {totalSeats}</div>
            </div>
            {myToday && (
              <div className="hd-stat" style={{ '--accent': C.primary, padding: '10px 16px' } as React.CSSProperties}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txDim }}>{t('hotdesk.activeBooking')}</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: C.primary, marginTop: 2 }}>{t('hotdesk.desk')} {myToday.seatId}</div>
              </div>
            )}
          </div>
        </div>

        {/* Blueprint area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          {children || (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.txDim, padding: 60, height: '100%' }}>
              {t('hotdesk.selectBuildingFloor')}
            </div>
          )}
        </div>

        {/* Bottom cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          padding: '12px 28px 16px', flexShrink: 0, borderTop: `1px solid ${C.sfHigh}`,
        }}>
          <div className="hd-card" style={{ '--accent': C.purple, display: 'flex', alignItems: 'center', gap: 16, padding: 16 } as React.CSSProperties}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: C.purple, padding: 8, background: C.purpleDim, borderRadius: T.radius.lg }}>insights</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{t('hotdesk.peakInsightTitle')}</div>
              <div style={{ fontSize: 10, color: C.txDim, marginTop: 2, lineHeight: 1.4 }}>{t('hotdesk.peakInsightDesc')}</div>
            </div>
            <button className="hd-btn hd-btn-ghost" style={{ padding: '6px 12px', fontSize: 10 }}>{t('hotdesk.viewTrends')}</button>
          </div>
          {myToday ? (
            <div className="hd-card" style={{ '--accent': C.green, display: 'flex', alignItems: 'center', gap: 16, padding: 16 } as React.CSSProperties}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: C.green, padding: 8, background: C.greenDim, borderRadius: T.radius.lg }}>event_seat</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txDim }}>{t('hotdesk.currentSelection')}</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginTop: 2 }}>{t('hotdesk.desk')} {myToday.seatId}</div>
              </div>
              <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: T.radius.md, background: myToday.status === 'confirmed' ? C.greenDim : C.amberDim, color: myToday.status === 'confirmed' ? C.green : C.amber, fontWeight: 600 }}>
                {myToday.status === 'confirmed' ? t('hotdesk.confirmed') : t('hotdesk.pending')}
              </span>
            </div>
          ) : (
            <div className="hd-card" style={{ '--accent': C.txDim, display: 'flex', alignItems: 'center', gap: 16, padding: 16, opacity: .6 } as React.CSSProperties}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: C.txDim, padding: 8, background: `${C.txDim}15`, borderRadius: T.radius.lg }}>event_busy</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{t('hotdesk.noBookingToday')}</div>
                <div style={{ fontSize: 10, color: C.txDim, marginTop: 2 }}>{t('hotdesk.clickToReserve')}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { HDMapView };
