import React from 'react';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { SEATS } from '../domain/entities/seats';
import { TODAY } from '@/shared/lib/constants';

const MOCK_TODAY = TODAY;

function OfficeSVG({ hd, onSeat, highlightSeat, currentUser, showOccupants=true, theme="dark" }: { hd: any; onSeat?: (id: string) => void; highlightSeat?: string; currentUser: any; showOccupants?: boolean; theme?: string }) {

  const blockedSeats = hd.blockedSeats || {};

  const C = theme === "light"
    ? { free:"#0f9060", occ:"#4f6ef7", fixed:"#c02828", amber:"#b86800",
        pending:"#b86800", blocked:"#8888aa", delegated:"#9b59b6",
        bd:"#d0d0e0", sf:"#ffffff", sf2:"#f0f0f8", sf3:"#e4e4ef", tx3:"#8888aa",
        zoneBg:"#f8f8fd", zoneBd:"#c0c0d8" }
    : { free:"#3ecf8e", occ:"#4f6ef7", fixed:"#e05252", amber:"#f5a623",
        pending:"#f5a623", blocked:"#50506a", delegated:"#b76dff",
        bd:"#2a2a38", sf:"#141418", sf2:"#1b1b22", sf3:"#21212c", tx3:"#50506a",
        zoneBg:"#18181f", zoneBd:"#2a2a38" };

  const colOf = (st: string) => {
    if (st === SeatStatus.FIXED) return C.fixed;
    if (st === SeatStatus.OCCUPIED) return C.occ;
    if (st === SeatStatus.PENDING) return C.pending;
    if (st === SeatStatus.BLOCKED) return C.blocked;
    if (st === SeatStatus.DELEGATED) return C.delegated;
    return C.free;
  };

  const SeatIcon = ({ seat }: { seat: any }) => {
    const st     = ReservationService.statusOf(seat.id, MOCK_TODAY, hd.fixed, hd.reservations, blockedSeats);
    const res    = ReservationService.resOf(seat.id, MOCK_TODAY, hd.reservations);
    const col    = colOf(st);
    const isMine = res?.userId === currentUser.id;
    const isMyFixed = hd.fixed[seat.id] === currentUser.name;
    const stroke = (isMine || isMyFixed) ? C.amber : col;
    const resName = res ? String(res.userName || "") : "";
    const lbl    = hd.fixed[seat.id]
      ? (String(hd.fixed?.[seat.id] || "").split(" ")[0] ?? "").slice(0,7)
      : resName ? (resName.split(" ")[0] ?? "").slice(0,7) : "";
    const { x, y } = seat;
    const op = theme === "light" ? 0.18 : 0.10;
    const isBlocked = st === SeatStatus.BLOCKED;
    const isPending = st === SeatStatus.PENDING;
    const isDelegated = st === SeatStatus.DELEGATED;

    return (
      <g className={onSeat && !isBlocked ? "hd-seat" : ""} onClick={()=> !isBlocked && onSeat && onSeat(seat.id)} style={isBlocked ? {cursor:'not-allowed'} : undefined}>
        {highlightSeat===seat.id && <rect x={x-25} y={y-18} width={50} height={46} rx={9} fill="none" stroke={C.amber} strokeWidth={2} strokeDasharray="5 3"/>}
        {/* desk */}
        <rect x={x-21} y={y-10} width={42} height={22} rx={6}
          fill={col} fillOpacity={isBlocked ? 0.05 : op}
          stroke={stroke} strokeWidth={isMine||isMyFixed?2:1.5}
          strokeDasharray={isPending ? "4 2" : undefined}
        >
          {isPending && <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>}
        </rect>
        {/* monitor */}
        <rect x={x-8} y={y-8} width={16} height={10} rx={2}
          fill={col} fillOpacity={isBlocked ? 0.03 : op*1.5}
          stroke={col} strokeOpacity={isBlocked ? 0.15 : 0.35} strokeWidth={1}/>
        {/* chair */}
        <rect x={x-11} y={y+14} width={22} height={12} rx={5}
          fill={col} fillOpacity={isBlocked ? 0.05 : op}
          stroke={stroke} strokeWidth={1.2}/>
        {/* Blocked X overlay */}
        {isBlocked && (
          <g>
            <line x1={x-12} y1={y-6} x2={x+12} y2={y+22} stroke={C.blocked} strokeWidth={2} strokeLinecap="round" opacity={0.7}/>
            <line x1={x+12} y1={y-6} x2={x-12} y2={y+22} stroke={C.blocked} strokeWidth={2} strokeLinecap="round" opacity={0.7}/>
          </g>
        )}
        {/* Delegated badge */}
        {isDelegated && (
          <g>
            <rect x={x+8} y={y-16} width={16} height={10} rx={3} fill={C.delegated} fillOpacity={0.85}/>
            <text x={x+16} y={y-9} textAnchor="middle" fill="#fff" fontSize={6} fontWeight={700}>D</text>
          </g>
        )}
        {/* Pending pulse indicator */}
        {isPending && (
          <circle cx={x+17} cy={y-14} r={4} fill={C.pending} stroke={C.sf} strokeWidth={1}>
            <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
          </circle>
        )}
        {/* label */}
        <text x={x} y={y+34} textAnchor="middle" fill={col} fontSize={8} fontWeight={700} fontFamily="monospace">{seat.id}</text>
        {showOccupants && lbl && <text x={x} y={y+6} textAnchor="middle" fill={stroke} fontSize={7} fontWeight={700}>{lbl}</text>}
        {showOccupants && (isMine||isMyFixed) && !isPending && <circle cx={x+17} cy={y-14} r={4} fill={C.amber} stroke={C.sf} strokeWidth={1}/>}
      </g>
    );
  };

  return (
    <svg viewBox="0 0 660 420" style={{width:"100%",display:"block",borderRadius:8}}>
      <rect x={0} y={0} width={660} height={420} rx={12} fill={C.sf2}/>
      {/* Right dividers */}
      <line x1={472} y1={0} x2={472} y2={420} stroke={C.bd} strokeWidth={1.5}/>
      <line x1={472} y1={210} x2={660} y2={210} stroke={C.bd} strokeWidth={1.5}/>
      {/* Meeting room */}
      <rect x={473} y={0} width={187} height={210} fill={C.sf3}/>
      <text x={566} y={85} textAnchor="middle" fill={C.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>MEETING</text>
      <text x={566} y={100} textAnchor="middle" fill={C.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>ROOM</text>
      <ellipse cx={566} cy={155} rx={52} ry={26} fill={C.sf2} stroke={C.bd} strokeWidth={1}/>
      {/* Kitchen */}
      <rect x={473} y={211} width={187} height={209} fill={C.sf3}/>
      <text x={566} y={295} textAnchor="middle" fill={C.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>KITCHEN /</text>
      <text x={566} y={311} textAnchor="middle" fill={C.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>RESTROOMS</text>
      {/* Entrance */}
      <rect x={266} y={408} width={112} height={10} rx={3} fill={C.sf2} stroke={C.bd}/>
      <text x={322} y={416} textAnchor="middle" fill={C.tx3} fontSize={8} fontWeight={700} letterSpacing={1.5}>ENTRANCE</text>
      {/* Zone boxes */}
      <rect x={16} y={28} width={216} height={170} rx={10} fill={C.zoneBg} stroke={C.zoneBd} strokeWidth={1.2}/>
      <text x={124} y={20} textAnchor="middle" fill={C.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE A</text>
      <rect x={244} y={28} width={216} height={170} rx={10} fill={C.zoneBg} stroke={C.zoneBd} strokeWidth={1.2}/>
      <text x={352} y={20} textAnchor="middle" fill={C.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE B</text>
      <rect x={16} y={238} width={444} height={170} rx={10} fill={C.zoneBg} stroke={C.zoneBd} strokeWidth={1.2}/>
      <text x={238} y={230} textAnchor="middle" fill={C.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE C</text>
      {/* Seats */}
      {SEATS.map(seat => <SeatIcon key={seat.id} seat={seat}/>)}
    </svg>
  );
}

export { OfficeSVG };
