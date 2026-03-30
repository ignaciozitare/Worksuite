// @ts-nocheck
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { BlueprintMiniMap } from './BlueprintMiniMap';
import { TODAY } from '@/shared/lib/constants';

function SeatTooltip({ seatId, anchorX, anchorY, hd, currentUser, blueprint, theme="dark" }) {
  
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: anchorX - 140, top: anchorY + 8 });

  // Enrich hd with currentUserId for mini-map coloring
  const hdWithUser = useMemo(()=>({...hd, _currentUserId: currentUser?.id}), [hd, currentUser?.id]);

  const res = hd.reservations.find(r=>r.seatId===seatId&&r.date===TODAY);
  const isFixed = !!hd.fixed[seatId];
  const isMine = res?.userId === currentUser?.id;
  const ownerName = isFixed ? hd.fixed[seatId] : res?.userName;

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const r  = el.getBoundingClientRect();
    let left = anchorX - r.width / 2;
    let top  = anchorY + 8;
    if (left + r.width > window.innerWidth - 12) left = window.innerWidth - r.width - 12;
    if (left < 12) left = 12;
    if (top + r.height > window.innerHeight - 12) top = anchorY - r.height - 8;
    setPos({ left, top });
  }, [anchorX, anchorY]);

  return (
    <div ref={ref} className="hd-tooltip" data-theme={theme} style={{ left: pos.left, top: pos.top, width: 480 }}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:13,
          color: isMine?'var(--amber)': isFixed?'var(--red)': res?'var(--ac2)':'var(--green)'}}>
          {seatId}
        </span>
        <span style={{fontSize:10,padding:'2px 7px',borderRadius:10,fontWeight:600,
          background: isMine?'rgba(245,158,11,.12)': isFixed?'rgba(239,68,68,.12)': res?'rgba(59,130,246,.12)':'rgba(34,197,94,.12)',
          color: isMine?'#f59e0b': isFixed?'#ef4444': res?'#3b82f6':'#22c55e'}}>
          {isMine?'My seat': isFixed?'Fixed': res?'Occupied':'Free'}
        </span>
        {ownerName && <span style={{fontSize:10,color:'var(--tx3)',marginLeft:'auto'}}>{ownerName.split(' ')[0]}</span>}
      </div>
      {/* Mini-map showing position */}
      <div style={{background:'var(--sf2)',borderRadius:6,overflow:'hidden',border:'1px solid var(--bd)'}}>
        {blueprint
          ? <BlueprintMiniMap blueprint={blueprint} hd={hdWithUser} seatId={seatId} theme={theme}/>
          : <div style={{height:80,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'var(--tx3)'}}>No map available</div>
        }
      </div>
    </div>
  );
}

export { SeatTooltip };
