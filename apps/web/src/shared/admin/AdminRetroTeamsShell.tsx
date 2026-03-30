// @ts-nocheck
import React from 'react';
import { supabase } from '../lib/api';
import { AdminRetroTeams } from '../../RetroBoard';

function AdminRetroTeamsShell({ users }) {
  const [teams, setTeams] = React.useState([]);
  React.useEffect(()=>{
    if(supabase){
      Promise.all([
        supabase.from("retro_teams").select("*"),
        supabase.from("retro_team_members").select("*"),
      ]).then(([{data:td},{data:md}])=>{
        const t=(td||[]).map(t=>({...t,members:(md||[]).filter(m=>m.team_id===t.id).map(m=>{const u=users.find(x=>x.id===m.user_id);return{...m,name:u?.name,email:u?.email};})}));
        setTeams(t);
      });
    }
  },[users.length]);
  return <AdminRetroTeams wsUsers={users} teams={teams} setTeams={setTeams}/>;
}

export { AdminRetroTeamsShell };
