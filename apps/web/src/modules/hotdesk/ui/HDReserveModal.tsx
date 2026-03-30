// @ts-nocheck
import React, { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { TODAY } from '@/shared/lib/constants';
import { fmtMonthYear } from '@/shared/lib/utils';
import { MiniCalendar } from '@/shared/ui/MiniCalendar';

const MOCK_TODAY = TODAY;

function HDReserveModal({ seatId, initDate, hd, onConfirm, onRelease, onClose, currentUser }) {
  const { t, locale } = useTranslation();
  const lang = locale;
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
  const [sel, sSel] = useState(initDate ? [initDate] : []);

  const date = initDate || MOCK_TODAY;
  const st    = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations);
  const res   = ReservationService.resOf(seatId, date, hd.reservations);
  const isMine = res?.userId === currentUser.id;

  // El puesto es "fijo" del usuario actual si está en fixed con su nombre
  const fixedOwner   = hd.fixed[seatId];
  const isMyFixed    = fixedOwner === currentUser.name;
  const isOtherFixed = st === SeatStatus.FIXED && !isMyFixed;

  // Fechas donde el usuario ya tiene reserva en OTRO puesto (para bloquear en el mini-cal)
  const myReservedDates = hd.reservations
    .filter(r => r.userId === currentUser.id && r.seatId !== seatId)
    .map(r => r.date);

  // Fechas ocupadas para este puesto (por otros)
  const occupiedDates = hd.reservations.filter(r => r.seatId === seatId).map(r => r.date);

  // Combinar: no puede seleccionar días donde ya reservó otro puesto
  const blockedDates = [...new Set([...occupiedDates, ...myReservedDates])];

  const toggle = iso => sSel(p => p.includes(iso) ? p.filter(x => x !== iso) : [...p, iso]);
  const prev = () => mo === 0 ? (sMo(11), sYr(y => y-1)) : sMo(m => m-1);
  const next = () => mo === 11 ? (sMo(0), sYr(y => y+1)) : sMo(m => m+1);

  // Título dinámico
  let title = t("hotdesk.reserveTitle");
  if (isMyFixed) title = isMine ? t("hotdesk.releaseTitle") : "Mi puesto fijo";
  else if (isMine) title = t("hotdesk.releaseTitle");
  else if (isOtherFixed) title = t("hotdesk.adminManage");

  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mb" style={{maxWidth:400}}>
        <div className="mh">
          <div className="mt">🪑 {title}</div>
          <button className="mc" onClick={onClose}>×</button>
        </div>
        <div className="mbody">
          {/* Info del puesto */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
            <div style={{fontFamily:"var(--mono)",fontWeight:700,color:"var(--ac2)",fontSize:16}}>{seatId}</div>
            <div style={{fontSize:12}}>
              {isMyFixed && <div style={{color:"var(--amber)"}}>📌 Tu puesto permanente</div>}
              {isOtherFixed && <div style={{color:"var(--red)"}}>{t("hotdesk.fixed")}: {fixedOwner}</div>}
              {!st.includes && res && !isMine && <div style={{color:"var(--ac2)"}}>{t("hotdesk.occupied")}: {res.userName}</div>}
              {st === SeatStatus.FREE && <div style={{color:"var(--green)"}}>{t("hotdesk.free")}</div>}
            </div>
          </div>

          {/* Bloqueo por puesto fijo de otro */}
          {isOtherFixed && (
            <div style={{fontSize:12,color:"var(--tx3)",padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
              {t("hotdesk.noReserve")}
            </div>
          )}

          {/* Mi puesto fijo — puedo liberarlo para un día */}
          {isMyFixed && !isMine && (
            <div style={{fontSize:12,color:"var(--tx2)",lineHeight:1.6}}>
              Este es tu puesto permanente. Si no lo vas a usar hoy puedes liberarlo para que otro compañero lo ocupe.
              <button className="b-danger" style={{width:"100%",marginTop:10}} onClick={()=>onRelease(seatId, date)}>
                Liberar para hoy ({date})
              </button>
            </div>
          )}

          {/* Mi reserva — puedo liberarla */}
          {isMine && !isMyFixed && (
            <div>
              <div style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>{t("hotdesk.releaseQuestion")}</div>
              <button className="b-danger" style={{width:"100%"}} onClick={()=>onRelease(seatId, date)}>{t("hotdesk.releaseBtn")}</button>
            </div>
          )}

          {/* Puesto liberado por el fijo — otro puede reservar */}
          {isMyFixed && isMine && (
            <div style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>
              {t("hotdesk.releaseQuestion")}
              <button className="b-danger" style={{width:"100%",marginTop:8}} onClick={()=>onRelease(seatId, date)}>{t("hotdesk.releaseBtn")}</button>
            </div>
          )}

          {/* Reserva libre — seleccionar fechas (filtra días con otra reserva) */}
          {!isOtherFixed && !isMine && !isMyFixed && (
            <>
              {myReservedDates.includes(date) ? (
                <div style={{fontSize:12,color:"var(--amber)",padding:"8px 12px",background:"rgba(245,166,35,.07)",borderRadius:"var(--r)",border:"1px solid rgba(245,166,35,.25)"}}>
                  ⚠ {t("hotdesk.alreadyReserved")}
                </div>
              ) : (
                <>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <button className="n-arr" onClick={prev}>‹</button>
                    <span style={{fontSize:12,fontWeight:600,color:"var(--ac2)"}}>{fmtMonthYear(yr,mo,lang)}</span>
                    <button className="n-arr" onClick={next}>›</button>
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
          {!isOtherFixed && !isMine && !isMyFixed && !myReservedDates.includes(date) && (
            <button className="b-sub" onClick={()=>onConfirm(seatId,sel)} disabled={sel.length===0}>
              {t("hotdesk.confirm")} {sel.length>0&&`(${sel.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { HDReserveModal };
