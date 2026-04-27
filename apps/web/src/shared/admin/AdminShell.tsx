import React, { useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { AdminSettings, PersonalJiraToken } from './AdminSettings';
import { AdminUsers } from './AdminUsers';
import { AdminHotDesk } from './AdminHotDesk';
import { AdminRoles } from './AdminRoles';
import { AdminRetroTeamsShell } from './AdminRetroTeamsShell';
import { AdminDeployConfig } from './AdminDeployConfig';
import { AdminEnvTrackerSection } from './AdminEnvTrackerSection';
import { ChronoConfigSection } from '../../modules/chrono-admin/ui/sections/ChronoConfigSection';
import { AdminVectorLogic } from './AdminVectorLogic';

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
    { id:"settings",   icon:"settings",                label:t("admin.settings") },
    { id:"users",      icon:"person",                  label:t("admin.users"),  badge:"Admin" },
    { id:"roles",      icon:"admin_panel_settings",    label:"Roles & Perms" },
    { id:"hotdesk",    icon:"event_seat",              label:t("admin.hotdesk"),hd:true },
    { id:"jiraconfig", icon:"integration_instructions",label:"Jira Config" },
    { id:"sso",        icon:"lock",                    label:"SSO" },
    { id:"retroteams", icon:"groups",                  label:"Retro Teams" },
    { id:"deploy",     icon:"rocket_launch",           label:"Deploy Config" },
    { id:"envtracker", icon:"dns",                     label:"Environments" },
    { id:"chrono",     icon:"timer",                   label:"Chrono" },
    { id:"vectorlogic",icon:"hub",                     label:"Vector Logic" },
  ];
  const openUIKit = () => window.open('/ui-kit', '_blank');
  return (
    <div className="admin-wrap">
      <nav className="admin-nav" style={{ background: 'var(--sf-low)', borderRight: '1px solid var(--bd)' }}>
        <div className="admin-nav-t">{t("admin.sidebar")}</div>
        {NAV.map(item=>(
          <button key={item.id} className={`an-btn ${mod===item.id ? (item.hd?"active-hd":"active") : ""}`} onClick={()=>setMod(item.id)}>
            <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)' }}>{item.icon}</span>
            <span>{item.label}</span>
            {item.badge&&<span className="an-badge">{item.badge}</span>}
          </button>
        ))}
        <div style={{borderTop:'1px solid var(--bd)',marginTop:12,paddingTop:12}}>
          <button className="an-btn" onClick={openUIKit} style={{opacity:.7}}>
            <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-md)' }}>palette</span>
            <span>UI Kit</span>
            <span style={{fontSize: 'var(--fs-2xs)',color:'var(--tx3)',marginLeft:'auto'}}>↗</span>
          </button>
        </div>
      </nav>
      <div className="admin-content">
        {mod==="settings"  && <AdminSettings/>}
        {mod==="users"     && <AdminUsers users={users} setUsers={setUsers} currentUser={currentUser}/>}
        {mod==="hotdesk"   && <AdminHotDesk hd={hd} setHd={setHd} users={users} theme={theme}/>}
        {mod==="roles"     && <AdminRoles/>}
        {mod==="retroteams" && <AdminRetroTeamsShell users={users}/>}
        {mod==="deploy"     && <AdminDeployConfig/>}
        {mod==="envtracker" && <AdminEnvTrackerSection/>}
        {mod==="chrono"     && <ChronoConfigSection/>}
        {mod==="vectorlogic"&& <AdminVectorLogic currentUser={currentUser} wsUsers={users}/>}
      </div>
    </div>
  );
}

export { AdminShell };
