// @ts-nocheck
import React from 'react';
import { supabase } from '../lib/api';
import { SupabaseRetroTeamRepo } from '../../modules/retro/infra/SupabaseRetroTeamRepo';
import { AdminRetroTeams } from '../../modules/retro/ui/RetroBoard';

const teamRepo = new SupabaseRetroTeamRepo(supabase);

function AdminRetroTeamsShell({ users }) {
  const [teams, setTeams] = React.useState([]);
  React.useEffect(()=>{
    Promise.all([
      teamRepo.findAllTeams(),
      teamRepo.findAllMembers(),
    ]).then(([td, md])=>{
      setTeams((td||[]).map(tm=>({...tm,members:(md||[]).filter(m=>m.team_id===tm.id).map(m=>{const u=users.find(x=>x.id===m.user_id);return{...m,name:u?.name,email:u?.email};})})));
    });
  },[users.length]);
  return <AdminRetroTeams wsUsers={users} teams={teams} setTeams={setTeams}/>;
}

export { AdminRetroTeamsShell };
