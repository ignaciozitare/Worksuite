/** Fallback data shown when Jira is not configured or data hasn't loaded */

export const MOCK_USERS = [
  { id:"u1", name:"Elena Martínez", email:"elena@co.com",   avatar:"EM", role:"admin", deskType:"fixed",   active:true,  modules:["jt","hd"] },
  { id:"u2", name:"Carlos Ruiz",    email:"carlos@co.com",  avatar:"CR", role:"user",  deskType:"hotdesk", active:true,  modules:["jt","hd"] },
  { id:"u3", name:"Ana López",      email:"ana@co.com",     avatar:"AL", role:"user",  deskType:"hotdesk", active:true,  modules:["jt","hd"] },
  { id:"u4", name:"Marco Silva",    email:"marco@co.com",   avatar:"MS", role:"user",  deskType:"fixed",   active:true,  modules:["jt","hd"] },
  { id:"u5", name:"Sofía Chen",     email:"sofia@co.com",   avatar:"SC", role:"user",  deskType:"hotdesk", active:false, modules:["jt"]      },
];

export const MOCK_ISSUES_FALLBACK = [
  { id:1, key:"DEMO-1", summary:"Configure your Jira connection in Admin → Settings", type:"Task", status:"To Do", priority:"High", project:"DEMO", assignee:"", epic:"—", epicName:"—", hours:0, labels:[] as string[] },
];

export const MOCK_PROJECTS_FALLBACK = [
  {key:"DEMO", name:"Demo — Configure Jira in Settings"},
];

export const MOCK_WORKLOGS: Record<string, any[]> = {};

export const INITIAL_HD_STATE = {
  fixed: {} as Record<string, string>,
  reservations: [] as Array<{ seatId: string; date: string; userId: string; userName: string }>,
};
