import React, { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { TODAY } from '@/shared/lib/constants';
import { fmtMonthYear } from '@/shared/lib/utils';
import { MiniCalendar } from '@/shared/ui/MiniCalendar';
import { CHRONO_THEME as T } from '../../chrono/shared/theme';
import { configRepo, reservationRepo } from '../container';
import type { HotDeskConfig } from '../domain/entities/HotDeskConfig';

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
  danger: T.color.danger,
  amber: T.color.warning, amberDim: T.color.warningDim,
  purple: T.color.tertiary, purpleStrong: T.color.tertiaryStrong,
  purpleDim: T.color.tertiaryDim,
  border: T.color.border,
};

function HDReserveModal({
  seatId, initDate, hd, onConfirm, onRelease, onClose, currentUser, wsUsers = [],
  onConfirmPresence, onDelegate,
}: {
  seatId: string; initDate: string; hd: any;
  onConfirm: (id: string, dates: string[]) => void;
  onRelease: (id: string, date: string) => void;
  onClose: () => void;
  currentUser: any;
  wsUsers?: any[];
  onConfirmPresence?: (seatId: string, date: string) => void;
  onDelegate?: (seatId: string, dates: string[], targetUserId: string) => void;
}) {
  const { t, locale } = useTranslation();
  const lang = locale;
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
  const [sel, sSel] = useState(initDate ? [initDate] : []);
  const [config, setConfig] = useState<HotDeskConfig | null>(null);
  const [showDelegate, setShowDelegate] = useState(false);
  const [delegateUser, setDelegateUser] = useState('');
  const [delegateDates, setDelegateDates] = useState<string[]>([]);
  const [justReserved, setJustReserved] = useState(false);

  const blockedSeats = hd.blockedSeats || {};
  const date = initDate || MOCK_TODAY;
  const st    = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations, blockedSeats);
  const res   = ReservationService.resOf(seatId, date, hd.reservations);
  const isMine = res?.userId === currentUser.id;
  const isPending = res?.status === 'pending' && isMine;
  const isBlocked = st === SeatStatus.BLOCKED;
  const isDelegated = st === SeatStatus.DELEGATED;

  const fixedOwner   = hd.fixed[seatId];
  const isMyFixed    = fixedOwner === currentUser.name;
  const isOtherFixed = st === SeatStatus.FIXED && !isMyFixed;

  useEffect(() => {
    configRepo.getConfig().then(setConfig).catch(() => {});
  }, []);

  const confirmationEnabled = config?.confirmationEnabled ?? false;

  const myReservedDates = hd.reservations
    .filter((r: any) => r.userId === currentUser.id && r.seatId !== seatId)
    .map((r: any) => r.date);

  const occupiedDates = hd.reservations.filter((r: any) => r.seatId === seatId).map((r: any) => r.date);
  const blockedDates = [...new Set([...occupiedDates, ...myReservedDates])];

  const toggle = (iso: string) => sSel(p => p.includes(iso) ? p.filter(x => x !== iso) : [...p, iso]);
  const toggleDelegateDate = (iso: string) => setDelegateDates(p => p.includes(iso) ? p.filter(x => x !== iso) : [...p, iso]);
  const prev = () => mo === 0 ? (sMo(11), sYr(y => y - 1)) : sMo(m => m - 1);
  const next = () => mo === 11 ? (sMo(0), sYr(y => y + 1)) : sMo(m => m + 1);

  const handleReserve = () => {
    onConfirm(seatId, sel);
    if (confirmationEnabled) {
      setJustReserved(true);
    }
  };

  const handleConfirmPresence = async () => {
    if (onConfirmPresence) {
      onConfirmPresence(seatId, date);
    } else {
      try {
        await reservationRepo.confirmReservation(seatId, date, currentUser.id);
      } catch (err) {
        console.error('Confirm failed:', err);
      }
    }
    onClose();
  };

  const handleDelegate = async () => {
    if (!delegateUser || delegateDates.length === 0) return;
    if (onDelegate) {
      onDelegate(seatId, delegateDates, delegateUser);
    } else {
      try {
        await reservationRepo.delegateSeat(seatId, delegateDates, currentUser.id, delegateUser);
      } catch (err) {
        console.error('Delegate failed:', err);
      }
    }
    onClose();
  };

  let title = t("hotdesk.reserveTitle");
  if (isBlocked) title = t("hotdesk.blockedSeat");
  else if (isMyFixed) title = isMine ? t("hotdesk.releaseTitle") : t("hotdesk.myFixedSeat");
  else if (isMine) title = t("hotdesk.releaseTitle");
  else if (isOtherFixed) title = t("hotdesk.adminManage");

  /* ── Shared inline styles ────────────────────────────────────────────────── */
  const btnGhost: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '9px 18px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: `1px solid ${C.border}50`,
    fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.05em', textTransform: 'uppercase',
    background: `${C.sfHigh}80`, color: C.txMuted,
    backdropFilter: 'blur(8px)', transition: 'all .15s',
  };

  const btnPrimary: React.CSSProperties = {
    ...btnGhost,
    background: `linear-gradient(135deg, ${C.primary}, ${C.primaryStrong})`,
    color: C.primaryOn, border: '1px solid transparent',
    boxShadow: `0 4px 20px ${C.primaryDim}`,
  };

  const btnDanger: React.CSSProperties = {
    ...btnGhost,
    background: `linear-gradient(135deg, ${C.danger}, ${C.red})`,
    color: '#fff', border: '1px solid transparent',
    boxShadow: `0 4px 20px ${C.redDim}`,
  };

  const btnGreen: React.CSSProperties = {
    ...btnGhost,
    background: `linear-gradient(135deg, ${C.green}, ${C.greenStrong})`,
    color: C.primaryOn, border: '1px solid transparent',
    boxShadow: `0 4px 20px ${C.greenDim}`,
  };

  const btnPurple: React.CSSProperties = {
    ...btnGhost,
    background: `linear-gradient(135deg, ${C.purple}, ${C.purpleStrong})`,
    color: '#fff', border: '1px solid transparent',
    boxShadow: `0 4px 20px ${C.purpleDim}`,
  };

  const infoBox: React.CSSProperties = {
    fontSize: 12, padding: '10px 14px', borderRadius: T.radius.lg,
    background: C.sfHigh, border: `1px solid ${C.sfBright}22`,
  };

  const navArrow: React.CSSProperties = {
    background: `${C.sfHigh}80`, border: `1px solid ${C.border}50`,
    borderRadius: 6, width: 28, height: 28, fontSize: 16,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: C.txMuted, fontFamily: 'inherit',
    backdropFilter: 'blur(8px)', transition: 'all .15s',
  };

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.font.body,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, padding: 0,
          background: C.sf, border: `1px solid ${C.sfHigh}`,
          borderRadius: T.radius.xl, overflow: 'hidden',
          boxShadow: `0 24px 80px rgba(0,0,0,.5), 0 0 40px ${C.primaryDim}`,
          animation: 'hdModalIn .25s ease forwards',
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');
          @keyframes hdModalIn { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
          @keyframes hd-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        `}</style>

        {/* ── Header ───────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: `1px solid ${C.sfHigh}`,
          background: C.bg,
        }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: C.tx,
            letterSpacing: '-0.01em',
          }}>
            {title}
          </div>
          <button
            onClick={onClose}
            style={{
              background: `${C.sfHigh}80`, border: `1px solid ${C.border}40`,
              borderRadius: 6, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: C.txDim, fontSize: 14,
              transition: 'all .15s', backdropFilter: 'blur(8px)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Seat info card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', background: C.sfHigh,
            borderRadius: T.radius.lg, position: 'relative', overflow: 'hidden',
          }}>
            {/* Top accent line */}
            <div aria-hidden style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: isBlocked ? C.txDim : isPending ? C.amber : isMine ? C.green : C.primaryStrong,
            }} />
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
              color: isBlocked ? C.txDim : C.primary,
              fontSize: 18, letterSpacing: '-0.01em',
            }}>
              {seatId}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              {isBlocked && <div style={{ color: C.txDim }}>{t("hotdesk.blockedSeat")}{blockedSeats[seatId] ? ` — ${blockedSeats[seatId]}` : ''}</div>}
              {isMyFixed && !isBlocked && <div style={{ color: C.amber }}>{t("hotdesk.myFixedSeat")}</div>}
              {isOtherFixed && !isBlocked && <div style={{ color: C.red }}>{t("hotdesk.fixed")}: {fixedOwner}</div>}
              {isDelegated && <div style={{ color: C.purple }}>{t("hotdesk.delegated")}{res?.delegatedBy ? ` — ${t("hotdesk.delegatedBy")} ${res.delegatedBy}` : ''}</div>}
              {isPending && <div style={{ color: C.amber, animation: 'hd-pulse 1.5s ease-in-out infinite' }}>{t("hotdesk.pendingConfirmation")}</div>}
              {st === SeatStatus.OCCUPIED && !isMine && !isBlocked && !isDelegated && <div style={{ color: C.primaryStrong }}>{t("hotdesk.occupied")}: {res?.userName}</div>}
              {st === SeatStatus.FREE && <div style={{ color: C.green }}>{t("hotdesk.free")}</div>}
              {isMine && res?.status === 'confirmed' && <div style={{ color: C.green }}>{t("hotdesk.confirmed")}</div>}
            </div>
          </div>

          {/* Blocked seat message */}
          {isBlocked && (
            <div style={{ ...infoBox, color: C.txDim }}>
              {t("hotdesk.blockedSeat")}
            </div>
          )}

          {/* Fixed seat assigned to someone else */}
          {isOtherFixed && !isBlocked && (
            <div style={{ ...infoBox, color: C.txDim }}>
              {t("hotdesk.noReserve")}
            </div>
          )}

          {/* Pending confirmation — CHECK IN button */}
          {isPending && date === MOCK_TODAY && (
            <div style={{
              padding: '16px', borderRadius: T.radius.lg,
              background: C.greenDim, border: `1px solid ${C.green}30`,
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 11, color: C.txMuted, marginBottom: 12,
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: '.08em', textTransform: 'uppercase',
              }}>
                {t("hotdesk.confirmBookingDesc")}
              </div>
              <button
                onClick={handleConfirmPresence}
                style={{
                  ...btnGreen,
                  width: '100%', padding: '14px 0', fontSize: 14,
                  fontWeight: 700, borderRadius: T.radius.lg,
                  letterSpacing: '.08em', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>login</span>
                {t("hotdesk.checkIn")}
              </button>
              {config?.autoReleaseEnabled && (
                <div style={{
                  fontSize: 10, color: C.txDim, marginTop: 8,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}>
                  {t("hotdesk.autoReleaseWarning")}
                </div>
              )}
            </div>
          )}

          {/* My fixed seat — delegate or release */}
          {isMyFixed && !isMine && !isBlocked && (
            <div style={{ fontSize: 12, color: C.txMuted, lineHeight: 1.6 }}>
              {t("hotdesk.delegateSeatDesc")}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={{ ...btnDanger, flex: 1, justifyContent: 'center' }} onClick={() => onRelease(seatId, date)}>
                  {t("hotdesk.releaseForToday")} ({date})
                </button>
                <button
                  onClick={() => setShowDelegate(true)}
                  style={{ ...btnPurple, flex: 1, justifyContent: 'center' }}
                >
                  {t("hotdesk.delegateSeat")}
                </button>
              </div>
            </div>
          )}

          {/* Delegate mini-modal */}
          {showDelegate && (
            <div style={{
              padding: 14, background: C.sfHigh, borderRadius: T.radius.lg,
              border: `1px solid ${C.sfBright}22`,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 10,
                letterSpacing: '.02em',
              }}>
                {t("hotdesk.delegateSeat")}
              </div>

              {/* User picker */}
              <div style={{ marginBottom: 10 }}>
                <label style={{
                  fontSize: 9, color: C.txDim, display: 'block', marginBottom: 4,
                  fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
                }}>
                  {t("hotdesk.selectUser")}
                </label>
                <select
                  value={delegateUser}
                  onChange={e => setDelegateUser(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12,
                    background: C.bg, border: `1px solid ${C.sfHigh}`,
                    color: C.tx, fontFamily: "'IBM Plex Mono', monospace",
                    outline: 'none',
                  }}
                >
                  <option value="">{t("hotdesk.selectUser")}...</option>
                  {wsUsers.filter(u => u.id !== currentUser.id && u.active !== false).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Date picker */}
              <div style={{ marginBottom: 10 }}>
                <label style={{
                  fontSize: 9, color: C.txDim, display: 'block', marginBottom: 4,
                  fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
                }}>
                  {t("hotdesk.selectDatesLabel")}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <button style={navArrow} onClick={prev}>&#8249;</button>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: C.primary,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {fmtMonthYear(yr, mo, lang)}
                  </span>
                  <button style={navArrow} onClick={next}>&#8250;</button>
                </div>
                <MiniCalendar year={yr} month={mo} lang={lang} selectedDates={delegateDates} onToggleDate={toggleDelegateDate} occupiedDates={[]} />
              </div>

              {delegateDates.length > 0 && (
                <div style={{
                  fontSize: 11, color: C.purple, marginBottom: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}>
                  {t("hotdesk.selectDates")}: {delegateDates.sort().join(", ")}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}
                  onClick={() => { setShowDelegate(false); setDelegateUser(''); setDelegateDates([]); }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleDelegate}
                  disabled={!delegateUser || delegateDates.length === 0}
                  style={{
                    ...(!delegateUser || delegateDates.length === 0 ? btnGhost : btnPurple),
                    flex: 1, justifyContent: 'center',
                    opacity: !delegateUser || delegateDates.length === 0 ? 0.4 : 1,
                    cursor: !delegateUser || delegateDates.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t("hotdesk.delegateConfirm")} {delegateDates.length > 0 && `(${delegateDates.length})`}
                </button>
              </div>
            </div>
          )}

          {/* My reservation — release it */}
          {isMine && !isMyFixed && !isPending && (
            <div>
              <div style={{ fontSize: 12, color: C.txMuted, marginBottom: 10 }}>
                {t("hotdesk.releaseQuestion")}
              </div>
              <button
                style={{ ...btnDanger, width: '100%', justifyContent: 'center' }}
                onClick={() => onRelease(seatId, date)}
              >
                {t("hotdesk.releaseBtn")}
              </button>
            </div>
          )}

          {/* My fixed seat that I have reserved — release */}
          {isMyFixed && isMine && !isPending && (
            <div style={{ fontSize: 12, color: C.txMuted, marginBottom: 10 }}>
              {t("hotdesk.releaseQuestion")}
              <button
                style={{ ...btnDanger, width: '100%', marginTop: 10, justifyContent: 'center' }}
                onClick={() => onRelease(seatId, date)}
              >
                {t("hotdesk.releaseBtn")}
              </button>
            </div>
          )}

          {/* Just reserved — awaiting confirmation */}
          {justReserved && confirmationEnabled && (
            <div style={{
              padding: '14px 16px', borderRadius: T.radius.lg,
              background: C.amberDim, border: `1px solid ${C.amber}30`,
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: C.amber, marginBottom: 4,
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
                {t("hotdesk.pendingConfirmation")}
              </div>
              <div style={{ fontSize: 10, color: C.txDim }}>
                {t("hotdesk.autoReleaseWarning")}
              </div>
            </div>
          )}

          {/* Free seat — date picker for reservation */}
          {!isBlocked && !isOtherFixed && !isMine && !isMyFixed && !justReserved && (
            <>
              {myReservedDates.includes(date) ? (
                <div style={{
                  ...infoBox,
                  color: C.amber, background: C.amberDim,
                  border: `1px solid ${C.amber}30`,
                }}>
                  {t("hotdesk.alreadyReserved")}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button style={navArrow} onClick={prev}>&#8249;</button>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: C.primary,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}>
                      {fmtMonthYear(yr, mo, lang)}
                    </span>
                    <button style={navArrow} onClick={next}>&#8250;</button>
                  </div>
                  <MiniCalendar year={yr} month={mo} lang={lang} selectedDates={sel} onToggleDate={toggle} occupiedDates={blockedDates} />
                  {sel.length > 0 && (
                    <div style={{
                      fontSize: 11, color: C.green, padding: '8px 12px',
                      background: C.greenDim, borderRadius: T.radius.lg,
                      border: `1px solid ${C.green}25`,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}>
                      {t("hotdesk.selectDates")}: {sel.sort().join(", ")}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '16px 24px', borderTop: `1px solid ${C.sfHigh}`,
          background: C.bg,
        }}>
          <button style={btnGhost} onClick={onClose}>
            {t("common.cancel")}
          </button>
          {!isBlocked && !isOtherFixed && !isMine && !isMyFixed && !myReservedDates.includes(date) && !justReserved && (
            <button
              style={{
                ...btnPrimary,
                opacity: sel.length === 0 ? 0.4 : 1,
                cursor: sel.length === 0 ? 'not-allowed' : 'pointer',
              }}
              onClick={handleReserve}
              disabled={sel.length === 0}
            >
              {t("hotdesk.confirm")} {sel.length > 0 && `(${sel.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { HDReserveModal };
