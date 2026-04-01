import React from 'react';
import { SeatStatusEnum as SeatStatus } from '../domain/entities/constants';
import { ReservationService } from '../domain/services/ReservationService';
import { SEATS } from '../domain/entities/seats';
import { TODAY } from '@/shared/lib/constants';

const MOCK_TODAY = TODAY;

function OfficeSVG({ hd, onSeat, highlightSeat, currentUser, showOccupants=true, theme="dark" }: { hd: any; onSeat?: (id: string) => void; highlightSeat?: string; currentUser: any; showOccupants?: boolean; theme?: string }) {
  
  const C = theme === "light"
    ? { free:"#0f9060", occ:"#4f6ef7", fixed:"#c02828", amber:"#b86800",
        bd:"#d0d0e0", sf:"#ffffff", sf2:"#f0f0f8", sf3:"#e4e4ef", tx3:"#8888aa",
        zoneBg:"#f8f8fd", zoneBd:"#c0c0d8" }
    : { free:"#3ecf8e", occ:"#4f6ef7", fixed:"#e05252", amber:"#f5a623",
        bd:"#2a2a38", sf:"#141418", sf2:"#1b1b22", sf3:"#21212c", tx3:"#50506a",
        zoneBg:"#18181f", zoneBd:"#2a2a38" };

  const colOf = (st: string) => st===SeatStatus.FIXED ? C.fixed : st===SeatStatus.OCCUPIED ? C.occ : C.free;

  const SeatIcon = ({ seat }: { seat: any }) => {
    const st     = ReservationService.statusOf(seat.id, MOCK_TODAY, hd.fixed, hd.reservations);
    const res    = ReservationService.resOf(seat.id, MOCK_TODAY, hd.reservations);
    const col    = colOf(st);
    const isMine = res?.userId === currentUser.id;
    const isMyFixed = hd.fixed[seat.id] === currentUser.name;
    const stroke = (isMine || isMyFixed) ? C.amber : col;
    const lbl    = hd.fixed[seat.id]
      ? (hd.fixed?.[seat.id] ?? "").split(" ")[0].slice(0,7)
      : res ? (res!.userName ?? "").split(" ")[0].slice(0,7) : "";
    const { x, y } = seat;
    const op = theme === "light" ? 0.18 : 0.10;
    return (
      <g className={onSeat?"hd-seat":""} onClick={()=>onSeat&&onSeat(seat.id)}>
        {highlightSeat===seat.id && <rect x={x-25} y={y-18} width={50} height={46} rx={9} fill="none" stroke={C.amber} strokeWidth={2} strokeDasharray="5 3"/>}
        {/* desk */}
        <rect x={x-21} y={y-10} width={42} height={22} rx={6} fill={col} fillOpacity={op} stroke={stroke} strokeWidth={isMine||isMyFixed?2:1.5}/>
        {/* monitor */}
        <rect x={x-8} y={y-8} width={16} height={10} rx={2} fill={col} fillOpacity={op*1.5} stroke={col} strokeOpacity={0.35} strokeWidth={1}/>
        {/* chair */}
        <rect x={x-11} y={y+14} width={22} height={12} rx={5} fill={col} fillOpacity={op} stroke={stroke} strokeWidth={1.2}/>
        {/* label */}
        <text x={x} y={y+34} textAnchor="middle" fill={col} fontSize={8} fontWeight={700} fontFamily="monospace">{seat.id}</text>
        {showOccupants && lbl && <text x={x} y={y+6} textAnchor="middle" fill={stroke} fontSize={7} fontWeight={700}>{lbl}</text>}
        {showOccupants && (isMine||isMyFixed) && <circle cx={x+17} cy={y-14} r={4} fill={C.amber} stroke={C.sf} strokeWidth={1}/>}
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
      <text x={322} y={416} textAnchor="middle" fill={C.tx3} fontSize={8} fontWeight={700} letterSpacing={1.5}>▲ ENTRANCE</text>
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
