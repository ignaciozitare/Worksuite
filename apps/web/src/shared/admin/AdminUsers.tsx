// @ts-nocheck
import React, { useState, useRef } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { UserAvatar } from '@worksuite/ui';
import { supabase } from '../lib/api';
import { SupabaseAdminUserRepo } from '../infra/SupabaseAdminUserRepo';
import { makeAvatar, isValidEmail } from '../lib/utils';
import { PasswordStrength } from '../ui/PasswordStrength';
import { DeskType } from '../../modules/hotdesk/domain/entities/constants';
import { CsvService } from '../../modules/jira-tracker/domain/services/CsvService';
import { AvatarPicker } from '../../modules/profile/ui/AvatarPicker';

const adminUserRepo = new SupabaseAdminUserRepo(supabase);

const MODULES = [
  { id:"jt",     label:"Jira Tracker",  color:"var(--ac2)"   },
  { id:"hd",     label:"HotDesk",       color:"var(--green)" },
  { id:"retro",  label:"RetroBoard",    color:"#818cf8"      },
  { id:"deploy", label:"Deploy Planner",color:"#f59e0b"      },
  { id:"envtracker", label:"Environments",  color:"#22d3ee"  },
  { id:"chrono",     label:"Control Horario", color:"#ec4899" },
  { id:"chrono-admin", label:"RRHH",         color:"#8b5cf6" },
];

const DESK_COLORS = { [DeskType.NONE]: "var(--tx3)", [DeskType.HOTDESK]: "var(--green)", [DeskType.FIXED]: "var(--amber)" };
const DESK_LABELS = { [DeskType.NONE]: "—", [DeskType.HOTDESK]: "Hotdesk", [DeskType.FIXED]: "Fixed" };

function AddUserModal({ existingUsers, onClose, onSave }) {
  const { t } = useTranslation();
  const [name, setName]  = useState("");
  const [email,setEmail] = useState("");
  const [role, setRole]  = useState("user");
  const [desk, setDesk]  = useState(DeskType.NONE);
  const [pwd,  setPwd]   = useState("");
  const [conf, setConf]  = useState("");
  const [show, setShow]  = useState(false);
  const [er,   setEr]    = useState({});
  const [done, setDone]  = useState(false);
  const existEmails = existingUsers.map(u=>u.email.toLowerCase());
  const validate = () => {
    const e = {};
    if (!name.trim())                              e.name  = t("admin.errNameRequired");
    if (!email.trim())                             e.email = t("admin.errEmailRequired");
    else if (!isValidEmail(email))                 e.email = t("admin.errEmailInvalid");
    else if (existEmails.includes(email.toLowerCase())) e.email = t("admin.errEmailExists");
    if (pwd.length < 8)                            e.pwd   = t("admin.errPasswordShort");
    if (pwd !== conf)                              e.conf  = t("admin.errPasswordMatch");
    return e;
  };
  const submit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setEr(errs); return; }
    setDone(true);
    try {
      const json = await adminUserRepo.createUser({ name: name.trim(), email: email.toLowerCase().trim(), password: pwd, role, desk_type: desk });
      if (json.error) { setEr({ email: json.error || 'Error creating user' }); setDone(false); return; }
      // Map snake_case → camelCase for local state
      const u = json.user;
      onSave({ id: u.id, name: u.name, email: u.email, avatar: u.avatar||makeAvatar(u.name), role: u.role, deskType: u.desk_type||'hotdesk', active: u.active });
      setTimeout(() => onClose(), 600);
    } catch(err) {
      setEr({ email: String(err) }); setDone(false);
    }
  };
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:490}}>
        <div className="mh"><div className="mt">👤 {t("admin.addUser")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {t("admin.userAdded")}</div></div>:(
          <>
            <div className="mbody">
              <div className="fr"><label className="fl">{t("admin.fieldName")}</label><input className={`mi ${er.name?"err":""}`} placeholder="John Smith" value={name} onChange={e=>{setName(e.target.value);setEr(v=>({...v,name:null}));}} autoFocus/>{er.name&&<span className="em">{er.name}</span>}</div>
              <div className="fr2">
                <div className="fr"><label className="fl">{t("admin.fieldEmail")}</label><input className={`mi ${er.email?"err":""}`} type="email" placeholder="john@co.com" value={email} onChange={e=>{setEmail(e.target.value);setEr(v=>({...v,email:null}));}}/>{er.email&&<span className="em">{er.email}</span>}</div>
                <div className="fr"><label className="fl">{t("admin.fieldRole")}</label><select className="mi" value={role} onChange={e=>setRole(e.target.value)}><option value="user">{t("admin.roleUser")}</option><option value="admin">{t("admin.roleAdmin")}</option></select></div>
              </div>
              <div className="fr"><label className="fl">{t("admin.fieldPassword")}</label><div style={{display:"flex",gap:6}}><input className={`mi ${er.pwd?"err":""}`} type={show?"text":"password"} placeholder="········" autoComplete="new-password" style={{flex:1}} value={pwd} onChange={e=>{setPwd(e.target.value);setEr(v=>({...v,pwd:null}));}}/><button className="btn-g" onClick={()=>setShow(s=>!s)} style={{flexShrink:0,padding:"0 10px"}}>{show?"🙈":"👁"}</button></div><PasswordStrength password={pwd}/>{er.pwd&&<span className="em">{er.pwd}</span>}</div>
              <div className="fr"><label className="fl">{t("admin.fieldConfirm")}</label><input className={`mi ${er.conf?"err":""}`} type={show?"text":"password"} placeholder="········" autoComplete="new-password" value={conf} onChange={e=>{setConf(e.target.value);setEr(v=>({...v,conf:null}));}}/>{er.conf&&<span className="em">{er.conf}</span>}</div>
            </div>
            <div className="mf"><button className="b-cancel" onClick={onClose}>{t("common.cancel")}</button><button className="b-sub" onClick={submit}>{t("admin.saveUser")}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

function ChangePasswordModal({ user, onClose }) {
  const { t } = useTranslation();
  const [pwd,  setPwd]  = useState("");
  const [conf, setConf] = useState("");
  const [show, setShow] = useState(false);
  const [er,   setEr]   = useState({});
  const [done, setDone] = useState(false);
  const validate = () => { const e = {}; if (pwd.length<8) e.pwd=t("admin.errPasswordShort"); if (pwd!==conf) e.conf=t("admin.errPasswordMatch"); return e; };
  const submit = () => { const errs=validate(); if (Object.keys(errs).length){setEr(errs);return;} setDone(true); setTimeout(()=>onClose(),850); };
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:420}}>
        <div className="mh"><div className="mt">🔑 {t("admin.changePassword")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {t("admin.passwordChanged")}</div></div>:(
          <><div className="mbody">
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
              <div className="avatar" style={{width:30,height:30,fontSize:10,flexShrink:0}}>{user.avatar}</div>
              <div><div style={{fontWeight:600}}>{user.name}</div><div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--tx3)"}}>{user.email}</div></div>
            </div>
            <div className="fr"><label className="fl">{t("admin.newPassword")}</label><div style={{display:"flex",gap:6}}><input className={`mi ${er.pwd?"err":""}`} type={show?"text":"password"} placeholder="········" style={{flex:1}} autoFocus value={pwd} onChange={e=>{setPwd(e.target.value);setEr(v=>({...v,pwd:null}));}}/><button className="btn-g" onClick={()=>setShow(s=>!s)} style={{flexShrink:0,padding:"0 10px"}}>{show?"🙈":"👁"}</button></div><PasswordStrength password={pwd}/>{er.pwd&&<span className="em">{er.pwd}</span>}</div>
            <div className="fr"><label className="fl">{t("admin.confirmPassword")}</label><input className={`mi ${er.conf?"err":""}`} type={show?"text":"password"} placeholder="········" autoComplete="new-password" value={conf} onChange={e=>{setConf(e.target.value);setEr(v=>({...v,conf:null}));}}/>{er.conf&&<span className="em">{er.conf}</span>}</div>
          </div><div className="mf"><button className="b-cancel" onClick={onClose}>{t("common.cancel")}</button><button className="b-sub" onClick={submit}>{t("admin.updatePassword")}</button></div></>
        )}
      </div>
    </div>
  );
}

function CsvImportModal({ existingUsers, onClose, onImport }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [drag,  setDrag]  = useState(false);
  const [parsed,setParsed]= useState(null);
  const [done,  setDone]  = useState(false);
  const [cnt,   setCnt]   = useState(0);
  const existEmails = existingUsers.map(u=>u.email.toLowerCase());
  const process = file => { if(!file||!file.name.endsWith(".csv"))return; const r=new FileReader();r.onload=e=>setParsed(CsvService.parseUsers(e.target.result,existEmails));r.readAsText(file); };
  const validRows = parsed?.rows.filter(r=>r.valid)??[];
  const handleImport = () => {
    const users = validRows.map(r=>({ id:`u-csv-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, name:r.name, email:r.email.toLowerCase(), avatar:makeAvatar(r.name), role:r.role, deskType:DeskType.NONE, active:true }));
    setCnt(users.length); setDone(true); setTimeout(()=>{ onImport(users); onClose(); }, 900);
  };
  const downloadTpl = () => { const blob=new Blob(["name,email,role\nJohn Smith,john@co.com,user\n"],{type:"text/csv"}); const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="users_template.csv";a.click(); };
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:580}}>
        <div className="mh"><div className="mt">📋 {t("admin.csvImportTitle")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {cnt} {t("admin.csvImportDone")}</div></div>:(
          <><div className="mbody">
            {!parsed&&(<><div className={`dropzone ${drag?"over":""}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files[0]);}} onClick={()=>fileRef.current?.click()}><div style={{fontSize:26,marginBottom:8}}>📂</div><div style={{fontSize:12,color:"var(--tx2)",fontWeight:500,marginBottom:4}}>{t("admin.csvDropzone")}</div><div style={{fontSize:10,color:"var(--tx3)"}}>CSV only</div><input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>process(e.target.files[0])}/></div><button className="btn-g" style={{alignSelf:"flex-start"}} onClick={downloadTpl}>↓ {t("admin.csvDownloadTemplate")}</button></>)}
            {parsed&&(<><div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:11,color:"var(--tx2)"}}><strong>{parsed.rows.length}</strong> {t("admin.csvRows")}</span><span style={{fontSize:11,color:parsed.errorCount>0?"var(--amber)":"var(--tx2)"}}><strong>{parsed.errorCount}</strong> {t("admin.csvErrors")}</span><span style={{fontSize:11,color:"var(--green)"}}><strong>{validRows.length}</strong> ready</span><button className="btn-g" style={{marginLeft:"auto",fontSize:10}} onClick={()=>setParsed(null)}>↩ Change</button></div><div className="csv-preview"><div className="csv-row hdr"><div className="csv-cell">#</div><div className="csv-cell">Name</div><div className="csv-cell">Email</div><div className="csv-cell">Role</div><div className="csv-cell">Status</div></div>{parsed.rows.map(r=>(<div key={r.idx} className={`csv-row ${!r.valid?"err-row":""}`}><div className="csv-cell" style={{color:"var(--tx3)"}}>{r.idx}</div><div className="csv-cell">{r.name||"—"}</div><div className="csv-cell">{r.email||"—"}</div><div className="csv-cell"><span className="r-tag r-user">{r.role}</span></div><div className="csv-err-tag">{r.valid?<span style={{color:"var(--green)"}}>✓ OK</span>:r.errors.join(" · ")}</div></div>))}</div></>)}
          </div><div className="mf"><button className="b-cancel" onClick={onClose}>{t("admin.csvCancel")}</button>{parsed&&<button className="b-sub" onClick={handleImport} disabled={validRows.length===0}>{t("admin.csvImport")} ({validRows.length})</button>}</div></>
        )}
      </div>
    </div>
  );
}

function AdminUsers({ users, setUsers, currentUser }) {
  const [pickerUser, setPickerUser] = useState(null);
  const { t } = useTranslation();
  const [modal, setModal] = useState(null);
  const toggleRole = async (id) => {
    const u = users.find(x=>x.id===id);
    if(!u) return;
    const newRole = u.role==="admin"?"user":"admin";
    setUsers(us=>us.map(x=>x.id===id?{...x,role:newRole}:x));
    try{ await adminUserRepo.updateRole(id, newRole); }catch(e){console.error(e);}
  };
  const toggleAccess = async (id) => {
    const u = users.find(x=>x.id===id);
    if(!u) return;
    setUsers(us=>us.map(x=>x.id===id?{...x,active:!x.active}:x));
    try{ await adminUserRepo.updateActive(id, !u.active); }catch(e){console.error(e);}
  };
  const changeDeskType = async (id, dt) => {
    setUsers(us=>us.map(u=>u.id===id?{...u,deskType:dt}:u));
    try{ await adminUserRepo.updateDeskType(id, dt); }catch(e){console.error(e);}
  };
  const toggleModule = async (id, modId) => {
    const u = users.find(x=>x.id===id);
    if(!u) return;
    const mods = u.modules||["jt","hd","retro","deploy"];
    const next = mods.includes(modId) ? mods.filter(m=>m!==modId) : [...mods, modId];
    setUsers(us=>us.map(x=>x.id===id?{...x,modules:next}:x));
    try{ await adminUserRepo.updateModules(id, next); }catch(e){console.error(e);}
  };
  const handleAdd    = u  => setUsers(us=>[...us,u]);
  const handleImport = us => setUsers(prev=>[...prev,...us]);
  const DESK_COLORS = { [DeskType.NONE]:"var(--tx3)", [DeskType.HOTDESK]:"var(--ac2)", [DeskType.FIXED]:"var(--red)" };
  const DESK_LABELS = { [DeskType.NONE]:"—", [DeskType.HOTDESK]:"HD", [DeskType.FIXED]:"FX" };
  return (
    <div>
      <div className="sec-t">{t("admin.usersTitle")}</div>
      <div className="sec-sub">{users.length} {t("admin.usersSynced")}. Manage roles, desk assignments, and access.</div>
      <div className="users-bar">
        <button className="btn-p" style={{width:"auto",padding:"7px 14px"}} onClick={()=>setModal("add")}>{t("admin.addUser")}</button>
        <button className="btn-exp" style={{width:"auto",padding:"7px 14px"}} onClick={()=>setModal("csv")}>{t("admin.importCsv")}</button>
      </div>
      <div className="a-card" style={{padding:0,overflow:"hidden"}}>
        <table className="ut">
          <thead><tr><th>{t("admin.colUser")}</th><th>{t("admin.colEmail")}</th><th>{t("admin.colRole")}</th><th>{t("admin.colDeskType")}</th><th>Módulos</th><th>{t("admin.colAccess")}</th><th>{t("admin.colActions")}</th></tr></thead>
          <tbody>{users.map(u=>(
            <tr key={u.id}>
              <td><div style={{display:"flex",alignItems:"center",gap:8}}><button type="button" onClick={()=>setPickerUser(u)} title={t("profile.avatarChange")} style={{background:"transparent",border:"none",padding:0,cursor:"pointer",borderRadius:"50%"}}><UserAvatar user={{id:u.id,name:u.name,email:u.email,avatar:u.avatar,avatarUrl:u.avatar_url ?? u.avatarUrl ?? null}} size={26} imageWidth={64}/></button><span style={{fontWeight:500}}>{u.name}</span>{u.id===currentUser.id&&<span style={{fontSize:9,color:"var(--tx3)"}}>{t("admin.you")}</span>}</div></td>
              <td style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--tx3)"}}>{u.email}</td>
              <td><span className={`r-tag ${u.role==="admin"?"r-admin":"r-user"}`}>{u.role==="admin"?t("admin.roleAdmin"):t("admin.roleUser")}</span></td>
              <td><div style={{display:"flex",gap:3}}>{[DeskType.NONE, DeskType.HOTDESK, DeskType.FIXED].map(dt=>(<button key={dt} onClick={()=>changeDeskType(u.id,dt)} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,border:`1px solid ${u.deskType===dt?DESK_COLORS[dt]:"var(--bd)"}`,background:u.deskType===dt?`${DESK_COLORS[dt]}15`:"transparent",color:u.deskType===dt?DESK_COLORS[dt]:"var(--tx3)",cursor:"pointer"}}>{DESK_LABELS[dt]}</button>))}</div></td>
              <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{MODULES.map(m=>{const hasMod=(u.modules||["jt","hd","retro","deploy"]).includes(m.id);return(<button key={m.id} onClick={()=>toggleModule(u.id,m.id)} style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:3,border:`1px solid ${hasMod?m.color:"var(--bd)"}`,background:hasMod?`${m.color}18`:"transparent",color:hasMod?m.color:"var(--tx3)",cursor:"pointer",textDecoration:hasMod?"none":"line-through"}}>{m.id.toUpperCase()}</button>);})}</div></td>
              <td><span style={{fontSize:11,fontWeight:500,color:u.active?"var(--green)":"var(--red)"}}>{u.active?t("admin.statusActive"):t("admin.statusBlocked")}</span></td>
              <td>
                <button className="act act-adm" onClick={()=>toggleRole(u.id)}>{u.role==="admin"?t("admin.removeAdmin"):t("admin.makeAdmin")}</button>
                <button className="act act-pwd" onClick={()=>setModal({type:"pwd",user:u})}>{t("admin.changePwdBtn")}</button>
                {u.id!==currentUser.id&&<button className={`act ${u.active?"act-d":"act-a"}`} onClick={()=>toggleAccess(u.id)}>{u.active?t("admin.blockUser"):t("admin.unblockUser")}</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {modal==="add"&&<AddUserModal existingUsers={users} onClose={()=>setModal(null)} onSave={handleAdd}/>}
      {modal==="csv"&&<CsvImportModal existingUsers={users} onClose={()=>setModal(null)} onImport={handleImport}/>}
      {modal?.type==="pwd"&&<ChangePasswordModal user={modal.user} onClose={()=>setModal(null)}/>}
      {pickerUser && (
        <AvatarPicker
          user={{ id: pickerUser.id, name: pickerUser.name, email: pickerUser.email, avatar: pickerUser.avatar, avatarUrl: pickerUser.avatar_url ?? pickerUser.avatarUrl ?? null }}
          onClose={() => setPickerUser(null)}
          onSaved={(value) => {
            setUsers(prev => prev.map(x => x.id === pickerUser.id ? { ...x, avatar_url: value, avatarUrl: value } : x));
          }}
        />
      )}
    </div>
  );
}

export { AdminUsers, AddUserModal, ChangePasswordModal, CsvImportModal };
