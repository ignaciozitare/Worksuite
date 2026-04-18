// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SS } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { SEATS } from '../domain/entities/seats';
import { TODAY } from '@/shared/lib/constants';
import { CHRONO_THEME as T } from '../../chrono/shared/theme';

/* ─── Design tokens from Chrono ────────────────────────────────────────────── */
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
.hd-shell{font-family:${T.font.body};color:${C.tx};display:flex;flex-direction:column;height:100%;overflow:hidden;background:${C.bg};}
.hd-shell *{box-sizing:border-box;margin:0;padding:0;}
.hd-shell .mono{font-family:${T.font.mono};}
.hd-shell .fade-in{animation:hdFade .3s ease forwards;}
@keyframes hdFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes hdPulse{0%{box-shadow:0 0 0 0 rgba(74,225,118,.5)}70%{box-shadow:0 0 0 16px rgba(74,225,118,0)}100%{box-shadow:0 0 0 0 rgba(74,225,118,0)}}
.hd-shell .pulse-green{animation:hdPulse 2s cubic-bezier(.215,.61,.355,1) infinite;}
.hd-card{background:${C.sf};border:1px solid ${C.sfHigh};border-radius:${T.radius.lg};padding:20px;position:relative;overflow:hidden;}
.hd-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,${C.primaryStrong});}
.hd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:${T.radius.lg};font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:${T.font.mono};letter-spacing:.04em;text-transform:uppercase;transition:all .2s;}
.hd-btn-green{background:linear-gradient(135deg,${C.green},${C.greenStrong});color:${C.primaryOn};box-shadow:0 4px 24px ${C.greenDim};}
.hd-btn-green:hover{box-shadow:0 6px 32px rgba(0,185,84,.4);transform:translateY(-1px);}
.hd-btn-primary{background:linear-gradient(135deg,${C.primary},${C.primaryStrong});color:${C.primaryOn};box-shadow:0 4px 20px ${C.primaryDim};}
.hd-btn-primary:hover{box-shadow:0 6px 28px rgba(77,142,255,.35);transform:translateY(-1px);}
.hd-btn-ghost{background:${C.sfHigh}90;color:${C.txMuted};border:1px solid ${C.border}40;backdrop-filter:blur(8px);}
.hd-btn-ghost:hover{border-color:${C.primary};color:${C.primary};background:${C.primaryDim};}
.hd-select{width:100%;padding:10px 12px;background:${C.sfLow};border:1px solid ${C.sfHigh};border-radius:${T.radius.md};color:${C.tx};font-size:13px;font-family:inherit;outline:none;appearance:none;cursor:pointer;}
.hd-select:focus{border-color:${C.primaryStrong};}
`;

interface Props {
  hd: any;
  onSeat: (id: string) => void;
  currentUser: any;
  onConfirmPresence?: (seatId: string, date: string) => void;
  children?: React.ReactNode;
  selectedSeatId?: string | null;
}

function HDMapView({ hd, onSeat, currentUser, onConfirmPresence, children, selectedSeatId }: Props) {
  const { t } = useTranslation();
  const blockedSeats = hd.blockedSeats || {};

  // ── Counts ──
  const counts = useMemo(() => {
    const result = { free: 0, occupied: 0, fixed: 0, blocked: 0, pending: 0 };
    SEATS.forEach(s => {
      const st = ReservationService.statusOf(s.id, TODAY, hd.fixed, hd.reservations, blockedSeats);
      if (st === SS.FREE) result.free++;
      else if (st === SS.FIXED) result.fixed++;
      else if (st === SS.BLOCKED) result.blocked++;
      else if (st === SS.PENDING) result.pending++;
      else result.occupied++;
    });
    return result;
  }, [hd.fixed, hd.reservations, blockedSeats]);

  const totalSeats = SEATS.length;
  const freePercent = totalSeats > 0 ? Math.round((counts.free / totalSeats) * 100) : 0;
  const occPercent = totalSeats > 0 ? Math.round((counts.occupied / totalSeats) * 100) : 0;
  const fixPercent = totalSeats > 0 ? Math.round((counts.fixed / totalSeats) * 100) : 0;

  // ── My today state ──
  const myPending = hd.reservations.find(
    (r: any) => r.userId === currentUser.id && r.date === TODAY && r.status === 'pending',
  );
  const myToday = hd.reservations.find(
    (r: any) => r.userId === currentUser.id && r.date === TODAY,
  );

  // ── Selected seat info ──
  const selSeat = selectedSeatId ? SEATS.find(s => s.id === selectedSeatId) : null;
  const selStatus = selSeat ? ReservationService.statusOf(selSeat.id, TODAY, hd.fixed, hd.reservations, blockedSeats) : null;
  const selRes = selSeat ? hd.reservations.find((r: any) => r.seatId === selSeat.id && r.date === TODAY) : null;

  const handleCheckIn = () => {
    if (myPending && onConfirmPresence) onConfirmPresence(myPending.seatId, TODAY);
  };

  return (
    <div className="hd-shell fade-in">
      <style>{CSS}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: C.primaryStrong, marginBottom: 4 }}>
              {t('hotdesk.moduleSubtitle')}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: C.tx, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              Hot Desk
            </h1>
            <p style={{ fontSize: 12, color: C.txDim, marginTop: 4 }}>
              {t('hotdesk.subtitle')}
            </p>
          </div>
          {/* Top-right stat pills */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txDim }}>{t('hotdesk.availableDesks')}</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: C.green }}>{counts.free} / {totalSeats}</div>
            </div>
            {myToday && (
              <div style={{ textAlign: 'center', padding: '8px 16px', background: C.sf, borderRadius: T.radius.lg, border: `1px solid ${C.sfHigh}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txDim }}>{t('hotdesk.activeBooking')}</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: C.primary }}>{myToday.seatId}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main body: sidebar + blueprint + selection ──────────────────── */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden', padding: '16px 28px 0' }}>

        {/* ── Left sidebar ──────────────────────────────────────────────── */}
        <aside style={{
          width: 220, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 16,
          paddingRight: 20, overflow: 'auto', flexShrink: 0,
        }}>
          {/* Live Status */}
          <div className="hd-card" style={{ '--accent': C.green } as React.CSSProperties}>
            <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.txMuted, marginBottom: 14 }}>
              {t('hotdesk.liveStatus')}
            </h3>
            {[
              { label: t('hotdesk.free'), pct: freePercent, color: C.green, count: counts.free },
              { label: t('hotdesk.occupied'), pct: occPercent, color: C.primaryStrong, count: counts.occupied },
              { label: t('hotdesk.fixed'), pct: fixPercent, color: C.red, count: counts.fixed },
              { label: t('hotdesk.mine'), pct: null, color: C.amber, count: myToday ? 1 : 0 },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.color }} />
                  <span style={{ fontSize: 12, color: C.tx }}>{row.label}</span>
                </div>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: C.txMuted }}>
                  {row.pct !== null ? `${row.pct}%` : row.count}
                </span>
              </div>
            ))}
          </div>

          {/* Check-in card */}
          {myPending && onConfirmPresence && (
            <div className="hd-card" style={{ '--accent': C.greenStrong, textAlign: 'center' } as React.CSSProperties}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: C.green, marginBottom: 8, display: 'block' }}>login</span>
              <div style={{ fontSize: 11, color: C.txMuted, marginBottom: 12, lineHeight: 1.5 }}>
                {t('hotdesk.checkInDesc')}
              </div>
              <button className="hd-btn hd-btn-green pulse-green" onClick={handleCheckIn} style={{ width: '100%', padding: '14px 0', fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                {t('hotdesk.checkIn')}
              </button>
              <div className="mono" style={{ fontSize: 11, color: C.green, marginTop: 8, fontWeight: 600 }}>
                {myPending.seatId}
              </div>
            </div>
          )}

          {/* Instant Booking */}
          {!myToday && (
            <div className="hd-card" style={{ '--accent': C.primaryStrong } as React.CSSProperties}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 4 }}>
                {t('hotdesk.instantBooking')}
              </h3>
              <p style={{ fontSize: 11, color: C.txDim, lineHeight: 1.5, marginBottom: 14 }}>
                {t('hotdesk.instantBookingDesc')}
              </p>
              <button className="hd-btn hd-btn-primary" style={{ width: '100%' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
                {t('hotdesk.quickReserve')}
              </button>
            </div>
          )}
        </aside>

        {/* ── Center: Blueprint map ─────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children || (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.txDim }}>
              {t('hotdesk.selectBuildingFloor')}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom cards row ──────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        padding: '16px 28px 20px', flexShrink: 0,
      }}>
        {/* Peak Utilization Insight */}
        <div className="hd-card" style={{ '--accent': C.purple, display: 'flex', alignItems: 'center', gap: 16 } as React.CSSProperties}>
          <span className="material-symbols-outlined" style={{
            fontSize: 28, color: C.purple, padding: 10,
            background: C.purpleDim, borderRadius: T.radius.lg,
          }}>insights</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{t('hotdesk.peakInsightTitle')}</div>
            <div style={{ fontSize: 11, color: C.txDim, marginTop: 2, lineHeight: 1.4 }}>{t('hotdesk.peakInsightDesc')}</div>
          </div>
          <button className="hd-btn hd-btn-ghost" style={{ padding: '6px 14px', fontSize: 11 }}>
            {t('hotdesk.viewTrends')}
          </button>
        </div>

        {/* Active booking summary */}
        {myToday ? (
          <div className="hd-card" style={{ '--accent': C.green, display: 'flex', alignItems: 'center', gap: 16 } as React.CSSProperties}>
            <span className="material-symbols-outlined" style={{
              fontSize: 28, color: C.green, padding: 10,
              background: C.greenDim, borderRadius: T.radius.lg,
            }}>event_seat</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.txDim }}>{t('hotdesk.currentSelection')}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginTop: 2 }}>
                {t('hotdesk.desk')} {myToday.seatId}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: T.radius.md, background: C.greenDim, color: C.green, fontWeight: 600 }}>
                {myToday.status === 'confirmed' ? t('hotdesk.confirmed') : t('hotdesk.pending')}
              </span>
            </div>
          </div>
        ) : (
          <div className="hd-card" style={{ '--accent': C.txDim, display: 'flex', alignItems: 'center', gap: 16, opacity: .6 } as React.CSSProperties}>
            <span className="material-symbols-outlined" style={{
              fontSize: 28, color: C.txDim, padding: 10,
              background: `${C.txDim}15`, borderRadius: T.radius.lg,
            }}>event_busy</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{t('hotdesk.noBookingToday')}</div>
              <div style={{ fontSize: 11, color: C.txDim, marginTop: 2 }}>{t('hotdesk.clickToReserve')}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 28px 12px', fontSize: 10, color: C.txDim,
        fontFamily: T.font.mono, letterSpacing: '.06em',
        borderTop: `1px solid ${C.sfHigh}`,
      }}>
        &copy; {new Date().getFullYear()} WORKSUITE
      </div>
    </div>
  );
}

export { HDMapView };
