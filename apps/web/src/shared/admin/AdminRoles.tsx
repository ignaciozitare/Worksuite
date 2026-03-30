// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/api';

function AdminRoles() {
  const [roles, setRoles] = useState([]);
  const [selRole, setSelRole] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [newRoleName, setNewRoleName] = useState('');

  useEffect(()=>{
    supabase.from('roles').select('*').order('created_at')
      .then(({data})=>{ if(data) setRoles(data); });
  },[]);

  const createRole = async () => {
    if(!newRoleName.trim()) return;
    const {data,error} = await supabase.from('roles').insert({
      name: newRoleName.trim().toLowerCase().replace(/\s+/g,'_'),
      description: newRoleName.trim(),
      permissions: {
        modules: ['jt','hd'],
        admin: { users:false,hotdesk:false,blueprint:false,settings:false,jira_config:false,sso:false,roles:false }
      }
    }).select().single();
    if(!error&&data){ setRoles(r=>[...r,data]); setSelRole(data); setNewRoleName(''); }
    else setMsg(error?.message||'Error');
  };

  const deleteRole = async (id) => {
    if(!confirm('Delete this role?')) return;
    await supabase.from('roles').delete().eq('id',id);
    setRoles(r=>r.filter(x=>x.id!==id));
    if(selRole?.id===id) setSelRole(null);
  };

  const updatePerm = async (key, value) => {
    if(!selRole) return;
    const updated = { ...selRole.permissions, ...value };
    setSelRole(r=>({...r, permissions: updated}));
    setRoles(rs=>rs.map(r=>r.id===selRole.id?{...r,permissions:updated}:r));
    await supabase.from('roles').update({permissions:updated}).eq('id',selRole.id);
  };

  const toggleModule = (modId) => {
    const mods = selRole.permissions.modules||[];
    const next = mods.includes(modId) ? mods.filter(m=>m!==modId) : [...mods, modId];
    updatePerm('modules', {modules: next});
  };

  const toggleAdmin = (permId) => {
    const cur = selRole.permissions.admin||{};
    updatePerm('admin', {admin: {...cur, [permId]: !cur[permId]}});
  };

  const saveDescription = async (desc) => {
    if(!selRole) return;
    setSelRole(r=>({...r,description:desc}));
    await supabase.from('roles').update({description:desc}).eq('id',selRole.id);
  };

  return (
    <div style={{display:'flex',gap:0,height:'100%',flex:1,minHeight:0}}>
      {/* Sidebar */}
      <div style={{width:220,borderRight:'1px solid var(--bd)',display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'10px 12px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:6}}>
          <input className="a-inp" placeholder="New role name" value={newRoleName}
            onChange={e=>setNewRoleName(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')createRole();}}
            style={{flex:1,fontSize:11,padding:'4px 7px'}}/>
          <button className="btn-g" onClick={createRole} style={{padding:'4px 8px',fontSize:11,flexShrink:0}}>+</button>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {roles.map(r=>(
            <div key={r.id} style={{display:'flex',alignItems:'center',padding:'8px 12px',cursor:'pointer',
              background:selRole?.id===r.id?'var(--glow)':'transparent',
              borderLeft:`2px solid ${selRole?.id===r.id?'var(--ac)':'transparent'}`,
              borderBottom:'1px solid var(--bd)'}}
              onClick={()=>setSelRole(r)}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:selRole?.id===r.id?'var(--ac2)':'var(--tx)'}}>
                  {r.name}
                  {r.is_system && <span style={{fontSize:9,color:'var(--tx3)',marginLeft:6,fontWeight:400}}>system</span>}
                </div>
                {r.description&&<div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{r.description}</div>}
              </div>
              {!r.is_system&&(
                <button onClick={e=>{e.stopPropagation();deleteRole(r.id);}}
                  style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'var(--tx3)',padding:'1px 3px'}}>×</button>
              )}
            </div>
          ))}
        </div>
        {msg&&<div style={{padding:'6px 10px',fontSize:11,color:'var(--red)'}}>{msg}</div>}
      </div>

      {/* Right: permissions editor */}
      {selRole ? (
        <div style={{flex:1,padding:20,overflowY:'auto'}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:700,color:'var(--tx)',marginBottom:4}}>{selRole.name}</div>
            <input className="a-inp" defaultValue={selRole.description}
              onBlur={e=>saveDescription(e.target.value)}
              placeholder="Role description"
              disabled={selRole.name==='admin'}
              style={{fontSize:12,padding:'5px 8px',width:'100%',maxWidth:380}}/>
          </div>

          {/* Modules */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--tx3)',marginBottom:10}}>
              Visible Modules
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {ALL_MODULES.map(mod=>{
                const on=(selRole.permissions.modules||[]).includes(mod.id);
                return (
                  <div key={mod.id} onClick={()=>selRole.name!=='admin'&&toggleModule(mod.id)}
                    style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',
                      border:`1px solid ${on?'var(--ac)':'var(--bd)'}`,borderRadius:'var(--r2)',
                      background:on?'var(--glow)':'var(--sf2)',
                      cursor:selRole.name==='admin'?'default':'pointer',opacity:selRole.name==='admin'?.6:1,transition:'var(--ease)'}}>
                    <div style={{width:14,height:14,borderRadius:3,background:on?'var(--ac)':'transparent',
                      border:`2px solid ${on?'var(--ac)':'var(--bd2)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff'}}>
                      {on&&'✓'}
                    </div>
                    <span style={{fontSize:12,fontWeight:600,color:on?'var(--ac2)':'var(--tx2)'}}>{mod.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Admin permissions */}
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--tx3)',marginBottom:10}}>
              Admin Access
              <span style={{fontSize:10,fontWeight:400,marginLeft:8,color:'var(--tx3)'}}>— controls what appears in the Admin panel</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {ALL_ADMIN_PERMS.map(perm=>{
                const on=selRole.permissions.admin?.[perm.id]||false;
                return (
                  <div key={perm.id} onClick={()=>selRole.name!=='admin'&&toggleAdmin(perm.id)}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                      border:`1px solid ${on?'rgba(79,110,247,.3)':'var(--bd)'}`,borderRadius:'var(--r)',
                      background:on?'rgba(79,110,247,.05)':'var(--sf2)',
                      cursor:selRole.name==='admin'?'default':'pointer',transition:'var(--ease)'}}>
                    <div style={{width:18,height:18,borderRadius:4,background:on?'var(--ac)':'transparent',
                      border:`2px solid ${on?'var(--ac)':'var(--bd2)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',flexShrink:0}}>
                      {on&&'✓'}
                    </div>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:on?'var(--ac2)':'var(--tx)'}}>{perm.label}</div>
                      <div style={{fontSize:10,color:'var(--tx3)'}}>{perm.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selRole.name==='admin'&&(
            <div style={{marginTop:16,fontSize:11,color:'var(--tx3)',padding:'8px 12px',background:'var(--sf2)',borderRadius:'var(--r)',border:'1px solid var(--bd)'}}>
              🔒 The <strong>admin</strong> role has full access and cannot be modified.
            </div>
          )}
        </div>
      ) : (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize:13}}>
          ← Select a role to configure permissions
        </div>
      )}
    </div>
  );
}

export { AdminRoles };
