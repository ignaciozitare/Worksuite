// @ts-nocheck
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { TODAY } from '@/shared/lib/constants';

function BlueprintHDMap({ hd, onSeat, currentUser, blueprint, highlightSeat=null, theme="dark", onFloorSeats }: { hd: any; onSeat: (id: string) => void; currentUser: any; blueprint: any; highlightSeat?: string | null; theme?: string; onFloorSeats?: (ids: string[]) => void }) {

  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const cwRef = useRef(null);
  const [hoveredSeat, setHoveredSeat] = useState(null);
  const [seatHoverInfo, setSeatHoverInfo] = useState(null); // {id, name, x, y, status}
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({x:0,y:0});
  const [pulsePhase, setPulsePhase] = useState(0);

  const blockedSeats = hd.blockedSeats || {};

  // Pulse animation tick for pending seats
  useEffect(() => {
    const id = setInterval(() => setPulsePhase(p => (p + 1) % 60), 50);
    return () => clearInterval(id);
  }, []);
  const pulseOpacity = 0.5 + 0.5 * Math.sin((pulsePhase / 60) * Math.PI * 2);

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

  // Determine seat status for canvas rendering
  function seatStatusOf(id) {
    if (blockedSeats[id]) return SeatStatus.BLOCKED;
    if (hd.fixed[id]) return SeatStatus.FIXED;
    const res = hd.reservations.find(r=>r.seatId===id&&r.date===TODAY);
    if (!res) return SeatStatus.FREE;
    if (res.delegatedBy) return SeatStatus.DELEGATED;
    if (res.status === 'pending') return SeatStatus.PENDING;
    return SeatStatus.OCCUPIED;
  }

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

  // Report seat IDs to parent for accurate counts
  useEffect(() => {
    if (onFloorSeats) onFloorSeats(allSeats.map(s => s.id));
  }, [allSeats, onFloorSeats]);

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

    // Wheel zoom
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

    // Pan
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
    // Walls
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
    // Doors
    items.filter(i=>i.type==='door').forEach(i=>{
      const{x,y}=i;
      const rad=(i.angle||0)*Math.PI/180;
      const sw=i.w||48;
      const cA=Math.cos(rad),sA=Math.sin(rad);
      const gx=x+sw*cA, gy=y+sw*sA;
      const lx=x+sw*sA, ly=y-sw*cA;
      ctx.strokeStyle='#fb923c';ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(gx,gy);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx,ly);ctx.stroke();
      ctx.lineWidth=0.8;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.arc(x,y,sw,rad,rad-Math.PI/2,true);ctx.stroke();
      if(i.double){
        ctx.setLineDash([]);ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+sw*sA,gy-sw*cA);ctx.stroke();
        ctx.lineWidth=0.8;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.arc(gx,gy,sw,rad+Math.PI,rad-Math.PI/2,false);ctx.stroke();
      }
      ctx.setLineDash([]);ctx.lineCap='butt';
    });
    // Windows
    items.filter(i=>i.type==='window').forEach(i=>{
      const{x,y}=i;
      const rad=(i.angle||0)*Math.PI/180;
      const sw=i.w||48,hth=3;
      const cA=Math.cos(rad),sA=Math.sin(rad);
      const px=-sA,py=cA;
      const x1=x+px*hth, y1=y+py*hth;
      const x2=x+sw*cA+px*hth, y2=y+sw*sA+py*hth;
      const x3=x+sw*cA-px*hth, y3=y+sw*sA-py*hth;
      const x4=x-px*hth, y4=y-py*hth;
      ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.5;ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x4,y4);ctx.lineTo(x3,y3);ctx.stroke();
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x4,y4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x3,y3);ctx.stroke();
      if(i.double){
        const mx=x+sw/2*cA, my=y+sw/2*sA;
        ctx.beginPath();ctx.moveTo(mx+px*hth,my+py*hth);ctx.lineTo(mx-px*hth,my-py*hth);ctx.stroke();
      }
    });

    // Elevators
    items.filter(i=>i.type==='elevator').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(40,40,45,.6)':'rgba(220,220,225,.6)';ctx.strokeStyle=dk?'#666':'#999';ctx.lineWidth=1.5;ctx.setLineDash([]);
      rr(x,y,w,h,4);ctx.fill();ctx.stroke();
      ctx.strokeStyle=dk?'rgba(100,100,110,.3)':'rgba(160,160,170,.3)';ctx.lineWidth=.6;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+w,y);ctx.lineTo(x,y+h);ctx.stroke();
      ctx.fillStyle=dk?'#999':'#666';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('▲▼',x+w/2,y+h/2);
      ctx.fillStyle=dk?'#888':'#777';ctx.font='500 8px sans-serif';ctx.textBaseline='bottom';
      ctx.fillText(i.label||'Elevator',x+w/2,y-3);
    });
    // Stairs
    items.filter(i=>i.type==='stairs').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(50,50,55,.5)':'rgba(230,230,235,.5)';ctx.strokeStyle=dk?'#888':'#aaa';ctx.lineWidth=1.2;ctx.setLineDash([]);
      rr(x,y,w,h,3);ctx.fill();ctx.stroke();
      ctx.strokeStyle=dk?'rgba(140,140,150,.5)':'rgba(100,100,110,.4)';ctx.lineWidth=.8;
      const steps=Math.max(3,Math.floor(h/8));
      for(let s=1;s<steps;s++){const sy=y+s*(h/steps);const sx=x+(s/steps)*w*0.4;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(x+w,sy);ctx.stroke();}
      ctx.strokeStyle=dk?'rgba(180,180,190,.4)':'rgba(120,120,130,.4)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x+4,y+h-4);ctx.lineTo(x+w-4,y+4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+w-4,y+4);ctx.lineTo(x+w-10,y+8);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+w-4,y+4);ctx.lineTo(x+w-8,y+12);ctx.stroke();
      ctx.fillStyle=dk?'#999':'#666';ctx.font='500 8px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(i.label||'Stairs',x+w/2,y-3);
    });
    // Bathrooms
    items.filter(i=>i.type==='bathroom').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(30,45,55,.5)':'rgba(219,234,254,.5)';ctx.strokeStyle=dk?'#6b8fa3':'#6b8fa3';ctx.lineWidth=1.2;ctx.setLineDash([]);
      rr(x,y,w,h,4);ctx.fill();ctx.stroke();
      ctx.fillStyle=dk?'#8ab4c7':'#4a7a8f';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('WC',x+w/2,y+h/2);
    });
    // Kitchens
    items.filter(i=>i.type==='kitchen').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(45,35,25,.5)':'rgba(254,243,230,.5)';ctx.strokeStyle=dk?'#a3856b':'#a3856b';ctx.lineWidth=1.2;ctx.setLineDash([]);
      rr(x,y,w,h,4);ctx.fill();ctx.stroke();
      const cx2=x+w/2,cy2=y+h/2;
      ctx.strokeStyle=dk?'#c4a882':'#8a6a52';ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(cx2-7,cy2-6);ctx.lineTo(cx2-7,cy2+6);ctx.lineTo(cx2+5,cy2+6);ctx.lineTo(cx2+5,cy2-6);ctx.stroke();
      ctx.beginPath();ctx.arc(cx2+5,cy2,4,-(Math.PI/2),(Math.PI/2),false);ctx.stroke();
      ctx.strokeStyle=dk?'rgba(196,168,130,.4)':'rgba(138,106,82,.4)';ctx.lineWidth=.7;
      [-4,0,4].forEach(dx=>{ctx.beginPath();ctx.moveTo(cx2+dx-1,cy2-8);ctx.quadraticCurveTo(cx2+dx+1,cy2-11,cx2+dx-1,cy2-14);ctx.stroke();});
      ctx.fillStyle=dk?'#b89a7a':'#8a6a52';ctx.font='500 8px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(i.label||'Kitchen',x+w/2,y-3);
    });
    // Tables (conference/meeting)
    items.filter(i=>i.type==='table').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(45,45,50,.55)':'rgba(235,235,240,.6)';ctx.strokeStyle=dk?'#7a7a8a':'#aaa';ctx.lineWidth=1.2;ctx.setLineDash([]);
      rr(x,y,w,h,5);ctx.fill();ctx.stroke();
      ctx.strokeStyle=dk?'rgba(130,130,140,.2)':'rgba(180,180,190,.3)';ctx.lineWidth=.5;
      rr(x+4,y+4,w-8,h-8,3);ctx.stroke();
      ctx.fillStyle=dk?'#9a9aaa':'#666';ctx.font='600 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i.label||'Table',x+w/2,y+h/2);
    });
    // Plants
    items.filter(i=>i.type==='plant').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(10,50,20,.5)':'rgba(220,252,231,.6)';ctx.strokeStyle=dk?'#4ade80':'#22c55e';ctx.lineWidth=1;ctx.setLineDash([]);
      const cx2=x+w/2,cy2=y+h/2,R=Math.min(w,h)/2;
      ctx.beginPath();ctx.arc(cx2,cy2,R,0,2*Math.PI);ctx.fill();ctx.stroke();
      ctx.fillStyle=dk?'rgba(74,222,128,.35)':'rgba(34,197,94,.3)';
      ctx.beginPath();ctx.ellipse(cx2-3,cy2-2,R*0.5,R*0.25,-(Math.PI/4),0,2*Math.PI);ctx.fill();
      ctx.beginPath();ctx.ellipse(cx2+3,cy2-2,R*0.5,R*0.25,(Math.PI/4),0,2*Math.PI);ctx.fill();
      ctx.fillStyle=dk?'#22c55e':'#16a34a';ctx.beginPath();ctx.arc(cx2,cy2+1,2,0,2*Math.PI);ctx.fill();
    });
    // Emergency exits
    items.filter(i=>i.type==='emergency_exit').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(5,40,15,.5)':'rgba(220,252,231,.5)';ctx.strokeStyle='#22c55e';ctx.lineWidth=2;ctx.setLineDash([]);
      rr(x,y,w,h,4);ctx.fill();ctx.stroke();
      ctx.fillStyle=dk?'#4ade80':'#16a34a';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('EXIT',x+w/2,y+h*0.35);
      const px2=x+w/2,py2=y+h*0.65;
      ctx.strokeStyle=dk?'#4ade80':'#16a34a';ctx.lineWidth=1.2;ctx.lineCap='round';
      ctx.beginPath();ctx.arc(px2-3,py2-6,2.5,0,2*Math.PI);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2-3,py2-3.5);ctx.lineTo(px2-1,py2+1);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2-1,py2+1);ctx.lineTo(px2-5,py2+6);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2-1,py2+1);ctx.lineTo(px2+4,py2+5);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2-6,py2-1);ctx.lineTo(px2-2,py2-2);ctx.lineTo(px2+3,py2-4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2+5,py2-2);ctx.lineTo(px2+10,py2-2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2+10,py2-2);ctx.lineTo(px2+7,py2-5);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2+10,py2-2);ctx.lineTo(px2+7,py2+1);ctx.stroke();
      ctx.lineCap='butt';
    });
    // Electrical panels
    items.filter(i=>i.type==='electrical_panel').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(50,45,15,.5)':'rgba(254,249,195,.5)';ctx.strokeStyle='#eab308';ctx.lineWidth=1.5;ctx.setLineDash([]);
      rr(x,y,w,h,3);ctx.fill();ctx.stroke();
      const cx2=x+w/2,cy2=y+h/2;
      ctx.fillStyle=dk?'#facc15':'#ca8a04';ctx.beginPath();
      ctx.moveTo(cx2-1,cy2-8);ctx.lineTo(cx2-5,cy2+1);ctx.lineTo(cx2-1,cy2);
      ctx.lineTo(cx2+1,cy2+8);ctx.lineTo(cx2+5,cy2-1);ctx.lineTo(cx2+1,cy2);
      ctx.closePath();ctx.fill();
      ctx.fillStyle=dk?'#ca9a08':'#a16207';ctx.font='500 7px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(i.label||'Panel',x+w/2,y-3);
    });

    // Draw clusters
    items.filter(i=>i.type==='desk'||i.type==='circle').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(3,15,6,.4)':'rgba(240,253,244,.5)';
      ctx.strokeStyle=dk?'rgba(34,197,94,.3)':'rgba(22,101,52,.25)';
      ctx.lineWidth=1;ctx.setLineDash([5,4]);
      if(i.shape==='circle'){const cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2;ctx.beginPath();ctx.arc(cx,cy,R,0,2*Math.PI);ctx.fill();ctx.stroke();}
      else{rr(x,y,w,h,7);ctx.fill();ctx.stroke();}
      ctx.setLineDash([]);
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
      const st = seatStatusOf(id);
      const isMine=res?.userId===currentUser.id;
      const isHov=hoveredSeat===id;
      const isBlocked = st === SeatStatus.BLOCKED;
      const isPending = st === SeatStatus.PENDING;
      const isDelegated = st === SeatStatus.DELEGATED;
      const isOcc=!!res||!!hd.fixed[id];

      let fc,sc,tc;
      if(isBlocked){
        fc=dk?'rgba(60,60,60,.3)':'rgba(200,200,200,.5)';sc=dk?'#50506a':'#999';tc=dk?'#777':'#888';
      } else if(hd.fixed[id]){
        fc=dk?'rgba(80,0,0,.55)':'rgba(254,226,226,.8)';sc='#ef4444';tc=dk?'#fca5a5':'#991b1b';
      } else if(isMine && isPending){
        fc=dk?'rgba(60,40,0,.6)':'rgba(255,251,235,.8)';sc='#f59e0b';tc=dk?'#fcd34d':'#92400e';
      } else if(isMine){
        fc=dk?'rgba(60,40,0,.6)':'rgba(255,251,235,.8)';sc='#f59e0b';tc=dk?'#fcd34d':'#92400e';
      } else if(isDelegated){
        fc=dk?'rgba(50,20,80,.5)':'rgba(245,230,255,.8)';sc='#b76dff';tc=dk?'#ddb7ff':'#7c3aed';
      } else if(isPending){
        fc=dk?'rgba(60,40,0,.4)':'rgba(255,251,235,.6)';sc='#f59e0b';tc=dk?'#fcd34d':'#92400e';
      } else if(isOcc){
        fc=dk?'rgba(20,30,80,.55)':'rgba(219,234,254,.8)';sc='#3b82f6';tc=dk?'#93c5fd':'#1e40af';
      } else {
        fc=dk?'rgba(5,35,12,.65)':'rgba(220,252,231,.85)';sc=isHov?'#4ade80':'#22c55e';tc=dk?'#86efac':'#166534';
      }

      // For pending seats, apply pulse opacity
      const seatAlpha = isPending ? pulseOpacity : 1;

      ctx.globalAlpha = seatAlpha;
      ctx.fillStyle=fc;ctx.strokeStyle=sc;ctx.lineWidth=isHov?2:1;

      // Pending: dashed border
      if (isPending) { ctx.setLineDash([4, 3]); } else { ctx.setLineDash([]); }

      rr(x,y,w,h,5);ctx.fill();ctx.stroke();
      ctx.setLineDash([]);

      if(!isOcc&&!isHov&&!isBlocked){ctx.fillStyle='rgba(255,255,255,.02)';ctx.strokeStyle=sc+'33';ctx.lineWidth=.4;rr(x+3,y+3,w-6,h-6,3);ctx.fill();ctx.stroke();}

      // Blocked X overlay
      if (isBlocked) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = dk ? '#777' : '#999';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();ctx.moveTo(x+6,y+6);ctx.lineTo(x+w-6,y+h-6);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+w-6,y+6);ctx.lineTo(x+6,y+h-6);ctx.stroke();
        ctx.lineCap = 'butt';
      }

      ctx.globalAlpha = 1;

      // Highlight ring for admin-selected seat
      if(id===highlightSeat){ctx.strokeStyle='#f59e0b';ctx.lineWidth=2.5;ctx.setLineDash([]);rr(x-3,y-3,w+6,h+6,7);ctx.stroke();}

      // Seat ID label
      ctx.fillStyle=tc;ctx.font='bold 9px monospace';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(id,x+w/2,y+h/2);

      // Delegated badge
      if (isDelegated) {
        const bx = x+w-10, by = y-2;
        ctx.fillStyle = dk ? '#b76dff' : '#9333ea';
        ctx.beginPath(); rr(bx, by, 14, 9, 3); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 6px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('D', bx+7, by+5);
      }
    });

    ctx.restore();
  }, [items, hd, scale, offset, hoveredSeat, theme, pulsePhase]);

  // Hit test seat in canvas coords
  function seatAt(px,py){
    const wx=(px-offset.x)/scale, wy=(py-offset.y)/scale;
    return allSeats.find(s=>wx>=s.x&&wx<=s.x+s.w&&wy>=s.y&&wy<=s.y+s.h)||null;
  }

  const freeCount = allSeats.filter(s => seatStatusOf(s.id) === SeatStatus.FREE).length;
  const occCount  = allSeats.filter(s => {
    const st = seatStatusOf(s.id);
    return st === SeatStatus.OCCUPIED || st === SeatStatus.PENDING || st === SeatStatus.DELEGATED;
  }).length;
  const fixCount  = allSeats.filter(s => seatStatusOf(s.id) === SeatStatus.FIXED).length;
  const blockedCount = allSeats.filter(s => seatStatusOf(s.id) === SeatStatus.BLOCKED).length;

  // Zoom helpers
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
    <div className="hd-map-wrap" style={{position:'relative',height:'100%',display:'flex',flexDirection:'column'}}>
      <div ref={cwRef} style={{position:'relative',flex:1,minHeight:0,padding:0,overflow:'hidden'}}>
        {/* Zoom controls — bottom left, vertical */}
        <div style={{position:'absolute',bottom:12,left:12,display:'flex',flexDirection:'column',gap:4,zIndex:20}}>
          <button onClick={()=>zoomBy(0.15)} style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--sf)',backdropFilter:'blur(12px)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx2)',cursor:'pointer',fontSize: 'var(--fs-body)',fontWeight:600,fontFamily:'inherit',transition:'all .15s'}}>+</button>
          <button onClick={()=>zoomBy(-0.15)} style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--sf)',backdropFilter:'blur(12px)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx2)',cursor:'pointer',fontSize: 'var(--fs-body)',fontWeight:600,fontFamily:'inherit',transition:'all .15s'}}>−</button>
          <button onClick={fitToView} title={t("hotdesk.fitMap")} style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--sf)',backdropFilter:'blur(12px)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx2)',cursor:'pointer',fontSize: 'var(--fs-2xs)',fontFamily:'inherit',transition:'all .15s'}}>
            <span className="material-symbols-outlined" style={{fontSize: 'var(--icon-sm)'}}>fit_screen</span>
          </button>
        </div>
        <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%',
          cursor: hoveredSeat ? (seatStatusOf(hoveredSeat) === SeatStatus.BLOCKED ? 'not-allowed' : 'pointer') : 'default'}}
          onMouseMove={e=>{
            const r=canvasRef.current?.getBoundingClientRect();
            if(!r)return;
            const s=seatAt(e.clientX-r.left,e.clientY-r.top);
            setHoveredSeat(s?.id||null);
            if(s){
              const res=hd.reservations.find(rv=>rv.seatId===s.id&&rv.date===TODAY);
              const isFixed=!!hd.fixed[s.id];
              const name=isFixed?hd.fixed[s.id]:res?.userName||null;
              const st = seatStatusOf(s.id);
              setSeatHoverInfo({id:s.id,name,x:e.clientX,y:e.clientY,status:st});
            }else{setSeatHoverInfo(null);}
          }}
          onMouseLeave={()=>{setHoveredSeat(null);setSeatHoverInfo(null);}}
          onClick={e=>{
            const r=canvasRef.current?.getBoundingClientRect();
            if(!r)return;
            const s=seatAt(e.clientX-r.left,e.clientY-r.top);
            if(s && seatStatusOf(s.id) !== SeatStatus.BLOCKED) onSeat(s.id);
          }}
        />
        {!allSeats.length && (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize: 'var(--fs-xs)',flexDirection:'column',gap:8}}>
            <span style={{fontSize: 'var(--fs-xl)'}}>MAP</span>
            <span>{t("hotdesk.noBlueprint")}</span>
          </div>
        )}
      </div>
      {seatHoverInfo&&(
        <div style={{position:'fixed',left:seatHoverInfo.x+14,top:seatHoverInfo.y-10,
          background:'var(--sf)',border:'1px solid var(--bd2)',borderRadius:'var(--r)',
          padding:'5px 10px',zIndex:9901,pointerEvents:'none',
          boxShadow:'var(--shadow)',animation:'mbIn .1s ease',whiteSpace:'nowrap'}}>
          <span style={{fontFamily:'var(--mono)',fontWeight:700,
            color: seatHoverInfo.status === SeatStatus.BLOCKED ? 'var(--tx3)'
                 : seatHoverInfo.status === SeatStatus.PENDING ? 'var(--amber)'
                 : seatHoverInfo.status === SeatStatus.DELEGATED ? 'var(--purple)'
                 : hoveredSeat ? 'var(--ac2)' : 'var(--tx)',
            fontSize: 'var(--fs-xs)'}}>{seatHoverInfo.id}</span>
          {seatHoverInfo.status === SeatStatus.BLOCKED && <span style={{fontSize: 'var(--fs-2xs)',color:'var(--tx3)',marginLeft:8}}>{t("hotdesk.blocked")}</span>}
          {seatHoverInfo.status === SeatStatus.PENDING && <span style={{fontSize: 'var(--fs-2xs)',color:'var(--amber)',marginLeft:8}}>{t("hotdesk.pending")}</span>}
          {seatHoverInfo.status === SeatStatus.DELEGATED && <span style={{fontSize: 'var(--fs-2xs)',color:'var(--purple)',marginLeft:8}}>{t("hotdesk.delegated")}</span>}
          {seatHoverInfo.name && seatHoverInfo.status !== SeatStatus.BLOCKED && <span style={{fontSize: 'var(--fs-2xs)',color:'var(--tx2)',marginLeft:8}}>{seatHoverInfo.name}</span>}
          {!seatHoverInfo.name && seatHoverInfo.status === SeatStatus.FREE && <span style={{fontSize: 'var(--fs-2xs)',color:'var(--green)',marginLeft:8}}>{t("hotdesk.free")}</span>}
        </div>
      )}
      <div className="hd-sub">{t("hotdesk.reserve")} · <span style={{color:'var(--amber)'}}>● {t("hotdesk.mine")}</span></div>
    </div>
  );
}

export { BlueprintHDMap };
