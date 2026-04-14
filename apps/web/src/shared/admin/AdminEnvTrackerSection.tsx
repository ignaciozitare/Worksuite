import React from 'react';
import { useTranslation } from '@worksuite/i18n';
import { AdminEnvEnvironments, AdminEnvPolicy, AdminEnvStatuses, AdminEnvJiraFilter, AdminEnvHistoryNote } from '../../modules/environments';

function AdminEnvTrackerSection() {
  const { t } = useTranslation();
  const [sub, setSub] = React.useState("environments");
  // Repositorios ya no se gestionan aquí: se leen automáticamente del
  // ticket Jira (campo repoField de @worksuite/jira-service).
  const SUB = [
    { id:"environments", label:t("admin.envTabEnvironments"), icon:"🖥️" },
    { id:"statuses",     label:t("admin.envTabStatuses"),     icon:"🏷️" },
    { id:"jirafilter",   label:t("admin.envTabJiraFilter"),   icon:"🔎" },
    { id:"policy",       label:t("admin.envTabPolicy"),       icon:"📋" },
    { id:"historynote",  label:t("admin.envTabRetentionNote"), icon:"📝" },
  ];
  return (
    <div>
      <div className="sec-t">🖥️ {t("admin.envTracker")}</div>
      <div className="sec-sub" style={{marginBottom:16}}>{t("admin.envTrackerDesc")}</div>
      <div style={{display:"flex",gap:4,marginBottom:20,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:10,padding:4,alignSelf:"flex-start",width:"fit-content"}}>
        {SUB.map(s=>(
          <button key={s.id} onClick={()=>setSub(s.id)} style={{background:sub===s.id?"var(--ac)":"transparent",color:sub===s.id?"#fff":"var(--tx3)",border:"none",borderRadius:7,cursor:"pointer",fontWeight:sub===s.id?600:400,fontSize:12,padding:"5px 14px",transition:"all 0.15s",fontFamily:"inherit"}}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>
      <div className="a-card">
        {sub==="environments" && <AdminEnvEnvironments/>}
        {sub==="statuses"     && <AdminEnvStatuses/>}
        {sub==="jirafilter"   && <AdminEnvJiraFilter/>}
        {sub==="policy"       && <AdminEnvPolicy/>}
        {sub==="historynote"  && <AdminEnvHistoryNote/>}
      </div>
    </div>
  );
}

export { AdminEnvTrackerSection };
