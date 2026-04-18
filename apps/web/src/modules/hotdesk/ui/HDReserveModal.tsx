import React, { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { TODAY } from '@/shared/lib/constants';
import { fmtMonthYear } from '@/shared/lib/utils';
import { MiniCalendar } from '@/shared/ui/MiniCalendar';
import { configRepo, reservationRepo } from '../container';
import type { HotDeskConfig } from '../domain/entities/HotDeskConfig';

const MOCK_TODAY = TODAY;

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

  // Fixed seat detection
  const fixedOwner   = hd.fixed[seatId];
  const isMyFixed    = fixedOwner === currentUser.name;
  const isOtherFixed = st === SeatStatus.FIXED && !isMyFixed;

  // Load config on mount
  useEffect(() => {
    configRepo.getConfig().then(setConfig).catch(() => {});
  }, []);

  const confirmationEnabled = config?.confirmationEnabled ?? false;

  // Dates where user already has a reservation on another seat
  const myReservedDates = hd.reservations
    .filter((r: any) => r.userId === currentUser.id && r.seatId !== seatId)
    .map((r: any) => r.date);

  // Occupied dates for this seat (by others)
  const occupiedDates = hd.reservations.filter((r: any) => r.seatId === seatId).map((r: any) => r.date);

  const blockedDates = [...new Set([...occupiedDates, ...myReservedDates])];

  const toggle = (iso: string) => sSel(p => p.includes(iso) ? p.filter(x => x !== iso) : [...p, iso]);
  const toggleDelegateDate = (iso: string) => setDelegateDates(p => p.includes(iso) ? p.filter(x => x !== iso) : [...p, iso]);
  const prev = () => mo === 0 ? (sMo(11), sYr(y => y-1)) : sMo(m => m-1);
  const next = () => mo === 11 ? (sMo(0), sYr(y => y+1)) : sMo(m => m+1);

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

  // Dynamic title
  let title = t("hotdesk.reserveTitle");
  if (isBlocked) title = t("hotdesk.blockedSeat");
  else if (isMyFixed) title = isMine ? t("hotdesk.releaseTitle") : t("hotdesk.myFixedSeat");
  else if (isMine) title = t("hotdesk.releaseTitle");
  else if (isOtherFixed) title = t("hotdesk.adminManage");

  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mb" style={{maxWidth:420}}>
        <div className="mh">
          <div className="mt">{title}</div>
          <button className="mc" onClick={onClose}>x</button>
        </div>
        <div className="mbody">
          {/* Seat info card */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
            <div style={{fontFamily:"var(--mono)",fontWeight:700,color: isBlocked ? "var(--tx3)" : "var(--ac2)",fontSize:16}}>{seatId}</div>
            <div style={{fontSize:12}}>
              {isBlocked && <div style={{color:"var(--tx3)"}}>{t("hotdesk.blockedSeat")}{blockedSeats[seatId] ? ` — ${blockedSeats[seatId]}` : ''}</div>}
              {isMyFixed && !isBlocked && <div style={{color:"var(--amber)"}}>{t("hotdesk.myFixedSeat")}</div>}
              {isOtherFixed && !isBlocked && <div style={{color:"var(--red)"}}>{t("hotdesk.fixed")}: {fixedOwner}</div>}
              {isDelegated && <div style={{color:"var(--purple)"}}>{t("hotdesk.delegated")}{res?.delegatedBy ? ` — ${t("hotdesk.delegatedBy")} ${res.delegatedBy}` : ''}</div>}
              {isPending && <div style={{color:"var(--amber)",animation:"hd-pulse 1.5s ease-in-out infinite"}}>{t("hotdesk.pendingConfirmation")}</div>}
              {st === SeatStatus.OCCUPIED && !isMine && !isBlocked && !isDelegated && <div style={{color:"var(--ac2)"}}>{t("hotdesk.occupied")}: {res?.userName}</div>}
              {st === SeatStatus.FREE && <div style={{color:"var(--green)"}}>{t("hotdesk.free")}</div>}
              {isMine && res?.status === 'confirmed' && <div style={{color:"var(--green)"}}>{t("hotdesk.confirmed")}</div>}
            </div>
          </div>

          {/* Blocked seat message */}
          {isBlocked && (
            <div style={{fontSize:12,color:"var(--tx3)",padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
              {t("hotdesk.blockedSeat")}
            </div>
          )}

          {/* Fixed seat assigned to someone else */}
          {isOtherFixed && !isBlocked && (
            <div style={{fontSize:12,color:"var(--tx3)",padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
              {t("hotdesk.noReserve")}
            </div>
          )}

          {/* Pending confirmation — Confirm Presence button */}
          {isPending && date === MOCK_TODAY && (
            <div style={{padding:"10px 12px",background:"rgba(245,158,11,.07)",borderRadius:"var(--r)",border:"1px solid rgba(245,158,11,.25)"}}>
              <div style={{fontSize:12,color:"var(--amber)",marginBottom:8}}>{t("hotdesk.confirmBookingDesc")}</div>
              <button
                onClick={handleConfirmPresence}
                style={{
                  width:"100%",padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",
                  fontWeight:600,fontSize:13,color:"#fff",
                  background:"linear-gradient(135deg, #4ae176, #00b954)",
                  boxShadow:"0 2px 12px rgba(74,225,118,.3)",
                }}>
                {t("hotdesk.confirmBooking")}
              </button>
              {config?.autoReleaseEnabled && (
                <div style={{fontSize:10,color:"var(--tx3)",marginTop:6,textAlign:"center"}}>{t("hotdesk.autoReleaseWarning")}</div>
              )}
            </div>
          )}

          {/* My fixed seat — delegate or release */}
          {isMyFixed && !isMine && !isBlocked && (
            <div style={{fontSize:12,color:"var(--tx2)",lineHeight:1.6}}>
              {t("hotdesk.delegateSeatDesc")}
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button className="b-danger" style={{flex:1}} onClick={()=>onRelease(seatId, date)}>
                  {t("hotdesk.releaseForToday")} ({date})
                </button>
                <button
                  onClick={()=>setShowDelegate(true)}
                  style={{
                    flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",
                    fontWeight:600,fontSize:12,color:"#fff",
                    background:"linear-gradient(135deg, #ddb7ff, #b76dff)",
                    boxShadow:"0 2px 12px rgba(183,109,255,.3)",
                  }}>
                  {t("hotdesk.delegateSeat")}
                </button>
              </div>
            </div>
          )}

          {/* Delegate mini-modal */}
          {showDelegate && (
            <div style={{padding:"12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)",marginTop:8}}>
              <div style={{fontSize:12,fontWeight:600,color:"var(--tx)",marginBottom:8}}>{t("hotdesk.delegateSeat")}</div>
              {/* User picker */}
              <div style={{marginBottom:8}}>
                <label style={{fontSize:11,color:"var(--tx2)",display:"block",marginBottom:4,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase"}}>{t("hotdesk.selectUser")}</label>
                <select
                  value={delegateUser}
                  onChange={e => setDelegateUser(e.target.value)}
                  style={{
                    width:"100%",padding:"6px 8px",borderRadius:6,fontSize:12,
                    background:"var(--bg)",border:"1px solid var(--bd)",color:"var(--tx)",
                  }}>
                  <option value="">{t("hotdesk.selectUser")}...</option>
                  {wsUsers.filter(u => u.id !== currentUser.id && u.active !== false).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              {/* Date picker */}
              <div style={{marginBottom:8}}>
                <label style={{fontSize:11,color:"var(--tx2)",display:"block",marginBottom:4,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase"}}>{t("hotdesk.selectDatesLabel")}</label>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                  <button className="n-arr" onClick={prev}>&#8249;</button>
                  <span style={{fontSize:12,fontWeight:600,color:"var(--ac2)"}}>{fmtMonthYear(yr,mo,lang)}</span>
                  <button className="n-arr" onClick={next}>&#8250;</button>
                </div>
                <MiniCalendar year={yr} month={mo} lang={lang} selectedDates={delegateDates} onToggleDate={toggleDelegateDate} occupiedDates={[]}/>
              </div>
              {delegateDates.length > 0 && (
                <div style={{fontSize:11,color:"var(--purple)",marginBottom:8}}>{t("hotdesk.selectDates")}: {delegateDates.sort().join(", ")}</div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button className="b-cancel" style={{flex:1}} onClick={()=>{setShowDelegate(false);setDelegateUser('');setDelegateDates([]);}}>{t("common.cancel")}</button>
                <button
                  onClick={handleDelegate}
                  disabled={!delegateUser || delegateDates.length === 0}
                  style={{
                    flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor: !delegateUser || delegateDates.length === 0 ? "not-allowed" : "pointer",
                    fontWeight:600,fontSize:12,color:"#fff",
                    background: !delegateUser || delegateDates.length === 0 ? "var(--tx3)" : "linear-gradient(135deg, #ddb7ff, #b76dff)",
                    opacity: !delegateUser || delegateDates.length === 0 ? 0.5 : 1,
                  }}>
                  {t("hotdesk.delegateConfirm")} {delegateDates.length > 0 && `(${delegateDates.length})`}
                </button>
              </div>
            </div>
          )}

          {/* My reservation — release it */}
          {isMine && !isMyFixed && !isPending && (
            <div>
              <div style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>{t("hotdesk.releaseQuestion")}</div>
              <button className="b-danger" style={{width:"100%"}} onClick={()=>onRelease(seatId, date)}>{t("hotdesk.releaseBtn")}</button>
            </div>
          )}

          {/* My fixed seat that I have reserved — release */}
          {isMyFixed && isMine && !isPending && (
            <div style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>
              {t("hotdesk.releaseQuestion")}
              <button className="b-danger" style={{width:"100%",marginTop:8}} onClick={()=>onRelease(seatId, date)}>{t("hotdesk.releaseBtn")}</button>
            </div>
          )}

          {/* Just reserved — show "awaiting confirmation" */}
          {justReserved && confirmationEnabled && (
            <div style={{padding:"10px 12px",background:"rgba(245,158,11,.07)",borderRadius:"var(--r)",border:"1px solid rgba(245,158,11,.25)",textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--amber)",marginBottom:4}}>{t("hotdesk.pendingConfirmation")}</div>
              <div style={{fontSize:11,color:"var(--tx3)"}}>{t("hotdesk.autoReleaseWarning")}</div>
            </div>
          )}

          {/* Free seat — date picker for reservation */}
          {!isBlocked && !isOtherFixed && !isMine && !isMyFixed && !justReserved && (
            <>
              {myReservedDates.includes(date) ? (
                <div style={{fontSize:12,color:"var(--amber)",padding:"8px 12px",background:"rgba(245,166,35,.07)",borderRadius:"var(--r)",border:"1px solid rgba(245,166,35,.25)"}}>
                  {t("hotdesk.alreadyReserved")}
                </div>
              ) : (
                <>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <button className="n-arr" onClick={prev}>&#8249;</button>
                    <span style={{fontSize:12,fontWeight:600,color:"var(--ac2)"}}>{fmtMonthYear(yr,mo,lang)}</span>
                    <button className="n-arr" onClick={next}>&#8250;</button>
                  </div>
                  <MiniCalendar year={yr} month={mo} lang={lang} selectedDates={sel} onToggleDate={toggle} occupiedDates={blockedDates}/>
                  {sel.length>0&&<div style={{fontSize:11,color:"var(--green)",background:"rgba(62,207,142,.07)",border:"1px solid rgba(62,207,142,.2)",borderRadius:"var(--r)",padding:"6px 10px"}}>{t("hotdesk.selectDates")}: {sel.sort().join(", ")}</div>}
                </>
              )}
            </>
          )}
        </div>

        <div className="mf">
          <button className="b-cancel" onClick={onClose}>{t("common.cancel")}</button>
          {!isBlocked && !isOtherFixed && !isMine && !isMyFixed && !myReservedDates.includes(date) && !justReserved && (
            <button className="b-sub" onClick={handleReserve} disabled={sel.length===0}>
              {t("hotdesk.confirm")} {sel.length>0&&`(${sel.length})`}
            </button>
          )}
        </div>
      </div>
      <style>{`
        @keyframes hd-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export { HDReserveModal };
