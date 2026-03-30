// @ts-nocheck
import React from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { SEATS } from '../domain/entities/seats';
import { TODAY } from '@/shared/lib/constants';
import { OfficeSVG } from './OfficeSVG';

const MOCK_TODAY = TODAY;

function HDMapView({ hd, onSeat, currentUser }) {
  const { t } = useTranslation();
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({x:0,y:0});
  const [panning, setPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState({x:0,y:0,px:0,py:0});
  const containerRef = React.useRef(null);

  const MIN_ZOOM = 0.4, MAX_ZOOM = 3;
  const clamp = v => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v));

  const freeCount = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.FREE).length;
  const occCount  = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.OCCUPIED).length;
  const fixCount  = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.FIXED).length;

  // Wheel zoom
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => clamp(Math.round((z + delta) * 100) / 100));
    };
    el.addEventListener("wheel", handler, {passive:false});
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Pan with mouse drag on the map background (not on seats)
  const onMouseDown = e => {
    if(e.button !== 0) return;
    setPanning(true);
    setPanStart({x:e.clientX, y:e.clientY, px:pan.x, py:pan.y});
  };
  const onMouseMove = e => {
    if(!panning) return;
    setPan({x:panStart.px+(e.clientX-panStart.x), y:panStart.py+(e.clientY-panStart.y)});
  };
  const onMouseUp = () => setPanning(false);

  const fitMap = () => { setZoom(1); setPan({x:0,y:0}); };

  return (
    <div className="hd-map-wrap">
      <div className="hd-map-header">
        <div className="cal-stats" style={{marginLeft:0}}>
          <div className="chip">{t("hotdesk.free")}: <strong style={{color:"var(--green)"}}>{freeCount}</strong></div>
          <div className="chip">{t("hotdesk.occupied")}: <strong style={{color:"var(--ac2)"}}>{occCount}</strong></div>
          <div className="chip">{t("hotdesk.fixed")}: <strong style={{color:"var(--red)"}}>{fixCount}</strong></div>
          <div className="chip">{t("hotdesk.seatsTotal")}: <strong>{SEATS.length}</strong></div>
        </div>
        <div className="hd-legend">
          {[[t("hotdesk.free"),"var(--seat-free)"],[t("hotdesk.occupied"),"var(--seat-occ)"],[t("hotdesk.fixed"),"var(--seat-fixed)"],[t("hotdesk.mine"),"var(--amber)"]].map(([l,c])=>(
            <div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:c}}/>{l}</div>
          ))}
        </div>
      </div>

      {/* Zoom controls */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",marginBottom:6}}>
        <button onClick={()=>setZoom(z=>clamp(Math.round((z+0.1)*100)/100))}
          style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:6,width:28,height:28,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx2)",fontFamily:"inherit"}}>+</button>
        <button onClick={()=>setZoom(z=>clamp(Math.round((z-0.1)*100)/100))}
          style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:6,width:28,height:28,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx2)",fontFamily:"inherit"}}>−</button>
        <button onClick={fitMap} title="Ajustar mapa completo"
          style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:6,padding:"0 10px",height:28,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:"var(--tx2)",fontFamily:"inherit",fontWeight:600}}>
          ⊡ Fit
        </button>
        <span style={{fontSize:11,color:"var(--tx3)",marginLeft:2}}>{Math.round(zoom*100)}%</span>
        <span style={{fontSize:10,color:"var(--tx3)",marginLeft:"auto"}}>Rueda del ratón para zoom · Arrastra para mover</span>
      </div>

      {/* Map container with zoom + pan */}
      <div ref={containerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{overflow:"hidden",borderRadius:10,border:"1px solid var(--bd)",cursor:panning?"grabbing":"grab",background:"var(--sf2)",userSelect:"none"}}
      >
        <div style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,transformOrigin:"top left",transition:panning?"none":"transform .15s ease"}}>
          <OfficeSVG hd={hd} onSeat={onSeat} currentUser={currentUser}/>
        </div>
      </div>
      <div className="hd-sub">Click on a seat to reserve · <span style={{color:"var(--amber)"}}>● your reservation</span></div>
    </div>
  );
}

export { HDMapView };
