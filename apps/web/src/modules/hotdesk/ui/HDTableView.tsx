// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { SEATS } from '../domain/entities/seats';
import { TODAY } from '@/shared/lib/constants';
import { daysInMonth, fmtMonthYear } from '@/shared/lib/utils';
import { SeatTooltip } from './SeatTooltip';

const MOCK_TODAY = TODAY;

function HDTableView({ hd, onCell, currentUser, blueprint, theme="dark" }) {
  const { t, locale } = useTranslation();
  const lang = locale;
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
  const [tooltip, setTooltip] = useState(null);
  const [hidePast, setHidePast] = useState(false);

  const days = daysInMonth(yr, mo);
  function isoD(d) { return `${yr}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
  const prev = ()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1);
  const next = ()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1);
  const DOW_EN = ["S","M","T","W","T","F","S"];
  const DOW_ES = ["D","L","M","X","J","V","S"];
  const DOW    = lang==="es" ? DOW_ES : DOW_EN;

  // Get seats from blueprint, fallback to legacy SEATS
  const CELL=52,PAD=14,LH=18;
  const seats = useMemo(()=>{
    const items = (() => { try { return Array.isArray(blueprint?.layout) ? blueprint.layout : []; } catch { return []; }})();
    if(!items.length) return SEATS.map(s=>({...s}));
    const result=[];
    items.forEach(item=>{
      if(item.type!=='desk'&&item.type!=='circle') return;
      const dis=item.disabled||[];
      let seatList;
      if(item.shape==='circle'){
        const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
        const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
        const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
        seatList=Array.from({length:n},(_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return{id:pfx+(i+1)};});
      } else {
        const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
        const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
        let n=1;seatList=Array.from({length:cols*rows},()=>{const s={id:pfx+n};n++;return s;});
      }
      seatList.forEach(s=>{ if(!dis.includes(s.id)) result.push(s); });
    });
    return result;
  },[blueprint?.id]);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div className="cal-h" style={{marginBottom:10,flexShrink:0,padding:'0 4px'}}>
        <button className="n-arr" onClick={prev}>‹</button>
        <div className="cal-t">{fmtMonthYear(yr, mo, lang)}</div>
        <button className="n-arr" onClick={next}>›</button>
        <button onClick={()=>setHidePast(h=>!h)}
          style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',fontSize:11,fontWeight:600,
            border:`1px solid ${hidePast?'var(--ac)':'var(--bd)'}`,borderRadius:'var(--r)',
            background:hidePast?'var(--glow)':'var(--sf2)',color:hidePast?'var(--ac2)':'var(--tx2)',
            cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap'}}>
          {hidePast?'▼ All days':'▲ Future only'}
        </button>
        <div className="hd-legend" style={{marginLeft:"auto"}}>
          {[[t("hotdesk.free"),"var(--seat-free)"],[t("hotdesk.occupied"),"var(--seat-occ)"],[t("hotdesk.fixed"),"var(--seat-fixed)"],["Mine","var(--amber)"]].map(([l,c])=>(
            <div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:c}}/>{l}</div>
          ))}
        </div>
      </div>

      {/* Scrollable table — horizontal + vertical */}
      <div style={{flex:1,overflow:'auto',borderRadius:'var(--r2)',border:'1px solid var(--bd)',background:'var(--sf)'}}>
        <table className="hd-tbl" style={{minWidth: 120 + seats.length * 52}}>
          <thead>
            <tr>
              <th className="hd-th date-col" style={{minWidth:90,left:0,zIndex:8}}>{lang==="es"?"Fecha":"Date"}</th>
              {seats.map(s => {
                const st = ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations);
                const col = st===SeatStatus.FIXED ? "var(--seat-fixed)" : st===SeatStatus.OCCUPIED ? "var(--seat-occ)" : "var(--seat-free)";
                return (
                  <th key={s.id} className="hd-th seat-col"
                    style={{minWidth:48,cursor:'pointer'}}
                    onMouseEnter={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTooltip({ seatId:s.id, ax: r.left + r.width/2, ay: r.bottom });
                    }}
                    onMouseLeave={() => setTooltip(null)}>
                    <span style={{color:col,fontSize:10,fontWeight:700}}>{s.id}</span>
                    {hd.fixed[s.id] && (
                      <div style={{fontSize:7,color:"var(--red)",marginTop:1,fontWeight:400,lineHeight:1}}>
                        {hd.fixed[s.id].split(" ")[0].slice(0,6)}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({length:days},(_,i)=>i+1).filter(d=>!hidePast||isoD(d)>=MOCK_TODAY).map(d => {
              const iso   = isoD(d);
              const dow   = new Date(iso+"T00:00:00").getDay();
              const isWe  = dow===0||dow===6;
              const isTod = iso===MOCK_TODAY;
              const rowCls = isWe ? "hd-row-we" : isTod ? "hd-row-today" : "";
              return (
                <tr key={d} className={rowCls}>
                  <td className="hd-td date-cell" style={{
                    position:'sticky',left:0,zIndex:4,background:'var(--sf)',
                    color: isWe?"var(--tx3)": isTod?"var(--ac2)":"var(--tx2)",
                    fontWeight:isTod?600:400, minWidth:90, paddingLeft:10
                  }}>
                    {isTod && <span style={{color:"var(--ac2)",marginRight:3,fontSize:9}}>▶</span>}
                    <span style={{fontFamily:"var(--mono)",fontSize:11}}>{DOW[dow]}</span>
                    {" "}<span style={{fontFamily:"var(--mono)",fontSize:11}}>{String(d).padStart(2,"0")}</span>
                  </td>
                  {seats.map(seat => {
                    const st     = ReservationService.statusOf(seat.id, iso, hd.fixed, hd.reservations);
                    const res    = ReservationService.resOf(seat.id, iso, hd.reservations);
                    const isMine = res?.userId===currentUser.id;
                    const ownerName = st===SeatStatus.FIXED ? hd.fixed[seat.id] : res?.userName;
                    const ownerLabel = ownerName ? ownerName.split(" ")[0].slice(0,7) : "";
                    const cls    = isMine ? "mine" : st===SeatStatus.FIXED ? "fx" : st===SeatStatus.OCCUPIED ? "occ" : "free";
                    return (
                      <td key={seat.id} className="hd-td" style={{padding:2,minWidth:48}}>
                        {isWe ? (
                          <div style={{height:28,borderRadius:3,background:"var(--sf2)"}}/>
                        ) : (
                          <div className={`hd-cell ${cls}`}
                            style={{height:28,fontSize:9}}
                            onClick={() => onCell(seat.id, iso)}>
                            <div className={`hd-cell-dot ${cls}`}/>
                            {(st!==SeatStatus.FREE && ownerLabel) && (
                              <span className="hd-cell-name" style={{fontSize:9}}>{ownerLabel}</span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <SeatTooltip
          seatId={tooltip.seatId}
          anchorX={tooltip.ax}
          anchorY={tooltip.ay}
          hd={hd}
          currentUser={currentUser}
          blueprint={blueprint}
          theme={theme}
        />
      )}
    </div>
  );
}

export { HDTableView };
