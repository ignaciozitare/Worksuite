// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { supabase } from '../lib/api';
import { BlueprintHDMap } from '../../modules/hotdesk/ui/BlueprintHDMap';
import { MiniCalendar } from '../ui/MiniCalendar';
import { TODAY } from '../lib/constants';
import { fmtMonthYear } from '../lib/utils';

function AdminHotDesk({ hd, setHd, users, theme="dark" }) {
  const { t, locale } = useTranslation();
  const lang = locale;
  const [buildings,  setBuildings]  = useState([]);
  const [floors,     setFloors]     = useState([]);
  const [selBldg,    setSelBldg]    = useState(null);
  const [selFloor,   setSelFloor]   = useState(null);
  const [selSeat,    setSelSeat]    = useState(null);
  const [selUser,    setSelUser]    = useState('');
  const [asFixed,    setAsFixed]    = useState(false);
  const [selDates,   setSelDates]   = useState([]);
  const [yr, sYr]  = useState(new Date().getFullYear());
  const [mo, sMo]  = useState(new Date().getMonth());
  const CELL=52,PAD=14,LH=18;
  const hotdeskUsers = users.filter(u => u.deskType===DeskType.HOTDESK || u.deskType===DeskType.FIXED);

  useEffect(()=>{
    supabase.from('buildings').select('*').eq('active',true).order('name')
      .then(({data})=>{if(data){setBuildings(data);if(data[0])setSelBldg(data[0]);}});
  },[]);

  useEffect(()=>{
    if(!selBldg){setFloors([]);setSelFloor(null);return;}
    supabase.from('blueprints').select('id,floor_name,floor_order,layout')
      .eq('building_id',selBldg.id).order('floor_order')
      .then(({data})=>{if(data){setFloors(data);setSelFloor(data[0]||null);}});
  },[selBldg?.id]);

  function getSeatsForItem(item) {
    if(item.shape==='circle'){
      const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
      const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
      const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
      return Array.from({length:n},(_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return{id:pfx+(i+1)};});
    }
    const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
    const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
    let n=1;return Array.from({length:cols*rows},()=>{const s={id:pfx+n};n++;return s;});
  }

  const seats = useMemo(()=>{
    const items=(() => { try { return Array.isArray(selFloor?.layout)?selFloor.layout:[]; } catch { return []; }})();
    if(!items.length) return SEATS.map(s=>({...s}));
    const result=[];
    items.forEach(item=>{
      if(item.type!=='desk'&&item.type!=='circle') return;
      const dis=item.disabled||[];
      getSeatsForItem(item).forEach(s=>{ if(!dis.includes(s.id)) result.push(s); });
    });
    return result;
  },[selFloor?.id]);

  const confirmAssign = async () => {
    if (!selSeat || !selUser) return;
    const usr = users.find(u=>u.id===selUser);
    if (asFixed) {
      setHd(h=>({ ...h, fixed:{ ...h.fixed, [selSeat]:usr?.name||selUser }, reservations:h.reservations.filter(r=>r.seatId!==selSeat) }));
      await supabase.from('fixed_assignments').upsert({seat_id:selSeat,user_id:selUser,user_name:usr?.name||selUser});
    } else {
      if (!selDates.length) return;
      setHd(h=>({ ...h, reservations:[ ...h.reservations.filter(r=>!selDates.includes(r.date)||r.seatId!==selSeat), ...selDates.map(date=>({seatId:selSeat,date,userId:selUser,userName:usr?.name||selUser})) ]}));
      const rows=selDates.map(d=>({id:`res-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,seat_id:selSeat,user_id:selUser,user_name:usr?.name||selUser,date:d}));
      await supabase.from('seat_reservations').upsert(rows,{onConflict:'seat_id,date'});
    }
    setSelSeat(null); setSelUser(''); setSelDates([]); setAsFixed(false);
  };

  const removeFixed = async (sid) => {
    setHd(h=>{ const f={...h.fixed}; delete f[sid]; return {...h,fixed:f}; });
    await supabase.from('fixed_assignments').delete().eq('seat_id',sid);
  };

  const occupiedForSeat = selSeat ? hd.reservations.filter(r=>r.seatId===selSeat).map(r=>r.date) : [];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,height:'100%',overflow:'hidden'}}>
      <div style={{flexShrink:0}}>
        <div className="sec-t">{t('admin.hotdeskTitle')}</div>
        <div className="sec-sub">Assign seats and fixed allocations from the floor plan.</div>
      </div>

      {/* Building + Floor selectors */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
        {buildings.length > 0 ? <>
          <select className="a-inp" style={{width:'auto',fontSize:12,padding:'5px 10px'}}
            value={selBldg?.id||''} onChange={e=>{const b=buildings.find(x=>x.id===e.target.value);setSelBldg(b||null);}}>
            {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="a-inp" style={{width:'auto',fontSize:12,padding:'5px 10px'}}
            value={selFloor?.id||''} onChange={e=>{const fl=floors.find(x=>x.id===e.target.value);setSelFloor(fl||null);setSelSeat(null);}}>
            {floors.map(fl=><option key={fl.id} value={fl.id}>{fl.floor_name}</option>)}
          </select>
          <span style={{fontSize:11,color:'var(--tx3)'}}>{seats.length} seats</span>
        </> : (
          <div style={{fontSize:12,color:'var(--tx3)'}}>No buildings — create in Admin → Blueprint first.</div>
        )}
      </div>

      {/* Main layout: map left, controls right */}
      <div style={{display:'flex',gap:16,flex:1,minHeight:0,overflow:'hidden'}}>

        {/* Floor map */}
        <div style={{flex:'0 0 auto',width:420}}>
          <div style={{flex:1,minHeight:350}}>
          {selFloor ? <BlueprintHDMap
            hd={hd}
            blueprint={selFloor}
            currentUser={{id:''}}
            onSeat={sid=>{setSelSeat(sid);setSelDates([]);setSelUser('');setAsFixed(false);}}
            highlightSeat={selSeat}
            theme={theme}
          /> : <div style={{height:300,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize:12}}>Select a building & floor</div>}
        </div>

        </div>

        {/* Right: seat grid + assign panel */}
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:12,overflow:'auto'}}>

          {/* Seat grid */}
          <div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--tx3)',marginBottom:8}}>SELECT SEAT</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {seats.map(seat=>{
                const st=ReservationService.statusOf(seat.id,MOCK_TODAY,hd.fixed,hd.reservations);
                const isSel=selSeat===seat.id;
                return(
                  <button key={seat.id}
                    onClick={()=>{setSelSeat(seat.id);setSelDates([]);setSelUser('');setAsFixed(false);}}
                    style={{width:46,height:36,border:`1px solid ${isSel?'var(--ac)':st===SeatStatus.FIXED?'rgba(239,68,68,.4)':st===SeatStatus.OCCUPIED?'rgba(59,130,246,.35)':'var(--bd)'}`,
                      borderRadius:'var(--r)',background:isSel?'var(--glow)':st===SeatStatus.FIXED?'rgba(239,68,68,.06)':st===SeatStatus.OCCUPIED?'rgba(59,130,246,.06)':'var(--sf2)',
                      color:isSel?'var(--ac2)':st===SeatStatus.FIXED?'var(--red)':st===SeatStatus.OCCUPIED?'var(--ac2)':'var(--tx2)',
                      cursor:'pointer',fontSize:9,fontWeight:600,textAlign:'center',lineHeight:1.2,padding:'2px 3px',transition:'var(--ease)'}}>
                    {seat.id}
                    {hd.fixed[seat.id]&&<div style={{fontSize:7,lineHeight:1,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{hd.fixed[seat.id].split(' ')[0].slice(0,5)}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fixed seats summary */}
          {Object.keys(hd.fixed).length>0&&(
            <div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--tx3)',marginBottom:6}}>Fixed seats</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {Object.entries(hd.fixed).map(([sid,uname])=>(
                  <div key={sid} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 8px',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.2)',borderRadius:'var(--r)',fontSize:11}}>
                    <span style={{fontFamily:'var(--mono)',color:'var(--red)',fontWeight:700,fontSize:11}}>{sid}</span>
                    <span style={{color:'var(--tx2)'}}>{uname}</span>
                    <button onClick={()=>removeFixed(sid)} style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:12,padding:'0 2px',lineHeight:1}}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assign panel */}
          {selSeat ? (
            <div className="a-card" style={{marginBottom:0,flexShrink:0}}>
              <div className="a-ct">🪑 Assign — <span style={{color:'var(--ac2)',fontFamily:'var(--mono)'}}>{selSeat}</span>
                <span style={{fontSize:10,fontWeight:400,color:'var(--tx3)',marginLeft:8}}>
                  {hd.fixed[selSeat]?'Fixed: '+hd.fixed[selSeat]:hd.reservations.find(r=>r.seatId===selSeat&&r.date===MOCK_TODAY)?.userName||'Free today'}
                </span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <select className="a-inp" value={selUser} onChange={e=>setSelUser(e.target.value)} style={{cursor:'pointer'}}>
                  <option value="">— Select user —</option>
                  {hotdeskUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <div onClick={()=>setAsFixed(f=>!f)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--sf2)',borderRadius:'var(--r)',border:`1px solid ${asFixed?'rgba(239,68,68,.3)':'var(--bd)'}`,cursor:'pointer'}}>
                  <div style={{width:14,height:14,borderRadius:3,background:asFixed?'var(--red)':'transparent',border:`2px solid ${asFixed?'var(--red)':'var(--bd2)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {asFixed&&<span style={{color:'#fff',fontSize:9,fontWeight:700}}>✓</span>}
                  </div>
                  <div>
                    <div style={{fontSize:12,color:asFixed?'var(--red)':'var(--tx2)',fontWeight:asFixed?600:400}}>📌 Mark as permanent</div>
                    <div style={{fontSize:10,color:'var(--tx3)'}}>Seat permanently locked for this person</div>
                  </div>
                </div>
                {!asFixed&&(
                  <div>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--tx3)',marginBottom:6}}>Select dates</div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <button className="n-arr" onClick={()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1)}>‹</button>
                      <span style={{fontSize:11,fontWeight:600,color:'var(--ac2)'}}>{fmtMonthYear(yr,mo,'en')}</span>
                      <button className="n-arr" onClick={()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1)}>›</button>
                    </div>
                    <MiniCalendar year={yr} month={mo} lang={lang} selectedDates={selDates} onToggleDate={d=>setSelDates(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d])} occupiedDates={occupiedForSeat}/>
                    {selDates.length>0&&<div style={{fontSize:10,color:'var(--green)',marginTop:6}}>{selDates.length} date{selDates.length!==1?'s':''} selected</div>}
                  </div>
                )}
                <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                  <button className="b-cancel" onClick={()=>{setSelSeat(null);setSelUser('');setSelDates([]);}}>Cancel</button>
                  <button className="b-sub" onClick={confirmAssign} disabled={!selUser||(!asFixed&&selDates.length===0)}>
                    {asFixed?'📌 Assign permanently':'Assign ('+selDates.length+')'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{padding:16,background:'var(--sf2)',borderRadius:'var(--r2)',border:'1px solid var(--bd)',color:'var(--tx3)',fontSize:12,textAlign:'center'}}>
              ← Click a seat on the map or in the grid above to assign it
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { AdminHotDesk };
