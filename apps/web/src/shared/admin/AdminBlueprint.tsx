// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '@worksuite/ui';
import { supabase } from '../lib/api';
import { SupabaseBuildingRepo } from '../infra/SupabaseBuildingRepo';

const buildingRepo = new SupabaseBuildingRepo(supabase);

function AdminBlueprint() {
  const dialog = useDialog();
  const [buildings, setBuildings]   = useState([]);
  const [selBldg,   setSelBldg]     = useState(null);
  const [floors,    setFloors]      = useState([]);
  const [selFloor,  setSelFloor]    = useState(null);
  const [saving,    setSaving]      = useState(false);
  const [msg,       setMsg]         = useState('');
  const [showEdit,  setShowEdit]    = useState(false);
  const [bForm,     setBForm]       = useState({name:'',address:'',city:''});
  const [collapsed, setCollapsed]   = useState({}); // {[bId]: bool}
  const [editorKey, setEditorKey]   = useState(0);
  const dragFloorRef = useRef(null);

  useEffect(() => {
    buildingRepo.findAllBuildings()
      .then(data=>{ if(data) setBuildings(data); })
      .catch(e=>console.error('[AdminBlueprint] loadBuildings:',e));
  }, []);

  useEffect(() => {
    if(!selBldg){setFloors([]);setSelFloor(null);return;}
    buildingRepo.findBlueprints(selBldg.id)
      .then(data=>{ if(data){setFloors(data);if(!selFloor||!data.find(f=>f.id===selFloor.id))setSelFloor(data[0]||null);}})
      .catch(e=>console.error('[AdminBlueprint] loadFloors:',e));
  }, [selBldg?.id]);

  const saveBuilding = async () => {
    if(!bForm.name.trim()) return;
    setSaving(true);
    try{
      const data=await buildingRepo.createBuilding(bForm.name.trim(),bForm.address.trim()||null,bForm.city.trim()||null);
      setBuildings(b=>[...b,data]);setSelBldg(data);setBForm({name:'',address:'',city:''});setShowEdit(false);setMsg('Building created');setTimeout(()=>setMsg(''),3000);
    }catch(e){console.error(e);}
    setSaving(false);
  };

  const addFloor = async () => {
    if(!selBldg) return;
    const name=await dialog.prompt('Floor name:',{defaultValue:'Floor '+(floors.length+1)});
    if(!name) return;
    try{
      const data=await buildingRepo.createBlueprint(selBldg.id,name,floors.length);
      setFloors(f=>[...f,data]);setSelFloor(data);
    }catch(e){console.error(e);}
  };

  const deleteFloor = async (id) => {
    if(!(await dialog.confirm('Delete this floor and its layout?',{danger:true}))) return;
    await buildingRepo.deleteBlueprint(id);
    const next=floors.filter(f=>f.id!==id);
    setFloors(next);
    setSelFloor(selFloor?.id===id?(next[0]||null):selFloor);
  };

  const renameFloor = async (id) => {
    const fl=floors.find(f=>f.id===id);
    const nv=await dialog.prompt('Rename:',{defaultValue:fl?.floor_name||''});
    if(!nv||!nv.trim()) return;
    await buildingRepo.renameBlueprint(id,nv.trim());
    setFloors(f=>f.map(fl=>fl.id===id?{...fl,floor_name:nv.trim()}:fl));
  };

  const moveFloor = async (id, dir) => {
    const idx=floors.findIndex(f=>f.id===id);
    const newIdx=idx+dir;
    if(newIdx<0||newIdx>=floors.length) return;
    const next=[...floors];
    [next[idx],next[newIdx]]=[next[newIdx],next[idx]];
    setFloors(next);
    // persist new order
    await buildingRepo.reorderBlueprints(next.map((f,i)=>({id:f.id,floor_order:i})));
  };

  const saveLayout = async (layout) => {
    if(!selFloor) return;
    setSaving(true);
    try{
      await buildingRepo.saveLayout(selFloor.id,layout);
      setFloors(f=>f.map(fl=>fl.id===selFloor.id?{...fl,layout}:fl));
      setSelFloor(sf=>sf?.id===selFloor.id?{...sf,layout}:sf);
      setMsg('✓ Blueprint saved');setTimeout(()=>setMsg(''),3000);
    }catch(e){setMsg('Error: '+e.message);}
    setSaving(false);
  };

  const deleteBuilding = async (id) => {
    if(!(await dialog.confirm('Delete building and ALL its floors?',{danger:true}))) return;
    await buildingRepo.deleteBuilding(id);
    setBuildings(b=>b.filter(x=>x.id!==id));
    if(selBldg?.id===id){setSelBldg(null);setFloors([]);setSelFloor(null);}
  };

  const renameBuilding = async (b) => {
    const nv=await dialog.prompt('Building name:',{defaultValue:b.name});
    if(!nv||!nv.trim()) return;
    await buildingRepo.renameBuilding(b.id,nv.trim());
    setBuildings(bs=>bs.map(x=>x.id===b.id?{...x,name:nv.trim()}:x));
    if(selBldg?.id===b.id) setSelBldg(sb=>({...sb,name:nv.trim()}));
  };

  return (
    <div style={{display:'flex',gap:0,height:'100%',flex:1,minHeight:0}}>
      {/* Sidebar: buildings + collapsible floors */}
      <div style={{width:220,borderRight:'1px solid var(--bd)',display:'flex',flexDirection:'column',background:'var(--sf)',overflow:'hidden',flexShrink:0}}>
        <div style={{padding:'8px 10px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <span style={{fontSize: 'var(--fs-2xs)',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--tx3)'}}>Buildings</span>
          <button className="btn-g" onClick={()=>setShowEdit(s=>!s)} style={{fontSize: 'var(--fs-2xs)',padding:'2px 8px'}}>+ Add</button>
        </div>

        {showEdit && (
          <div style={{padding:'8px 10px',borderBottom:'1px solid var(--bd)',display:'flex',flexDirection:'column',gap:6,background:'var(--sf2)',flexShrink:0}}>
            <input className="a-inp" placeholder="Building name *" value={bForm.name} onChange={e=>setBForm(b=>({...b,name:e.target.value}))} style={{fontSize: 'var(--fs-2xs)',padding:'4px 7px'}}/>
            <input className="a-inp" placeholder="City (optional)" value={bForm.city} onChange={e=>setBForm(b=>({...b,city:e.target.value}))} style={{fontSize: 'var(--fs-2xs)',padding:'4px 7px'}}/>
            <input className="a-inp" placeholder="Address (optional)" value={bForm.address} onChange={e=>setBForm(b=>({...b,address:e.target.value}))} style={{fontSize: 'var(--fs-2xs)',padding:'4px 7px'}}/>
            <div style={{display:'flex',gap:5}}>
              <button className="b-cancel" style={{flex:1,padding:'4px',fontSize: 'var(--fs-2xs)'}} onClick={()=>setShowEdit(false)}>Cancel</button>
              <button className="b-sub" style={{flex:1,padding:'4px',fontSize: 'var(--fs-2xs)'}} onClick={saveBuilding} disabled={saving}>Save</button>
            </div>
          </div>
        )}

        <div style={{flex:1,overflowY:'auto'}}>
          {buildings.length===0 && <div style={{padding:'14px 10px',fontSize: 'var(--fs-2xs)',color:'var(--tx3)'}}>No buildings yet</div>}
          {buildings.map(b=>{
            const isSelB=selBldg?.id===b.id;
            const isCollapsed=collapsed[b.id];
            const bFloors=isSelB?floors:[];
            return (
              <div key={b.id} style={{borderBottom:'1px solid var(--bd)'}}>
                {/* Building row */}
                <div style={{display:'flex',alignItems:'center',gap:0,padding:'6px 8px',
                  background:isSelB?'var(--glow)':'transparent',
                  borderLeft:`2px solid ${isSelB?'var(--ac)':'transparent'}`}}>
                  <button onClick={()=>{
                    if(isSelB){setCollapsed(c=>({...c,[b.id]:!c[b.id]}));}
                    else{setSelBldg(b);setCollapsed(c=>({...c,[b.id]:false}));}
                  }} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)',fontSize: 'var(--fs-2xs)',padding:'0 4px 0 0',flexShrink:0}}>
                    {isCollapsed?'▶':'▼'}
                  </button>
                  <div style={{flex:1,fontWeight:600,fontSize: 'var(--fs-xs)',color:isSelB?'var(--ac2)':'var(--tx)',cursor:'pointer',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                    onClick={()=>{setSelBldg(b);setCollapsed(c=>({...c,[b.id]:false}));}}>
                    🏢 {b.name}
                  </div>
                  <button onClick={e=>{e.stopPropagation();renameBuilding(b);}} style={{background:'none',border:'none',cursor:'pointer',fontSize: 'var(--fs-2xs)',color:'var(--tx3)',padding:'1px 3px',opacity:.6}}>✎</button>
                  <button onClick={e=>{e.stopPropagation();deleteBuilding(b.id);}} style={{background:'none',border:'none',cursor:'pointer',fontSize: 'var(--fs-2xs)',color:'var(--tx3)',padding:'1px 3px',opacity:.6}}>×</button>
                </div>

                {/* Floors list (collapsed by default if not selected) */}
                {isSelB && !isCollapsed && (
                  <div style={{paddingLeft:8}}>
                    {bFloors.map((fl,idx)=>(
                      <div key={fl.id} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 8px',
                        background:selFloor?.id===fl.id?'rgba(79,110,247,.06)':'transparent',
                        borderLeft:`1px solid ${selFloor?.id===fl.id?'var(--ac)':'var(--bd)'}`,
                        cursor:'pointer'}}
                        onClick={()=>{setSelFloor(fl);setEditorKey(k=>k+1);}}>
                        <span style={{flex:1,fontSize: 'var(--fs-2xs)',color:selFloor?.id===fl.id?'var(--ac2)':'var(--tx2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {fl.floor_name}
                        </span>
                        <button onClick={e=>{e.stopPropagation();moveFloor(fl.id,-1);}} disabled={idx===0}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize: 'var(--fs-2xs)',color:'var(--tx3)',padding:'1px 2px',opacity:idx===0?.2:1}} title="Move up">↑</button>
                        <button onClick={e=>{e.stopPropagation();moveFloor(fl.id,1);}} disabled={idx===bFloors.length-1}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize: 'var(--fs-2xs)',color:'var(--tx3)',padding:'1px 2px',opacity:idx===bFloors.length-1?.2:1}} title="Move down">↓</button>
                        <button onClick={e=>{e.stopPropagation();renameFloor(fl.id);}}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize: 'var(--fs-2xs)',color:'var(--tx3)',padding:'1px 3px'}}>✎</button>
                        <button onClick={e=>{e.stopPropagation();deleteFloor(fl.id);}}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize: 'var(--fs-2xs)',color:'var(--tx3)',padding:'1px 3px'}}>×</button>
                      </div>
                    ))}
                    <button className="btn-g" onClick={addFloor} style={{fontSize: 'var(--fs-2xs)',padding:'3px 8px',margin:'4px 8px',width:'calc(100% - 16px)'}}>+ Add floor</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {msg&&<div style={{padding:'6px 10px',fontSize: 'var(--fs-2xs)',color:'var(--green)',borderTop:'1px solid var(--bd)',flexShrink:0}}>{msg}</div>}
      </div>

      {/* Right: editor */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {!selBldg||!selFloor ? (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize: 'var(--fs-xs)'}}>
            {buildings.length===0?'Create a building first':'Select a building and floor to edit its blueprint'}
          </div>
        ) : (
          <BlueprintEditorPanel key={editorKey+'-'+selFloor.id} floor={selFloor} onSave={saveLayout} saving={saving} msg={msg}/>
        )}
      </div>
    </div>
  );
}

function BlueprintEditorPanel({ floor, onSave, saving, msg }) {
  const [items, setItems] = useState(() => {
    try { return Array.isArray(floor.layout) ? floor.layout : []; } catch { return []; }
  });

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'6px 12px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:10,background:'var(--sf)',flexShrink:0}}>
        <span style={{fontWeight:600,fontSize: 'var(--fs-xs)',color:'var(--tx)'}}>{floor.floor_name}</span>
        <span style={{fontSize: 'var(--fs-2xs)',color:'var(--tx3)',marginLeft:'auto'}}>{items.filter(i=>i.type==='desk'||i.type==='circle').length} clusters</span>
        {msg&&<span style={{fontSize: 'var(--fs-2xs)',color:'var(--green)'}}>{msg}</span>}
        <button className="btn-p" style={{padding:'5px 14px',width:'auto'}} onClick={()=>onSave(items)} disabled={saving}>
          {saving?'Saving…':'💾 Save blueprint'}
        </button>
      </div>
      <BlueprintCanvas items={items} onChange={setItems}/>
    </div>
  );
}

function BuildingFloorSelectors({ selectedBuilding, selectedBlueprint, onChange }) {
  const [buildings, setBuildings] = useState([]);
  const [floors,    setFloors]    = useState([]);

  useEffect(() => {
    buildingRepo.findAllBuildings()
      .then(data=>{
        if(!data?.length) return;
        setBuildings(data);
        const lastBid = localStorage.getItem('ws_last_building');
        const b = data.find(x=>x.id===lastBid) || data[0];
        if(b && !selectedBuilding) onChange(b, null);
      })
      .catch(e=>console.error('[BuildingFloorSelectors] loadBuildings:',e));
  }, []);

  useEffect(() => {
    if(!selectedBuilding){setFloors([]);return;}
    buildingRepo.findBlueprints(selectedBuilding.id)
      .then(data=>{
        if(!data) return;
        setFloors(data);
        const lastFid = localStorage.getItem('ws_last_floor_'+selectedBuilding.id);
        const fl = data.find(x=>x.id===lastFid) || data[0];
        if(fl && (!selectedBlueprint || selectedBlueprint.id !== fl.id)) {
          onChange(selectedBuilding, fl);
        }
      })
      .catch(e=>console.error('[BuildingFloorSelectors] loadFloors:',e));
  }, [selectedBuilding?.id]);

  const selectBuilding = (bid) => {
    const b = buildings.find(x=>x.id===bid);
    if(!b) return;
    localStorage.setItem('ws_last_building', bid);
    setFloors([]);
    onChange(b, null);
  };

  const selectFloor = (fid) => {
    const fl = floors.find(x=>x.id===fid);
    if(!fl || !selectedBuilding) return;
    localStorage.setItem('ws_last_floor_'+selectedBuilding.id, fid);
    onChange(selectedBuilding, fl);
  };

  if(buildings.length===0) return (
    <span style={{fontSize: 'var(--fs-2xs)',color:'var(--tx3)',padding:'0 8px'}}>No buildings — configure in Admin → Blueprint</span>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <select
        value={selectedBuilding?.id||''}
        onChange={e=>selectBuilding(e.target.value)}
        style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:'var(--r)',
          padding:'6px 10px',fontSize: 'var(--fs-xs)',color:'var(--tx)',outline:'none',cursor:'pointer',fontFamily:'inherit',width:'100%'}}>
        <option value="">— Building —</option>
        {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <select
        value={selectedBlueprint?.id||''}
        onChange={e=>selectFloor(e.target.value)}
        disabled={!selectedBuilding||floors.length===0}
        style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:'var(--r)',
          padding:'4px 8px',fontSize: 'var(--fs-2xs)',color:'var(--tx)',outline:'none',cursor:'pointer',fontFamily:'inherit',
          opacity:(!selectedBuilding||floors.length===0)?0.5:1}}>
        <option value="">— Floor —</option>
        {floors.map(fl=><option key={fl.id} value={fl.id}>{fl.floor_name}</option>)}
      </select>
    </div>
  );
}

function BuildingSelector({ onSelect }) {
  return (
    <div style={{padding:32,textAlign:'center',color:'var(--tx3)'}}>
      <div style={{fontSize: 'var(--fs-xl)',marginBottom:12}}>🏢</div>
      <div style={{fontSize: 'var(--fs-xs)',marginBottom:6}}>No buildings configured yet</div>
      <div style={{fontSize: 'var(--fs-2xs)'}}>An admin needs to create a building and blueprint in Admin → Blueprint</div>
    </div>
  );
}

function BlueprintCanvas({ items: initItems, onChange }) {
  const canvasRef = useRef(null);
  const cwRef = useRef(null);
  const stateRef = useRef({
    items: initItems||[], sel:null, tool:'select', showGrid:true,
    cam:{cx:0,cy:0,s:1},
    drg:false,rsz:false,crt:false,pan:false,
    dragOff:{x:0,y:0},rHandle:null,origItem:null,
    dragS:null,crtS:null,crtE:null,panLast:null,clickOrig:null,
    clN:1,rN:1,zN:1,hist:[],fwd:[],selBox:null,multiSel:[],multiDragOffsets:[],
  });
  const [tool, _setTool] = useState('select');
  const [,forceRender] = useState(0);
  const re = () => forceRender(n=>n+1);
  const [tbTip, setTbTip] = useState(null); // {text, x, y}

  const S = stateRef.current;
  const GRID=24,CELL=52,PAD=14,LH=18,WW=2400,WH=1800,HS=7;
  const snap=v=>Math.round(v/GRID)*GRID;

  function relabelClusters(){
    saveH();
    // Sort clusters top→bottom, left→right
    const clusters=S.items.filter(i=>i.type==='desk'||i.type==='circle');
    clusters.sort((a,b)=>{const rowA=Math.round(a.y/50),rowB=Math.round(b.y/50);return rowA!==rowB?rowA-rowB:a.x-b.x;});
    const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    clusters.forEach((cl,idx)=>{ cl.prefix=alpha[idx%26]||'A'; });
    onChange([...S.items]);draw();re();
  }

  function setTool(t){ S.tool=t; _setTool(t); if(t!=='select'){S.sel=null;re();} draw(); }

  useEffect(()=>{
    const cvs=canvasRef.current;const cw=cwRef.current;if(!cvs||!cw)return;
    function fitItems(){
      if(!S.items.length){S.cam={cx:0,cy:0,s:1};draw();return;}
      let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
      S.items.forEach(i=>{
        if(i.pts&&i.pts.length){i.pts.forEach(p=>{if(p.x<mnX)mnX=p.x;if(p.y<mnY)mnY=p.y;if(p.x>mxX)mxX=p.x;if(p.y>mxY)mxY=p.y;});}
        else{if(i.x<mnX)mnX=i.x;if(i.y<mnY)mnY=i.y;if(i.x+i.w>mxX)mxX=i.x+i.w;if(i.y+i.h>mxY)mxY=i.y+i.h;}
      });
      const W=cvs.width,H=cvs.height,P=60;
      const bW=mxX-mnX,bH=mxY-mnY;
      if(bW<=0||bH<=0)return;
      const s=Math.min((W-P*2)/bW,(H-P*2)/bH,2);
      S.cam={cx:(W-bW*s)/2-mnX*s,cy:(H-bH*s)/2-mnY*s,s};
      draw();
    }
    let _fitted=false;
    function resize(){
      cvs.width=cw.clientWidth;cvs.height=Math.max(cw.clientHeight,300);
      if(!_fitted){_fitted=true;fitItems();}else{draw();}
    }
    const ro=new ResizeObserver(resize);ro.observe(cw);
    resize();
    function wheelH(e){
      e.preventDefault();
      const r=cvs.getBoundingClientRect();
      const sx=e.clientX-r.left,sy=e.clientY-r.top;
      const ns=Math.max(0.15,Math.min(4,S.cam.s+(e.deltaY<0?0.1:-0.1)));
      const ratio=ns/S.cam.s;
      S.cam.cx=sx-(sx-S.cam.cx)*ratio; S.cam.cy=sy-(sy-S.cam.cy)*ratio; S.cam.s=ns;
      draw();
    }
    // Spacebar → select tool; Ctrl+Z → undo; Ctrl+Shift+Z → redo
    function onKey(e){
      const inInput=document.activeElement?.tagName==='INPUT'||document.activeElement?.tagName==='TEXTAREA';
      if(e.key===' '&&!inInput){e.preventDefault();setTool('select');return;}
      if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='z'&&!inInput){e.preventDefault();doUndo();return;}
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='z'&&!inInput){e.preventDefault();doRedo();return;}
      if((e.ctrlKey||e.metaKey)&&e.key==='d'&&!inInput){e.preventDefault();doDuplicate();return;}
      if((e.key==='Delete'||e.key==='Backspace')&&!inInput){
        e.preventDefault();
        if(S.sel){saveH();S.items=S.items.filter(i=>i!==S.sel);S.sel=null;S.multiSel=[];onChange([...S.items]);draw();re();}
        else if(S.multiSel.length>0){saveH();S.items=S.items.filter(i=>!S.multiSel.includes(i));S.sel=null;S.multiSel=[];onChange([...S.items]);draw();re();}
        return;
      }
      if(e.key==='f'&&!inInput&&!e.ctrlKey&&!e.metaKey){e.preventDefault();
        if(!S.items.length){S.cam={cx:0,cy:0,s:1};draw();return;}
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        S.items.forEach(i=>{if(i.x<minX)minX=i.x;if(i.y<minY)minY=i.y;if(i.x+i.w>maxX)maxX=i.x+i.w;if(i.y+i.h>maxY)maxY=i.y+i.h;});
        const cvs=canvasRef.current;if(!cvs)return;
        const W=cvs.width,H=cvs.height,PAD2=40;
        const s2=Math.min((W-PAD2*2)/(maxX-minX),(H-PAD2*2)/(maxY-minY),2);
        S.cam={cx:(W-(maxX-minX)*s2)/2-minX*s2,cy:(H-(maxY-minY)*s2)/2-minY*s2,s:s2};draw();return;
      }
      if(e.key==='f'&&!inInput&&!e.ctrlKey){
        e.preventDefault();
        if(!S.items.length){S.cam={cx:0,cy:0,s:1};draw();return;}
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        S.items.forEach(i=>{if(i.x<minX)minX=i.x;if(i.y<minY)minY=i.y;if(i.x+i.w>maxX)maxX=i.x+i.w;if(i.y+i.h>maxY)maxY=i.y+i.h;});
        const cvs=canvasRef.current;if(!cvs)return;
        const W=cvs.width,H=cvs.height,PAD=40;
        const bW=maxX-minX,bH=maxY-minY;
        const s=Math.min((W-PAD*2)/bW,(H-PAD*2)/bH,2);
        S.cam={cx:(W-bW*s)/2-minX*s,cy:(H-bH*s)/2-minY*s,s};draw();
        return;
      }
    }
    cw.addEventListener('wheel',wheelH,{passive:false});
    window.addEventListener('keydown',onKey);
    return()=>{ro.disconnect();cw.removeEventListener('wheel',wheelH);window.removeEventListener('keydown',onKey);};
  },[]);

  function draw(){
    const cvs=canvasRef.current;if(!cvs)return;
    const ctx=cvs.getContext('2d');
    const W=cvs.width,H=cvs.height;
    ctx.clearRect(0,0,W,H);
    ctx.save();
    ctx.setTransform(S.cam.s,0,0,S.cam.s,S.cam.cx,S.cam.cy);
    // Grid
    if(S.showGrid){
      ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=.5/S.cam.s;
      const tl=s2w(0,0),br=s2w(W,H);
      for(let x=Math.floor(tl.x/GRID)*GRID;x<br.x+GRID;x+=GRID){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WH);ctx.stroke();}
      for(let y=Math.floor(tl.y/GRID)*GRID;y<br.y+GRID;y+=GRID){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WW,y);ctx.stroke();}
    }
    // Items
    ['zone','wall','door','window','room','elevator','stairs','bathroom','kitchen','table','plant','emergency_exit','electrical_panel','desk','circle'].forEach(type=>{S.items.filter(i=>i.type===type).forEach(i=>{ctx.save();drawItem(ctx,i,S.sel===i||(!S.sel&&(S.multiSel||[]).includes(i)));ctx.restore();});});
    if(S.selBox&&S.selBox.w>2&&S.selBox.h>2){ctx.fillStyle='rgba(59,130,246,.06)';ctx.strokeStyle='rgba(96,165,250,.7)';ctx.lineWidth=1/S.cam.s;ctx.setLineDash([4/S.cam.s,3/S.cam.s]);ctx.fillRect(S.selBox.x,S.selBox.y,S.selBox.w,S.selBox.h);ctx.strokeRect(S.selBox.x,S.selBox.y,S.selBox.w,S.selBox.h);ctx.setLineDash([]);}
    // Preview
    if(S.crt&&S.crtS&&S.crtE){
      const x=Math.min(S.crtS.x,S.crtE.x),y=Math.min(S.crtS.y,S.crtE.y);
      const w=Math.abs(S.crtE.x-S.crtS.x),h=Math.abs(S.crtE.y-S.crtS.y);
      const mn=S.tool==='wall'?GRID:GRID*2;
      if(S.tool==='wall'&&S._wallPts&&S._wallPts.length>1){ctx.save();ctx.globalAlpha=.5;ctx.strokeStyle='rgba(160,160,180,.8)';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(S._wallPts[0].x,S._wallPts[0].y);S._wallPts.slice(1).forEach(pt=>ctx.lineTo(pt.x,pt.y));ctx.stroke();ctx.restore();}
      else if(w>=mn||h>=mn){ctx.save();ctx.globalAlpha=.4;drawItem(ctx,{type:S.tool,x,y,w:Math.max(w,mn),h:Math.max(h,S.tool==='wall'?GRID:mn),label:'?',prefix:'A',shape:S.tool==='circle'?'circle':undefined,disabled:[],occupants:{}});ctx.restore();}
    }
    ctx.restore();
  }

  function s2w(sx,sy){return{x:(sx-S.cam.cx)/S.cam.s,y:(sy-S.cam.cy)/S.cam.s};}
  function evW(e){const r=canvasRef.current.getBoundingClientRect();return s2w(e.clientX-r.left,e.clientY-r.top);}
  function evWS(e){const p=evW(e);return{x:snap(p.x),y:snap(p.y)};}
  function hitI(i,wx,wy){return wx>=i.x&&wx<=i.x+i.w&&wy>=i.y&&wy<=i.y+i.h;}

  function hPts(i){const{x,y,w,h}=i,cx=x+w/2,cy=y+h/2;return{nw:{x,y},n:{x:cx,y},ne:{x:x+w,y},w:{x,y:cy},e:{x:x+w,y:cy},sw:{x,y:y+h},s:{x:cx,y:y+h},se:{x:x+w,y:y+h}};}
  function getHdl(i,wx,wy){const ht=HS/S.cam.s;for(const[k,{x,y}]of Object.entries(hPts(i))){if(Math.abs(wx-x)<=ht&&Math.abs(wy-y)<=ht)return k;}return null;}

  function rr(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

  function getSeats(item){
    if(item.shape==='circle'){
      const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
      const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
      const p=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
      return Array.from({length:n},(_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return{id:p+(i+1),x:cx+R*Math.cos(a)-CELL/2+2,y:cy+R*Math.sin(a)-CELL/2+2,w:CELL-4,h:CELL-4};});
    }
    const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
    const tW=cols*CELL,tH=rows*CELL,sx=x+PAD+(w-PAD*2-tW)/2,sy=y+LH+PAD+(h-LH-PAD*2-tH)/2;
    const p=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
    let n=1;return Array.from({length:cols*rows},(_,i)=>{const r=Math.floor(i/cols),c=i%cols;const s={id:p+n,x:sx+c*CELL+2,y:sy+r*CELL+2,w:CELL-4,h:CELL-4};n++;return s;});
  }

  function drawSeat(ctx,s,dis){
    const{x,y,w,h,id}=s;
    const fc=dis?'rgba(25,12,12,.55)':'rgba(5,35,12,.65)';
    const sc=dis?'rgba(90,50,50,.4)':'#22c55e';
    const tc=dis?'rgba(120,80,80,.5)':'#86efac';
    ctx.fillStyle=fc;ctx.strokeStyle=sc;ctx.lineWidth=dis?.5:1;
    rr(ctx,x,y,w,h,5);ctx.fill();ctx.stroke();
    ctx.fillStyle=tc;ctx.font='bold 9px var(--font-mono,monospace)';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(id,x+w/2,y+h/2);
    if(dis){ctx.strokeStyle='rgba(100,50,50,.4)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x+5,y+5);ctx.lineTo(x+w-5,y+h-5);ctx.moveTo(x+w-5,y+5);ctx.lineTo(x+5,y+h-5);ctx.stroke();}
  }

  function drawItem(ctx,i,isSel){
    const{x,y,w,h}=i,dis=i.disabled||[];
    if(i.type==='desk'||i.type==='circle'){
      ctx.fillStyle='rgba(3,15,6,.5)';ctx.strokeStyle='rgba(34,197,94,.3)';ctx.lineWidth=1;ctx.setLineDash([5,4]);
      if(i.shape==='circle'){const cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2;ctx.beginPath();ctx.arc(cx,cy,R,0,2*Math.PI);ctx.fill();ctx.stroke();}
      else{rr(ctx,x,y,w,h,7);ctx.fill();ctx.stroke();}
      ctx.setLineDash([]);
      // Cluster zone name: small, close to seats (just above first row)
      const clSeats=getSeats(i);
      if(clSeats.length>0){
        const firstY=Math.min(...clSeats.map(s=>s.y));
        ctx.fillStyle='rgba(134,239,172,.55)';ctx.font='600 9px var(--font-sans,sans-serif)';
        ctx.textAlign='center';ctx.textBaseline='bottom';
        ctx.fillText((i.label||'').toUpperCase(),x+w/2,firstY-2);
      }
      clSeats.forEach(s=>drawSeat(ctx,s,dis.includes(s.id)));
    }else if(i.type==='room'){
      ctx.fillStyle='rgba(10,20,50,.55)';ctx.strokeStyle='#3b82f6';ctx.lineWidth=1;ctx.setLineDash([]);
      rr(ctx,x,y,w,h,6);ctx.fill();ctx.stroke();
      // Label: centered in room, 2x bigger (18px)
      ctx.fillStyle='#93c5fd';ctx.font='600 20px var(--font-sans,sans-serif)';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i.label||'Room',x+w/2,y+h*0.22);
    }else if(i.type==='zone'){
      ctx.fillStyle='rgba(30,20,60,.2)';ctx.strokeStyle='#818cf8';ctx.lineWidth=.8;ctx.setLineDash([6,4]);
      rr(ctx,x,y,w,h,5);ctx.fill();ctx.stroke();ctx.setLineDash([]);
      // Label: centered in zone, 2x bigger (18px)
      ctx.fillStyle='rgba(165,180,252,.75)';ctx.font='700 20px var(--font-sans,sans-serif)';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText((i.label||'Zone').toUpperCase(),x+w/2,y+h*0.22);
    }else if(i.type==='wall'){
      // Polyline wall: i.pts = [{x,y},...] or fallback to rect
      ctx.strokeStyle='rgba(160,160,180,.8)';ctx.lineWidth=3;ctx.setLineDash([]);ctx.lineCap='round';ctx.lineJoin='round';
      if(i.pts&&i.pts.length>1){
        ctx.beginPath();ctx.moveTo(i.pts[0].x,i.pts[0].y);
        for(let k=1;k<i.pts.length;k++)ctx.lineTo(i.pts[k].x,i.pts[k].y);
        ctx.stroke();
        if(isSel){i.pts.forEach(pt=>{ctx.fillStyle='#60a5fa';ctx.beginPath();ctx.arc(pt.x,pt.y,4/S.cam.s,0,2*Math.PI);ctx.fill();});}
      }else{ctx.fillStyle='rgba(60,60,70,.5)';rr(ctx,x,y,w,h,2);ctx.fill();ctx.stroke();}
      ctx.lineCap='butt';ctx.lineJoin='miter';
    }else if(i.type==='door'){
      // Architectural door: pivot line + 90° sweep arc
      const ang=i.angle||0,sw=i.w||GRID*2;
      ctx.save();ctx.translate(x,y);ctx.rotate(ang*Math.PI/180);
      ctx.strokeStyle='#fb923c';ctx.lineWidth=1.5;ctx.setLineDash([]);
      ctx.lineCap='round';
      // Wall gap line
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(sw,0);ctx.stroke();
      // Door leaf: solid line from hinge to open edge
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-sw);ctx.stroke();
      // Sweep arc: quarter circle from closed→open (90°)
      ctx.lineWidth=0.8;ctx.setLineDash([3/S.cam.s,3/S.cam.s]);
      ctx.beginPath();ctx.arc(0,0,sw,0,-Math.PI/2,true);ctx.stroke();
      if(i.double){
        ctx.setLineDash([]);ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(sw,0);ctx.lineTo(sw,-sw);ctx.stroke();
        ctx.lineWidth=0.8;ctx.setLineDash([3/S.cam.s,3/S.cam.s]);
        ctx.beginPath();ctx.arc(sw,0,sw,Math.PI,-Math.PI/2,false);ctx.stroke();
      }
      ctx.setLineDash([]);ctx.lineCap='butt';
      if(isSel){ctx.strokeStyle='#60a5fa';ctx.lineWidth=1/S.cam.s;ctx.setLineDash([4/S.cam.s,3/S.cam.s]);ctx.strokeRect(-4/S.cam.s,-sw-4/S.cam.s,(i.double?sw*2:sw)+8/S.cam.s,sw+8/S.cam.s);ctx.setLineDash([]);}
      ctx.restore();
    }else if(i.type==='window'){
      // Architectural window symbol: two parallel lines with tick marks
      const ang=i.angle||0,sw=i.w||GRID*2,th=6;
      ctx.save();ctx.translate(x,y);ctx.rotate(ang*Math.PI/180);
      ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.5;ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(0,-th/2);ctx.lineTo(sw,-th/2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,th/2);ctx.lineTo(sw,th/2);ctx.stroke();
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(0,-th/2);ctx.lineTo(0,th/2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sw,-th/2);ctx.lineTo(sw,th/2);ctx.stroke();
      if(i.double){const m=sw/2;ctx.beginPath();ctx.moveTo(m,-th/2);ctx.lineTo(m,th/2);ctx.stroke();}
      ctx.restore();
    }else if(i.type==='door'){
      // Door: gap in wall + arc showing swing
      const thick=h||GRID,cx2=x+w/2,cy2=y+thick/2;
      ctx.fillStyle='rgba(30,15,5,.5)';ctx.strokeStyle='#fb923c';ctx.lineWidth=1.2;ctx.setLineDash([]);
      ctx.fillRect(x,y,w,thick);ctx.strokeRect(x,y,w,thick);
      // Door arc
      ctx.strokeStyle='rgba(251,146,60,.5)';ctx.lineWidth=.8;
      ctx.beginPath();
      if(i.double){
        ctx.arc(x,y+thick/2,w/2,0,-Math.PI/2,true);ctx.moveTo(x+w,y+thick/2);ctx.arc(x+w,y+thick/2,w/2,Math.PI,-Math.PI/2,false);
      } else {
        ctx.arc(x,y+thick/2,w,-Math.PI/2,0);
      }
      ctx.stroke();
      ctx.fillStyle='#fb923c';ctx.font='500 8px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i.double?'DD':'D',cx2,y-6);
    }else if(i.type==='window'){
      // Window: 3 horizontal lines (glazing bars)
      const thick=h||GRID;
      ctx.fillStyle='rgba(10,30,50,.4)';ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.2;ctx.setLineDash([]);
      ctx.fillRect(x,y,w,thick);ctx.strokeRect(x,y,w,thick);
      // Glazing lines
      ctx.strokeStyle='rgba(56,189,248,.4)';ctx.lineWidth=.7;
      if(i.double){
        [.33,.5,.67].forEach(t=>{ctx.beginPath();ctx.moveTo(x+w*t,y);ctx.lineTo(x+w*t,y+thick);ctx.stroke();});
      } else {
        ctx.beginPath();ctx.moveTo(x+w/2,y);ctx.lineTo(x+w/2,y+thick);ctx.stroke();
      }
      ctx.strokeStyle='#38bdf8';ctx.lineWidth=.7;
      ctx.beginPath();ctx.moveTo(x,y+thick/2);ctx.lineTo(x+w,y+thick/2);ctx.stroke();
      ctx.fillStyle='#38bdf8';ctx.font='500 8px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i.double?'WW':'W',x+w/2,y-6);
    }else if(i.type==='elevator'){
      // Elevator shaft: dark grey rectangle with up/down arrows
      ctx.fillStyle='rgba(40,40,45,.6)';ctx.strokeStyle='#666';ctx.lineWidth=1.5;ctx.setLineDash([]);
      rr(ctx,x,y,w,h,4);ctx.fill();ctx.stroke();
      // Cross lines (shaft pattern)
      ctx.strokeStyle='rgba(100,100,110,.3)';ctx.lineWidth=.6;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+w,y);ctx.lineTo(x,y+h);ctx.stroke();
      // Arrows icon
      ctx.fillStyle='#999';ctx.font='bold 14px sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('▲▼',x+w/2,y+h/2);
      // Label
      ctx.fillStyle='#888';ctx.font='500 8px sans-serif';
      ctx.textBaseline='bottom';ctx.fillText(i.label||'Elevator',x+w/2,y-3);
    }else if(i.type==='stairs'){
      // Staircase: rectangle with diagonal stair lines
      ctx.fillStyle='rgba(50,50,55,.5)';ctx.strokeStyle='#888';ctx.lineWidth=1.2;ctx.setLineDash([]);
      rr(ctx,x,y,w,h,3);ctx.fill();ctx.stroke();
      // Stair steps: horizontal lines with offsets to create step pattern
      ctx.strokeStyle='rgba(140,140,150,.5)';ctx.lineWidth=.8;
      const steps=Math.max(3,Math.floor(h/8));
      for(let s=1;s<steps;s++){
        const sy=y+s*(h/steps);
        const sx=x+(s/steps)*w*0.4;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(x+w,sy);ctx.stroke();
      }
      // Diagonal direction line
      ctx.strokeStyle='rgba(180,180,190,.4)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x+4,y+h-4);ctx.lineTo(x+w-4,y+4);ctx.stroke();
      // Arrow tip
      ctx.beginPath();ctx.moveTo(x+w-4,y+4);ctx.lineTo(x+w-10,y+8);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+w-4,y+4);ctx.lineTo(x+w-8,y+12);ctx.stroke();
      // Label
      ctx.fillStyle='#999';ctx.font='500 8px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(i.label||'Stairs',x+w/2,y-3);
    }else if(i.type==='bathroom'){
      // Bathroom: rectangle with "WC" label
      ctx.fillStyle='rgba(30,45,55,.5)';ctx.strokeStyle='#6b8fa3';ctx.lineWidth=1.2;ctx.setLineDash([]);
      rr(ctx,x,y,w,h,4);ctx.fill();ctx.stroke();
      // WC text
      ctx.fillStyle='#8ab4c7';ctx.font='bold 16px sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('WC',x+w/2,y+h/2);
      // Label
      ctx.fillStyle='#7a9aaa';ctx.font='500 8px sans-serif';
      ctx.textBaseline='bottom';ctx.fillText(i.label||'',x+w/2,y-3);
    }else if(i.type==='kitchen'){
      // Kitchen: rectangle with cup icon
      ctx.fillStyle='rgba(45,35,25,.5)';ctx.strokeStyle='#a3856b';ctx.lineWidth=1.2;ctx.setLineDash([]);
      rr(ctx,x,y,w,h,4);ctx.fill();ctx.stroke();
      // Cup icon (simple outline)
      const cx2=x+w/2,cy2=y+h/2;
      ctx.strokeStyle='#c4a882';ctx.lineWidth=1.2;
      // Cup body
      ctx.beginPath();ctx.moveTo(cx2-7,cy2-6);ctx.lineTo(cx2-7,cy2+6);ctx.lineTo(cx2+5,cy2+6);ctx.lineTo(cx2+5,cy2-6);ctx.stroke();
      // Handle
      ctx.beginPath();ctx.arc(cx2+5,cy2,4,-(Math.PI/2),(Math.PI/2),false);ctx.stroke();
      // Steam lines
      ctx.strokeStyle='rgba(196,168,130,.4)';ctx.lineWidth=.7;
      [-4,0,4].forEach(dx=>{ctx.beginPath();ctx.moveTo(cx2+dx-1,cy2-8);ctx.quadraticCurveTo(cx2+dx+1,cy2-11,cx2+dx-1,cy2-14);ctx.stroke();});
      // Label
      ctx.fillStyle='#b89a7a';ctx.font='500 8px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(i.label||'Kitchen',x+w/2,y-3);
    }else if(i.type==='table'){
      // Conference table: medium grey rectangle, no seats
      ctx.fillStyle='rgba(45,45,50,.55)';ctx.strokeStyle='#7a7a8a';ctx.lineWidth=1.2;ctx.setLineDash([]);
      rr(ctx,x,y,w,h,5);ctx.fill();ctx.stroke();
      // Inner edge detail
      ctx.strokeStyle='rgba(130,130,140,.2)';ctx.lineWidth=.5;
      rr(ctx,x+4,y+4,w-8,h-8,3);ctx.stroke();
      // Label
      ctx.fillStyle='#9a9aaa';ctx.font='600 10px sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i.label||'Table',x+w/2,y+h/2);
    }else if(i.type==='plant'){
      // Decorative plant: small green circle with leaf
      ctx.fillStyle='rgba(10,50,20,.5)';ctx.strokeStyle='#4ade80';ctx.lineWidth=1;ctx.setLineDash([]);
      const cx2=x+w/2,cy2=y+h/2,R=Math.min(w,h)/2;
      ctx.beginPath();ctx.arc(cx2,cy2,R,0,2*Math.PI);ctx.fill();ctx.stroke();
      // Leaf shapes
      ctx.fillStyle='rgba(74,222,128,.35)';
      // Left leaf
      ctx.beginPath();ctx.ellipse(cx2-3,cy2-2,R*0.5,R*0.25,-(Math.PI/4),0,2*Math.PI);ctx.fill();
      // Right leaf
      ctx.beginPath();ctx.ellipse(cx2+3,cy2-2,R*0.5,R*0.25,(Math.PI/4),0,2*Math.PI);ctx.fill();
      // Center dot
      ctx.fillStyle='#22c55e';ctx.beginPath();ctx.arc(cx2,cy2+1,2,0,2*Math.PI);ctx.fill();
    }else if(i.type==='emergency_exit'){
      // Emergency exit: green bordered rectangle with EXIT + running figure
      ctx.fillStyle='rgba(5,40,15,.5)';ctx.strokeStyle='#22c55e';ctx.lineWidth=2;ctx.setLineDash([]);
      rr(ctx,x,y,w,h,4);ctx.fill();ctx.stroke();
      // EXIT text
      ctx.fillStyle='#4ade80';ctx.font='bold 11px sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('EXIT',x+w/2,y+h*0.35);
      // Running person (simple stick figure)
      const px2=x+w/2,py2=y+h*0.65;
      ctx.strokeStyle='#4ade80';ctx.lineWidth=1.2;ctx.lineCap='round';
      // Head
      ctx.beginPath();ctx.arc(px2-3,py2-6,2.5,0,2*Math.PI);ctx.stroke();
      // Body
      ctx.beginPath();ctx.moveTo(px2-3,py2-3.5);ctx.lineTo(px2-1,py2+1);ctx.stroke();
      // Legs
      ctx.beginPath();ctx.moveTo(px2-1,py2+1);ctx.lineTo(px2-5,py2+6);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2-1,py2+1);ctx.lineTo(px2+4,py2+5);ctx.stroke();
      // Arms
      ctx.beginPath();ctx.moveTo(px2-6,py2-1);ctx.lineTo(px2-2,py2-2);ctx.lineTo(px2+3,py2-4);ctx.stroke();
      // Arrow
      ctx.beginPath();ctx.moveTo(px2+5,py2-2);ctx.lineTo(px2+10,py2-2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2+10,py2-2);ctx.lineTo(px2+7,py2-5);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px2+10,py2-2);ctx.lineTo(px2+7,py2+1);ctx.stroke();
      ctx.lineCap='butt';
      // Label
      ctx.fillStyle='#4ade80';ctx.font='500 7px sans-serif';ctx.textBaseline='bottom';
      ctx.fillText(i.label||'',x+w/2,y-3);
    }else if(i.type==='electrical_panel'){
      // Electrical panel: small square with lightning bolt and yellow border
      ctx.fillStyle='rgba(50,45,15,.5)';ctx.strokeStyle='#eab308';ctx.lineWidth=1.5;ctx.setLineDash([]);
      rr(ctx,x,y,w,h,3);ctx.fill();ctx.stroke();
      // Lightning bolt
      const cx2=x+w/2,cy2=y+h/2;
      ctx.fillStyle='#facc15';ctx.beginPath();
      ctx.moveTo(cx2-1,cy2-8);ctx.lineTo(cx2-5,cy2+1);ctx.lineTo(cx2-1,cy2);
      ctx.lineTo(cx2+1,cy2+8);ctx.lineTo(cx2+5,cy2-1);ctx.lineTo(cx2+1,cy2);
      ctx.closePath();ctx.fill();
      // Label
      ctx.fillStyle='#ca9a08';ctx.font='500 7px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(i.label||'Panel',x+w/2,y-3);
    }
    if(isSel){
      const hs=HS/S.cam.s;
      ctx.strokeStyle='#60a5fa';ctx.lineWidth=1.5/S.cam.s;ctx.setLineDash([4/S.cam.s,3/S.cam.s]);
      ctx.strokeRect(x-2/S.cam.s,y-2/S.cam.s,w+4/S.cam.s,h+4/S.cam.s);ctx.setLineDash([]);
      Object.values(hPts(i)).forEach(({x:hx,y:hy})=>{ctx.fillStyle='#0c1018';ctx.strokeStyle='#60a5fa';ctx.lineWidth=1.2/S.cam.s;ctx.fillRect(hx-hs,hy-hs,hs*2,hs*2);ctx.strokeRect(hx-hs,hy-hs,hs*2,hs*2);});
    }
  }

  function saveH(){S.hist.push(JSON.parse(JSON.stringify(S.items)));S.fwd=[];}

  function handleMD(e){
    if(e.button===1){e.preventDefault();S.pan=true;S.panLast={x:e.clientX,y:e.clientY};return;}
    const p=evW(e),ps=evWS(e);S.clickOrig={...p};
    if(S.tool==='eraser'){saveH();const idx=S.items.findLastIndex(i=>hitI(i,p.x,p.y));if(idx>=0){if(S.sel===S.items[idx])S.sel=null;S.items.splice(idx,1);onChange([...S.items]);draw();re();return;}return;}
    if(S.tool==='select'){
      if(S.sel){
        // Wall point editing: click on a point handle to drag it
        if(S.sel.type==='wall'&&S.sel.pts){
          const hs2=8/S.cam.s;
          for(let k=0;k<S.sel.pts.length;k++){
            const pt=S.sel.pts[k];
            if(Math.abs(p.x-pt.x)<hs2&&Math.abs(p.y-pt.y)<hs2){
              S._wallPtIdx=k;S._wallPtDrag=true;S.dragS=p;draw();re();return;
            }
          }
        }
        const h=getHdl(S.sel,p.x,p.y);if(h){S.rsz=true;S.rHandle=h;S.origItem={...S.sel};S.dragS=p;return;}
      }
      for(let i=S.items.length-1;i>=0;i--){
        if(hitI(S.items[i],p.x,p.y)){
          const hit=S.items[i];
          if(S.multiSel.length>1&&S.multiSel.includes(hit)){
            // Multi-drag: record offsets for all selected items
            saveH();S.sel=hit;S.drg=true;S.dragS=p;
            S.multiDragOffsets=S.multiSel.map(it=>({item:it,dx:p.x-it.x,dy:p.y-it.y,origX:it.x,origY:it.y}));
          } else {
            S.sel=hit;S.multiSel=[hit];S.drg=true;S.dragOff={x:p.x-hit.x,y:p.y-hit.y};S.origItem={...hit};S.dragS=p;S.multiDragOffsets=[];
          }
          draw();re();return;
        }
      }
      S.sel=null;S.multiSel=[];S.selBox={sx:p.x,sy:p.y,x:p.x,y:p.y,w:0,h:0};draw();re();return;
    }
    if(S.tool==='wall'){
      // Wall pencil: start new point list
      S.crt=true;S._wallPts=[{x:snap(p.x),y:snap(p.y)}];S.crtS=ps;S.crtE=ps;
      return;
    }
    S.crt=true;S.crtS=ps;S.crtE=ps;
  }

  function handleMM(e){
    if(S.pan&&S.panLast){S.cam.cx+=e.clientX-S.panLast.x;S.cam.cy+=e.clientY-S.panLast.y;S.panLast={x:e.clientX,y:e.clientY};draw();return;}
    const p=evW(e),ps=evWS(e);
    if(S.rsz&&S.sel&&S.origItem){
      const dx=ps.x-S.dragS.x,dy=ps.y-S.dragS.y,o=S.origItem,h2=S.rHandle;
      const mn=S.sel.type==='wall'?GRID:GRID*2;let{x,y,w,h}=o;
      if(h2.includes('e'))w=Math.max(mn,snap(o.w+dx));if(h2.includes('s'))h=Math.max(mn,snap(o.h+dy));
      if(h2.includes('w')){const nw=Math.max(mn,snap(o.w-dx));x=snap(o.x+o.w-nw);w=nw;}if(h2.includes('n')){const nh=Math.max(mn,snap(o.h-dy));y=snap(o.y+o.h-nh);h=nh;}
      S.sel.x=x;S.sel.y=y;S.sel.w=w;S.sel.h=h;draw();re();return;
    }
    if(S.selBox){S.selBox.x=Math.min(S.selBox.sx,p.x);S.selBox.y=Math.min(S.selBox.sy,p.y);S.selBox.w=Math.abs(p.x-S.selBox.sx);S.selBox.h=Math.abs(p.y-S.selBox.sy);S.multiSel=S.items.filter(i=>i.x<S.selBox.x+S.selBox.w&&i.x+i.w>S.selBox.x&&i.y<S.selBox.y+S.selBox.h&&i.y+i.h>S.selBox.y);draw();return;}
    if(S._wallPtDrag&&S.sel&&S.sel.pts){S.sel.pts[S._wallPtIdx]={x:snap(p.x),y:snap(p.y)};S.sel.x=S.sel.pts[0].x;S.sel.y=S.sel.pts[0].y;draw();re();return;}
    if(S.drg&&S.sel){
      if(S.multiDragOffsets&&S.multiDragOffsets.length>1){
        // Move all selected items together
        S.multiDragOffsets.forEach(({item,dx,dy})=>{item.x=snap(p.x-dx);item.y=snap(p.y-dy);}); // move all together
      } else {
        S.sel.x=snap(p.x-S.dragOff.x);S.sel.y=snap(p.y-S.dragOff.y);
      }
      draw();re();return;
    }
    if(S.crt){
      S.crtE=ps;
      if(S.tool==='wall'&&S._wallPts){
        const last=S._wallPts[S._wallPts.length-1];
        const nx=snap(p.x),ny=snap(p.y);
        // Only add if moved at least one grid cell
        if(Math.abs(nx-last.x)>=GRID/2||Math.abs(ny-last.y)>=GRID/2)S._wallPts.push({x:nx,y:ny});
      }
      draw();
    }
  }

  function handleMU(e){
    if(S.pan){S.pan=false;S.panLast=null;return;}
    if(S.rsz){S.rsz=false;S.rHandle=null;S.origItem=null;S.dragS=null;onChange([...S.items]);return;}
    if(S._wallPtDrag){S._wallPtDrag=false;S._wallPtIdx=null;onChange([...S.items]);draw();re();return;}
    if(S.drg){
      const p=evW(e);const moved=Math.abs(p.x-(S.clickOrig?.x||0))>4/S.cam.s||Math.abs(p.y-(S.clickOrig?.y||0))>4/S.cam.s;
      if(!moved&&S.sel&&(S.sel.type==='desk'||S.sel.type==='circle')){
        const sh=getSeats(S.sel).find(s=>p.x>=s.x&&p.x<=s.x+s.w&&p.y>=s.y&&p.y<=s.y+s.h);
        if(sh){saveH();if(!S.sel.disabled)S.sel.disabled=[];S.sel.disabled.includes(sh.id)?S.sel.disabled=S.sel.disabled.filter(d=>d!==sh.id):S.sel.disabled.push(sh.id);onChange([...S.items]);draw();S.drg=false;S.origItem=null;S.dragS=null;re();return;}
      }
      S.drg=false;S.origItem=null;S.dragS=null;S.multiDragOffsets=[];onChange([...S.items]);return;
    }
    if(S.selBox){const sel=S.items.filter(i=>i.x<S.selBox.x+S.selBox.w&&i.x+i.w>S.selBox.x&&i.y<S.selBox.y+S.selBox.h&&i.y+i.h>S.selBox.y);S.multiSel=sel;S.sel=sel.length===1?sel[0]:null;S.selBox=null;re();draw();return;}
    if(S.crt){
      S.crt=false;if(!S.crtS||!S.crtE)return;
      const x=Math.min(S.crtS.x,S.crtE.x),y=Math.min(S.crtS.y,S.crtE.y);
      const rw=Math.abs(S.crtE.x-S.crtS.x),rh=Math.abs(S.crtE.y-S.crtS.y);
      const isW=S.tool==='wall';const mn=isW?GRID:GRID*2;
      const w=Math.max(snap(rw),mn),h=Math.max(snap(rh),isW?GRID:mn);
      if(w<mn&&h<mn){S.crtS=null;S.crtE=null;draw();return;}
      saveH();let ni;
      if(S.tool==='desk'||S.tool==='circle'){const l=String.fromCharCode(64+S.clN);ni={type:S.tool,shape:S.tool==='circle'?'circle':undefined,x,y,w,h,label:'Zone '+l,prefix:l,id:Math.random().toString(36).slice(2),disabled:[],occupants:{}};S.clN++;}
      else if(S.tool==='room'){ni={type:'room',x,y,w,h,label:'Room '+S.rN++,id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='zone'){ni={type:'zone',x,y,w,h,label:'Zone '+S.zN++,id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='door'){ni={type:'door',x,y,w:Math.max(snap(rw),GRID*2),h:GRID,label:'',double:w>=GRID*3,id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='window'){ni={type:'window',x,y,w:Math.max(snap(rw),GRID*2),h:GRID,label:'',double:w>=GRID*3,id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='wall'){const pts=S._wallPts||[{x,y},{x:x+w,y:y}];S._wallPts=null;ni={type:'wall',x:pts[0].x,y:pts[0].y,w:Math.max(w,GRID),h:GRID,pts,label:'',id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='elevator'){ni={type:'elevator',x,y,w:Math.max(w,GRID*3),h:Math.max(h,GRID*3),label:'Elevator',id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='stairs'){ni={type:'stairs',x,y,w:Math.max(w,GRID*3),h:Math.max(h,GRID*4),label:'Stairs',id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='bathroom'){ni={type:'bathroom',x,y,w:Math.max(w,GRID*3),h:Math.max(h,GRID*3),label:'WC',id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='kitchen'){ni={type:'kitchen',x,y,w:Math.max(w,GRID*3),h:Math.max(h,GRID*3),label:'Kitchen',id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='table'){ni={type:'table',x,y,w,h,label:'Table',id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='plant'){ni={type:'plant',x,y,w:Math.max(w,GRID*2),h:Math.max(h,GRID*2),label:'',id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='emergency_exit'){ni={type:'emergency_exit',x,y,w:Math.max(w,GRID*3),h:Math.max(h,GRID*3),label:'',id:Math.random().toString(36).slice(2)};}
      else if(S.tool==='electrical_panel'){ni={type:'electrical_panel',x,y,w:Math.max(w,GRID*2),h:Math.max(h,GRID*2),label:'Panel',id:Math.random().toString(36).slice(2)};}
      if(ni){S.items.push(ni);S.sel=ni;}
      S.crtS=null;S.crtE=null;onChange([...S.items]);draw();re();
    }
  }

  const selItem = S.sel;
  const isCl = selItem&&(selItem.type==='desk'||selItem.type==='circle');
  const seats = isCl?getSeats(selItem):[];
  const dis = isCl?(selItem.disabled||[]):[];

  function pChange(key,val,num){
    if(!S.sel)return;saveH();
    let v=num?+val:val;
    const mn=S.sel.type==='wall'?GRID:GRID*2;
    if(num&&(key==='w'||key==='h'))v=Math.max(mn,snap(v));
    S.sel[key]=v;onChange([...S.items]);draw();re();
  }

  const TB_TOOLS=[
    {id:'select', lbl:'↖', tip:'Select / move / resize  [Space]', dot:null, sel:true},
    {id:'desk',   lbl:'Cluster',  tip:'Rectangular desk cluster',  dot:'#22c55e', circle:false},
    {id:'circle', lbl:'Round',    tip:'Circular / round table',    dot:'#22c55e', circle:true},
    {id:'room',   lbl:'Room',     tip:'Meeting room',              dot:'#3b82f6', circle:false},
    {id:'zone',   lbl:'Zone',     tip:'Zone / area label',         dot:'#818cf8', circle:false},
    {id:'wall',   lbl:'Wall',     tip:'Draw walls (click+drag along grid)',  dot:'#888', circle:false},
    {id:'door',    lbl:'Door',     tip:'Door (single/double)',      dot:'#fb923c', circle:false},
    {id:'window',  lbl:'Window',   tip:'Window (single/double)',    dot:'#38bdf8', circle:false},
    {id:'elevator',lbl:'Elevator', tip:'Elevator shaft',            dot:'#666',   circle:false},
    {id:'stairs',  lbl:'Stairs',   tip:'Staircase',                 dot:'#888',   circle:false},
    {id:'bathroom',lbl:'WC',       tip:'Bathroom / restroom',       dot:'#6b8fa3',circle:false},
    {id:'kitchen', lbl:'Kitchen',  tip:'Kitchen / break room',      dot:'#a3856b',circle:false},
    {id:'table',   lbl:'Table',    tip:'Conference / meeting table', dot:'#7a7a8a',circle:false},
    {id:'plant',   lbl:'Plant',    tip:'Decorative plant',          dot:'#4ade80',circle:true},
    {id:'emergency_exit',lbl:'Exit',tip:'Emergency exit',           dot:'#22c55e',circle:false},
    {id:'electrical_panel',lbl:'⚡ Panel',tip:'Electrical panel',   dot:'#eab308',circle:false},
    {id:'eraser', lbl:'✕',        tip:'Erase element',              dot:null, danger:true},
  ];

  function doUndo(){if(S.hist.length){S.fwd.push(JSON.parse(JSON.stringify(S.items)));S.items=S.hist.pop();S.sel=null;onChange([...S.items]);draw();re();}}
  function doRedo(){if(S.fwd.length){S.hist.push(JSON.parse(JSON.stringify(S.items)));S.items=S.fwd.pop();S.sel=null;onChange([...S.items]);draw();re();}}
  function doDuplicate(){
    if(!S.sel) return;
    saveH();
    const clone=JSON.parse(JSON.stringify(S.sel));
    clone.id=Math.random().toString(36).slice(2);
    clone.x+=24;clone.y+=24;
    S.items.push(clone);S.sel=clone;
    onChange([...S.items]);draw();re();
  }

  // Btn helper — React-state tooltip + click flash
  function abtn(tip,lbl,onClick,extra={}){
    return (
      <button
        className="tb-btn"
        onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setTbTip({text:tip,x:r.left+r.width/2,y:r.top-8});}}
        onMouseLeave={()=>setTbTip(null)}
        onClick={e=>{
          const b=e.currentTarget;b.classList.add('tb-flash');
          setTimeout(()=>b.classList.remove('tb-flash'),180);
          setTbTip(null);onClick();
        }}
        style={{display:'flex',alignItems:'center',justifyContent:'center',minWidth:32,height:30,padding:'0 8px',
          border:'1px solid var(--bd)',borderRadius:6,background:'var(--sf2)',color:'var(--tx2)',
          cursor:'pointer',fontSize: 'var(--fs-xs)',fontFamily:'inherit',gap:4,...extra}}>
        {lbl}
      </button>
    );
  }

  return (
    <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden',flexDirection:'column'}}>
      {/* Horizontal pill toolbar */}
      <div style={{display:'flex',gap:4,padding:'6px 10px',borderBottom:'1px solid var(--bd)',background:'var(--sf)',alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
        {TB_TOOLS.map(t=>{
          const isActive=tool===t.id;
          const border=isActive?(t.danger?'#ef4444':'#3b82f6'):'var(--bd)';
          const bg=isActive?(t.danger?'rgba(239,68,68,.12)':t.sel?'rgba(59,130,246,.2)':'rgba(59,130,246,.12)'):'var(--sf2)';
          const color=isActive?(t.danger?'#ef4444':'#7b93ff'):'var(--tx2)';
          return (
            <button key={t.id}
              onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setTbTip({text:t.tip,x:r.left+r.width/2,y:r.top-8});}}
              onMouseLeave={()=>setTbTip(null)}
              onClick={()=>{setTool(t.id);setTbTip(null);}}
              style={{position:'relative',display:'flex',alignItems:'center',gap:6,padding:'5px 12px',
                border:`1px solid ${border}`,borderRadius:20,background:bg,
                color,cursor:'pointer',fontSize: 'var(--fs-2xs)',fontFamily:'inherit',fontWeight:isActive?600:400,whiteSpace:'nowrap',transition:'all .12s'}}>
              {t.dot&&<span style={{width:8,height:8,borderRadius:t.circle?'50%':'2px',background:t.dot,flexShrink:0}}/>}
              {t.lbl}
            </button>
          );
        })}
        <div style={{width:1,height:20,background:'var(--bd)',margin:'0 2px'}}/>
        {abtn('Undo  [Ctrl+Z]','↩',doUndo)}
        {abtn('Redo  [Ctrl+Shift+Z]','↪',doRedo)}
        {abtn('Duplicate selected','⧉',doDuplicate)}
        {abtn('Relabel clusters A, B, C… (top→bottom, left→right)','A,B,C…',relabelClusters)}
        <div style={{width:1,height:20,background:'var(--bd)',margin:'0 2px'}}/>
        {abtn('Toggle grid','⊞',()=>{S.showGrid=!S.showGrid;draw();})}
        {abtn('Fit all to screen [F]',<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,()=>{
  if(!S.items.length){S.cam={cx:0,cy:0,s:1};draw();return;}
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  S.items.forEach(i=>{if(i.x<minX)minX=i.x;if(i.y<minY)minY=i.y;if(i.x+i.w>maxX)maxX=i.x+i.w;if(i.y+i.h>maxY)maxY=i.y+i.h;});
  const cvs=canvasRef.current;if(!cvs)return;
  const W=cvs.width,H=cvs.height,PAD=40;
  const bW=maxX-minX,bH=maxY-minY;
  const s=Math.min((W-PAD*2)/bW,(H-PAD*2)/bH,2);
  S.cam={cx:(W-bW*s)/2-minX*s,cy:(H-bH*s)/2-minY*s,s};draw();
})}
      </div>

      {/* Canvas + properties side by side */}
      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>
      {/* Canvas */}
      <div ref={cwRef} style={{flex:1,position:'relative',background:'#0c1018',overflow:'hidden',minHeight:0}}>
        <canvas ref={canvasRef}
          style={{display:'block',cursor:tool==='select'?'default':tool==='eraser'?'cell':tool==='wall'?'crosshair':'crosshair'}}
          onMouseDown={handleMD} onMouseMove={handleMM} onMouseUp={handleMU} onMouseLeave={handleMU}/>
      </div>

      {/* Properties panel */}
      <div style={{width:180,borderLeft:'1px solid var(--bd)',background:'var(--sf)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'6px 8px',fontSize: 'var(--fs-2xs)',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--tx3)',borderBottom:'1px solid var(--bd)'}}>Properties</div>
        <div style={{padding:'8px',flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:7}}>
          {!selItem && <div style={{fontSize: 'var(--fs-2xs)',color:'var(--tx3)',textAlign:'center',padding:'12px 0'}}>Select an element</div>}
          {selItem && <>
            {isCl && <>
              <div>
                <div style={{fontSize: 'var(--fs-2xs)',fontWeight:600,color:'var(--tx3)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:3}}>Zone name</div>
                <input className="a-inp" defaultValue={selItem.label||''} style={{fontSize: 'var(--fs-2xs)',padding:'3px 6px'}}
                  onChange={e=>pChange('label',e.target.value,false)}
                  onKeyDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}/>
              </div>
              <div>
                <div style={{fontSize: 'var(--fs-2xs)',fontWeight:600,color:'var(--tx3)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:3}}>Seat prefix</div>
                <input className="a-inp" defaultValue={selItem.prefix||''} maxLength={4} style={{fontSize: 'var(--fs-2xs)',padding:'3px 6px'}}
                  onChange={e=>pChange('prefix',e.target.value,false)}
                  onKeyDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}/>
              </div>
              <div style={{textAlign:'center',padding:'4px',background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.2)',borderRadius:4,fontSize: 'var(--fs-2xs)',color:'#22c55e',fontWeight:700,fontFamily:'var(--mono)'}}>
                {seats.length-dis.filter(d=>seats.some(s=>s.id===d)).length} active · {dis.length} off
              </div>
              <div>
                <div style={{fontSize: 'var(--fs-2xs)',fontWeight:600,color:'var(--tx3)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:4}}>Seats (click = disable)</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:2}}>
                  {seats.map(s=>(
                    <span key={s.id}
                      onClick={()=>{saveH();if(!selItem.disabled)selItem.disabled=[];selItem.disabled.includes(s.id)?selItem.disabled=selItem.disabled.filter(d=>d!==s.id):selItem.disabled.push(s.id);onChange([...S.items]);draw();re();}}
                      style={{padding:'1px 4px',borderRadius:2,fontSize: 'var(--fs-2xs)',fontFamily:'var(--mono)',cursor:'pointer',border:'1px solid',
                        background:dis.includes(s.id)?'rgba(80,30,30,.2)':'rgba(34,197,94,.1)',
                        borderColor:dis.includes(s.id)?'rgba(100,50,50,.3)':'rgba(34,197,94,.35)',
                        color:dis.includes(s.id)?'rgba(150,80,80,.6)':'#86efac',
                        textDecoration:dis.includes(s.id)?'line-through':'none'}}>
                      {s.id}
                    </span>
                  ))}
                </div>
              </div>
            </>}
            {!isCl && selItem.label!==undefined && (
              <div>
                <div style={{fontSize: 'var(--fs-2xs)',fontWeight:600,color:'var(--tx3)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:3}}>Label</div>
                <input className="a-inp" defaultValue={selItem.label||''} style={{fontSize: 'var(--fs-2xs)',padding:'3px 6px'}}
                  onChange={e=>pChange('label',e.target.value,false)}
                  onKeyDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}/>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
              {[['W','w'],['H','h'],['X','x'],['Y','y']].map(([l,k])=>(
                <div key={k}>
                  <div style={{fontSize: 'var(--fs-2xs)',color:'var(--tx3)',marginBottom:2}}>{l}</div>
                  <input className="a-inp" type="number" step={GRID} defaultValue={selItem[k]} style={{fontSize: 'var(--fs-2xs)',padding:'3px 5px'}}
                    onChange={e=>pChange(k,e.target.value,true)}
                    onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.target.blur();}}
                    onMouseDown={e=>e.stopPropagation()}/>
                </div>
              ))}
            </div>
            {/* Door/Window: double toggle + angle */}
            {(selItem?.type==='door'||selItem?.type==='window')&&<>
              <div style={{display:'flex',gap:5}}>
                <button onClick={()=>{saveH();selItem.double=!selItem.double;onChange([...S.items]);draw();re();}}
                  style={{flex:1,padding:'4px 6px',border:`1px solid ${selItem.double?'#fb923c':'var(--bd)'}`,borderRadius:4,
                    background:selItem.double?'rgba(251,146,60,.12)':'transparent',
                    color:selItem.double?'#fb923c':'var(--tx2)',cursor:'pointer',fontSize: 'var(--fs-2xs)',fontFamily:'inherit'}}>
                  {selItem.double?'Double':'Single'}
                </button>
                <button title="Rotate 90°" onClick={()=>{saveH();selItem.angle=((selItem.angle||0)+90)%360;onChange([...S.items]);draw();re();}}
                  style={{padding:'4px 8px',border:'1px solid var(--bd)',borderRadius:4,background:'var(--sf2)',
                    color:'var(--tx2)',cursor:'pointer',fontSize: 'var(--fs-xs)',fontFamily:'inherit'}}>
                  ↻ 90°
                </button>
              </div>
              <div style={{fontSize: 'var(--fs-2xs)',color:'var(--tx3)',marginTop:2}}>Rotation: {selItem.angle||0}°</div>
            </>}
            <button onClick={()=>{if(!S.sel)return;saveH();S.items=S.items.filter(i=>i!==S.sel);S.sel=null;onChange([...S.items]);draw();re();}}
              style={{padding:'4px',border:'1px solid rgba(239,68,68,.2)',borderRadius:4,background:'transparent',color:'#ef4444',cursor:'pointer',fontSize: 'var(--fs-2xs)',fontFamily:'inherit'}}>✕ Delete</button>
          </>}
        </div>
      </div>
      </div>{/* end canvas+props */}
      {/* Tooltip portal — renders on document.body to escape overflow:hidden stacking contexts */}
      {tbTip && createPortal(
        <div style={{position:'fixed',left:tbTip.x,top:tbTip.y,transform:'translate(-50%,-100%)',
          background:'#1a1a28',color:'#c8c8e8',fontSize: 'var(--fs-2xs)',fontWeight:500,
          padding:'5px 10px',borderRadius:5,border:'1px solid rgba(255,255,255,.1)',
          boxShadow:'0 4px 14px rgba(0,0,0,.6)',pointerEvents:'none',zIndex:99999,
          whiteSpace:'nowrap',animation:'mbIn .1s ease'}}>
          {tbTip.text}
          <div style={{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',
            borderLeft:'5px solid transparent',borderRight:'5px solid transparent',
            borderTop:'5px solid #1a1a28'}}/>
        </div>,
        document.body
      )}
    </div>
  );
}

export { AdminBlueprint, BlueprintEditorPanel, BuildingFloorSelectors, BuildingSelector, BlueprintCanvas };
