import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { BlueprintMiniMap } from './BlueprintMiniMap';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { TODAY } from '@/shared/lib/constants';

function SeatTooltip({ seatId, anchorX, anchorY, hd, currentUser, blueprint, theme="dark" }: { seatId: string; anchorX: number; anchorY: number; hd: any; currentUser: any; blueprint: any; theme?: string }) {

  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchorX - 140, top: anchorY + 8 });

  // Enrich hd with currentUserId for mini-map coloring
  const hdWithUser = useMemo(()=>({...hd, _currentUserId: currentUser?.id}), [hd, currentUser?.id]);

  const blockedSeats = hd.blockedSeats || {};
  const res = hd.reservations.find((r: any)=>r.seatId===seatId&&r.date===TODAY);
  const isFixed = !!hd.fixed[seatId];
  const isBlocked = !!blockedSeats[seatId];
  const isMine = res?.userId === currentUser?.id;
  const isPending = res?.status === 'pending';
  const isDelegated = !!res?.delegatedBy;
  const ownerName = isFixed ? hd.fixed[seatId] : res?.userName;

  let statusLabel = t("hotdesk.free");
  let statusColor = 'var(--green)';
  let statusBg = 'var(--green-dim)';

  if (isBlocked) {
    statusLabel = t("hotdesk.blocked");
    statusColor = 'var(--tx3)';
    statusBg = 'rgba(140,144,159,.12)';
  } else if (isMine && isPending) {
    statusLabel = t("hotdesk.pending");
    statusColor = 'var(--amber)';
    statusBg = 'var(--amber-dim)';
  } else if (isMine) {
    statusLabel = t("hotdesk.mine");
    statusColor = 'var(--amber)';
    statusBg = 'var(--amber-dim)';
  } else if (isDelegated) {
    statusLabel = t("hotdesk.delegated");
    statusColor = 'var(--purple-strong)';
    statusBg = 'var(--purple-dim)';
  } else if (isFixed) {
    statusLabel = t("hotdesk.fixed");
    statusColor = 'var(--danger-strong)';
    statusBg = 'var(--red-dim)';
  } else if (res) {
    statusLabel = isPending ? t("hotdesk.pending") : t("hotdesk.occupied");
    statusColor = isPending ? 'var(--amber)' : 'var(--ac)';
    statusBg = isPending ? 'var(--amber-dim)' : 'var(--ac-dim)';
  }

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
        <span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize: 'var(--fs-xs)',color: statusColor}}>
          {seatId}
        </span>
        <span style={{fontSize: 'var(--fs-2xs)',padding:'2px 7px',borderRadius:10,fontWeight:600,
          background: statusBg, color: statusColor}}>
          {statusLabel}
        </span>
        {ownerName && !isBlocked && <span style={{fontSize: 'var(--fs-2xs)',color:'var(--tx3)',marginLeft:'auto'}}>{ownerName.split(' ')[0]}</span>}
      </div>
      {/* Mini-map showing position */}
      <div style={{background:'var(--sf2)',borderRadius:6,overflow:'hidden',border:'1px solid var(--bd)'}}>
        {blueprint
          ? <BlueprintMiniMap blueprint={blueprint} hd={hdWithUser} seatId={seatId} theme={theme}/>
          : <div style={{height:80,display:'flex',alignItems:'center',justifyContent:'center',fontSize: 'var(--fs-2xs)',color:'var(--tx3)'}}>{t("hotdesk.noBlueprint")}</div>
        }
      </div>
    </div>
  );
}

export { SeatTooltip };
