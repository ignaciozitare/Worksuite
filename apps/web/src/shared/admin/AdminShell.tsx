import React, { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { AdminSettings, PersonalJiraToken } from './AdminSettings';
import { AdminUsers } from './AdminUsers';
import { AdminHotDesk } from './AdminHotDesk';
import { AdminBlueprint } from './AdminBlueprint';
import { AdminRoles } from './AdminRoles';
import { AdminRetroTeamsShell } from './AdminRetroTeamsShell';
import { AdminDeployConfig } from './AdminDeployConfig';
import { AdminEnvTrackerSection } from './AdminEnvTrackerSection';
import { ChronoConfigSection } from '../../modules/chrono-admin/ui/sections/ChronoConfigSection';

interface AdminShellProps {
  users: any[];
  setUsers: (fn: any) => void;
  hd: any;
  setHd: (fn: any) => void;
  currentUser: { id: string; name: string; role: string; email: string };
  theme?: string;
}

function AdminShell({ users, setUsers, hd, setHd, currentUser, theme="dark" }: AdminShellProps) {
  const { t } = useTranslation();
  const isAdmin = currentUser.role === 'admin';
  const [mod, setMod] = useState("settings");

  // Usuario no-admin solo ve su token personal
  if (!isAdmin) {
    return (
      <div className="admin-content" style={{maxWidth:600}}>
        <div className="sec-t">Jira personal configuration</div>
        <div className="sec-sub">Set your personal Jira API token so your time logs appear under your name in Jira.</div>
        <div className="a-card">
          <div className="a-ct">🔑 Personal Jira API token</div>
          <PersonalJiraToken />
        </div>
      </div>
    );
  }

  const NAV = [
    { id:"settings",   icon:"⚙",  label:t("admin.settings") },
    { id:"users",      icon:"👥", label:t("admin.users"),  badge:"Admin" },
    { id:"roles",      icon:"🛡", label:"Roles & Perms" },
    { id:"hotdesk",    icon:"🪑", label:t("admin.hotdesk"),hd:true },
    { id:"blueprint",  icon:"🗺", label:"Blueprint" },
    { id:"retroteams", icon:"🔁", label:"Retro Teams" },
    { id:"deploy",     icon:"🚀", label:"Deploy Planner" },
    { id:"envtracker", icon:"🖥️", label:"Environments" },
    { id:"chrono",     icon:"⏱️", label:"Chrono Config" },
  ];
  const openUIKit = () => window.open('/ui-kit', '_blank');
  return (
    <div className="admin-wrap">
      <nav className="admin-nav">
        <div className="admin-nav-t">{t("admin.sidebar")}</div>
        {NAV.map(item=>(<button key={item.id} className={`an-btn ${mod===item.id ? (item.hd?"active-hd":"active") : ""}`} onClick={()=>setMod(item.id)}><span className="an-icon">{item.icon}</span><span>{item.label}</span>{item.badge&&<span className="an-badge">{item.badge}</span>}</button>))}
        <div style={{borderTop:'1px solid var(--bd)',marginTop:12,paddingTop:12}}>
          <button className="an-btn" onClick={openUIKit} style={{opacity:.7}}><span className="an-icon">🎨</span><span>UI Kit</span><span style={{fontSize:9,color:'var(--tx3)',marginLeft:'auto'}}>↗</span></button>
        </div>
      </nav>
      <div className="admin-content">
        {mod==="settings"  && <AdminSettings/>}
        {mod==="users"     && <AdminUsers users={users} setUsers={setUsers} currentUser={currentUser}/>}
        {mod==="hotdesk"   && <AdminHotDesk hd={hd} setHd={setHd} users={users} theme={theme}/>}
        {mod==="roles"     && <AdminRoles/>}
        {mod==="blueprint" && <AdminBlueprint/>}
        {mod==="retroteams" && <AdminRetroTeamsShell users={users}/>}
        {mod==="deploy"     && <AdminDeployConfig/>}
        {mod==="envtracker" && <AdminEnvTrackerSection/>}
        {mod==="chrono"     && <ChronoConfigSection/>}
      </div>
    </div>
  );
}

export { AdminShell };
