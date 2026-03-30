// @ts-nocheck
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { TODAY } from '@/shared/lib/constants';

function BlueprintHDMap({ hd, onSeat, currentUser, blueprint, highlightSeat=null, theme="dark" }) {
  
  const canvasRef = useRef(null);
  const cwRef = useRef(null);
  const [hoveredSeat, setHoveredSeat] = useState(null);
  const [seatHoverInfo, setSeatHoverInfo] = useState(null); // {id, name, x, y}
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({x:0,y:0});

  const items = (() => {
    try { return Array.isArray(blueprint?.layout) ? blueprint.layout : []; } catch { return []; }
  })();

  // Calculate bounding box of all items to fit canvas
  const bbox = useMemo(() => {
    if(!items.length) return {minX:0,minY:0,maxX:800,maxY:600};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    items.forEach(i=>{
      if(i.pts&&i.pts.length){
        i.pts.forEach(p=>{ if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; });
      } else if(i.type==='door'||i.type==='window'){
        // Door/window pivot at (x,y), extends sw in rotated space — use loose bounds
        const sw=i.w||48;
        if(i.x-sw<minX)minX=i.x-sw; if(i.y-sw<minY)minY=i.y-sw;
        if(i.x+sw>maxX)maxX=i.x+sw; if(i.y+sw>maxY)maxY=i.y+sw;
      } else {
        if(i.x<minX) minX=i.x; if(i.y<minY) minY=i.y;
        if(i.x+i.w>maxX) maxX=i.x+i.w; if(i.y+i.h>maxY) maxY=i.y+i.h;
      }
    });
    return {minX:minX-20,minY:minY-20,maxX:maxX+20,maxY:maxY+20};
  }, [blueprint?.id]);

  const CELL=52,PAD=14,LH=18;
  const dk = theme==='dark';

  // Get seat positions from a cluster item
  function getSeatsForItem(item) {
    if(item.shape==='circle'){
      const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
      const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
      const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
      return Array.from({length:n},(_,i)=>{
        const a=(i/n)*2*Math.PI-Math.PI/2;
        return{id:pfx+(i+1),x:cx+R*Math.cos(a)-CELL/2+2,y:cy+R*Math.sin(a)-CELL/2+2,w:CELL-4,h:CELL-4};
      });
    }
    const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
    const tW=cols*CELL,tH=rows*CELL,sx=x+PAD+(w-PAD*2-tW)/2,sy=y+LH+PAD+(h-LH-PAD*2-tH)/2;
    const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
    let n=1;return Array.from({length:cols*rows},(_,i)=>{const r=Math.floor(i/cols),cc=i%cols;const s={id:pfx+n,x:sx+cc*CELL+2,y:sy+r*CELL+2,w:CELL-4,h:CELL-4};n++;return s;});
  }

  // All active seats from blueprint
  const allSeats = useMemo(() => {
    const seats = [];
    items.forEach(item=>{
      if(item.type==='desk'||item.type==='circle'){
        const dis=item.disabled||[];
        getSeatsForItem(item).forEach(s=>{
          if(!dis.includes(s.id)) seats.push({...s, clusterLabel:item.label});
        });
      }
    });
    return seats;
  }, [blueprint?.id]);

  // Use refs to access current scale/offset inside event handlers (avoids stale closure)
  const scaleRef  = useRef(scale);
  const offsetRef = useRef(offset);
  useEffect(() => { scaleRef.current  = scale;  }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  useEffect(() => {
    const cw  = cwRef.current;
    const cvs = canvasRef.current;
    if(!cw || !cvs) return;

    function resize() {
      const W = cw.clientWidth, H = cw.clientHeight;
      cvs.width = W; cvs.height = H;
      const bW = bbox.maxX-bbox.minX, bH = bbox.maxY-bbox.minY;
      if(bW<=0||bH<=0) return;
      const s  = Math.min((W-40)/bW, (H-40)/bH, 1.5);
      const ox = (W - bW*s)/2 - bbox.minX*s;
      const oy = (H - bH*s)/2 - bbox.minY*s;
      setScale(s); setOffset({x:ox, y:oy});
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cw);

    // Wheel zoom — centered on cursor position
    function onWheel(e) {
      e.preventDefault();
      const rect = cvs.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const cur  = scaleRef.current;
      const ns   = Math.max(0.15, Math.min(4, cur + (e.deltaY < 0 ? 0.12 : -0.12)));
      const ratio = ns / cur;
      const ox    = offsetRef.current.x;
      const oy    = offsetRef.current.y;
      setScale(ns);
      setOffset({ x: mx - (mx - ox) * ratio, y: my - (my - oy) * ratio });
    }
    cvs.addEventListener('wheel', onWheel, { passive: false });

    // Pan — mouse drag (left button) or middle button
    let panActive = false, px0 = 0, py0 = 0, ox0 = 0, oy0 = 0;
    function onMouseDown(e) {
      if(e.button !== 0 && e.button !== 1) return;
      if(e.button === 1) e.preventDefault();
      panActive = true;
      px0 = e.clientX; py0 = e.clientY;
      ox0 = offsetRef.current.x; oy0 = offsetRef.current.y;
      cvs.style.cursor = 'grabbing';
    }
    function onMouseMove(e) {
      if(!panActive) return;
      setOffset({ x: ox0 + (e.clientX - px0), y: oy0 + (e.clientY - py0) });
    }
    function onMouseUp() {
      if(!panActive) return;
      panActive = false;
      cvs.style.cursor = 'default';
    }
    cvs.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      ro.disconnect();
      cvs.removeEventListener('wheel', onWheel);
      cvs.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [bbox]);

  // Draw
  useEffect(() => {
    const cvs = canvasRef.current;
    if(!cvs) return;
    const ctx = cvs.getContext('2d');
    const W=cvs.width, H=cvs.height;
    ctx.clearRect(0,0,W,H);
    ctx.save();
    ctx.setTransform(scale,0,0,scale,offset.x,offset.y);

    function rr(x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

    // Draw items (background first: zones, walls, rooms, doors, windows)
    // Zones
    items.filter(i=>i.type==='zone').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(40,30,80,.2)':'rgba(238,242,255,.6)';ctx.strokeStyle='#818cf8';ctx.lineWidth=1;ctx.setLineDash([6,4]);
      rr(x,y,w,h,5);ctx.fill();ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=dk?'rgba(165,180,252,.85)':'#4338ca';ctx.font='700 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText((i.label||'Zone').toUpperCase(),x+w/2,y+h*0.22);
    });
    // Rooms
    items.filter(i=>i.type==='room').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(15,30,70,.5)':'rgba(219,234,254,.6)';ctx.strokeStyle='#3b82f6';ctx.lineWidth=1;ctx.setLineDash([]);
      rr(x,y,w,h,5);ctx.fill();ctx.stroke();
      ctx.fillStyle=dk?'#93c5fd':'#1e40af';ctx.font='600 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i.label||'Room',x+w/2,y+h*0.22);
    });
    // Walls — polyline (pts[]) OR rect fallback
    items.filter(i=>i.type==='wall').forEach(i=>{
      ctx.strokeStyle=dk?'#777':'#999';ctx.lineWidth=4;ctx.setLineDash([]);ctx.lineCap='round';ctx.lineJoin='round';
      if(i.pts&&i.pts.length>=2){
        ctx.beginPath();ctx.moveTo(i.pts[0].x,i.pts[0].y);
        i.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
        ctx.stroke();
      } else {
        ctx.fillStyle=dk?'rgba(70,70,70,.5)':'rgba(140,140,140,.3)';
        rr(i.x,i.y,i.w,i.h,2);ctx.fill();ctx.stroke();
      }
      ctx.lineCap='butt';ctx.lineJoin='miter';
    });
    // Doors — pure world-coordinate math, NO ctx.translate/rotate
    // Avoids any potential conflict with the outer scale transform.
    // angle=0: gap→right, leaf→up(into building). arc in upper-right.
    // angle=90: gap→down, leaf→right, arc in lower-right.
    items.filter(i=>i.type==='door').forEach(i=>{
      const{x,y}=i;
      const rad=(i.angle||0)*Math.PI/180;
      const sw=i.w||48;
      const cA=Math.cos(rad),sA=Math.sin(rad);
      // Gap end = (x + sw*cos, y + sw*sin)
      const gx=x+sw*cA, gy=y+sw*sA;
      // Leaf end = (x + sw*sin, y - sw*cos)  [perpendicular, inward]
      const lx=x+sw*sA, ly=y-sw*cA;
      ctx.strokeStyle='#fb923c';ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.lineCap='round';
      // Gap line
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(gx,gy);ctx.stroke();
      // Leaf
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx,ly);ctx.stroke();
      // Arc: from gap direction (rad) anticlockwise to leaf direction (rad-PI/2)
      ctx.lineWidth=0.8;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.arc(x,y,sw,rad,rad-Math.PI/2,true);ctx.stroke();
      if(i.double){
        ctx.setLineDash([]);ctx.lineWidth=1.5;
        // Second leaf from gap-end going same perpendicular dir
        ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+sw*sA,gy-sw*cA);ctx.stroke();
        ctx.lineWidth=0.8;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.arc(gx,gy,sw,rad+Math.PI,rad-Math.PI/2,false);ctx.stroke();
      }
      ctx.setLineDash([]);ctx.lineCap='butt';
    });
    // Windows — pure world-coordinate math, NO ctx.translate/rotate
    // Two parallel lines straddling the wall, with end ticks.
    items.filter(i=>i.type==='window').forEach(i=>{
      const{x,y}=i;
      const rad=(i.angle||0)*Math.PI/180;
      const sw=i.w||48,hth=3; // half-thickness = 3 (total 6)
      const cA=Math.cos(rad),sA=Math.sin(rad);
      // Perpendicular unit vector (rotated 90° from gap direction)
      const px=-sA,py=cA;
      // Four corners
      const x1=x+px*hth, y1=y+py*hth;
      const x2=x+sw*cA+px*hth, y2=y+sw*sA+py*hth;
      const x3=x+sw*cA-px*hth, y3=y+sw*sA-py*hth;
      const x4=x-px*hth, y4=y-py*hth;
      ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.5;ctx.setLineDash([]);
      // Line 1 (one side of wall)
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      // Line 2 (other side of wall)
      ctx.beginPath();ctx.moveTo(x4,y4);ctx.lineTo(x3,y3);ctx.stroke();
      // End ticks
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x4,y4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x3,y3);ctx.stroke();
      if(i.double){
        const mx=x+sw/2*cA, my=y+sw/2*sA;
        ctx.beginPath();ctx.moveTo(mx+px*hth,my+py*hth);ctx.lineTo(mx-px*hth,my-py*hth);ctx.stroke();
      }
    });

    // Draw clusters (border + zone label)
    items.filter(i=>i.type==='desk'||i.type==='circle').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(3,15,6,.4)':'rgba(240,253,244,.5)';
      ctx.strokeStyle=dk?'rgba(34,197,94,.3)':'rgba(22,101,52,.25)';
      ctx.lineWidth=1;ctx.setLineDash([5,4]);
      if(i.shape==='circle'){const cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2;ctx.beginPath();ctx.arc(cx,cy,R,0,2*Math.PI);ctx.fill();ctx.stroke();}
      else{rr(x,y,w,h,7);ctx.fill();ctx.stroke();}
      ctx.setLineDash([]);
      // Zone label — just above first row of seats (not at top of cluster box)
      const seats=getSeatsForItem(i);
      if(seats.length>0){
        const firstY=Math.min(...seats.map(s=>s.y));
        ctx.fillStyle=dk?'rgba(134,239,172,.5)':'rgba(22,101,52,.5)';
        ctx.font='500 9px var(--font-sans,sans-serif)';
        ctx.textAlign='center';ctx.textBaseline='bottom';
        ctx.fillText((i.label||'Zone').toUpperCase(),x+w/2,firstY-4);
      }
    });

    // Draw seats
    allSeats.forEach(s=>{
      const{x,y,w,h,id}=s;
      const res=hd.reservations.find(r=>r.seatId===id&&r.date===TODAY);
      const isFixed=!!hd.fixed[id];
      const isMine=res?.userId===currentUser.id;
      const isOcc=!!res||isFixed;
      const isHov=hoveredSeat===id;
      let fc,sc,tc;
      if(isFixed){fc=dk?'rgba(80,0,0,.55)':'rgba(254,226,226,.8)';sc='#ef4444';tc=dk?'#fca5a5':'#991b1b';}
      else if(isMine){fc=dk?'rgba(60,40,0,.6)':'rgba(255,251,235,.8)';sc='#f59e0b';tc=dk?'#fcd34d':'#92400e';}
      else if(isOcc){fc=dk?'rgba(20,30,80,.55)':'rgba(219,234,254,.8)';sc='#3b82f6';tc=dk?'#93c5fd':'#1e40af';}
      else{fc=dk?'rgba(5,35,12,.65)':'rgba(220,252,231,.85)';sc=isHov?'#4ade80':'#22c55e';tc=dk?'#86efac':'#166534';}
      ctx.fillStyle=fc;ctx.strokeStyle=sc;ctx.lineWidth=isHov?2:1;
      rr(x,y,w,h,5);ctx.fill();ctx.stroke();
      if(!isOcc&&!isHov){ctx.fillStyle='rgba(255,255,255,.02)';ctx.strokeStyle=sc+'33';ctx.lineWidth=.4;rr(x+3,y+3,w-6,h-6,3);ctx.fill();ctx.stroke();}
      // Highlight ring for admin-selected seat
      if(id===highlightSeat){ctx.strokeStyle='#f59e0b';ctx.lineWidth=2.5;ctx.setLineDash([]);rr(x-3,y-3,w+6,h+6,7);ctx.stroke();}
      // Only show seat ID — color conveys status
      ctx.fillStyle=tc;ctx.font='bold 9px monospace';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(id,x+w/2,y+h/2);
    });

    ctx.restore();
  }, [items, hd, scale, offset, hoveredSeat, theme]);

  // Hit test seat in canvas coords
  function seatAt(px,py){
    const wx=(px-offset.x)/scale, wy=(py-offset.y)/scale;
    return allSeats.find(s=>wx>=s.x&&wx<=s.x+s.w&&wy>=s.y&&wy<=s.y+s.h)||null;
  }

  const freeCount = allSeats.filter(s=>!hd.fixed[s.id]&&!hd.reservations.find(r=>r.seatId===s.id&&r.date===TODAY)).length;
  const occCount  = allSeats.filter(s=>hd.reservations.find(r=>r.seatId===s.id&&r.date===TODAY)).length;
  const fixCount  = allSeats.filter(s=>hd.fixed[s.id]).length;

  // Zoom helpers that operate on the canvas scale/offset state
  const zoomBy = (delta) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const cx = cvs.width / 2, cy = cvs.height / 2;
    const ns = Math.max(0.15, Math.min(4, scale + delta));
    const ratio = ns / scale;
    setScale(ns);
    setOffset(o => ({ x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio }));
  };
  const fitToView = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const W  = cvs.width, H = cvs.height, PAD = 40;
    const bW = bbox.maxX-bbox.minX, bH = bbox.maxY-bbox.minY;
    if(bW<=0||bH<=0) { setScale(1); setOffset({x:0,y:0}); return; }
    const s = Math.min((W-PAD*2)/bW, (H-PAD*2)/bH, 1.5);
    setScale(s);
    setOffset({ x:(W-bW*s)/2-bbox.minX*s, y:(H-bH*s)/2-bbox.minY*s });
  };

  return (
    <div className="hd-map-wrap">
      <div className="hd-map-header">
        <div className="cal-stats" style={{marginLeft:0}}>
          <div className="chip">Free: <strong style={{color:'var(--green)'}}>{freeCount}</strong></div>
          <div className="chip">Occupied: <strong style={{color:'var(--ac2)'}}>{occCount}</strong></div>
          <div className="chip">Fixed: <strong style={{color:'var(--red)'}}>{fixCount}</strong></div>
          <div className="chip">Total: <strong>{allSeats.length}</strong></div>
        </div>
        <div className="hd-legend">
          {[['Free','var(--seat-free)'],['Occupied','var(--seat-occ)'],['Fixed','var(--seat-fixed)'],['Mine','var(--amber)']].map(([l,col])=>(
            <div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:col}}/>{l}</div>
          ))}
        </div>
      </div>

      {/* Zoom controls */}
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
        <button onClick={()=>zoomBy(0.15)}
          style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:6,width:28,height:28,fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx2)',lineHeight:1}}>+</button>
        <button onClick={()=>zoomBy(-0.15)}
          style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:6,width:28,height:28,fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx2)',lineHeight:1}}>−</button>
        <button onClick={fitToView} title="Ajustar mapa completo"
          style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:6,padding:'0 10px',height:28,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:4,color:'var(--tx2)',fontFamily:'inherit',fontWeight:600}}>
          ⊡ Fit
        </button>
        <span style={{fontSize:11,color:'var(--tx3)',marginLeft:2}}>{Math.round(scale*100)}%</span>
        <span style={{fontSize:10,color:'var(--tx3)',marginLeft:'auto'}}>Rueda del ratón · Arrastra para mover</span>
      </div>

      <div className="hd-card" ref={cwRef} style={{position:'relative',height:'calc(100vh - 260px)',minHeight:400,padding:0,overflow:'hidden'}}>
        <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%',
          cursor: hoveredSeat ? 'pointer' : 'default'}}
          onMouseMove={e=>{
            const r=canvasRef.current?.getBoundingClientRect();
            if(!r)return;
            const s=seatAt(e.clientX-r.left,e.clientY-r.top);
            setHoveredSeat(s?.id||null);
            if(s){
              const res=hd.reservations.find(rv=>rv.seatId===s.id&&rv.date===TODAY);
              const isFixed=!!hd.fixed[s.id];
              const name=isFixed?hd.fixed[s.id]:res?.userName||null;
              setSeatHoverInfo({id:s.id,name,x:e.clientX,y:e.clientY});
            }else{setSeatHoverInfo(null);}
          }}
          onMouseLeave={()=>{setHoveredSeat(null);setSeatHoverInfo(null);}}
          onClick={e=>{
            const r=canvasRef.current?.getBoundingClientRect();
            if(!r)return;
            const s=seatAt(e.clientX-r.left,e.clientY-r.top);
            if(s) onSeat(s.id);
          }}
        />
        {!allSeats.length && (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize:13,flexDirection:'column',gap:8}}>
            <span style={{fontSize:24}}>🗺</span>
            <span>No seats in this blueprint. Edit it in Admin → Blueprint.</span>
          </div>
        )}
      </div>
      {seatHoverInfo&&(
        <div style={{position:'fixed',left:seatHoverInfo.x+14,top:seatHoverInfo.y-10,
          background:'var(--sf)',border:'1px solid var(--bd2)',borderRadius:'var(--r)',
          padding:'5px 10px',zIndex:9901,pointerEvents:'none',
          boxShadow:'var(--shadow)',animation:'mbIn .1s ease',whiteSpace:'nowrap'}}>
          <span style={{fontFamily:'var(--mono)',fontWeight:700,color:hoveredSeat?'var(--ac2)':'var(--tx)',fontSize:12}}>{seatHoverInfo.id}</span>
          {seatHoverInfo.name&&<span style={{fontSize:11,color:'var(--tx2)',marginLeft:8}}>{seatHoverInfo.name}</span>}
          {!seatHoverInfo.name&&<span style={{fontSize:11,color:'var(--green)',marginLeft:8}}>Free</span>}
        </div>
      )}
      <div className="hd-sub">Click on a green seat to reserve · <span style={{color:'var(--amber)'}}>● your reservation</span></div>
    </div>
  );
}

export { BlueprintHDMap };
