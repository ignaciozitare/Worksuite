// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SS } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { SEATS } from '../domain/entities/seats';
import { TODAY } from '@/shared/lib/constants';
import { CHRONO_THEME as T } from '../../chrono/shared/theme';

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
.hd .hd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:${T.radius.lg};font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:${T.font.mono};letter-spacing:.04em;text-transform:uppercase;transition:all .2s;}
.hd .hd-btn-green{background:linear-gradient(135deg,${C.green},${C.greenStrong});color:${C.primaryOn};box-shadow:0 4px 24px ${C.greenDim};}
.hd .hd-btn-green:hover{box-shadow:0 6px 32px rgba(0,185,84,.4);transform:translateY(-1px);}
.hd .hd-btn-primary{background:linear-gradient(135deg,${C.primary},${C.primaryStrong});color:${C.primaryOn};box-shadow:0 4px 20px ${C.primaryDim};}
.hd .hd-btn-primary:hover{box-shadow:0 6px 28px rgba(77,142,255,.35);transform:translateY(-1px);}
.hd .hd-btn-ghost{background:${C.sfHigh}80;color:${C.txMuted};border:1px solid ${C.border}40;backdrop-filter:blur(8px);}
.hd .hd-btn-ghost:hover{border-color:${C.primary};color:${C.primary};background:${C.primaryDim};}
.hd select{width:100%;padding:8px 12px;background:${C.bg};border:1px solid ${C.sfHigh};border-radius:5px;color:${C.tx};font-size:13px;font-family:${T.font.mono};outline:none;appearance:none;cursor:pointer;transition:border-color .15s;}
.hd select:focus{border-color:${C.primaryStrong};}
.hd .float-card{background:${C.sf};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid ${C.sfHigh};border-radius:${T.radius.lg};padding:12px 16px;position:relative;overflow:hidden;box-shadow:var(--shadow);}
.hd .float-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,${C.primaryStrong});}
.hd .modal-backdrop{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);}
.hd .modal-body{background:${C.sf};border:1px solid ${C.sfHigh};border-radius:12px;max-width:560px;width:100%;max-height:80vh;overflow:auto;box-shadow:var(--shadow);}
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
  building?: { id: string; name: string; city?: string; address?: string } | null;
  onQuickReserve?: () => void;
  floorSeatIds?: string[];
}

function HDMapView({ hd, onSeat, currentUser, onConfirmPresence, children, view = 'map', onViewChange, buildingFloorSelector, building, onQuickReserve, floorSeatIds }: Props) {
  const { t } = useTranslation();
  const [showTrends, setShowTrends] = useState(false);
  const blockedSeats = hd.blockedSeats || {};

  // Use floor seats if available, fallback to global SEATS
  const seatIds = floorSeatIds ?? SEATS.map(s => s.id);

  const counts = useMemo(() => {
    const r = { free: 0, occupied: 0, fixed: 0, blocked: 0, pending: 0 };
    seatIds.forEach(id => {
      const st = ReservationService.statusOf(id, TODAY, hd.fixed, hd.reservations, blockedSeats);
      if (st === SS.FREE) r.free++; else if (st === SS.FIXED) r.fixed++;
      else if (st === SS.BLOCKED) r.blocked++; else if (st === SS.PENDING) r.pending++;
      else r.occupied++;
    });
    return r;
  }, [seatIds, hd.fixed, hd.reservations, blockedSeats]);

  const totalSeats = seatIds.length;

  const myPending = hd.reservations.find((r: any) => r.userId === currentUser.id && r.date === TODAY && r.status === 'pending');
  const myToday = hd.reservations.find((r: any) => r.userId === currentUser.id && r.date === TODAY);

  const handleCheckIn = () => { if (myPending && onConfirmPresence) onConfirmPresence(myPending.seatId, TODAY); };
  const handleQuickReserve = () => {
    if (onQuickReserve) { onQuickReserve(); return; }
    const freeSeat = SEATS.find(s => ReservationService.statusOf(s.id, TODAY, hd.fixed, hd.reservations, blockedSeats) === SS.FREE);
    if (freeSeat) onSeat(freeSeat.id);
  };

  const NAV = [
    { id: 'map' as View,   label: t('hotdesk.officeMap'),   icon: 'map' },
    { id: 'table' as View, label: t('hotdesk.monthlyView'), icon: 'calendar_month' },
  ];

  const hubName = building?.city ? ` ${building.city} Hub` : '';

  // Calculate real trend data from reservations for this floor's seats
  const trendData = useMemo(() => {
    const days = [
      { day: t('hotdesk.trendMon'), dow: 1 },
      { day: t('hotdesk.trendTue'), dow: 2 },
      { day: t('hotdesk.trendWed'), dow: 3 },
      { day: t('hotdesk.trendThu'), dow: 4 },
      { day: t('hotdesk.trendFri'), dow: 5 },
    ];
    if (totalSeats === 0) return days.map(d => ({ ...d, pct: 0 }));
    // Count reservations per day-of-week for seats on this floor
    const dowCounts: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    const floorSet = new Set(seatIds);
    hd.reservations.forEach((r: any) => {
      if (!floorSet.has(r.seatId)) return;
      const d = new Date(r.date);
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) {
        const key = r.date;
        if (!dowCounts[dow].includes(key)) dowCounts[dow].push(key);
      }
    });
    // Calculate average occupancy per DOW
    return days.map(d => {
      const dates = dowCounts[d.dow] || [];
      if (dates.length === 0) return { ...d, pct: 0 };
      // Count unique dates and average reservations per date
      const dateSet = new Set<string>();
      let totalRes = 0;
      hd.reservations.forEach((r: any) => {
        if (!floorSet.has(r.seatId)) return;
        const rd = new Date(r.date);
        if (rd.getDay() === d.dow) {
          dateSet.add(r.date);
          totalRes++;
        }
      });
      const avgPerDay = dateSet.size > 0 ? totalRes / dateSet.size : 0;
      const pct = Math.round((avgPerDay / totalSeats) * 100);
      return { ...d, pct: Math.min(pct, 100) };
    });
  }, [hd.reservations, seatIds, totalSeats]);

  return (
    <div className="hd">
      <style>{CSS}</style>

      {/* ═══════ Sidebar ═══════ */}
      <aside style={{
        position: 'sticky', top: 0, width: 240, minWidth: 240,
        height: 'calc(100vh - 52px)', maxHeight: 'calc(100vh - 52px)',
        background: C.sfLowest, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRight: `1px solid var(--bd)`,
        boxShadow: `0 0 60px ${C.primaryDim}`,
        display: 'flex', flexDirection: 'column', padding: 16, gap: 4, zIndex: 30, overflowY: 'auto',
      }}>
        {/* Brand */}
        <div style={{ padding: '24px 12px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: C.greenDim, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.green}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: C.green }}>event_seat</span>
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: C.tx, letterSpacing: '-0.01em', lineHeight: 1 }}>Hot Desk</h1>
            <p style={{ fontSize: 10, color: C.tx, opacity: .4, fontWeight: 700, letterSpacing: '.1em', marginTop: 4, textTransform: 'uppercase' }}>{t('hotdesk.moduleSubtitle')}</p>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '16px 0' }}>
          {NAV.map(item => (
            <button key={item.id} className={`nav-item${view === item.id ? ' active' : ''}`} onClick={() => onViewChange?.(item.id)}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </button>
          ))}
        </nav>

        {buildingFloorSelector && (
          <div className="hd-card" style={{ '--accent': C.primaryStrong, padding: 16 } as React.CSSProperties}>
            <div aria-hidden style={{ position: 'absolute', top: -30, right: -30, width: 80, height: 80, background: `radial-gradient(circle, ${C.primaryDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <h3 style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: C.txDim, marginBottom: 12, position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: C.primary }}>apartment</span>
              {t('hotdesk.buildingFilter')}
            </h3>
            <div style={{ position: 'relative' }}>{buildingFloorSelector}</div>
          </div>
        )}

        {myPending && onConfirmPresence && (
          <div className="hd-card fade-in" style={{ '--accent': C.greenStrong, textAlign: 'center', marginTop: 8 } as React.CSSProperties}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, ${C.greenDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: C.green, marginBottom: 8, display: 'block', position: 'relative' }}>login</span>
            <div style={{ fontSize: 11, color: C.txMuted, marginBottom: 12, lineHeight: 1.5, position: 'relative' }}>{t('hotdesk.checkInDesc')}</div>
            <button className="hd-btn hd-btn-green pulse-green" onClick={handleCheckIn} style={{ width: '100%', padding: '14px 0', fontSize: 14, position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
              {t('hotdesk.checkIn')}
            </button>
            <div className="mono" style={{ fontSize: 11, color: C.green, marginTop: 8, fontWeight: 600, position: 'relative' }}>{myPending.seatId}</div>
          </div>
        )}

        <div className="hd-card" style={{ '--accent': C.green, marginTop: 8 } as React.CSSProperties}>
          <div aria-hidden style={{ position: 'absolute', top: -30, right: -30, width: 80, height: 80, background: `radial-gradient(circle, ${C.greenDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
          <h3 style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: C.txDim, marginBottom: 14, position: 'relative' }}>{t('hotdesk.liveStatus')}</h3>
          {[
            { label: t('hotdesk.free'), pct: totalSeats > 0 ? Math.round((counts.free / totalSeats) * 100) : 0, color: C.green },
            { label: t('hotdesk.occupied'), pct: totalSeats > 0 ? Math.round((counts.occupied / totalSeats) * 100) : 0, color: C.primaryStrong },
            { label: t('hotdesk.fixed'), pct: totalSeats > 0 ? Math.round((counts.fixed / totalSeats) * 100) : 0, color: C.red },
            { label: t('hotdesk.mine'), pct: null, color: C.amber, val: myToday ? 1 : 0 },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.color }} />
                <span style={{ fontSize: 12, color: C.tx }}>{row.label}</span>
              </div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: C.txMuted }}>
                {row.pct !== null ? `${row.pct}%` : (row as any).val}
              </span>
            </div>
          ))}
        </div>

        {!myToday && (
          <div className="hd-card" style={{ '--accent': C.primaryStrong, marginTop: 8 } as React.CSSProperties}>
            <div aria-hidden style={{ position: 'absolute', top: -30, right: -30, width: 80, height: 80, background: `radial-gradient(circle, ${C.primaryDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <h3 style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 4, position: 'relative' }}>{t('hotdesk.instantBooking')}</h3>
            <p style={{ fontSize: 11, color: C.txDim, lineHeight: 1.5, marginBottom: 14, position: 'relative' }}>{t('hotdesk.instantBookingDesc')}</p>
            <button className="hd-btn hd-btn-primary" onClick={handleQuickReserve} style={{ width: '100%', position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
              {t('hotdesk.quickReserve')}
            </button>
          </div>
        )}

        <div style={{ marginTop: 'auto', padding: '14px 12px', fontSize: 10, color: C.txDim, letterSpacing: '.08em', fontFamily: T.font.mono }}>
          &copy; {new Date().getFullYear()} WorkSuite
        </div>
      </aside>

      {/* ═══════ Main ═══════ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 28px 12px', flexShrink: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: C.tx, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {t('hotdesk.subtitle')}{hubName ? ` ${hubName}.` : ''}
          </h2>
        </div>

        {/* Map area */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 0 }}>
          {children || (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.txDim, padding: 60, height: '100%' }}>
              {t('hotdesk.selectBuildingFloor')}
            </div>
          )}

          {/* Floating cards — bottom right: Available Desks + Active Booking stacked */}
          <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 20 }}>
            {/* Available Desks */}
            <div className="float-card" style={{ '--accent': C.green } as React.CSSProperties}>
              <div aria-hidden style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, background: `radial-gradient(circle, ${C.greenDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txDim, position: 'relative' }}>{t('hotdesk.availableDesks')}</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: C.green, marginTop: 4, position: 'relative' }}>{counts.free} / {totalSeats}</div>
            </div>

            {/* Active Booking — always visible */}
            <div className="float-card" style={{ '--accent': myToday ? C.primary : C.txDim } as React.CSSProperties}>
              <div aria-hidden style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, background: `radial-gradient(circle, ${myToday ? C.primaryDim : `${C.txDim}15`} 0%, transparent 70%)`, pointerEvents: 'none' }} />
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txDim, position: 'relative' }}>{t('hotdesk.activeBooking')}</div>
              {myToday ? (
                <>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: C.primary, marginTop: 4, position: 'relative' }}>{t('hotdesk.desk')} {myToday.seatId}</div>
                  <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: myToday.status === 'confirmed' ? C.greenDim : C.amberDim, color: myToday.status === 'confirmed' ? C.green : C.amber, fontWeight: 600, marginTop: 4, display: 'inline-block', position: 'relative' }}>
                    {myToday.status === 'confirmed' ? t('hotdesk.confirmed') : t('hotdesk.pending')}
                  </span>
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.txDim, marginTop: 4, position: 'relative' }}>{t('hotdesk.noBookingToday')}</div>
              )}
            </div>

            {/* Peak Insight card (below Active Booking) */}
            <div className="float-card" style={{ '--accent': C.purple, cursor: 'pointer' } as React.CSSProperties} onClick={() => setShowTrends(true)}>
              <div aria-hidden style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, background: `radial-gradient(circle, ${C.purpleDim} 0%, transparent 70%)`, pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.purple }}>insights</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.tx }}>{t('hotdesk.peakInsightTitle')}</div>
                  <div style={{ fontSize: 9, color: C.txDim, marginTop: 1 }}>{t('hotdesk.viewTrends')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar: legend + stats only */}
        <div style={{
          padding: '10px 28px 12px', flexShrink: 0, borderTop: `1px solid ${C.sfHigh}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {[
              { label: t('hotdesk.free'), color: C.green },
              { label: t('hotdesk.occupied'), color: C.primaryStrong },
              { label: t('hotdesk.fixed'), color: C.red },
              { label: t('hotdesk.mine'), color: C.amber },
              { label: t('hotdesk.pending'), color: C.amber },
              { label: t('hotdesk.blocked'), color: C.txDim },
              { label: t('hotdesk.delegated'), color: C.purple },
            ].map(leg => (
              <div key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.txMuted }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: leg.color }} />
                {leg.label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {[
              { label: t('hotdesk.free'), val: counts.free, color: C.green },
              { label: t('hotdesk.occupied'), val: counts.occupied, color: C.primaryStrong },
              { label: t('hotdesk.fixed'), val: counts.fixed, color: C.red },
              { label: t('hotdesk.seatsTotal'), val: totalSeats, color: C.txDim },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: C.txMuted }}>{s.label}:</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ Trends Modal ═══════ */}
      {showTrends && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowTrends(false)}>
          <div className="modal-body">
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.sfHigh}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: C.purple }}>insights</span>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>{t('hotdesk.peakInsightTitle')}</h3>
              </div>
              <button onClick={() => setShowTrends(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.txDim, display: 'flex' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 13, color: C.txMuted, marginBottom: 20, lineHeight: 1.6 }}>{t('hotdesk.peakInsightDesc')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {trendData.map(d => (
                  <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: C.txMuted, width: 36 }}>{d.day}</span>
                    <div style={{ flex: 1, height: 24, background: C.sfHigh, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${d.pct}%`, height: '100%', borderRadius: 4, background: d.pct > 85 ? `linear-gradient(90deg, ${C.amber}, ${C.red})` : `linear-gradient(90deg, ${C.green}, ${C.greenStrong})`, transition: 'width .6s ease' }} />
                    </div>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: d.pct > 85 ? C.amber : C.green, width: 36, textAlign: 'right' }}>{d.pct}%</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, padding: 16, background: C.sfLow, borderRadius: T.radius.lg, border: `1px solid ${C.sfHigh}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: C.amber }}>tips_and_updates</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{t('hotdesk.trendRecommendation')}</span>
                </div>
                <p style={{ fontSize: 11, color: C.txDim, lineHeight: 1.5 }}>{t('hotdesk.trendRecommendationDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { HDMapView };
