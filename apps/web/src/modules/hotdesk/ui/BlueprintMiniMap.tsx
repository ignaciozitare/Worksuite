// @ts-nocheck
import React, { useRef, useMemo, useEffect } from 'react';
import { TODAY } from '@/shared/lib/constants';

function BlueprintMiniMap({ blueprint, hd, seatId, theme="dark" }) {
  const canvasRef = useRef(null);
  
  const dk = theme !== 'light';

  const items = (() => {
    try { return Array.isArray(blueprint?.layout) ? blueprint.layout : []; } catch { return []; }
  })();

  const CELL=52, PAD=14, LH=18;

  function getSeatsForItem(item) {
    if(item.shape==='circle'){
      const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
      const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
      const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
      return Array.from({length:n},(_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return{id:pfx+(i+1),x:cx+R*Math.cos(a)-CELL/2+2,y:cy+R*Math.sin(a)-CELL/2+2,w:CELL-4,h:CELL-4};});
    }
    const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
    const tW=cols*CELL,tH=rows*CELL,sx=x+PAD+(w-PAD*2-tW)/2,sy=y+LH+PAD+(h-LH-PAD*2-tH)/2;
    const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
    let n=1;return Array.from({length:cols*rows},(_,i)=>{const r=Math.floor(i/cols),cc=i%cols;const s={id:pfx+n,x:sx+cc*CELL+2,y:sy+r*CELL+2,w:CELL-4,h:CELL-4};n++;return s;});
  }

  const allSeats = useMemo(()=>{
    const seats=[];
    items.forEach(item=>{
      if(item.type==='desk'||item.type==='circle'){
        const dis=item.disabled||[];
        getSeatsForItem(item).forEach(s=>{if(!dis.includes(s.id))seats.push(s);});
      }
    });
    return seats;
  },[blueprint?.id]);

  const bbox = useMemo(()=>{
    if(!items.length)return{minX:0,minY:0,maxX:400,maxY:300};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    items.forEach(i=>{if(i.x<minX)minX=i.x;if(i.y<minY)minY=i.y;if(i.x+i.w>maxX)maxX=i.x+i.w;if(i.y+i.h>maxY)maxY=i.y+i.h;});
    return{minX:minX-16,minY:minY-16,maxX:maxX+16,maxY:maxY+16};
  },[blueprint?.id]);

  useEffect(()=>{
    const cvs=canvasRef.current;if(!cvs)return;
    const ctx=cvs.getContext('2d');
    const W=cvs.width,H=cvs.height;
    ctx.clearRect(0,0,W,H);
    const bW=bbox.maxX-bbox.minX,bH=bbox.maxY-bbox.minY;
    const s=Math.min(W/bW,H/bH);
    const ox=(W-bW*s)/2-bbox.minX*s, oy=(H-bH*s)/2-bbox.minY*s;

    function rr(x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

    ctx.save();ctx.setTransform(s,0,0,s,ox,oy);

    // Draw non-cluster items as faint background
    items.forEach(i=>{
      const{x,y,w,h}=i;
      if(i.type==='zone'){ctx.fillStyle=dk?'rgba(40,30,80,.15)':'rgba(238,242,255,.5)';ctx.strokeStyle='rgba(129,140,248,.3)';ctx.lineWidth=1/s;ctx.setLineDash([4/s,3/s]);rr(x,y,w,h,5);ctx.fill();ctx.stroke();ctx.setLineDash([]);}
      else if(i.type==='room'){ctx.fillStyle=dk?'rgba(15,30,70,.3)':'rgba(219,234,254,.4)';ctx.strokeStyle='rgba(59,130,246,.3)';ctx.lineWidth=1/s;ctx.setLineDash([]);rr(x,y,w,h,4);ctx.fill();ctx.stroke();}
      else if(i.type==='wall'){ctx.strokeStyle=dk?'rgba(120,120,120,.5)':'rgba(100,100,110,.4)';ctx.lineWidth=3/s;ctx.setLineDash([]);ctx.lineCap='round';if(i.pts&&i.pts.length>=2){ctx.beginPath();ctx.moveTo(i.pts[0].x,i.pts[0].y);i.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();}else{rr(x,y,w,h,2);ctx.stroke();}ctx.lineCap='butt';}
      else if(i.type==='door'){
        const rad2=(i.angle||0)*Math.PI/180,sw2=i.w||48;
        const c2=Math.cos(rad2),s2=Math.sin(rad2);
        const gx2=x+sw2*c2,gy2=y+sw2*s2,lx2=x+sw2*s2,ly2=y-sw2*c2;
        ctx.strokeStyle='rgba(249,115,22,.7)';ctx.lineWidth=1.5/s;ctx.setLineDash([]);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(gx2,gy2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx2,ly2);ctx.stroke();
        ctx.lineWidth=0.6/s;ctx.setLineDash([3/s,3/s]);
        ctx.beginPath();ctx.arc(x,y,sw2,rad2,rad2-Math.PI/2,true);ctx.stroke();
        ctx.setLineDash([]);ctx.lineCap='butt';
      }
      else if(i.type==='window'){
        const rad3=(i.angle||0)*Math.PI/180,sw3=i.w||48,hth3=3;
        const c3=Math.cos(rad3),s3=Math.sin(rad3),px3=-s3,py3=c3;
        ctx.strokeStyle='rgba(56,189,248,.7)';ctx.lineWidth=1.5/s;ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo(x+px3*hth3,y+py3*hth3);ctx.lineTo(x+sw3*c3+px3*hth3,y+sw3*s3+py3*hth3);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x-px3*hth3,y-py3*hth3);ctx.lineTo(x+sw3*c3-px3*hth3,y+sw3*s3-py3*hth3);ctx.stroke();
        ctx.lineWidth=1/s;
        ctx.beginPath();ctx.moveTo(x+px3*hth3,y+py3*hth3);ctx.lineTo(x-px3*hth3,y-py3*hth3);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+sw3*c3+px3*hth3,y+sw3*s3+py3*hth3);ctx.lineTo(x+sw3*c3-px3*hth3,y+sw3*s3-py3*hth3);ctx.stroke();
      }
      else if(i.type==='desk'||i.type==='circle'){
        ctx.fillStyle=dk?'rgba(3,15,6,.3)':'rgba(240,253,244,.4)';
        ctx.strokeStyle='rgba(34,197,94,.2)';ctx.lineWidth=1/s;ctx.setLineDash([3/s,3/s]);
        if(i.shape==='circle'){const cx=i.x+i.w/2,cy=i.y+i.h/2,R=Math.min(i.w,i.h)/2;ctx.beginPath();ctx.arc(cx,cy,R,0,2*Math.PI);ctx.fill();ctx.stroke();}
        else{rr(i.x,i.y,i.w,i.h,5);ctx.fill();ctx.stroke();}
        ctx.setLineDash([]);
      }
    });

    // Draw all seats small
    allSeats.forEach(seat=>{
      const{x,y,w,h,id}=seat;
      const isTarget=id===seatId;
      const res=hd.reservations.find(r=>r.seatId===id&&r.date===TODAY);
      const isFixed=!!hd.fixed[id];
      const isMine=res?.userId===hd._currentUserId;
      let col;
      if(isTarget) col='#f59e0b';
      else if(isFixed) col='#ef4444';
      else if(res) col='#3b82f6';
      else col='#22c55e';
      ctx.fillStyle=col+(isTarget?'':'44');
      ctx.strokeStyle=col;
      ctx.lineWidth=(isTarget?2.5:0.8)/s;
      rr(x,y,w,h,3);ctx.fill();ctx.stroke();
      // Target gets a glow + label
      if(isTarget){
        ctx.fillStyle=col;
        ctx.font=`bold ${Math.max(8,10/s)}px monospace`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(id,x+w/2,y+h/2);
      }
    });

    ctx.restore();
  },[blueprint?.id, hd, seatId, theme]);

  return <canvas ref={canvasRef} width={440} height={280} style={{display:'block',width:'100%',borderRadius:6}}/>;
}

export { BlueprintMiniMap };
