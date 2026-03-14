// @ts-nocheck
// WorkSuite — Fase 2 — Prototype connected to real Supabase
// UI is identical to the prototype; data layer replaced with Supabase.

import {
  useState, useMemo, useCallback,
  createContext, useContext, useRef, useEffect,
  Component
} from "react";
import { supabase } from './shared/lib/api';
import { useAuth } from './shared/hooks/useAuth';

// ── Helpers to convert DB rows to UI format ────────────────────────────────

function dbWorklogToUI(row) {
  const seconds = row.seconds ?? 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const time = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  return {
    id: row.id,
    issue: row.issue_key,
    summary: row.issue_summary ?? row.issue_key,
    type: row.issue_type ?? 'Task',
    epic: row.epic_key ?? '—',
    epicName: row.epic_name ?? '—',
    project: row.project_key ?? '—',
    author: row.author_name,
    authorId: row.author_id,
    time,
    seconds,
    started: (row.started_at ?? '09:00').slice(0, 5),
    description: row.description ?? '',
    syncedToJira: row.synced_to_jira ?? false,
  };
}

function worklogsArrayToMap(rows) {
  const map = {};
  for (const row of rows) {
    const date = typeof row.date === 'string' ? row.date.slice(0, 10) : row.date;
    if (!map[date]) map[date] = [];
    map[date].push(dbWorklogToUI(row));
  }
  return map;
}


// DOMAIN LAYER
// ══════════════════════════════════════════════════════════════════

/** Value Object — desk assignment type */
const DeskType = Object.freeze({ NONE:"none", HOTDESK:"hotdesk", FIXED:"fixed" });

/** Value Object — seat availability */
const SeatStatus = Object.freeze({ FREE:"free", OCCUPIED:"occupied", FIXED:"fixed" });

/** Domain Service — parse & validate time strings to seconds */
const TimeParser = {
  parse(raw) {
    const s = (raw||"").trim().toLowerCase();
    const hm = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(?:(\d+)\s*m)?$/);
    if (hm) return Math.round((parseFloat(hm[1]) + (hm[2] ? parseInt(hm[2])/60 : 0)) * 3600);
    const onlyM = s.match(/^(\d+)\s*m$/); if (onlyM) return parseInt(onlyM[1]) * 60;
    const onlyH = s.match(/^(\d+(?:\.\d+)?)$/); if (onlyH) return Math.round(parseFloat(onlyH[1]) * 3600);
    return 0;
  },
  format(secs) {
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
    if (!h) return `${m}m`; if (!m) return `${h}h`; return `${h}h ${m}m`;
  },
  toHours: secs => Math.round((secs/3600)*100)/100,
};

/** Domain Service — worklog aggregation */
const WorklogService = {
  filterByRange(allWorklogs, from, to, authorId) {
    const result = {};
    for (const [date, wls] of Object.entries(allWorklogs)) {
      if (date < from || date > to) continue;
      const filtered = authorId ? wls.filter(w => w.authorId === authorId) : wls;
      if (filtered.length) result[date] = filtered;
    }
    return result;
  },
  groupByEpic(worklogs) {
    const map = new Map();
    for (const wl of worklogs) {
      if (!map.has(wl.epic)) map.set(wl.epic, { key:wl.epic, name:wl.epicName, items:[] });
      map.get(wl.epic).items.push(wl);
    }
    return Array.from(map.values());
  },
};

/** Domain Service — reservation logic */
const ReservationService = {
  statusOf(seat, date, fixed, reservations) {
    if (fixed[seat]) return SeatStatus.FIXED;
    return reservations.find(r => r.seatId===seat && r.date===date)
      ? SeatStatus.OCCUPIED : SeatStatus.FREE;
  },
  resOf(seat, date, reservations) {
    return reservations.find(r => r.seatId===seat && r.date===date) || null;
  },
  isWeekend(iso) { const d = new Date(iso+"T00:00:00").getDay(); return d===0||d===6; },
};

/** Domain Service — CSV validation */
const CsvService = {
  parseUsers(raw, existingEmails) {
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { rows:[], errorCount:0 };
    const startIdx = lines[0].toLowerCase().includes("name") ? 1 : 0;
    const rows = lines.slice(startIdx).map((line, i) => {
      const [name="", email="", role="user"] = line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
      const errors = [];
      if (!name) errors.push("Name required");
      if (!email) errors.push("Email required");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email");
      else if (existingEmails.includes(email.toLowerCase())) errors.push("Already exists");
      const normalRole = ["admin","user"].includes(role.toLowerCase()) ? role.toLowerCase() : "user";
      return { idx:startIdx+i+1, name, email, role:normalRole, errors, valid:!errors.length };
    });
    return { rows, errorCount: rows.filter(r=>!r.valid).length };
  },
  exportWorklogs(worklogs, from, to, authorId, spaceKeys) {
    const filtered = WorklogService.filterByRange(worklogs, from, to, authorId||null);
    const rows = [["Date","Issue","Summary","Epic","EpicName","Type","Project","Author","Start","Time","Hours","Description"]];
    for (const [date, wls] of Object.entries(filtered)) {
      for (const w of wls) {
        if (spaceKeys.length && !spaceKeys.includes(w.project)) continue;
        rows.push([date,w.issue,`"${w.summary}"`,w.epic,`"${w.epicName}"`,w.type,w.project,w.author,w.started,w.time,(w.seconds/3600).toFixed(2),`"${w.description||""}"`]);
      }
    }
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download=`worklogs_${from}_${to}.csv`; a.click(); URL.revokeObjectURL(url);
  },
};

// ══════════════════════════════════════════════════════════════════
// INFRASTRUCTURE — i18n Adapter
// ══════════════════════════════════════════════════════════════════

const TRANSLATIONS = {
  en: {
    // Shell
    appName:"WorkSuite", protoTag:"UI Prototype",
    moduleSwitchJira:"Jira Tracker", moduleSwitchHD:"HotDesk",
    darkMode:"Dark", lightMode:"Light",
    // Nav
    navCalendar:"Calendar", navDay:"Day View", navTasks:"Tasks", navAdmin:"Admin",
    navMap:"Office Map", navTable:"Monthly View",
    // Filter sidebar
    dateRange:"Date range", filterByUser:"Filter by user", allUsers:"All users",
    spaces:"Projects", taskType:"Task type", extraJql:"Additional JQL",
    applyFilters:"Apply filters", exportCsv:"↓ Export CSV",
    exportHint:"Only hours within the selected range", clearSelection:"Clear",
    // Calendar
    today:"Today", totalLabel:"Total", activeDays:"Active days",
    avgLabel:"Avg", perDay:"h/d", more:"more", logHours:"+ Log hours",
    // Day view
    worklogs:"worklogs", tasks:"tasks",
    noWorklogs:"No worklogs on this day", noWorklogsSub:"Try another day or user filter",
    logThisDay:"+ Log hours for this day", summaryByTask:"Summary by task",
    // Tasks
    searchPlaceholder:"Search key, summary, user…", jqlGenerated:"JQL",
    noResults:"No results", clearFilter:"Clear",
    colKey:"Key", colSummary:"Summary", colType:"Type", colStatus:"Status",
    colPriority:"Priority", colProject:"Project", colAssignee:"Assignee",
    colEpic:"Epic", colTime:"Time", colAction:"Action", btnHours:"+ Hours",
    // Worklog modal
    logWorklog:"Log worklog", taskField:"Task *", selectTask:"Select task…",
    dateField:"Date *", startTime:"Start time", timeLogged:"Time *",
    timePlaceholder:"2h, 1h 30m, 45m, 1.5", timeFormats:"Formats:",
    decimalHours:"(decimal h)", descField:"Description", descOptional:"(optional)",
    descPlaceholder:"What did you work on?", cancel:"Cancel",
    saveWorklog:"Save worklog", timeInvalid:"Invalid format", timeExceeds:"Max 24h",
    taskRequired:"Select a task", dateRequired:"Date required", savedFlash:"Worklog saved",
    // Admin
    adminSidebar:"Administration", adminSettings:"Settings", adminUsers:"Users", adminHotDesk:"HotDesk",
    settingsTitle:"Settings", jiraConnection:"Jira Cloud Connection",
    jiraUrl:"Jira URL", jiraEmail:"Account email", apiToken:"API Token",
    tokenHint:"Generate at id.atlassian.com → Security → API tokens",
    saveConfig:"Save configuration", savedOk:"Saved", connStatus:"Status",
    connInstance:"Instance", connProjects:"Projects", connLastSync:"Last sync",
    connected:"Connected", minsAgo:"3 minutes ago", hideToken:"Hide", showToken:"Show",
    // Admin — Users
    usersTitle:"User management", usersSynced:"users", addUserBtn:"+ Add user",
    importCsvBtn:"↑ Import CSV", fieldName:"Full name *", fieldEmail:"Email *",
    fieldRole:"App role", fieldDeskType:"Desk type", fieldPassword:"Password *",
    fieldConfirm:"Confirm password *", changePassword:"Change password",
    changePwdBtn:"Change pwd", newPassword:"New password *",
    confirmPassword:"Confirm new password *", saveUser:"Save user",
    updatePassword:"Update password", colUser:"User", colEmail:"Email",
    colRole:"Role", colDeskType:"Desk", colAccess:"Access", colActions:"Actions",
    roleAdmin:"Admin", roleUser:"User", deskNone:"—", deskHotdesk:"Hotdesk",
    deskFixed:"Fixed", statusActive:"Active", statusBlocked:"Blocked",
    makeAdmin:"Make admin", removeAdmin:"Remove admin", blockUser:"Block",
    unblockUser:"Unblock", you:"(you)", errNameRequired:"Name required",
    errEmailRequired:"Email required", errEmailInvalid:"Invalid email",
    errEmailExists:"Email already registered", errPasswordShort:"Min 8 characters",
    errPasswordMatch:"Passwords don't match", userAdded:"User added",
    passwordChanged:"Password updated",
    // CSV
    csvImportTitle:"Bulk import users", csvDropzone:"Drop CSV here or click to browse",
    csvFormat:"Expected format:", csvFormatHint:"name, email, role (admin/user)",
    csvPreview:"Preview", csvRows:"rows detected", csvErrors:"rows with errors",
    csvImport:"Import users", csvImportDone:"users imported",
    csvDownloadTemplate:"Download template", csvCancel:"Cancel",
    // Admin — HotDesk
    hotdeskTitle:"HotDesk Configuration", hotdeskSeats:"Seat Management",
    hotdeskLegend:"Seat status today", assignSeat:"Assign seat",
    selectSeat:"Select a seat to configure",
    assignTo:"Assign to user", asFixed:"Mark as permanent",
    asFixedHint:"Seat will be locked for this person permanently",
    confirmAssign:"Assign", releaseBtn:"Release", fixedSeats:"Fixed seats",
    noFixed:"No fixed assignments", unlockSeat:"Unlock",
    // HotDesk views
    officeMap:"Office Map", monthlyView:"Monthly View",
    freeSeats:"free today", seatsTotal:"seats",
    legendFree:"Free", legendOcc:"Occupied", legendFixed:"Fixed",
    hdNoReserve:"This seat has a fixed assignment.",
    hdAlreadyOcc:"Seat already taken.", hdAlreadyRes:"You already have a reservation for this date.",
    hdReleaseTitle:"Release reservation", hdReleaseQ:"Release your reservation?",
    hdReleaseBtn:"Release", hdReserveTitle:"New reservation",
    hdSelectDates:"Select dates", hdConfirm:"Confirm",
    hdReleasedOk:"Reservation released", hdReservedOk:"Reserved",
    hdAdminManage:"Manage seat",
  },
  es: {
    appName:"WorkSuite", protoTag:"Prototipo UI",
    moduleSwitchJira:"Jira Tracker", moduleSwitchHD:"HotDesk",
    darkMode:"Oscuro", lightMode:"Claro",
    navCalendar:"Calendario", navDay:"Vista día", navTasks:"Tareas", navAdmin:"Admin",
    navMap:"Mapa oficina", navTable:"Vista mensual",
    dateRange:"Rango de fechas", filterByUser:"Filtrar por usuario", allUsers:"Todos",
    spaces:"Proyectos", taskType:"Tipo de tarea", extraJql:"JQL adicional",
    applyFilters:"Aplicar filtros", exportCsv:"↓ Exportar CSV",
    exportHint:"Solo horas en el rango seleccionado", clearSelection:"Limpiar",
    today:"Hoy", totalLabel:"Total", activeDays:"Días activos",
    avgLabel:"Promedio", perDay:"h/día", more:"más", logHours:"+ Imputar horas",
    worklogs:"worklogs", tasks:"tareas",
    noWorklogs:"Sin worklogs en este día", noWorklogsSub:"Prueba otro día o usuario",
    logThisDay:"+ Imputar horas este día", summaryByTask:"Resumen por tarea",
    searchPlaceholder:"Buscar clave, resumen, usuario…", jqlGenerated:"JQL",
    noResults:"Sin resultados", clearFilter:"Limpiar",
    colKey:"Clave", colSummary:"Resumen", colType:"Tipo", colStatus:"Estado",
    colPriority:"Prioridad", colProject:"Proyecto", colAssignee:"Asignado",
    colEpic:"Épica", colTime:"Tiempo", colAction:"Acción", btnHours:"+ Horas",
    logWorklog:"Imputar horas", taskField:"Tarea *", selectTask:"Selecciona tarea…",
    dateField:"Fecha *", startTime:"Hora inicio", timeLogged:"Tiempo *",
    timePlaceholder:"2h, 1h 30m, 45m, 1.5", timeFormats:"Formatos:",
    decimalHours:"(horas decimales)", descField:"Descripción", descOptional:"(opcional)",
    descPlaceholder:"¿En qué trabajaste?", cancel:"Cancelar",
    saveWorklog:"Guardar worklog", timeInvalid:"Formato inválido", timeExceeds:"Máx 24h",
    taskRequired:"Selecciona una tarea", dateRequired:"Fecha requerida", savedFlash:"Worklog guardado",
    adminSidebar:"Administración", adminSettings:"Configuración", adminUsers:"Usuarios", adminHotDesk:"HotDesk",
    settingsTitle:"Configuración", jiraConnection:"Conexión Jira Cloud",
    jiraUrl:"URL de Jira", jiraEmail:"Email de la cuenta", apiToken:"API Token",
    tokenHint:"Genera el token en id.atlassian.com → Seguridad → API tokens",
    saveConfig:"Guardar configuración", savedOk:"Guardado", connStatus:"Estado",
    connInstance:"Instancia", connProjects:"Proyectos", connLastSync:"Último sync",
    connected:"Conectado", minsAgo:"hace 3 minutos", hideToken:"Ocultar", showToken:"Ver",
    usersTitle:"Gestión de usuarios", usersSynced:"usuarios", addUserBtn:"+ Agregar usuario",
    importCsvBtn:"↑ Importar CSV", fieldName:"Nombre completo *", fieldEmail:"Email *",
    fieldRole:"Rol en la app", fieldDeskType:"Tipo de puesto", fieldPassword:"Contraseña *",
    fieldConfirm:"Confirmar contraseña *", changePassword:"Cambiar contraseña",
    changePwdBtn:"Cambiar clave", newPassword:"Nueva contraseña *",
    confirmPassword:"Confirmar nueva contraseña *", saveUser:"Guardar usuario",
    updatePassword:"Actualizar contraseña", colUser:"Usuario", colEmail:"Email",
    colRole:"Rol", colDeskType:"Puesto", colAccess:"Acceso", colActions:"Acciones",
    roleAdmin:"Admin", roleUser:"Usuario", deskNone:"—", deskHotdesk:"Hotdesk",
    deskFixed:"Fijo", statusActive:"Activo", statusBlocked:"Bloqueado",
    makeAdmin:"Hacer admin", removeAdmin:"Quitar admin", blockUser:"Bloquear",
    unblockUser:"Desbloquear", you:"(tú)", errNameRequired:"Nombre obligatorio",
    errEmailRequired:"Email obligatorio", errEmailInvalid:"Email inválido",
    errEmailExists:"Email ya registrado", errPasswordShort:"Mín 8 caracteres",
    errPasswordMatch:"Las contraseñas no coinciden", userAdded:"Usuario añadido",
    passwordChanged:"Contraseña actualizada",
    csvImportTitle:"Importación masiva de usuarios", csvDropzone:"Arrastra CSV aquí o haz clic",
    csvFormat:"Formato esperado:", csvFormatHint:"nombre, email, rol (admin/user)",
    csvPreview:"Vista previa", csvRows:"filas detectadas", csvErrors:"filas con errores",
    csvImport:"Importar usuarios", csvImportDone:"usuarios importados",
    csvDownloadTemplate:"Descargar plantilla", csvCancel:"Cancelar",
    hotdeskTitle:"Configuración HotDesk", hotdeskSeats:"Gestión de puestos",
    hotdeskLegend:"Estado de puestos hoy", assignSeat:"Asignar puesto",
    selectSeat:"Selecciona un puesto para configurarlo",
    assignTo:"Asignar a usuario", asFixed:"Marcar como permanente",
    asFixedHint:"El puesto quedará bloqueado para esta persona",
    confirmAssign:"Asignar", releaseBtn:"Liberar", fixedSeats:"Puestos fijos",
    noFixed:"Sin asignaciones fijas", unlockSeat:"Desbloquear",
    officeMap:"Mapa de oficina", monthlyView:"Vista mensual",
    freeSeats:"libres hoy", seatsTotal:"puestos",
    legendFree:"Libre", legendOcc:"Ocupado", legendFixed:"Fijo",
    hdNoReserve:"Este puesto tiene asignación fija.",
    hdAlreadyOcc:"Puesto ya ocupado.", hdAlreadyRes:"Ya tienes reserva para esta fecha.",
    hdReleaseTitle:"Liberar reserva", hdReleaseQ:"¿Deseas liberar tu reserva?",
    hdReleaseBtn:"Liberar", hdReserveTitle:"Nueva reserva",
    hdSelectDates:"Selecciona fechas", hdConfirm:"Confirmar",
    hdReleasedOk:"Reserva liberada", hdReservedOk:"Reserva confirmada",
    hdAdminManage:"Gestionar puesto",
  }
};

// ══════════════════════════════════════════════════════════════════
// INFRASTRUCTURE — Storage Adapter (in-memory; no localStorage in artifacts)
// ══════════════════════════════════════════════════════════════════

const _memStore = {};
const StorageAdapter = {
  load()        { return _memStore["state"] ?? null; },
  save(state)   { _memStore["state"] = state; },
};

// ══════════════════════════════════════════════════════════════════
// MOCK DATA — Initial state (would come from API in production)
// ══════════════════════════════════════════════════════════════════

const MOCK_USERS = [
  { id:"u1", name:"Elena Martínez", email:"elena@co.com",   avatar:"EM", role:"admin", deskType:DeskType.FIXED,    active:true  },
  { id:"u2", name:"Carlos Ruiz",    email:"carlos@co.com",  avatar:"CR", role:"user",  deskType:DeskType.HOTDESK,  active:true  },
  { id:"u3", name:"Ana López",      email:"ana@co.com",     avatar:"AL", role:"user",  deskType:DeskType.HOTDESK,  active:true  },
  { id:"u4", name:"Marco Silva",    email:"marco@co.com",   avatar:"MS", role:"user",  deskType:DeskType.FIXED,    active:true  },
  { id:"u5", name:"Sofía Chen",     email:"sofia@co.com",   avatar:"SC", role:"user",  deskType:DeskType.HOTDESK,  active:false },
];

// CURRENT_USER is now injected from auth in WorkSuiteApp

// HotDesk seats layout
const SEATS = [
  {id:"A1",x:75,y:80},{id:"A2",x:135,y:80},{id:"A3",x:195,y:80},
  {id:"A4",x:75,y:140},{id:"A5",x:135,y:140},{id:"A6",x:195,y:140},
  {id:"B1",x:262,y:80},{id:"B2",x:322,y:80},{id:"B3",x:382,y:80},
  {id:"B4",x:262,y:140},{id:"B5",x:322,y:140},{id:"B6",x:382,y:140},
  {id:"C1",x:75,y:282},{id:"C2",x:135,y:282},{id:"C3",x:195,y:282},
  {id:"C4",x:255,y:282},{id:"C5",x:315,y:282},{id:"C6",x:375,y:282},
];

const TODAY = new Date().toISOString().slice(0,10);
const MOCK_TODAY = TODAY;

const MOCK_ISSUES = [
  { id:1,  key:"PLAT-142", summary:"Refactor auth service with JWT RS256",   type:"Story", status:"In Progress", priority:"High",    project:"PLAT", assignee:"Elena Martínez", epic:"PLAT-100", epicName:"Security Q1",  hours:12.5, labels:["backend","security"] },
  { id:2,  key:"PLAT-143", summary:"Add rate limiting to API Gateway",       type:"Task",  status:"In Progress", priority:"High",    project:"PLAT", assignee:"Elena Martínez", epic:"PLAT-100", epicName:"Security Q1",  hours:6.0,  labels:["backend","infra"]   },
  { id:3,  key:"MOB-87",   summary:"Crash on iOS 17 opening notifications",  type:"Bug",   status:"Done",        priority:"Critical",project:"MOB",  assignee:"Carlos Ruiz",    epic:"MOB-50",   epicName:"Stability",    hours:3.5,  labels:["ios","hotfix"]      },
  { id:4,  key:"MOB-91",   summary:"Migrate to React Native 0.73",           type:"Task",  status:"In Progress", priority:"Medium",  project:"MOB",  assignee:"Elena Martínez", epic:"MOB-80",   epicName:"Tech Debt",    hours:8.0,  labels:["rn","upgrade"]      },
  { id:5,  key:"DATA-34",  summary:"ETL pipeline for product metrics",       type:"Story", status:"To Do",       priority:"Medium",  project:"DATA", assignee:"Ana López",      epic:"DATA-20",  epicName:"Analytics v2", hours:0,    labels:["etl","bigquery"]    },
  { id:6,  key:"DATA-38",  summary:"KPI dashboard in Metabase",              type:"Task",  status:"Done",        priority:"Low",     project:"DATA", assignee:"Ana López",      epic:"DATA-20",  epicName:"Analytics v2", hours:5.5,  labels:["bi","metabase"]     },
  { id:7,  key:"OPS-19",   summary:"Migrate clusters to EKS 1.29",           type:"Spike", status:"In Progress", priority:"High",    project:"OPS",  assignee:"Marco Silva",    epic:"OPS-10",   epicName:"K8s Upgrade",  hours:14.0, labels:["k8s","aws"]         },
  { id:8,  key:"PLAT-149", summary:"Document REST endpoints in OpenAPI 3.1", type:"Task",  status:"To Do",       priority:"Low",     project:"PLAT", assignee:"Elena Martínez", epic:"PLAT-110", epicName:"DX Improve",   hours:0,    labels:["docs","api"]        },
  { id:9,  key:"MOB-95",   summary:"Implement offline mode with SQLite",     type:"Story", status:"To Do",       priority:"High",    project:"MOB",  assignee:"Carlos Ruiz",    epic:"MOB-90",   epicName:"Offline Mode", hours:0,    labels:["offline","sqlite"]  },
  { id:10, key:"OPS-22",   summary:"SLO alerts with Prometheus + Grafana",   type:"Task",  status:"Done",        priority:"Medium",  project:"OPS",  assignee:"Marco Silva",    epic:"OPS-10",   epicName:"K8s Upgrade",  hours:7.0,  labels:["monitoring"]        },
];

const MOCK_PROJECTS = [
  {key:"PLAT",name:"Platform Core"},{key:"MOB",name:"Mobile App"},
  {key:"DATA",name:"Data & Analytics"},{key:"OPS",name:"DevOps & Infra"},
];

const MOCK_WORKLOGS = {
  "2026-03-04":[{id:"wl5",issue:"PLAT-142",summary:"Refactor auth service",type:"Story",epic:"PLAT-100",epicName:"Security Q1",author:"Elena Martínez",authorId:"u1",time:"5h",seconds:18000,started:"08:45",project:"PLAT",description:""}],
  "2026-03-06":[{id:"wl9",issue:"OPS-19",summary:"Migrate clusters to EKS 1.29",type:"Spike",epic:"OPS-10",epicName:"K8s Upgrade",author:"Marco Silva",authorId:"u4",time:"6h",seconds:21600,started:"08:30",project:"OPS",description:""},{id:"wl10",issue:"PLAT-142",summary:"Refactor auth service",type:"Story",epic:"PLAT-100",epicName:"Security Q1",author:"Elena Martínez",authorId:"u1",time:"2h",seconds:7200,started:"15:00",project:"PLAT",description:""}],
  "2026-03-11":[{id:"wl14",issue:"PLAT-142",summary:"Refactor auth service",type:"Story",epic:"PLAT-100",epicName:"Security Q1",author:"Elena Martínez",authorId:"u1",time:"4h 30m",seconds:16200,started:"09:30",project:"PLAT",description:""},{id:"wl15",issue:"MOB-87",summary:"Crash on iOS 17",type:"Bug",epic:"MOB-50",epicName:"Stability",author:"Carlos Ruiz",authorId:"u2",time:"1h",seconds:3600,started:"14:00",project:"MOB",description:""}],
  "2026-03-17":[{id:"wl21",issue:"PLAT-142",summary:"Refactor auth service",type:"Story",epic:"PLAT-100",epicName:"Security Q1",author:"Elena Martínez",authorId:"u1",time:"6h",seconds:21600,started:"08:45",project:"PLAT",description:""}],
  "2026-03-18":[{id:"wl22",issue:"DATA-38",summary:"KPI dashboard in Metabase",type:"Task",epic:"DATA-20",epicName:"Analytics v2",author:"Ana López",authorId:"u3",time:"4h",seconds:14400,started:"09:30",project:"DATA",description:""},{id:"wl23",issue:"MOB-87",summary:"Crash on iOS 17",type:"Bug",epic:"MOB-50",epicName:"Stability",author:"Carlos Ruiz",authorId:"u2",time:"2h",seconds:7200,started:"14:00",project:"MOB",description:""}],
  "2026-03-23":[{id:"wl27",issue:"PLAT-142",summary:"Refactor auth service",type:"Story",epic:"PLAT-100",epicName:"Security Q1",author:"Elena Martínez",authorId:"u1",time:"3h 30m",seconds:12600,started:"09:00",project:"PLAT",description:""}],
  "2026-03-25":[{id:"wl30",issue:"PLAT-143",summary:"Add rate limiting",type:"Task",epic:"PLAT-100",epicName:"Security Q1",author:"Elena Martínez",authorId:"u1",time:"4h",seconds:14400,started:"09:00",project:"PLAT",description:""}],
};

// Initial HotDesk state
const INITIAL_HD_STATE = {
  fixed: { "A1":"Elena Martínez", "B3":"Marco Silva" },
  reservations: [
    { seatId:"A2", date:MOCK_TODAY, userId:"u2", userName:"Carlos Ruiz" },
    { seatId:"C1", date:MOCK_TODAY, userId:"u3", userName:"Ana López" },
  ],
};

// ══════════════════════════════════════════════════════════════════
// INFRASTRUCTURE — Theme Adapter
// ══════════════════════════════════════════════════════════════════

// Full CSS with dual-theme variables
const buildCSS = () => `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

/* ── Default dark vars on :root so html/body bg works before .shell renders ── */
:root{
  --body:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;
  --r:5px;--r2:8px;--ease:all .15s ease;
  --bg:#0d0d10;--sf:#141418;--sf2:#1b1b22;--sf3:#21212c;
  --bd:#2a2a38;--bd2:#383850;
  --ac:#4f6ef7;--ac2:#7b93ff;--glow:rgba(79,110,247,.12);
  --green:#3ecf8e;--amber:#f5a623;--red:#e05252;--purple:#b57cf6;
  --tx:#e4e4ef;--tx2:#8888a8;--tx3:#50506a;
  --shadow:0 8px 30px rgba(0,0,0,.55);
  --seat-free:#3ecf8e;--seat-occ:#4f6ef7;--seat-fixed:#e05252;
  color-scheme:dark;
}

/* ── Dark theme — applied via data-theme on .shell ── */
[data-theme="dark"]{
  --bg:#0d0d10;--sf:#141418;--sf2:#1b1b22;--sf3:#21212c;
  --bd:#2a2a38;--bd2:#383850;
  --ac:#4f6ef7;--ac2:#7b93ff;--glow:rgba(79,110,247,.12);
  --green:#3ecf8e;--amber:#f5a623;--red:#e05252;--purple:#b57cf6;
  --tx:#e4e4ef;--tx2:#8888a8;--tx3:#50506a;
  --shadow:0 8px 30px rgba(0,0,0,.55);
  --seat-free:#3ecf8e;--seat-occ:#4f6ef7;--seat-fixed:#e05252;
  color-scheme:dark;
}
/* ── Light theme ── */
[data-theme="light"]{
  --bg:#f0f0f6;--sf:#ffffff;--sf2:#f5f5fb;--sf3:#eaeaf2;
  --bd:#dcdce8;--bd2:#c4c4d8;
  --ac:#4f6ef7;--ac2:#2d4fd0;--glow:rgba(79,110,247,.07);
  --green:#0f9060;--amber:#b86800;--red:#c02828;--purple:#7030b0;
  --tx:#181826;--tx2:#4a4a70;--tx3:#9494b8;
  --shadow:0 8px 30px rgba(0,0,0,.1);
  --seat-free:#0f9060;--seat-occ:#4f6ef7;--seat-fixed:#c02828;
  color-scheme:light;
}

/* ── Base — html/body dark by default ── */
html,body,#root{background:#0d0d10;color:#e4e4ef;margin:0;padding:0;}
body{font-family:'Inter',system-ui,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;}

/* ── Scrollbars ── */
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:var(--bg);}
::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:3px;}

/* ── Shell — root of all themed content ── */
.shell{display:flex;flex-direction:column;height:100vh;overflow:hidden;background:var(--bg);color:var(--tx);}
.topbar{display:flex;align-items:center;gap:10px;padding:0 18px;height:48px;background:var(--sf);border-bottom:1px solid var(--bd);flex-shrink:0;}
.logo{font-size:14px;font-weight:700;letter-spacing:-.3px;display:flex;align-items:center;gap:7px;}
.logo-dot{width:7px;height:7px;border-radius:50%;background:var(--ac);box-shadow:0 0 8px var(--ac);}
.logo-jt{color:var(--ac2);}
.logo-sep{color:var(--tx3);font-weight:300;}
.logo-hd{color:var(--green);}
.proto-tag{font-size:10px;font-weight:500;background:rgba(79,110,247,.08);border:1px solid rgba(79,110,247,.18);border-radius:4px;padding:2px 8px;color:var(--ac2);}
.top-right{margin-left:auto;display:flex;align-items:center;gap:8px;}
.avatar{width:28px;height:28px;border-radius:50%;background:var(--ac);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;border:1px solid var(--bd2);flex-shrink:0;}
.u-name{font-size:12px;font-weight:500;color:var(--tx2);}
.o-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 5px var(--green);}

/* ── Switcher pills ── */
.sw-group{display:flex;border:1px solid var(--bd2);border-radius:var(--r);overflow:hidden;}
.sw-btn{font-size:10px;font-weight:700;padding:4px 10px;background:transparent;border:none;color:var(--tx3);cursor:pointer;transition:var(--ease);letter-spacing:.03em;white-space:nowrap;}
.sw-btn:hover{color:var(--tx2);background:var(--sf3);}
.sw-btn.active{background:var(--ac);color:#fff;}
.sw-btn.active-green{background:var(--green);color:#fff;}
.sw-btn.active-theme{background:var(--sf3);color:var(--tx);}

/* ── Role tag ── */
.r-tag{font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:3px;}
.r-admin{background:rgba(245,166,35,.12);color:var(--amber);border:1px solid rgba(245,166,35,.3);}
.r-user{background:var(--sf3);color:var(--tx3);border:1px solid var(--bd);}

/* ── Nav bar ── */
.nav-bar{display:flex;align-items:center;gap:2px;padding:0 18px;height:38px;background:var(--sf);border-bottom:1px solid var(--bd);flex-shrink:0;}
.n-btn{font-size:11px;font-weight:600;letter-spacing:.02em;padding:5px 12px;border-radius:var(--r);border:1px solid transparent;cursor:pointer;background:transparent;color:var(--tx3);transition:var(--ease);}
.n-btn:hover{color:var(--tx2);background:var(--sf3);}
.n-btn.active{color:var(--ac2);background:var(--glow);border-color:rgba(79,110,247,.28);}
.n-btn.active-hd{color:var(--green);background:rgba(62,207,142,.06);border-color:rgba(62,207,142,.25);}
.n-sep{width:1px;height:16px;background:var(--bd);margin:0 4px;}
.body{display:flex;flex:1;overflow:hidden;background:var(--bg);}
.content{flex:1;overflow-y:auto;padding:20px;background:var(--bg);}

/* ── Filter sidebar ── */
.sb{width:248px;min-width:248px;background:var(--sf);border-right:1px solid var(--bd);overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:14px;}
.sb-lbl{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3);padding-bottom:5px;border-bottom:1px solid var(--bd);}
.sb-cnt{color:var(--ac2);margin-left:4px;}
.sb-s{display:flex;flex-direction:column;gap:7px;}
.fi{width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:6px 9px;color:var(--tx);font-family:var(--body);font-size:12px;outline:none;transition:border-color .15s;}
.fi:focus{border-color:var(--ac);}
.fi::placeholder{color:var(--tx3);}
select.fi{cursor:pointer;}
textarea.fi{resize:vertical;min-height:52px;font-family:var(--mono);font-size:11px;}
.pick-l{display:flex;flex-direction:column;gap:2px;}
.pick-i{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:var(--r);cursor:pointer;user-select:none;font-size:12px;color:var(--tx2);transition:background .1s;}
.pick-i:hover{background:var(--sf3);}
.pick-i.on{background:var(--glow);color:var(--tx);}
.cb{width:13px;height:13px;border-radius:3px;border:1px solid var(--bd2);background:var(--sf3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:8px;color:transparent;transition:var(--ease);}
.pick-i.on .cb{background:var(--ac);border-color:var(--ac);color:#fff;}
.kb{font-family:var(--mono);color:var(--ac2);font-size:10px;font-weight:500;}
.btn-p{font-size:12px;font-weight:600;width:100%;padding:8px;border-radius:var(--r);border:none;background:var(--ac);color:#fff;cursor:pointer;transition:var(--ease);}
.btn-p:hover{background:var(--ac2);box-shadow:0 4px 12px rgba(79,110,247,.25);}
.btn-g{font-size:11px;font-weight:500;padding:4px 10px;border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.btn-g:hover{color:var(--tx);background:var(--sf3);border-color:var(--bd2);}
.btn-exp{font-size:11px;font-weight:600;width:100%;padding:7px;border-radius:var(--r);border:1px solid var(--bd2);background:var(--sf2);color:var(--green);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:var(--ease);}
.btn-exp:hover{background:rgba(62,207,142,.07);border-color:var(--green);}
.btn-log{font-size:11px;font-weight:600;padding:6px 12px;border-radius:var(--r);border:1px solid rgba(79,110,247,.3);background:var(--glow);color:var(--ac2);cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:var(--ease);}
.btn-log:hover{background:rgba(79,110,247,.18);border-color:var(--ac);}
.btn-log-sm{font-size:10px;padding:4px 9px;}

/* ── Calendar ── */
.cal-h{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;}
.cal-t{font-size:20px;font-weight:700;letter-spacing:-.3px;color:var(--tx);}
.n-arr{width:28px;height:28px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;color:var(--tx2);transition:var(--ease);}
.n-arr:hover{border-color:var(--bd2);color:var(--tx);}
.cal-stats{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;}
.chip{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:3px 10px;font-size:11px;color:var(--tx2);}
.chip strong{color:var(--tx);font-family:var(--mono);font-weight:700;}
.cgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
.cdh{font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);text-align:center;padding:6px 0;}
.cc{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);min-height:80px;padding:6px;cursor:pointer;transition:var(--ease);display:flex;flex-direction:column;gap:2px;position:relative;overflow:hidden;}
.cc:hover{border-color:var(--bd2);background:var(--sf2);}
.cc:hover .cadd{opacity:1;}
.cc.today::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac);}
.cc.today{border-color:rgba(79,110,247,.35);}
.cc.other{background:transparent !important;border-color:transparent !important;pointer-events:none;}
.cc.other .cday{color:var(--tx3);opacity:.3;}
.cc.active{border-color:var(--ac2);background:var(--glow);}
.cc.has-d{background:var(--sf2);}
.ctop{display:flex;align-items:flex-start;justify-content:space-between;}
.cday{font-family:var(--mono);font-size:11px;font-weight:500;color:var(--tx3);}
.cc.today .cday{color:var(--ac2);}
.cadd{opacity:0;font-size:12px;color:var(--ac2);background:var(--glow);border:1px solid rgba(79,110,247,.25);border-radius:3px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;transition:opacity .15s;cursor:pointer;flex-shrink:0;}
.chrs{font-family:var(--mono);font-size:17px;font-weight:600;line-height:1.1;color:var(--tx);}
.chrs span{font-size:10px;font-weight:400;color:var(--tx3);}
.cdots{display:flex;flex-direction:column;gap:1px;margin-top:auto;}
.cdot{font-family:var(--mono);font-size:9px;color:var(--tx3);display:flex;align-items:center;gap:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cdot::before{content:'';width:3px;height:3px;border-radius:50%;background:var(--ac);flex-shrink:0;}

/* ── Day view ── */
.dh{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;}
.dd{font-size:21px;font-weight:700;letter-spacing:-.4px;color:var(--tx);}
.dsub{font-size:12px;color:var(--tx2);margin-top:4px;}
.dsub strong{color:var(--green);font-family:var(--mono);}
.dn{display:flex;gap:6px;align-items:center;}
.eb{margin-bottom:16px;}
.eh{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--sf2);border-left:3px solid var(--purple);border-radius:0 var(--r) var(--r) 0;margin-bottom:6px;}
.ek{font-family:var(--mono);font-size:10px;color:var(--purple);font-weight:500;}
.en{font-size:12px;font-weight:500;color:var(--tx2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ehrs{font-family:var(--mono);font-size:11px;color:var(--purple);margin-left:auto;}
.wlc{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);padding:8px 11px;display:flex;align-items:center;gap:10px;margin-bottom:4px;transition:var(--ease);}
.wlc:hover{border-color:var(--bd2);}
.wlc.new{border-color:rgba(62,207,142,.3);background:rgba(62,207,142,.04);animation:fadeIn .3s ease;}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.wlk{font-family:var(--mono);font-size:10px;color:var(--ac2);min-width:68px;font-weight:500;}
.wls{flex:1;font-size:12px;font-weight:500;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.wlr{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;}
.wlt{font-family:var(--mono);font-size:13px;color:var(--green);font-weight:500;}
.wlm{font-size:10px;color:var(--tx3);}
.t-pill{font-family:var(--mono);font-size:9px;padding:2px 6px;border-radius:3px;border:1px solid var(--bd2);color:var(--tx3);white-space:nowrap;background:var(--sf3);}
.del-wl{background:none;border:none;cursor:pointer;color:var(--tx3);font-size:12px;padding:2px 4px;border-radius:3px;opacity:0;transition:var(--ease);}
.wlc:hover .del-wl{opacity:1;}
.del-wl:hover{color:var(--red);}

/* ── Tasks table ── */
.tk-h{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.tk-t{font-size:20px;font-weight:700;letter-spacing:-.3px;color:var(--tx);}
.c-bdg{background:var(--sf2);border:1px solid var(--bd);border-radius:20px;padding:2px 10px;font-size:10px;font-weight:500;color:var(--tx2);font-family:var(--mono);}
.jql-b{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:7px 11px;margin-bottom:12px;font-family:var(--mono);font-size:10px;color:var(--tx3);word-break:break-all;}
.jql-b strong{color:var(--tx2);}
.f-row{display:flex;gap:7px;margin-bottom:12px;flex-wrap:wrap;align-items:center;}
.pill{font-size:10px;font-weight:600;padding:4px 10px;border-radius:20px;border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.pill.on{background:var(--glow);border-color:rgba(79,110,247,.28);color:var(--ac2);}
table{width:100%;border-collapse:collapse;}
th{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);padding:8px 10px;text-align:left;border-bottom:1px solid var(--bd);cursor:pointer;white-space:nowrap;background:var(--sf);}
th:hover{color:var(--tx2);background:var(--sf2);}
td{padding:9px 10px;border-bottom:1px solid var(--bd);font-size:12px;color:var(--tx2);vertical-align:middle;background:var(--sf);}
tr:hover td{background:var(--sf2);}
.ik{font-family:var(--mono);color:var(--ac2);font-size:10px;white-space:nowrap;font-weight:500;}
.ism{font-weight:500;color:var(--tx);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.s-b{display:inline-block;padding:2px 7px;border-radius:3px;font-size:9px;font-weight:600;text-transform:uppercase;white-space:nowrap;}
.s-todo{background:rgba(128,128,160,.1);color:var(--tx3);}
.s-prog{background:rgba(79,110,247,.1);color:var(--ac2);}
.s-done{background:rgba(62,207,142,.1);color:var(--green);}
.p-crit{color:var(--red);font-weight:600;}.p-high{color:var(--amber);font-weight:600;}.p-med{color:var(--tx2);}.p-low{color:var(--tx3);}
.hc{font-family:var(--mono);color:var(--green);font-size:11px;font-weight:500;}
.er{font-family:var(--mono);color:var(--purple);font-size:10px;}
.tag{display:inline-block;padding:1px 5px;border-radius:3px;background:var(--sf3);border:1px solid var(--bd);font-family:var(--mono);font-size:9px;color:var(--tx3);margin:1px;}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:8px;color:var(--tx3);font-size:12px;}
.empty-i{font-size:28px;margin-bottom:4px;}

/* ── Modals — inherit theme from parent .shell ── */
.ov{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;backdrop-filter:blur(4px);animation:ovIn .15s ease;}
@keyframes ovIn{from{opacity:0}to{opacity:1}}
.mb{background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);width:100%;box-shadow:var(--shadow);animation:mbIn .18s ease;max-height:90vh;overflow-y:auto;}
@keyframes mbIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.mh{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;border-bottom:1px solid var(--bd);background:var(--sf);}
.mt{font-size:14px;font-weight:700;letter-spacing:-.1px;color:var(--tx);}
.mc{background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;padding:2px 6px;border-radius:3px;transition:var(--ease);}
.mc:hover{color:var(--tx2);background:var(--sf3);}
.mbody{padding:18px;display:flex;flex-direction:column;gap:14px;background:var(--sf);}
.mf{padding:12px 18px 16px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--bd);background:var(--sf);}
.fr{display:flex;flex-direction:column;gap:5px;}
.fr2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.fl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tx3);}
.mi{width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:7px 10px;color:var(--tx);font-family:var(--body);font-size:12px;outline:none;transition:border-color .15s;}
.mi:focus{border-color:var(--ac);}
.mi::placeholder{color:var(--tx3);}
.mi.err{border-color:var(--red);}
option{background:var(--sf2);color:var(--tx);}
.fh{font-size:10px;color:var(--tx3);}
.em{font-size:10px;color:var(--red);}
.tp{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--sf3);border-radius:var(--r);font-family:var(--mono);font-size:12px;}
.tv{color:var(--green);font-weight:500;}.tl{color:var(--tx3);}
.b-cancel{font-size:12px;font-weight:500;padding:8px 14px;border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.b-cancel:hover{background:var(--sf3);}
.b-sub{font-size:12px;font-weight:600;padding:8px 18px;border-radius:var(--r);border:none;background:var(--ac);color:#fff;cursor:pointer;transition:var(--ease);}
.b-sub:hover{background:var(--ac2);}
.b-sub:disabled{opacity:.4;cursor:not-allowed;}
.b-danger{font-size:12px;font-weight:600;padding:8px 18px;border-radius:var(--r);border:none;background:var(--red);color:#fff;cursor:pointer;transition:var(--ease);}
.ok-fl{display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(62,207,142,.08);border:1px solid rgba(62,207,142,.22);border-radius:var(--r);font-size:12px;color:var(--green);}

/* ── Password strength ── */
.pwd-meter{display:flex;gap:3px;margin-top:4px;}
.pwd-seg{height:3px;flex:1;border-radius:2px;background:var(--bd2);}
.pwd-seg.weak{background:var(--red);}
.pwd-seg.fair{background:var(--amber);}
.pwd-seg.strong{background:var(--green);}

/* ── CSV dropzone ── */
.dropzone{border:2px dashed var(--bd2);border-radius:var(--r2);padding:28px 20px;text-align:center;cursor:pointer;transition:var(--ease);background:var(--sf2);}
.dropzone:hover,.dropzone.over{border-color:var(--ac);background:var(--glow);}
.csv-preview{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;max-height:200px;overflow-y:auto;}
.csv-row{display:grid;grid-template-columns:28px 1fr 1fr 70px 1fr;font-size:11px;border-bottom:1px solid var(--bd);}
.csv-row:last-child{border-bottom:none;}
.csv-row.hdr{background:var(--sf3);font-size:9px;font-weight:700;text-transform:uppercase;color:var(--tx3);}
.csv-row.err-row{background:rgba(224,82,82,.04);}
.csv-cell{padding:7px 10px;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.csv-err-tag{font-size:9px;color:var(--red);padding:7px 10px;}

/* ── Admin layout ── */
.admin-wrap{display:flex;flex:1;overflow:hidden;background:var(--bg);}
.admin-nav{width:196px;min-width:196px;background:var(--sf);border-right:1px solid var(--bd);padding:16px 10px;display:flex;flex-direction:column;gap:4px;flex-shrink:0;}
.admin-nav-t{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3);padding:0 8px 10px;border-bottom:1px solid var(--bd);margin-bottom:6px;}
.an-btn{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:var(--r);border:1px solid transparent;background:transparent;color:var(--tx2);cursor:pointer;transition:var(--ease);font-size:12px;font-weight:500;text-align:left;}
.an-btn:hover{background:var(--sf3);color:var(--tx);}
.an-btn.active{background:var(--glow);color:var(--ac2);border-color:rgba(79,110,247,.22);}
.an-btn.active-hd{background:rgba(62,207,142,.07);color:var(--green);border-color:rgba(62,207,142,.22);}
.an-icon{font-size:14px;width:20px;text-align:center;flex-shrink:0;}
.an-badge{margin-left:auto;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;background:rgba(245,166,35,.1);color:var(--amber);}
.admin-content{flex:1;overflow-y:auto;padding:24px;background:var(--bg);}
.sec-t{font-size:18px;font-weight:700;letter-spacing:-.3px;margin-bottom:4px;color:var(--tx);}
.sec-sub{font-size:12px;color:var(--tx3);margin-bottom:20px;}
.a-card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);padding:20px;margin-bottom:16px;}
.a-ct{font-size:13px;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--bd);color:var(--tx);}
.a-form{display:flex;flex-direction:column;gap:12px;}
.a-lbl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tx3);margin-bottom:3px;}
.a-inp{width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:7px 10px;color:var(--tx);font-family:var(--mono);font-size:12px;outline:none;transition:border-color .15s;}
.a-inp:focus{border-color:var(--ac);}
.a-hint{font-size:10px;color:var(--tx3);}
.info-r{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bd);}
.info-r:last-child{border-bottom:none;}
.ik2{font-size:11px;color:var(--tx3);}
.iv{font-family:var(--mono);font-size:11px;color:var(--tx2);}
.dot-ok{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 5px var(--green);}
.saved-ok{font-size:11px;color:var(--green);display:flex;align-items:center;gap:5px;margin-top:4px;}
.users-bar{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;}
.ut{width:100%;border-collapse:collapse;}
.ut th{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);padding:10px 14px;text-align:left;border-bottom:1px solid var(--bd);background:var(--sf);}
.ut td{padding:10px 14px;border-bottom:1px solid var(--bd);font-size:12px;color:var(--tx2);background:var(--sf);}
.ut tr:hover td{background:var(--sf2);}
.act{font-size:10px;font-weight:600;padding:3px 9px;border-radius:3px;border:1px solid var(--bd);background:transparent;cursor:pointer;transition:var(--ease);margin-right:4px;}
.act-d{color:var(--red);border-color:rgba(224,82,82,.2);}.act-d:hover{background:rgba(224,82,82,.06);}
.act-a{color:var(--green);border-color:rgba(62,207,142,.2);}.act-a:hover{background:rgba(62,207,142,.06);}
.act-adm{color:var(--amber);border-color:rgba(245,166,35,.2);}.act-adm:hover{background:rgba(245,166,35,.06);}
.act-pwd{color:var(--ac2);border-color:rgba(79,110,247,.2);}.act-pwd:hover{background:var(--glow);}

/* ── HotDesk map ── */
.hd-map-wrap{display:flex;flex-direction:column;gap:12px;}
.hd-map-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
.hd-card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);padding:16px;}
.hd-legend{display:flex;gap:14px;flex-wrap:wrap;}
.hd-leg{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tx2);}
.hd-leg-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0;}
.hd-seat{cursor:pointer;transition:filter .12s;}
.hd-seat:hover{filter:brightness(1.25) drop-shadow(0 0 5px rgba(100,200,255,.3));}
.hd-sub{font-size:10px;color:var(--tx3);text-align:center;margin-top:8px;}

/* ── HotDesk monthly table ── */
.hd-table-wrap{overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);}
.hd-tbl{border-collapse:collapse;font-size:11px;width:100%;}
.hd-th{padding:9px 4px;text-align:center;border-bottom:2px solid var(--bd);background:var(--sf);color:var(--tx3);font-size:9px;font-weight:700;text-transform:uppercase;min-width:44px;white-space:nowrap;position:sticky;top:0;z-index:6;}
.hd-th.seat-col{color:var(--ac2);font-family:var(--mono);cursor:help;}
.hd-th.seat-col:hover{background:var(--sf2);}
.hd-th.date-col{position:sticky;left:0;top:0;z-index:8;background:var(--sf);text-align:left;padding-left:12px;min-width:96px;border-right:2px solid var(--bd);}
.hd-td{padding:2px;border-bottom:1px solid var(--bd);background:var(--sf);}
.hd-td.date-cell{position:sticky;left:0;z-index:4;background:var(--sf);padding:0 12px;border-right:2px solid var(--bd);white-space:nowrap;font-size:11px;height:34px;vertical-align:middle;color:var(--tx2);}
tr.hd-row-we > td.hd-td{background:var(--sf2) !important;}
tr.hd-row-today > td.hd-td{background:rgba(79,110,247,.05) !important;}
tr.hd-row-we > td.hd-td.date-cell{background:var(--sf2) !important;color:var(--tx3);}
tr.hd-row-today > td.hd-td.date-cell{background:rgba(79,110,247,.07) !important;color:var(--ac2);}
.hd-cell{cursor:pointer;border-radius:3px;height:30px;width:100%;display:flex;align-items:center;justify-content:center;transition:all .1s;}
.hd-cell:hover{filter:brightness(1.15);transform:scale(1.08);}
.hd-cell-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.hd-cell.free{background:rgba(62,207,142,.09);border:1px solid rgba(62,207,142,.32);}
.hd-cell.occ{background:rgba(79,110,247,.09);border:1px solid rgba(79,110,247,.32);}
.hd-cell.fx{background:rgba(224,82,82,.09);border:1px solid rgba(224,82,82,.32);}
.hd-cell.mine{background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.55);}
.hd-cell-dot.free{background:var(--seat-free);}
.hd-cell-dot.occ{background:var(--seat-occ);}
.hd-cell-dot.fx{background:var(--seat-fixed);}
.hd-cell-dot.mine{background:var(--amber);}
.hd-tooltip{position:fixed;z-index:9900;background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);padding:12px;box-shadow:var(--shadow);width:280px;pointer-events:none;animation:mbIn .15s ease;}
.hd-tooltip-title{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3);margin-bottom:8px;}

/* ── HotDesk admin ── */
.seat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px;}
.seat-btn{background:var(--sf2);border:2px solid var(--bd);border-radius:var(--r2);padding:10px 4px;cursor:pointer;color:var(--tx2);font-size:12px;font-weight:500;text-align:center;line-height:1.4;transition:var(--ease);}
.seat-btn:hover{border-color:var(--bd2);color:var(--tx);}
.seat-btn.sel{border-color:var(--ac);color:var(--ac2);background:var(--glow);}
.seat-btn.is-fixed{border-color:rgba(224,82,82,.4);color:var(--red);}
.seat-btn.is-occ{border-color:rgba(79,110,247,.3);color:var(--ac2);}

/* ── Mini calendar ── */
.mini-cal{user-select:none;}
.mini-day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.mini-dh{text-align:center;font-size:9px;font-weight:700;color:var(--tx3);padding:2px 0;}
.mini-day{text-align:center;border-radius:4px;padding:4px 2px;font-size:11px;cursor:pointer;border:1px solid transparent;transition:var(--ease);color:var(--tx2);}
.mini-day.dis{color:var(--tx3);opacity:.35;cursor:not-allowed;}
.mini-day.sel{background:rgba(62,207,142,.15);border-color:var(--green);color:var(--green);font-weight:700;}
.mini-day.occ{background:rgba(79,110,247,.1);border-color:rgba(79,110,247,.3);color:var(--ac2);}
.mini-day.avail:hover{background:var(--sf3);border-color:var(--bd2);}

@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}

/* ── Combobox (task search) ── */
.cb-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);box-shadow:var(--shadow);z-index:200;max-height:220px;overflow-y:auto;}
.cb-opt{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--bd);}
.cb-opt:last-child{border-bottom:none;}
.cb-opt:hover,.cb-opt.cb-sel{background:var(--glow);}
.cb-key{font-family:var(--mono);font-size:11px;color:var(--ac2);font-weight:600;min-width:72px;flex-shrink:0;}
.cb-sum{font-size:12px;color:var(--tx);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cb-prj{font-family:var(--mono);font-size:9px;color:var(--tx3);flex-shrink:0;}

/* ── Mobile sidebar drawer ── */
.sb-toggle{display:none;}
.sb-backdrop{display:none;}
@media(max-width:700px){
  .sb-toggle{display:flex;}
  .sb{
    position:fixed;left:-260px;top:0;bottom:0;width:260px;z-index:300;
    transition:left .25s cubic-bezier(.4,0,.2,1);
    box-shadow:none;
    padding-top:56px; /* clear topbar */
  }
  .sb.sb-open{left:0;box-shadow:4px 0 24px rgba(0,0,0,.5);}
  .sb-backdrop{
    display:block;position:fixed;inset:0;z-index:299;
    background:rgba(0,0,0,.45);backdrop-filter:blur(2px);
    animation:ovIn .2s ease;
  }
} */
@media(max-width:900px){
  .sb{width:200px;min-width:200px;}
  .cgrid{grid-template-columns:repeat(7,1fr);}
  .proto-tag,.u-name,.r-tag,.o-dot{display:none;}
}
@media(max-width:700px){
  .topbar{padding:0 12px;gap:6px;height:44px;}
  .logo-dot{display:none;}
  .nav-bar{padding:0 10px;gap:1px;height:36px;overflow-x:auto;}
  .n-btn{padding:4px 8px;font-size:10px;}
  .content{padding:12px;}
  .cgrid{grid-template-columns:repeat(7,1fr);}
  .cc{min-height:52px;padding:4px;}
  .chrs{font-size:13px;}
  .cdots{display:none;}
  .cal-h{gap:6px;}
  .cal-t{font-size:16px;}
  .dh{flex-direction:column;gap:10px;}
  .dn{flex-wrap:wrap;}
  .fr2{grid-template-columns:1fr;}
  .mb{max-width:100% !important;margin:0;border-radius:var(--r2) var(--r2) 0 0;position:fixed;bottom:0;left:0;right:0;max-height:92vh;}
  .ov{align-items:flex-end;padding:0;}
  .admin-nav{width:160px;min-width:160px;}
  .hd-table-wrap{font-size:10px;}
  .sw-btn{padding:4px 7px;font-size:9px;}
}
@media(max-width:480px){
  .topbar{height:40px;}
  .cal-stats{display:none;}
  .cgrid{grid-template-columns:repeat(7,1fr);}
  .cc{min-height:40px;padding:3px;}
  .cday{font-size:10px;}
  .chrs{font-size:11px;}
  .admin-wrap{flex-direction:column;}
  .admin-nav{width:100%;flex-direction:row;height:44px;overflow-x:auto;padding:6px 10px;border-right:none;border-bottom:1px solid var(--bd);}
  .admin-content{padding:14px;}
  .an-btn{padding:6px 10px;font-size:11px;white-space:nowrap;}
  .seat-grid{grid-template-columns:repeat(4,1fr);}
}
`;

// ══════════════════════════════════════════════════════════════════
// CONTEXT — App-wide state (dependency injection)
// ══════════════════════════════════════════════════════════════════

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

// ══════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ══════════════════════════════════════════════════════════════════

const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_EN   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAYS_ES   = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

function buildCalGrid(year, month) {
  const first = new Date(year,month,1), last = new Date(year,month+1,0);
  const so = (first.getDay()+6)%7, eo = (7-last.getDay())%7;
  const cells = [];
  for (let i = -so; i <= last.getDate()-1+eo; i++) {
    const d = new Date(year,month,1+i);
    cells.push({ date:d.toISOString().slice(0,10), day:d.getDate(), isCurrentMonth:d.getMonth()===month, isToday:d.toISOString().slice(0,10)===MOCK_TODAY });
  }
  return cells;
}

function formatFullDate(iso, lang) {
  const d = new Date(iso+"T00:00:00");
  const ms = lang==="es" ? MONTHS_ES : MONTHS_EN;
  if (lang==="es") {
    const dn = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    return `${dn[d.getDay()]}, ${d.getDate()} de ${ms[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
  }
  const dn = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return `${dn[d.getDay()]}, ${ms[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function makeAvatar(name) { return (name||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function daysInMonth(y,m) { return new Date(y,m+1,0).getDate(); }
function firstMonday(y,m) { return (new Date(y,m,1).getDay()+6)%7; }
function isoFromYMD(y,m,d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function fmtMonthYear(y,m,lang) { return lang==="es" ? `${MONTHS_ES[m]} ${y}` : `${MONTHS_EN[m]} ${y}`; }

// ══════════════════════════════════════════════════════════════════
// SHARED PRESENTATIONAL COMPONENTS
// ══════════════════════════════════════════════════════════════════

function PasswordStrength({ password }) {
  if (!password) return null;
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length;
  const level = score<=1?"weak":score<=3?"fair":"strong";
  const label = score<=1?"Weak":score<=3?"Fair":"Strong";
  const colors = { weak:"var(--red)", fair:"var(--amber)", strong:"var(--green)" };
  return (
    <div>
      <div className="pwd-meter">
        {[0,1,2,3].map(i=><div key={i} className={`pwd-seg ${i<score?level:""}`}/>)}
      </div>
      <div style={{fontSize:10,color:colors[level],marginTop:2}}>{label}</div>
    </div>
  );
}

function MiniCalendar({ year, month, selectedDates, onToggleDate, occupiedDates=[], minDate="" }) {
  const { lang } = useApp();
  const DAYS = lang==="es" ? DAYS_ES : DAYS_EN;
  const days = daysInMonth(year, month);
  const first = firstMonday(year, month);

  return (
    <div className="mini-cal">
      <div className="mini-day-grid">
        {DAYS.map(d => <div key={d} className="mini-dh">{d}</div>)}
        {Array.from({length:first}).map((_,i)=><div key={"e"+i}/>)}
        {Array.from({length:days},(_,i)=>i+1).map(d => {
          const iso = isoFromYMD(year, month, d);
          const dow = (new Date(iso+"T00:00:00").getDay()+6)%7;
          const isWe = dow>=5;
          const isPast = iso < MOCK_TODAY;
          const isOcc = occupiedDates.includes(iso);
          const isSel = selectedDates.includes(iso);
          const dis = isWe || isPast || isOcc;
          let cls = "mini-day ";
          if (dis) cls += "dis";
          else if (isSel) cls += "sel";
          else if (isOcc) cls += "occ";
          else cls += "avail";
          return (
            <div key={d} className={cls} onClick={() => !dis && onToggleDate(iso)}>
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// JIRA TRACKER — Log Worklog Modal
// ══════════════════════════════════════════════════════════════════

function LogWorklogModal({ initialDate, initialIssueKey, onClose, onSave, currentUser }) {
  const { t } = useApp();
  const [ik,     setIk]    = useState(initialIssueKey||"");
  const [query,  setQuery] = useState(initialIssueKey||"");
  const [open,   setOpen]  = useState(false);
  const [dt,     setDt]    = useState(initialDate||MOCK_TODAY);
  const [tr,     setTr]    = useState("");
  const [st,     setSt]    = useState("09:00");
  const [dc,     setDc]    = useState("");
  const [er,     setEr]    = useState({});
  const [ok,     setOk]    = useState(false);
  const cbRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (cbRef.current && !cbRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = query.trim()
    ? MOCK_ISSUES.filter(i =>
        i.key.toLowerCase().includes(query.toLowerCase()) ||
        i.summary.toLowerCase().includes(query.toLowerCase()))
    : MOCK_ISSUES;

  const selectIssue = issue => {
    setIk(issue.key);
    setQuery(issue.key);
    setOpen(false);
    setEr(v => ({...v, ik:null}));
  };

  const ps = TimeParser.parse(tr), tp = ps > 0 ? TimeParser.format(ps) : null;

  const validate = () => {
    const e = {};
    if (!ik)   e.ik = t("taskRequired");
    if (!dt)   e.dt = t("dateRequired");
    if (ps<=0) e.tr = t("timeInvalid");
    if (ps>86400) e.tr = t("timeExceeds");
    return e;
  };

  const submit = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setEr(errs); return; }
    const iss = MOCK_ISSUES.find(i => i.key===ik);
    setOk(true);
    setTimeout(() => {
      onSave(dt, { id:`wl-${Date.now()}`, issue:ik, summary:iss?.summary||ik, type:iss?.type||"Task",
        epic:iss?.epic||"—", epicName:iss?.epicName||"—", author:currentUser.name,
        authorId:currentUser.id, time:tp, seconds:ps, started:st,
        project:iss?.project||"—", description:dc, isNew:true });
      onClose();
    }, 750);
  };

  const si = MOCK_ISSUES.find(i => i.key===ik);
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:480}}>
        <div className="mh"><div className="mt">⏱ {t("logWorklog")}</div><button className="mc" onClick={onClose}>×</button></div>
        {ok ? <div className="mbody"><div className="ok-fl">✓ {t("savedFlash")} — {tp} · {ik} · {dt}</div></div> : (
          <>
            <div className="mbody">
              <div className="fr">
                <label className="fl">{t("taskField")}</label>
                <div ref={cbRef} style={{position:"relative"}}>
                  <input
                    className={`mi ${er.ik?"err":""}`}
                    placeholder={t("selectTask")}
                    value={query}
                    autoComplete="off"
                    onChange={e => { setQuery(e.target.value); setIk(""); setOpen(true); setEr(v=>({...v,ik:null})); }}
                    onFocus={() => setOpen(true)}
                    style={{fontFamily:"var(--mono)",fontSize:12}}
                  />
                  {open && filtered.length > 0 && (
                    <div className="cb-drop">
                      {filtered.map(i => (
                        <div key={i.key} className={`cb-opt ${i.key===ik?"cb-sel":""}`}
                          onMouseDown={e => { e.preventDefault(); selectIssue(i); }}>
                          <span className="cb-key">{i.key}</span>
                          <span className="cb-sum">{i.summary}</span>
                          <span className="cb-prj">{i.project}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {open && filtered.length === 0 && (
                    <div className="cb-drop">
                      <div style={{padding:"10px 12px",color:"var(--tx3)",fontSize:12}}>No results for "{query}"</div>
                    </div>
                  )}
                </div>
                {er.ik&&<span className="em">{er.ik}</span>}
                {si && <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                  <span className="t-pill">{si.type}</span>
                  <span className="er" style={{fontSize:10}}>{si.epic} · {si.epicName}</span>
                  <span style={{fontSize:10,color:"var(--tx3)",marginLeft:"auto"}}>{si.summary}</span>
                </div>}
              </div>
              <div className="fr2">
                <div className="fr"><label className="fl">{t("dateField")}</label><input className={`mi ${er.dt?"err":""}`} type="date" value={dt} onChange={e=>{setDt(e.target.value);setEr(v=>({...v,dt:null}));}}/>{er.dt&&<span className="em">{er.dt}</span>}</div>
                <div className="fr"><label className="fl">{t("startTime")}</label><input className="mi" type="time" value={st} onChange={e=>setSt(e.target.value)}/></div>
              </div>
              <div className="fr">
                <label className="fl">{t("timeLogged")}</label>
                <input className={`mi ${er.tr?"err":""}`} placeholder={t("timePlaceholder")} value={tr} onChange={e=>{setTr(e.target.value);setEr(v=>({...v,tr:null}));}} style={{fontFamily:"var(--mono)"}} autoFocus/>
                <span className="fh">{t("timeFormats")} <code>2h</code> · <code>1h 30m</code> · <code>45m</code> · <code>1.5</code> {t("decimalHours")}</span>
                {er.tr&&<span className="em">{er.tr}</span>}
                {tp&&!er.tr&&<div className="tp"><span className="tl">→</span><span className="tv">{tp}</span><span className="tl">({(ps/3600).toFixed(2)}h)</span></div>}
              </div>
              <div className="fr">
                <label className="fl">{t("descField")} <span style={{color:"var(--tx3)",textTransform:"none",letterSpacing:0}}>{t("descOptional")}</span></label>
                <textarea className="mi" style={{minHeight:56,resize:"vertical",fontFamily:"var(--body)",fontSize:12}} placeholder={t("descPlaceholder")} value={dc} onChange={e=>setDc(e.target.value)}/>
              </div>
            </div>
            <div className="mf">
              <button className="b-cancel" onClick={onClose}>{t("cancel")}</button>
              <button className="b-sub" onClick={submit} disabled={!ik||ps<=0}>{t("saveWorklog")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// JIRA TRACKER — Filter Sidebar
// ══════════════════════════════════════════════════════════════════

function JTFilterSidebar({ filters, onApply, onExport, mobileOpen, onMobileClose }) {
  const { t } = useApp();
  const [l, sL] = useState(filters);
  const ts = k => sL(f=>({...f, spaceKeys: f.spaceKeys.includes(k)?f.spaceKeys.filter(x=>x!==k):[...f.spaceKeys,k]}));

  return (
    <aside className={`sb ${mobileOpen?"sb-open":""}`}>
      <div className="sb-s"><div className="sb-lbl">{t("dateRange")}</div>
        <input className="fi" type="date" value={l.from} onChange={e=>sL({...l,from:e.target.value})}/>
        <input className="fi" type="date" value={l.to}   onChange={e=>sL({...l,to:e.target.value})}/>
      </div>
      <div className="sb-s"><div className="sb-lbl">{t("filterByUser")}</div>
        <select className="fi" value={l.authorId} onChange={e=>sL({...l,authorId:e.target.value})}>
          <option value="">{t("allUsers")}</option>
          {MOCK_USERS.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="sb-s">
        <div className="sb-lbl">{t("spaces")}{l.spaceKeys.length>0&&<span className="sb-cnt">({l.spaceKeys.length})</span>}</div>
        <div className="pick-l">
          {MOCK_PROJECTS.map(p=>{const on=l.spaceKeys.includes(p.key);return(
            <div key={p.key} className={`pick-i ${on?"on":""}`} onClick={()=>ts(p.key)}>
              <div className="cb">{on&&"✓"}</div><span className="kb">{p.key}</span><span>{p.name}</span>
            </div>
          );})}
        </div>
        {l.spaceKeys.length>0&&<button className="btn-g" onClick={()=>sL({...l,spaceKeys:[]})}>{t("clearSelection")}</button>}
      </div>
      <div className="sb-s"><div className="sb-lbl">{t("extraJql")}</div>
        <textarea className="fi" placeholder='priority = High' value={l.jql} onChange={e=>sL({...l,jql:e.target.value})}/>
      </div>
      <button className="btn-p" onClick={()=>onApply(l)}>{t("applyFilters")}</button>
      <button className="btn-exp" onClick={()=>onExport(l)}>{t("exportCsv")}</button>
      <div style={{fontSize:10,color:"var(--tx3)",textAlign:"center",lineHeight:1.5,marginTop:-8}}>{t("exportHint")}</div>
    </aside>
  );
}

// ══════════════════════════════════════════════════════════════════
// JIRA TRACKER — Calendar View
// ══════════════════════════════════════════════════════════════════

function CalendarView({ filters, worklogs, onDayClick, onOpenLog }) {
  const { t, lang } = useApp();
  const [yr, sYr] = useState(2026);
  const [mo, sMo] = useState(2);
  const [sel, sSel] = useState(MOCK_TODAY);

  const mFrom = `${yr}-${String(mo+1).padStart(2,"0")}-01`;
  const mTo   = `${yr}-${String(mo+1).padStart(2,"0")}-${daysInMonth(yr,mo)}`;
  const rWls  = WorklogService.filterByRange(worklogs, mFrom, mTo, filters.authorId||null);
  const aWls  = Object.values(rWls).flat();
  const totalH = TimeParser.toHours(aWls.reduce((s,w)=>s+w.seconds,0));
  const actD   = Object.keys(rWls).length;
  const cells  = buildCalGrid(yr, mo);
  const DAYS   = lang==="es" ? DAYS_ES : DAYS_EN;
  const MONTHS = lang==="es" ? MONTHS_ES : MONTHS_EN;

  const prev = ()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1);
  const next = ()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1);

  return (
    <div>
      <div className="cal-h">
        <button className="n-arr" onClick={prev}>‹</button>
        <div className="cal-t">{MONTHS[mo]} {yr}</div>
        <button className="n-arr" onClick={next}>›</button>
        <button className="btn-g" onClick={()=>{sYr(2026);sMo(2);}}>{t("today")}</button>
        <button className="btn-log" onClick={()=>onOpenLog({})}>{t("logHours")}</button>
        <div className="cal-stats">
          <div className="chip">{t("totalLabel")}: <strong>{totalH.toFixed(1)}h</strong></div>
          <div className="chip">{t("activeDays")}: <strong>{actD}</strong></div>
          {actD>0&&<div className="chip">{t("avgLabel")}: <strong>{(totalH/actD).toFixed(1)}{t("perDay")}</strong></div>}
        </div>
      </div>
      <div className="cgrid">
        {DAYS.map(d=><div key={d} className="cdh">{d}</div>)}
        {cells.map(c=>{
          const dw=rWls[c.date]||[], sec=dw.reduce((s,w)=>s+w.seconds,0), hrs=TimeParser.toHours(sec);
          const top=[...new Set(dw.map(w=>w.issue))].slice(0,2);
          return (
            <div key={c.date} className={["cc",!c.isCurrentMonth?"other":"",c.isToday?"today":"",sec>0?"has-d":"",sel===c.date?"active":""].filter(Boolean).join(" ")}
              onClick={()=>{sSel(c.date);onDayClick(c.date);}}>
              <div className="ctop">
                <div className="cday">{c.day}</div>
                <div className="cadd" onClick={e=>{e.stopPropagation();onOpenLog({date:c.date});}}>+</div>
              </div>
              {hrs>0&&<div className="chrs">{hrs.toFixed(1)}<span>h</span></div>}
              {top.length>0&&<div className="cdots">{top.map(k=><div key={k} className="cdot">{k}</div>)}{[...new Set(dw.map(w=>w.issue))].length>2&&<div style={{fontSize:9,color:"var(--tx3)"}}>+{[...new Set(dw.map(w=>w.issue))].length-2} {t("more")}</div>}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// JIRA TRACKER — Day View
// ══════════════════════════════════════════════════════════════════

function DayView({ date, filters, worklogs, onDateChange, onOpenLog, onDeleteWorklog }) {
  const { t, lang } = useApp();
  const af  = worklogs[date]||[];
  const fl  = filters.authorId ? af.filter(w=>w.authorId===filters.authorId) : af;
  const ts  = fl.reduce((s,w)=>s+w.seconds,0);
  const eps = WorklogService.groupByEpic(fl);
  const su  = MOCK_USERS.find(u=>u.id===filters.authorId);

  function addDays(iso,n){const d=new Date(iso+"T00:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}

  return (
    <div>
      <div className="dh">
        <div>
          <div className="dd">{formatFullDate(date, lang)}</div>
          <div className="dsub">{t("totalLabel")}: <strong>{TimeParser.toHours(ts).toFixed(2)}h</strong>{" · "}{fl.length} {t("worklogs")}{" · "}{[...new Set(fl.map(w=>w.issue))].length} {t("tasks")}{su&&<span style={{color:"var(--ac2)",marginLeft:8}}>· {su.name}</span>}</div>
        </div>
        <div className="dn">
          <button className="n-arr" onClick={()=>onDateChange(addDays(date,-1))}>‹</button>
          <button className="btn-g" onClick={()=>onDateChange(MOCK_TODAY)}>{t("today")}</button>
          <button className="n-arr" onClick={()=>onDateChange(addDays(date,1))}>›</button>
          <button className="btn-log" onClick={()=>onOpenLog({date})}>{t("logHours")}</button>
        </div>
      </div>
      {fl.length===0&&<div className="empty"><div className="empty-i">📭</div><div>{t("noWorklogs")}</div><div style={{fontSize:11}}>{t("noWorklogsSub")}</div><button className="btn-log" style={{marginTop:10}} onClick={()=>onOpenLog({date})}>{t("logThisDay")}</button></div>}
      {eps.map(ep=>{
        const es=ep.items.reduce((s,w)=>s+w.seconds,0);
        return(<div key={ep.key} className="eb"><div className="eh"><span className="ek">{ep.key}</span><span className="en">{ep.name}</span><span className="ehrs">{TimeParser.toHours(es).toFixed(1)}h</span></div>
          {ep.items.map(w=><div key={w.id} className={`wlc ${w.isNew?"new":""}`}><div className="wlk">{w.issue}</div><div style={{flex:1,minWidth:0}}><div className="wls">{w.summary}</div></div><div className="wlr"><div className="wlt">{w.time}</div><div className="wlm">{w.started} · {w.author}</div></div><span className="t-pill">{w.type}</span><button className="del-wl" onClick={()=>onDeleteWorklog(date,w.id)}>×</button></div>)}
        </div>);
      })}
      {fl.length>0&&<div style={{marginTop:20}}><div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--tx3)",paddingBottom:8,borderBottom:"1px solid var(--bd)",marginBottom:10}}>{t("summaryByTask")}</div><table><thead><tr><th>{t("colKey")}</th><th>{t("colSummary")}</th><th>{t("colType")}</th><th>{t("colTime")}</th></tr></thead><tbody>{[...new Set(fl.map(w=>w.issue))].map(k=>{const ws=fl.filter(w=>w.issue===k),sc=ws.reduce((s,w)=>s+w.seconds,0);return <tr key={k}><td><span className="ik">{k}</span></td><td><div className="ism">{ws[0].summary}</div></td><td><span className="t-pill">{ws[0].type}</span></td><td className="hc">{TimeParser.toHours(sc).toFixed(2)}h</td></tr>;})}</tbody></table></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// JIRA TRACKER — Tasks View
// ══════════════════════════════════════════════════════════════════

function TasksView({ filters, onOpenLog }) {
  const { t } = useApp();
  const [tf, stf] = useState([]);
  const [sr, ssr] = useState("");
  const [so, sso] = useState({key:"key",dir:"asc"});

  const jql = useMemo(()=>{
    const p=[];
    if(filters.spaceKeys.length)p.push(`project in (${filters.spaceKeys.join(",")})`);
    if(filters.authorId)p.push(`worklogAuthor="${filters.authorId}"`);
    if(filters.jql)p.push(`(${filters.jql})`);
    return(p.length?p.join(" AND "):"no filters")+" ORDER BY updated DESC";
  },[filters]);

  const issues = useMemo(()=>{
    let l=MOCK_ISSUES;
    if(filters.spaceKeys.length)l=l.filter(i=>filters.spaceKeys.includes(i.project));
    if(tf.length)l=l.filter(i=>tf.includes(i.type));
    if(sr){const q=sr.toLowerCase();l=l.filter(i=>i.key.toLowerCase().includes(q)||i.summary.toLowerCase().includes(q)||i.assignee.toLowerCase().includes(q));}
    if(filters.authorId){const u=MOCK_USERS.find(u=>u.id===filters.authorId);if(u)l=l.filter(i=>i.assignee===u.name);}
    return[...l].sort((a,b)=>{const d=so.dir==="asc"?1:-1;if(so.key==="hours")return(a.hours-b.hours)*d;return(a[so.key]??"").localeCompare(b[so.key]??"")*d;});
  },[filters,tf,sr,so]);

  const ts=k=>sso(s=>s.key===k?{...s,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"});
  const A=({k})=>so.key!==k?<span style={{fontSize:9,color:"var(--tx3)"}}>⇅</span>:<span style={{fontSize:9,color:"var(--ac2)"}}>{so.dir==="asc"?"↑":"↓"}</span>;
  const sc=s=>s==="Done"?"s-done":s==="In Progress"?"s-prog":"s-todo";
  const pc=p=>p==="Critical"?"p-crit":p==="High"?"p-high":p==="Medium"?"p-med":"p-low";
  const pt=[...new Set(MOCK_ISSUES.map(i=>i.type))];

  return(
    <div>
      <div className="tk-h"><div className="tk-t">{t("navTasks")}</div><div className="c-bdg">{issues.length}/{MOCK_ISSUES.length}</div><button className="btn-log" style={{marginLeft:"auto"}} onClick={()=>onOpenLog({})}>{t("logHours")}</button></div>
      <div className="jql-b"><strong>{t("jqlGenerated")}:</strong> {jql}</div>
      <div className="f-row"><input className="fi" style={{maxWidth:220}} type="search" placeholder={t("searchPlaceholder")} value={sr} onChange={e=>ssr(e.target.value)}/>{pt.map(ty=><button key={ty} className={`pill ${tf.includes(ty)?"on":""}`} onClick={()=>stf(f=>f.includes(ty)?f.filter(x=>x!==ty):[...f,ty])}>{ty}</button>)}{tf.length>0&&<button className="btn-g" onClick={()=>stf([])}>{t("clearFilter")}</button>}</div>
      {issues.length===0&&<div className="empty"><div className="empty-i">🔍</div><div>{t("noResults")}</div></div>}
      {issues.length>0&&<div style={{overflowX:"auto"}}><table><thead><tr><th onClick={()=>ts("key")}>{t("colKey")} <A k="key"/></th><th onClick={()=>ts("summary")}>{t("colSummary")} <A k="summary"/></th><th>{t("colType")}</th><th onClick={()=>ts("status")}>{t("colStatus")} <A k="status"/></th><th onClick={()=>ts("priority")}>{t("colPriority")} <A k="priority"/></th><th>{t("colProject")}</th><th>{t("colAssignee")}</th><th>{t("colEpic")}</th><th onClick={()=>ts("hours")}>{t("colTime")} <A k="hours"/></th><th>{t("colAction")}</th></tr></thead><tbody>{issues.map(i=><tr key={i.id}><td><span className="ik">{i.key}</span></td><td><div className="ism">{i.summary}</div><div style={{marginTop:2}}>{i.labels.slice(0,3).map(l=><span key={l} className="tag">{l}</span>)}</div></td><td><span className="t-pill">{i.type}</span></td><td><span className={`s-b ${sc(i.status)}`}>{i.status}</span></td><td><span className={pc(i.priority)}>{i.priority}</span></td><td><span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--tx3)"}}>{i.project}</span></td><td style={{fontSize:11}}>{i.assignee}</td><td><span className="er">{i.epic}</span></td><td className="hc">{i.hours>0?`${i.hours}h`:"—"}</td><td><button className="btn-log btn-log-sm" onClick={()=>onOpenLog({issueKey:i.key})}>{t("btnHours")}</button></td></tr>)}</tbody></table></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// HOTDESK — Office SVG (redesigned with theme vars)
// ══════════════════════════════════════════════════════════════════

function OfficeSVG({ hd, onSeat, highlightSeat, currentUser }) {
  const { theme } = useApp();
  // Theme-aware hex colors — SVG doesn't support CSS vars in fill with opacity suffix
  const COLORS = theme === "light"
    ? { free:"#0f9060", occ:"#4f6ef7", fixed:"#c02828", amber:"#b86800", bd:"#dcdce8", sf:"#ffffff", sf2:"#f5f5fb", sf3:"#eaeaf2", tx3:"#9494b8" }
    : { free:"#3ecf8e", occ:"#4f6ef7", fixed:"#e05252", amber:"#f5a623", bd:"#2a2a38", sf:"#141418", sf2:"#1b1b22", sf3:"#21212c", tx3:"#50506a" };

  const colOf = st => st===SeatStatus.FIXED ? COLORS.fixed : st===SeatStatus.OCCUPIED ? COLORS.occ : COLORS.free;

  return (
    <svg viewBox="0 0 640 390" style={{width:"100%",display:"block"}}>
      <rect x={8} y={8} width={624} height={374} rx={10} fill={COLORS.sf2} stroke={COLORS.bd} strokeWidth={1.5}/>
      <line x1={453} y1={10} x2={453} y2={382} stroke={COLORS.bd} strokeWidth={2}/>
      <line x1={453} y1={200} x2={632} y2={200} stroke={COLORS.bd} strokeWidth={2}/>
      <rect x={455} y={11} width={174} height={188} fill={COLORS.sf3} rx={4}/>
      <text x={542} y={88} textAnchor="middle" fill={COLORS.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>MEETING</text>
      <text x={542} y={103} textAnchor="middle" fill={COLORS.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>ROOM</text>
      <ellipse cx={542} cy={148} rx={46} ry={24} fill={COLORS.sf2} stroke={COLORS.bd} strokeWidth={1}/>
      <rect x={455} y={201} width={174} height={181} fill={COLORS.sf3} rx={4}/>
      <text x={542} y={282} textAnchor="middle" fill={COLORS.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>KITCHEN /</text>
      <text x={542} y={298} textAnchor="middle" fill={COLORS.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>RESTROOMS</text>
      <rect x={270} y={376} width={100} height={10} rx={3} fill={COLORS.sf2} stroke={COLORS.bd}/>
      <text x={320} y={384} textAnchor="middle" fill={COLORS.tx3} fontSize={8} fontWeight={700} letterSpacing={2}>▲ ENTRANCE</text>
      <rect x={52} y={58} width={165} height={107} rx={8} fill={COLORS.sf} stroke={COLORS.bd} strokeWidth={1}/>
      <rect x={239} y={58} width={165} height={107} rx={8} fill={COLORS.sf} stroke={COLORS.bd} strokeWidth={1}/>
      <rect x={52} y={260} width={345} height={48} rx={8} fill={COLORS.sf} stroke={COLORS.bd} strokeWidth={1}/>
      <text x={134} y={50} textAnchor="middle" fill={COLORS.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE A</text>
      <text x={321} y={50} textAnchor="middle" fill={COLORS.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE B</text>
      <text x={225} y={252} textAnchor="middle" fill={COLORS.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE C</text>
      {highlightSeat && SEATS.filter(s=>s.id===highlightSeat).map(s=>(
        <circle key="ring" cx={s.x} cy={s.y} r={26} fill="none" stroke={COLORS.amber} strokeWidth={2} strokeDasharray="5 3" style={{animation:"pulse 1.5s ease infinite"}}/>
      ))}
      {SEATS.map(seat => {
        const st = ReservationService.statusOf(seat.id, MOCK_TODAY, hd.fixed, hd.reservations);
        const res = ReservationService.resOf(seat.id, MOCK_TODAY, hd.reservations);
        const col = colOf(st);
        const isMine = res?.userId===currentUser.id;
        const strokeCol = isMine ? COLORS.amber : col;
        const lbl = hd.fixed[seat.id] ? hd.fixed[seat.id].split(" ")[0].slice(0,8) : res ? res.userName.split(" ")[0].slice(0,8) : "";
        return (
          <g key={seat.id} className={onSeat?"hd-seat":""} onClick={()=>onSeat&&onSeat(seat.id)}>
            {/* Seat card */}
            <rect x={seat.x-16} y={seat.y-18} width={32} height={36} rx={6}
              fill={col} fillOpacity={0.12}
              stroke={strokeCol} strokeWidth={isMine?2.2:1.5}/>
            {/* Monitor */}
            <rect x={seat.x-10} y={seat.y-6} width={20} height={9} rx={2.5}
              fill={col} fillOpacity={0.16}
              stroke={col} strokeOpacity={0.35} strokeWidth={1}/>
            {/* Chair */}
            <circle cx={seat.x} cy={seat.y-12} r={3.4}
              fill={col} fillOpacity={0.2}
              stroke={col} strokeOpacity={0.45} strokeWidth={1}/>
            {/* Seat label */}
            <text x={seat.x} y={seat.y+14} textAnchor="middle" fill={col} fontSize={8.5} fontWeight={700}>{seat.id}</text>
            {lbl&&<text x={seat.x} y={seat.y+3} textAnchor="middle" fill={col} fillOpacity={0.85} fontSize={6.5}>{lbl}</text>}
            {isMine&&<circle cx={seat.x+13} cy={seat.y-14} r={3.2} fill={COLORS.amber} stroke={COLORS.bd} strokeWidth={1}/>}
          </g>
        );
      })}
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════
// HOTDESK — Seat Tooltip (shows mini office map on column hover)
// ══════════════════════════════════════════════════════════════════

function SeatTooltip({ seatId, anchorX, anchorY, hd, currentUser }) {
  const { theme } = useApp();
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: anchorX - 140, top: anchorY + 8 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const r  = el.getBoundingClientRect();
    let left = anchorX - r.width / 2;
    let top  = anchorY + 8;
    if (left + r.width > window.innerWidth - 12) left = window.innerWidth - r.width - 12;
    if (left < 12) left = 12;
    if (top + r.height > window.innerHeight - 12) top = anchorY - r.height - 8;
    setPos({ left, top });
  }, [anchorX, anchorY]);

  return (
    <div ref={ref} className="hd-tooltip" data-theme={theme} style={{ left: pos.left, top: pos.top }}>
      <div className="hd-tooltip-title">Seat <span style={{ color:"var(--ac2)",fontFamily:"var(--mono)" }}>{seatId}</span> · today</div>
      <OfficeSVG hd={hd} onSeat={null} highlightSeat={seatId} currentUser={currentUser} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// HOTDESK — Map View
// ══════════════════════════════════════════════════════════════════

function HDMapView({ hd, onSeat, currentUser }) {
  const { t } = useApp();
  const freeCount = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.FREE).length;
  const occCount  = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.OCCUPIED).length;
  const fixCount  = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.FIXED).length;

  return (
    <div className="hd-map-wrap">
      {/* Stats bar — matches JT chip style */}
      <div className="hd-map-header">
        <div className="cal-stats" style={{marginLeft:0}}>
          <div className="chip">{t("legendFree")}: <strong style={{color:"var(--green)"}}>{freeCount}</strong></div>
          <div className="chip">{t("legendOcc")}: <strong style={{color:"var(--ac2)"}}>{occCount}</strong></div>
          <div className="chip">{t("legendFixed")}: <strong style={{color:"var(--red)"}}>{fixCount}</strong></div>
          <div className="chip">{t("seatsTotal")}: <strong>{SEATS.length}</strong></div>
        </div>
        <div className="hd-legend">
          {[[t("legendFree"),"var(--seat-free)"],[t("legendOcc"),"var(--seat-occ)"],[t("legendFixed"),"var(--seat-fixed)"]].map(([l,c])=>(
            <div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:c}}/>{l}</div>
          ))}
        </div>
      </div>
      {/* Office plan */}
      <div className="hd-card">
        <OfficeSVG hd={hd} onSeat={onSeat} currentUser={currentUser}/>
      </div>
      <div className="hd-sub">Click on a seat to reserve · <span style={{color:"var(--amber)"}}>● your reservation</span></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// HOTDESK — Monthly Table View
// ══════════════════════════════════════════════════════════════════

function HDTableView({ hd, onCell, currentUser }) {
  const { t, lang } = useApp();
  const [yr, sYr] = useState(2026);
  const [mo, sMo] = useState(2);
  const [tooltip, setTooltip] = useState(null); // { seatId, ax, ay }

  const days = daysInMonth(yr, mo);
  function isoD(d) { return `${yr}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
  const prev = ()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1);
  const next = ()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1);
  const DOW_EN = ["S","M","T","W","T","F","S"];
  const DOW_ES = ["D","L","M","X","J","V","S"];
  const DOW    = lang==="es" ? DOW_ES : DOW_EN;

  return (
    <div>
      {/* Nav header */}
      <div className="cal-h" style={{marginBottom:14}}>
        <button className="n-arr" onClick={prev}>‹</button>
        <div className="cal-t">{fmtMonthYear(yr, mo, lang)}</div>
        <button className="n-arr" onClick={next}>›</button>
        <div className="hd-legend" style={{marginLeft:"auto"}}>
          {[[t("legendFree"),"var(--seat-free)"],[t("legendOcc"),"var(--seat-occ)"],[t("legendFixed"),"var(--seat-fixed)"]].map(([l,c])=>(
            <div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:c}}/>{l}</div>
          ))}
        </div>
      </div>

      {/* Scrollable table */}
      <div className="hd-table-wrap">
        <table className="hd-tbl">
          <thead>
            <tr>
              <th className="hd-th date-col">{lang==="es"?"Fecha":"Date"}</th>
              {SEATS.map(s => {
                const st = ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations);
                const col = st===SeatStatus.FIXED ? "var(--seat-fixed)" : st===SeatStatus.OCCUPIED ? "var(--seat-occ)" : "var(--seat-free)";
                return (
                  <th key={s.id} className="hd-th seat-col"
                    onMouseEnter={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTooltip({ seatId:s.id, ax: r.left + r.width/2, ay: r.bottom });
                    }}
                    onMouseLeave={() => setTooltip(null)}>
                    <span style={{color:col}}>{s.id}</span>
                    {hd.fixed[s.id] && <div style={{fontSize:8,color:"var(--red)",marginTop:1,fontWeight:400}}>{hd.fixed[s.id].split(" ")[0]}</div>}
                    <div style={{fontSize:9,color:"var(--tx3)",marginTop:1,opacity:.5}}>🗺</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({length:days},(_,i)=>i+1).map(d => {
              const iso   = isoD(d);
              const dow   = new Date(iso+"T00:00:00").getDay();
              const isWe  = dow===0||dow===6;
              const isTod = iso===MOCK_TODAY;
              const rowCls = isWe ? "hd-row-we" : isTod ? "hd-row-today" : "";
              return (
                <tr key={d} className={rowCls}>
                  {/* Date cell */}
                  <td className={`hd-td date-cell ${isWe?"is-we":""} ${isTod?"is-today":""}`}
                    style={{color: isWe?"var(--tx3)": isTod?"var(--ac2)":"var(--tx2)", fontWeight:isTod?600:400}}>
                    {isTod && <span style={{color:"var(--ac2)",marginRight:4,fontSize:9}}>▶</span>}
                    <span style={{fontFamily:"var(--mono)",fontSize:11}}>{DOW[dow]}</span>
                    {" "}<span style={{fontFamily:"var(--mono)",fontSize:11}}>{String(d).padStart(2,"0")}</span>
                  </td>
                  {/* Seat cells */}
                  {SEATS.map(seat => {
                    const st     = ReservationService.statusOf(seat.id, iso, hd.fixed, hd.reservations);
                    const res    = ReservationService.resOf(seat.id, iso, hd.reservations);
                    const isMine = res?.userId===currentUser.id;
                    // Use CSS class names (no invalid CSS-var-with-hex-suffix)
                    const cls    = isMine ? "mine" : st===SeatStatus.FIXED ? "fx" : st===SeatStatus.OCCUPIED ? "occ" : "free";
                    return (
                      <td key={seat.id} className="hd-td">
                        {isWe ? (
                          <div style={{height:30,borderRadius:3,background:"var(--sf3)"}}/>
                        ) : (
                          <div className={`hd-cell ${cls}`}
                            onClick={() => onCell(seat.id, iso)}
                            title={st===SeatStatus.FREE?"Free":st===SeatStatus.FIXED?`Fixed: ${hd.fixed[seat.id]}`:`${res?.userName||""}`}>
                            <div className={`hd-cell-dot ${cls}`}/>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Seat tooltip — mini office map */}
      {tooltip && <SeatTooltip seatId={tooltip.seatId} anchorX={tooltip.ax} anchorY={tooltip.ay} hd={hd} currentUser={currentUser}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// HOTDESK — Reserve Modal
// ══════════════════════════════════════════════════════════════════

function HDReserveModal({ seatId, initDate, hd, onConfirm, onRelease, onClose, currentUser }) {
  const { t, lang } = useApp();
  const [yr, sYr] = useState(2026);
  const [mo, sMo] = useState(2);
  const [sel, sSel] = useState(initDate ? [initDate] : []);

  const st  = ReservationService.statusOf(seatId, initDate||MOCK_TODAY, hd.fixed, hd.reservations);
  const res = ReservationService.resOf(seatId, initDate||MOCK_TODAY, hd.reservations);
  const isMine = res?.userId === currentUser.id;
  const isFixed = st === SeatStatus.FIXED;

  const occupiedDates = hd.reservations.filter(r=>r.seatId===seatId).map(r=>r.date);

  const toggle = iso => sSel(p => p.includes(iso) ? p.filter(x=>x!==iso) : [...p, iso]);
  const prev = ()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1);
  const next = ()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1);

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:400}}>
        <div className="mh">
          <div className="mt">🪑 {isFixed ? t("hdAdminManage") : isMine ? t("hdReleaseTitle") : t("hdReserveTitle")}</div>
          <button className="mc" onClick={onClose}>×</button>
        </div>
        <div className="mbody">
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
            <div style={{fontFamily:"var(--mono)",fontWeight:700,color:"var(--ac2)",fontSize:16}}>{seatId}</div>
            <div style={{fontSize:12}}>
              {isFixed&&<div style={{color:"var(--red)"}}>{t("legendFixed")}: {hd.fixed[seatId]}</div>}
              {!isFixed&&res&&<div style={{color:"var(--ac2)"}}>{t("legendOcc")}: {res.userName}</div>}
              {!isFixed&&!res&&<div style={{color:"var(--green)"}}>{t("legendFree")}</div>}
            </div>
          </div>

          {isMine && (
            <div>
              <div style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>{t("hdReleaseQ")}</div>
              <button className="b-danger" style={{width:"100%"}} onClick={()=>onRelease(seatId,initDate||MOCK_TODAY)}>{t("hdReleaseBtn")}</button>
            </div>
          )}

          {!isFixed && !isMine && (
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <button className="n-arr" onClick={prev}>‹</button>
                <span style={{fontSize:12,fontWeight:600,color:"var(--ac2)"}}>{fmtMonthYear(yr,mo,lang)}</span>
                <button className="n-arr" onClick={next}>›</button>
              </div>
              <MiniCalendar year={yr} month={mo} selectedDates={sel} onToggleDate={toggle} occupiedDates={occupiedDates}/>
              {sel.length>0&&<div style={{fontSize:11,color:"var(--green)",background:"rgba(62,207,142,.07)",border:"1px solid rgba(62,207,142,.2)",borderRadius:"var(--r)",padding:"6px 10px"}}>{t("hdSelectDates")}: {sel.sort().join(", ")}</div>}
            </>
          )}
        </div>
        {!isMine && !isFixed && (
          <div className="mf">
            <button className="b-cancel" onClick={onClose}>{t("cancel")}</button>
            <button className="b-sub" onClick={()=>onConfirm(seatId,sel)} disabled={sel.length===0}>{t("hdConfirm")} {sel.length>0&&`(${sel.length})`}</button>
          </div>
        )}
        {(isMine||isFixed) && <div className="mf"><button className="b-cancel" onClick={onClose}>{t("cancel")}</button></div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ADMIN — Settings Module
// ══════════════════════════════════════════════════════════════════

function AdminSettings() {
  const { t } = useApp();
  const [jiraUrl,  setJiraUrl]  = useState("https://my-company.atlassian.net");
  const [email,    setEmail]    = useState("admin@company.com");
  const [token,    setToken]    = useState("ATatt3xFfGF04P8R...");
  const [saved,    setSaved]    = useState(false);
  const [showTok,  setShowTok]  = useState(false);
  const handleSave = () => { setSaved(true); setTimeout(()=>setSaved(false),2500); };
  return (
    <div>
      <div className="sec-t">{t("settingsTitle")}</div>
      <div className="sec-sub">Configure the connection to your Jira Cloud instance and global preferences.</div>
      <div className="a-card">
        <div className="a-ct">🔗 {t("jiraConnection")}</div>
        <div className="a-form">
          <div><div className="a-lbl">{t("jiraUrl")}</div><input className="a-inp" value={jiraUrl} onChange={e=>setJiraUrl(e.target.value)}/></div>
          <div><div className="a-lbl">{t("jiraEmail")}</div><input className="a-inp" type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div>
            <div className="a-lbl">{t("apiToken")}</div>
            <div style={{display:"flex",gap:6}}>
              <input className="a-inp" type={showTok?"text":"password"} value={token} onChange={e=>setToken(e.target.value)} style={{flex:1}}/>
              <button className="btn-g" onClick={()=>setShowTok(s=>!s)} style={{padding:"0 10px",flexShrink:0}}>{showTok?t("hideToken"):t("showToken")}</button>
            </div>
            <div className="a-hint">{t("tokenHint")}</div>
          </div>
          <button className="btn-p" onClick={handleSave}>{t("saveConfig")}</button>
          {saved&&<div className="saved-ok"><span className="dot-ok"/>✓ {t("savedOk")}</div>}
        </div>
      </div>
      <div className="a-card">
        <div className="a-ct">📡 Connection status</div>
        <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"10px 14px"}}>
          <div className="info-r"><span className="ik2">{t("connStatus")}</span><div style={{display:"flex",alignItems:"center",gap:5}}><div className="dot-ok"/><span className="iv" style={{color:"var(--green)"}}>{t("connected")}</span></div></div>
          <div className="info-r"><span className="ik2">{t("connInstance")}</span><span className="iv">my-company.atlassian.net</span></div>
          <div className="info-r"><span className="ik2">{t("connProjects")}</span><span className="iv">4</span></div>
          <div className="info-r" style={{border:"none"}}><span className="ik2">{t("connLastSync")}</span><span className="iv">{t("minsAgo")}</span></div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ADMIN — Add User Modal
// ══════════════════════════════════════════════════════════════════

function AddUserModal({ existingUsers, onClose, onSave }) {
  const { t } = useApp();
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
    if (!name.trim())                              e.name  = t("errNameRequired");
    if (!email.trim())                             e.email = t("errEmailRequired");
    else if (!isValidEmail(email))                 e.email = t("errEmailInvalid");
    else if (existEmails.includes(email.toLowerCase())) e.email = t("errEmailExists");
    if (pwd.length < 8)                            e.pwd   = t("errPasswordShort");
    if (pwd !== conf)                              e.conf  = t("errPasswordMatch");
    return e;
  };

  const submit = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setEr(errs); return; }
    setDone(true);
    setTimeout(() => {
      onSave({ id:`u-${Date.now()}`, name:name.trim(), email:email.toLowerCase().trim(), avatar:makeAvatar(name), role, deskType:desk, active:true });
      onClose();
    }, 750);
  };

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:490}}>
        <div className="mh"><div className="mt">👤 {t("addUserBtn")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {t("userAdded")}</div></div>:(
          <>
            <div className="mbody">
              <div className="fr"><label className="fl">{t("fieldName")}</label><input className={`mi ${er.name?"err":""}`} placeholder="John Smith" value={name} onChange={e=>{setName(e.target.value);setEr(v=>({...v,name:null}));}} autoFocus/>{er.name&&<span className="em">{er.name}</span>}</div>
              <div className="fr2">
                <div className="fr"><label className="fl">{t("fieldEmail")}</label><input className={`mi ${er.email?"err":""}`} type="email" placeholder="john@co.com" value={email} onChange={e=>{setEmail(e.target.value);setEr(v=>({...v,email:null}));}}/>{er.email&&<span className="em">{er.email}</span>}</div>
                <div className="fr"><label className="fl">{t("fieldRole")}</label><select className="mi" value={role} onChange={e=>setRole(e.target.value)}><option value="user">{t("roleUser")}</option><option value="admin">{t("roleAdmin")}</option></select></div>
              </div>
              <div className="fr"><label className="fl">{t("fieldDeskType")}</label>
                <div style={{display:"flex",gap:4}}>
                  {[[DeskType.NONE,t("deskNone")],[DeskType.HOTDESK,t("deskHotdesk")],[DeskType.FIXED,t("deskFixed")]].map(([v,l])=>(
                    <button key={v} onClick={()=>setDesk(v)} style={{flex:1,padding:"6px",borderRadius:"var(--r)",border:`1px solid ${desk===v?"var(--ac)":"var(--bd)"}`,background:desk===v?"var(--glow)":"var(--sf2)",color:desk===v?"var(--ac2)":"var(--tx2)",cursor:"pointer",fontSize:11,fontWeight:desk===v?600:400,transition:"var(--ease)"}}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="fr"><label className="fl">{t("fieldPassword")}</label>
                <div style={{display:"flex",gap:6}}><input className={`mi ${er.pwd?"err":""}`} type={show?"text":"password"} placeholder="········" style={{flex:1}} value={pwd} onChange={e=>{setPwd(e.target.value);setEr(v=>({...v,pwd:null}));}}/><button className="btn-g" onClick={()=>setShow(s=>!s)} style={{flexShrink:0,padding:"0 10px"}}>{show?"🙈":"👁"}</button></div>
                <PasswordStrength password={pwd}/>
                {er.pwd&&<span className="em">{er.pwd}</span>}
              </div>
              <div className="fr"><label className="fl">{t("fieldConfirm")}</label><input className={`mi ${er.conf?"err":""}`} type={show?"text":"password"} placeholder="········" value={conf} onChange={e=>{setConf(e.target.value);setEr(v=>({...v,conf:null}));}}/>{er.conf&&<span className="em">{er.conf}</span>}</div>
            </div>
            <div className="mf"><button className="b-cancel" onClick={onClose}>{t("cancel")}</button><button className="b-sub" onClick={submit}>{t("saveUser")}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ADMIN — Change Password Modal
// ══════════════════════════════════════════════════════════════════

function ChangePasswordModal({ user, onClose }) {
  const { t } = useApp();
  const [pwd,  setPwd]  = useState("");
  const [conf, setConf] = useState("");
  const [show, setShow] = useState(false);
  const [er,   setEr]   = useState({});
  const [done, setDone] = useState(false);

  const validate = () => {
    const e = {};
    if (pwd.length<8)   e.pwd  = t("errPasswordShort");
    if (pwd!==conf)     e.conf = t("errPasswordMatch");
    return e;
  };
  const submit = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setEr(errs); return; }
    setDone(true);
    setTimeout(() => onClose(), 850);
  };

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:420}}>
        <div className="mh"><div className="mt">🔑 {t("changePassword")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {t("passwordChanged")}</div></div>:(
          <>
            <div className="mbody">
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
                <div className="avatar" style={{width:30,height:30,fontSize:10,flexShrink:0}}>{user.avatar}</div>
                <div><div style={{fontWeight:600}}>{user.name}</div><div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--tx3)"}}>{user.email}</div></div>
              </div>
              <div className="fr"><label className="fl">{t("newPassword")}</label><div style={{display:"flex",gap:6}}><input className={`mi ${er.pwd?"err":""}`} type={show?"text":"password"} placeholder="········" style={{flex:1}} autoFocus value={pwd} onChange={e=>{setPwd(e.target.value);setEr(v=>({...v,pwd:null}));}}/><button className="btn-g" onClick={()=>setShow(s=>!s)} style={{flexShrink:0,padding:"0 10px"}}>{show?"🙈":"👁"}</button></div><PasswordStrength password={pwd}/>{er.pwd&&<span className="em">{er.pwd}</span>}</div>
              <div className="fr"><label className="fl">{t("confirmPassword")}</label><input className={`mi ${er.conf?"err":""}`} type={show?"text":"password"} placeholder="········" value={conf} onChange={e=>{setConf(e.target.value);setEr(v=>({...v,conf:null}));}}/>{er.conf&&<span className="em">{er.conf}</span>}</div>
            </div>
            <div className="mf"><button className="b-cancel" onClick={onClose}>{t("cancel")}</button><button className="b-sub" onClick={submit}>{t("updatePassword")}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ADMIN — CSV Import Modal
// ══════════════════════════════════════════════════════════════════

function CsvImportModal({ existingUsers, onClose, onImport }) {
  const { t } = useApp();
  const fileRef = useRef(null);
  const [drag,  setDrag]  = useState(false);
  const [parsed,setParsed]= useState(null);
  const [done,  setDone]  = useState(false);
  const [cnt,   setCnt]   = useState(0);

  const existEmails = existingUsers.map(u=>u.email.toLowerCase());
  const process = file => {
    if(!file||!file.name.endsWith(".csv"))return;
    const r=new FileReader();r.onload=e=>setParsed(CsvService.parseUsers(e.target.result,existEmails));r.readAsText(file);
  };
  const validRows = parsed?.rows.filter(r=>r.valid)??[];

  const handleImport = () => {
    const users = validRows.map(r=>({ id:`u-csv-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, name:r.name, email:r.email.toLowerCase(), avatar:makeAvatar(r.name), role:r.role, deskType:DeskType.NONE, active:true }));
    setCnt(users.length); setDone(true);
    setTimeout(()=>{ onImport(users); onClose(); }, 900);
  };

  const downloadTpl = () => {
    const blob=new Blob(["name,email,role\nJohn Smith,john@co.com,user\n"],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="users_template.csv";a.click();
  };

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:580}}>
        <div className="mh"><div className="mt">📋 {t("csvImportTitle")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {cnt} {t("csvImportDone")}</div></div>:(
          <>
            <div className="mbody">
              {!parsed&&(
                <>
                  <div className={`dropzone ${drag?"over":""}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files[0]);}} onClick={()=>fileRef.current?.click()}>
                    <div style={{fontSize:26,marginBottom:8}}>📂</div>
                    <div style={{fontSize:12,color:"var(--tx2)",fontWeight:500,marginBottom:4}}>{t("csvDropzone")}</div>
                    <div style={{fontSize:10,color:"var(--tx3)"}}>CSV only</div>
                    <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>process(e.target.files[0])}/>
                  </div>
                  <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"10px 14px"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--tx3)",marginBottom:4,textTransform:"uppercase",letterSpacing:".08em"}}>{t("csvFormat")}</div>
                    <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--tx2)"}}>name, email, role</div>
                    <div style={{fontSize:10,color:"var(--tx3)",marginTop:2}}>{t("csvFormatHint")}</div>
                  </div>
                  <button className="btn-g" style={{alignSelf:"flex-start"}} onClick={downloadTpl}>↓ {t("csvDownloadTemplate")}</button>
                </>
              )}
              {parsed&&(
                <>
                  <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"var(--tx2)"}}><strong>{parsed.rows.length}</strong> {t("csvRows")}</span>
                    <span style={{fontSize:11,color:parsed.errorCount>0?"var(--amber)":"var(--tx2)"}}><strong>{parsed.errorCount}</strong> {t("csvErrors")}</span>
                    <span style={{fontSize:11,color:"var(--green)"}}><strong>{validRows.length}</strong> ready</span>
                    <button className="btn-g" style={{marginLeft:"auto",fontSize:10}} onClick={()=>setParsed(null)}>↩ Change</button>
                  </div>
                  <div className="csv-preview">
                    <div className="csv-row hdr"><div className="csv-cell">#</div><div className="csv-cell">Name</div><div className="csv-cell">Email</div><div className="csv-cell">Role</div><div className="csv-cell">Status</div></div>
                    {parsed.rows.map(r=>(
                      <div key={r.idx} className={`csv-row ${!r.valid?"err-row":""}`}>
                        <div className="csv-cell" style={{color:"var(--tx3)"}}>{r.idx}</div>
                        <div className="csv-cell">{r.name||"—"}</div>
                        <div className="csv-cell">{r.email||"—"}</div>
                        <div className="csv-cell"><span className="r-tag r-user">{r.role}</span></div>
                        <div className="csv-err-tag">{r.valid?<span style={{color:"var(--green)"}}>✓ OK</span>:r.errors.join(" · ")}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="mf"><button className="b-cancel" onClick={onClose}>{t("csvCancel")}</button>{parsed&&<button className="b-sub" onClick={handleImport} disabled={validRows.length===0}>{t("csvImport")} ({validRows.length})</button>}</div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ADMIN — Unified Users Module (used by both JT and HD)
// ══════════════════════════════════════════════════════════════════

function AdminUsers({ users, setUsers, currentUser }) {
  const { t } = useApp();
  const [modal, setModal] = useState(null);

  const toggleRole   = id => setUsers(us=>us.map(u=>u.id===id?{...u,role:u.role==="admin"?"user":"admin"}:u));
  const toggleAccess = id => setUsers(us=>us.map(u=>u.id===id?{...u,active:!u.active}:u));
  const changeDeskType = (id, dt) => setUsers(us=>us.map(u=>u.id===id?{...u,deskType:dt}:u));
  const handleAdd    = u  => setUsers(us=>[...us,u]);
  const handleImport = us => setUsers(prev=>[...prev,...us]);

  const DESK_COLORS = { [DeskType.NONE]:"var(--tx3)", [DeskType.HOTDESK]:"var(--ac2)", [DeskType.FIXED]:"var(--red)" };
  const DESK_LABELS = { [DeskType.NONE]:"—", [DeskType.HOTDESK]:"HD", [DeskType.FIXED]:"FX" };

  return (
    <div>
      <div className="sec-t">{t("usersTitle")}</div>
      <div className="sec-sub">{users.length} {t("usersSynced")}. Manage roles, desk assignments, and access.</div>
      <div className="users-bar">
        <button className="btn-p" style={{width:"auto",padding:"7px 14px"}} onClick={()=>setModal("add")}>{t("addUserBtn")}</button>
        <button className="btn-exp" style={{width:"auto",padding:"7px 14px"}} onClick={()=>setModal("csv")}>{t("importCsvBtn")}</button>
      </div>
      <div className="a-card" style={{padding:0,overflow:"hidden"}}>
        <table className="ut">
          <thead><tr>
            <th>{t("colUser")}</th><th>{t("colEmail")}</th>
            <th>{t("colRole")}</th><th>{t("colDeskType")}</th>
            <th>{t("colAccess")}</th><th>{t("colActions")}</th>
          </tr></thead>
          <tbody>
            {users.map(u=>(
              <tr key={u.id}>
                <td><div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div className="avatar" style={{width:26,height:26,fontSize:9,flexShrink:0}}>{u.avatar}</div>
                  <span style={{fontWeight:500}}>{u.name}</span>
                  {u.id===currentUser.id&&<span style={{fontSize:9,color:"var(--tx3)"}}>{t("you")}</span>}
                </div></td>
                <td style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--tx3)"}}>{u.email}</td>
                <td><span className={`r-tag ${u.role==="admin"?"r-admin":"r-user"}`}>{u.role==="admin"?t("roleAdmin"):t("roleUser")}</span></td>
                <td>
                  {/* Desk type inline selector */}
                  <div style={{display:"flex",gap:3}}>
                    {[DeskType.NONE, DeskType.HOTDESK, DeskType.FIXED].map(dt=>(
                      <button key={dt} onClick={()=>changeDeskType(u.id,dt)}
                        style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,border:`1px solid ${u.deskType===dt?DESK_COLORS[dt]:"var(--bd)"}`,background:u.deskType===dt?`${DESK_COLORS[dt]}15`:"transparent",color:u.deskType===dt?DESK_COLORS[dt]:"var(--tx3)",cursor:"pointer",transition:"var(--ease)"}}>
                        {DESK_LABELS[dt]}
                      </button>
                    ))}
                  </div>
                </td>
                <td><span style={{fontSize:11,fontWeight:500,color:u.active?"var(--green)":"var(--red)"}}>{u.active?t("statusActive"):t("statusBlocked")}</span></td>
                <td>
                  <button className="act act-adm" onClick={()=>toggleRole(u.id)}>{u.role==="admin"?t("removeAdmin"):t("makeAdmin")}</button>
                  <button className="act act-pwd" onClick={()=>setModal({type:"pwd",user:u})}>{t("changePwdBtn")}</button>
                  {u.id!==currentUser.id&&<button className={`act ${u.active?"act-d":"act-a"}`} onClick={()=>toggleAccess(u.id)}>{u.active?t("blockUser"):t("unblockUser")}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal==="add"&&<AddUserModal existingUsers={users} onClose={()=>setModal(null)} onSave={handleAdd}/>}
      {modal==="csv"&&<CsvImportModal existingUsers={users} onClose={()=>setModal(null)} onImport={handleImport}/>}
      {modal?.type==="pwd"&&<ChangePasswordModal user={modal.user} onClose={()=>setModal(null)}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ADMIN — HotDesk Configuration Module
// ══════════════════════════════════════════════════════════════════

function AdminHotDesk({ hd, setHd, users }) {
  const { t } = useApp();
  const [selSeat, setSelSeat] = useState(null);
  const [selUser, setSelUser] = useState("");
  const [asFixed, setAsFixed] = useState(false);
  const [yr, sYr] = useState(2026);
  const [mo, sMo] = useState(2);
  const [selDates, setSelDates] = useState([]);

  const hotdeskUsers = users.filter(u => u.deskType===DeskType.HOTDESK || u.deskType===DeskType.FIXED);

  const confirmAssign = () => {
    if (!selSeat || !selUser) return;
    if (asFixed) {
      setHd(h=>({ ...h, fixed:{ ...h.fixed, [selSeat]:selUser }, reservations:h.reservations.filter(r=>r.seatId!==selSeat) }));
    } else {
      if (!selDates.length) return;
      const usr = users.find(u=>u.id===selUser);
      setHd(h=>({ ...h, reservations:[ ...h.reservations.filter(r=>!selDates.includes(r.date)||r.seatId!==selSeat), ...selDates.map(date=>({seatId:selSeat,date,userId:selUser,userName:usr?.name||selUser})) ]}));
    }
    setSelSeat(null); setSelUser(""); setSelDates([]); setAsFixed(false);
  };

  const removeFixed = sid => setHd(h=>{ const f={...h.fixed}; delete f[sid]; return {...h,fixed:f}; });

  const occupiedForSeat = selSeat ? hd.reservations.filter(r=>r.seatId===selSeat).map(r=>r.date) : [];

  return (
    <div>
      <div className="sec-t">{t("hotdeskTitle")}</div>
      <div className="sec-sub">Manage seat assignments and fixed allocations for your team.</div>

      <div style={{display:"grid",gridTemplateColumns:"minmax(200px,280px) 1fr",gap:20,alignItems:"start"}}>
        {/* Left: seat selector */}
        <div>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--tx3)",marginBottom:10}}>SELECT SEAT</div>
          <div className="seat-grid">
            {SEATS.map(seat=>{
              const st=ReservationService.statusOf(seat.id,MOCK_TODAY,hd.fixed,hd.reservations);
              const isSel=selSeat===seat.id;
              return(
                <button key={seat.id} className={`seat-btn ${isSel?"sel":st===SeatStatus.FIXED?"is-fixed":st===SeatStatus.OCCUPIED?"is-occ":""}`} onClick={()=>{setSelSeat(seat.id);setSelDates([]);setSelUser("");setAsFixed(false);}}>
                  {seat.id}
                  {hd.fixed[seat.id]&&<div style={{fontSize:9,color:"var(--red)",marginTop:2}}>{hd.fixed[seat.id].split(" ")[0]}</div>}
                </button>
              );
            })}
          </div>
          {/* Fixed seats list */}
          {Object.keys(hd.fixed).length>0&&(
            <div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--tx3)",marginBottom:8}}>{t("fixedSeats")}</div>
              {Object.entries(hd.fixed).map(([sid,uname])=>(
                <div key={sid} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"var(--sf2)",border:"1px solid rgba(224,82,82,.2)",borderRadius:"var(--r)",marginBottom:4}}>
                  <span style={{fontFamily:"var(--mono)",color:"var(--red)",fontWeight:700,fontSize:12,minWidth:32}}>{sid}</span>
                  <span style={{flex:1,fontSize:12,color:"var(--tx2)"}}>{uname}</span>
                  <button onClick={()=>removeFixed(sid)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:13,padding:"2px 4px",borderRadius:3}} onMouseOver={e=>e.currentTarget.style.color="var(--red)"} onMouseOut={e=>e.currentTarget.style.color="var(--tx3)"}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: configure selected seat */}
        {selSeat ? (
          <div className="a-card" style={{marginBottom:0}}>
            <div className="a-ct">🪑 {t("assignSeat")} — <span style={{color:"var(--ac2)",fontFamily:"var(--mono)"}}>{selSeat}</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div className="a-lbl" style={{marginBottom:6}}>{t("assignTo")}</div>
                <select className="a-inp" value={selUser} onChange={e=>setSelUser(e.target.value)} style={{cursor:"pointer"}}>
                  <option value="">— Select user —</option>
                  {hotdeskUsers.map(u=><option key={u.id} value={u.id}>{u.name} ({u.deskType})</option>)}
                </select>
              </div>
              {/* Fixed toggle */}
              <div onClick={()=>setAsFixed(f=>!f)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--sf2)",borderRadius:"var(--r)",border:`1px solid ${asFixed?"rgba(224,82,82,.3)":"var(--bd)"}`,cursor:"pointer"}}>
                <div style={{width:16,height:16,borderRadius:3,background:asFixed?"var(--red)":"transparent",border:`2px solid ${asFixed?"var(--red)":"var(--bd2)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {asFixed&&<span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}
                </div>
                <div>
                  <div style={{fontSize:12,color:asFixed?"var(--red)":"var(--tx2)",fontWeight:asFixed?600:400}}>📌 {t("asFixed")}</div>
                  <div style={{fontSize:10,color:"var(--tx3)",marginTop:1}}>{t("asFixedHint")}</div>
                </div>
              </div>
              {/* Mini calendar for date selection */}
              {!asFixed&&(
                <div>
                  <div className="a-lbl" style={{marginBottom:8}}>{t("hdSelectDates")}</div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <button className="n-arr" onClick={()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1)}>‹</button>
                    <span style={{fontSize:12,fontWeight:600,color:"var(--ac2)"}}>{fmtMonthYear(yr,mo,"en")}</span>
                    <button className="n-arr" onClick={()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1)}>›</button>
                  </div>
                  <MiniCalendar year={yr} month={mo} selectedDates={selDates} onToggleDate={d=>setSelDates(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d])} occupiedDates={occupiedForSeat}/>
                  {selDates.length>0&&<div style={{fontSize:10,color:"var(--green)",marginTop:8}}>{selDates.length} date{selDates.length!==1?"s":""} selected</div>}
                </div>
              )}
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="b-cancel" onClick={()=>{setSelSeat(null);setSelUser("");setSelDates([]);}}>{t("cancel")}</button>
                <button className="b-sub" onClick={confirmAssign} disabled={!selUser||((!asFixed)&&selDates.length===0)}>
                  {asFixed?"📌 "+t("confirmAssign"):t("confirmAssign")+" ("+selDates.length+")"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--r2)",padding:32,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx3)",fontSize:13,minHeight:200}}>
            ← {t("selectSeat")}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ADMIN SHELL — Unified sidebar + module router
// ══════════════════════════════════════════════════════════════════

function AdminShell({ users, setUsers, hd, setHd, currentUser }) {
  const { t } = useApp();
  const [mod, setMod] = useState("settings");

  const NAV = [
    { id:"settings", icon:"⚙",  label:t("adminSettings") },
    { id:"users",    icon:"👥", label:t("adminUsers"),   badge:"Admin" },
    { id:"hotdesk",  icon:"🪑", label:t("adminHotDesk"), hd:true },
  ];

  return (
    <div className="admin-wrap">
      <nav className="admin-nav">
        <div className="admin-nav-t">{t("adminSidebar")}</div>
        {NAV.map(item=>(
          <button key={item.id} className={`an-btn ${mod===item.id ? (item.hd?"active-hd":"active") : ""}`} onClick={()=>setMod(item.id)}>
            <span className="an-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge&&<span className="an-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="admin-content">
        {mod==="settings" && <AdminSettings/>}
        {mod==="users"    && <AdminUsers users={users} setUsers={setUsers} currentUser={currentUser}/>}
        {mod==="hotdesk"  && <AdminHotDesk hd={hd} setHd={setHd} users={users}/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// ROOT COMPONENT — Connected to Supabase
// ══════════════════════════════════════════════════════════════════

export default function WorkSuiteApp() {
  const { user: authUser, logout } = useAuth();

  // ── Infrastructure state ──────────────────────────────────────
  const [lang,  setLang]  = useState("en");
  const [theme, setTheme] = useState("dark");
  const [mod,   setMod]   = useState("jt");

  // ── Data loading state ────────────────────────────────────────
  const [loadingData, setLoadingData] = useState(true);

  // ── Jira Tracker state ────────────────────────────────────────
  const [activeDay, setActiveDay] = useState(TODAY);
  const [filters,   setFilters]   = useState({
    from: TODAY.slice(0, 7) + '-01',
    to:   TODAY.slice(0, 7) + '-' + new Date(parseInt(TODAY.slice(0,4)), parseInt(TODAY.slice(5,7)), 0).getDate().toString().padStart(2,'0'),
    authorId: '', spaceKeys: [], jql: ''
  });
  const [worklogs,  setWorklogs]  = useState({});
  const [logModal,  setLogModal]  = useState(null);

  // ── HotDesk state ─────────────────────────────────────────────
  const [hd,        setHd]        = useState({ fixed: {}, reservations: [] });
  const [hdModal,   setHdModal]   = useState(null);
  const [toast,     setToast]     = useState(null);

  // ── Shared state ──────────────────────────────────────────────
  const [users,  setUsers]   = useState([]);
  const [view,   setView]    = useState("calendar");
  const [sbOpen, setSbOpen]  = useState(false);

  // ── Build CURRENT_USER from auth ──────────────────────────────
  const CURRENT_USER = authUser ? {
    id:       authUser.id,
    name:     authUser.name,
    email:    authUser.email,
    avatar:   authUser.avatar || (authUser.name || 'U').slice(0,2).toUpperCase(),
    role:     authUser.role,
    deskType: authUser.desk_type || 'hotdesk',
    active:   authUser.active !== false,
  } : { id: '', name: 'Loading...', email: '', avatar: '..', role: 'user', deskType: 'hotdesk', active: true };

  // ── Load initial data from Supabase ──────────────────────────
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;

    async function loadAll() {
      setLoadingData(true);
      try {
        const [wlRes, usersRes, seatsRes, resRes, fixedRes] = await Promise.all([
          supabase.from('worklogs').select('*').order('date', { ascending: false }),
          supabase.from('users').select('*').order('name'),
          supabase.from('seats').select('*').order('id'),
          supabase.from('seat_reservations').select('*'),
          supabase.from('fixed_assignments').select('*'),
        ]);

        if (cancelled) return;

        if (wlRes.data) setWorklogs(worklogsArrayToMap(wlRes.data));
        if (usersRes.data) setUsers(usersRes.data.map(u => ({
          id: u.id, name: u.name, email: u.email,
          avatar: u.avatar || u.name.slice(0,2).toUpperCase(),
          role: u.role, deskType: u.desk_type, active: u.active,
        })));

        // Build HD state
        const fixed = {};
        (fixedRes.data ?? []).forEach(fa => { fixed[fa.seat_id] = fa.user_name; });
        const reservations = (resRes.data ?? []).map(r => ({
          seatId: r.seat_id, date: r.date.slice(0,10),
          userId: r.user_id, userName: r.user_name,
        }));
        setHd({ fixed, reservations });

        // Update SEATS if DB returns different coords
        if (seatsRes.data?.length) {
          seatsRes.data.forEach(s => {
            const seat = SEATS.find(ss => ss.id === s.id);
            if (seat) { seat.x = s.x; seat.y = s.y; }
          });
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  // ── Translation function ──────────────────────────────────────
  const t = useCallback(k => TRANSLATIONS[lang]?.[k] ?? TRANSLATIONS.en[k] ?? k, [lang]);

  // ── JiraTracker use cases ─────────────────────────────────────
  const activeDayRef = useRef(activeDay);
  useEffect(() => { activeDayRef.current = activeDay; }, [activeDay]);

  const openLogModal = useCallback(({ date, issueKey } = {}) => {
    setLogModal({ date: date || activeDayRef.current, issueKey: issueKey || '' });
  }, []);

  const handleSaveWorklog = useCallback(async (date, wl) => {
    // Optimistic update
    setWorklogs(p => ({ ...p, [date]: [...(p[date] || []), wl] }));
    // Persist to Supabase
    try {
      const { error } = await supabase.from('worklogs').insert({
        id:            wl.id,
        issue_key:     wl.issue,
        issue_summary: wl.summary,
        issue_type:    wl.type,
        epic_key:      wl.epic,
        epic_name:     wl.epicName,
        project_key:   wl.project,
        author_id:     CURRENT_USER.id,
        author_name:   CURRENT_USER.name,
        date:          date,
        started_at:    wl.started,
        seconds:       wl.seconds,
        description:   wl.description || '',
      });
      if (error) console.error('Save worklog error:', error.message);
    } catch (err) {
      console.error('Save worklog failed:', err);
    }
  }, [CURRENT_USER.id, CURRENT_USER.name]);

  const handleDeleteWorklog = useCallback(async (date, id) => {
    // Optimistic update
    setWorklogs(p => {
      const u = (p[date] || []).filter(w => w.id !== id);
      if (!u.length) { const { [date]: _, ...r } = p; return r; }
      return { ...p, [date]: u };
    });
    // Delete from Supabase
    try {
      const { error } = await supabase.from('worklogs').delete().eq('id', id);
      if (error) console.error('Delete worklog error:', error.message);
    } catch (err) {
      console.error('Delete worklog failed:', err);
    }
  }, []);

  const handleExport = f => CsvService.exportWorklogs(worklogs, f.from, f.to, f.authorId || null, f.spaceKeys);
  const handleDayClick = d => { setActiveDay(d); setView('day'); };

  // ── HotDesk use cases ─────────────────────────────────────────
  const notify = msg => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleHdSeatClick = (seatId, date = TODAY) => {
    const st = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations);
    if (st === SeatStatus.FIXED) { notify(t('hdNoReserve')); return; }
    const res = ReservationService.resOf(seatId, date, hd.reservations);
    if (st === SeatStatus.OCCUPIED && res?.userId !== CURRENT_USER.id) { notify(t('hdAlreadyOcc')); return; }
    setHdModal({ seatId, date });
  };

  const handleHdConfirm = async (seatId, dates) => {
    if (!dates.length) return;
    // Optimistic update
    setHd(h => ({
      ...h,
      reservations: [
        ...h.reservations.filter(r => !dates.includes(r.date) || r.seatId !== seatId),
        ...dates.map(d => ({ seatId, date: d, userId: CURRENT_USER.id, userName: CURRENT_USER.name })),
      ],
    }));
    setHdModal(null);
    notify(`✓ ${t('hdReservedOk')} — ${seatId}`);
    // Persist to Supabase
    try {
      const rows = dates.map(d => ({
        id:        `res-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        seat_id:   seatId,
        user_id:   CURRENT_USER.id,
        user_name: CURRENT_USER.name,
        date:      d,
      }));
      // Upsert to handle re-reservations
      const { error } = await supabase.from('seat_reservations').upsert(rows, { onConflict: 'seat_id,date' });
      if (error) console.error('Reserve error:', error.message);
    } catch (err) {
      console.error('Reserve failed:', err);
    }
  };

  const handleHdRelease = async (seatId, date) => {
    setHd(h => ({ ...h, reservations: h.reservations.filter(r => !(r.seatId === seatId && r.date === date)) }));
    setHdModal(null);
    notify(t('hdReleasedOk'));
    try {
      const { error } = await supabase.from('seat_reservations')
        .delete().eq('seat_id', seatId).eq('date', date).eq('user_id', CURRENT_USER.id);
      if (error) console.error('Release error:', error.message);
    } catch (err) {
      console.error('Release failed:', err);
    }
  };

  // ── Nav ───────────────────────────────────────────────────────
  const isAdmin = CURRENT_USER.role === 'admin';
  const jtNavItems = [
    { id: 'calendar', label: t('navCalendar') },
    { id: 'day',      label: t('navDay')      },
    { id: 'tasks',    label: t('navTasks')    },
  ];
  const hdNavItems = [
    { id: 'map',   label: t('navMap')   },
    { id: 'table', label: t('navTable') },
  ];
  const currentNavItems = mod === 'jt' ? jtNavItems : hdNavItems;

  // ── Loading screen ────────────────────────────────────────────
  if (loadingData) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#50506a', fontSize: 13, fontFamily: 'Inter, sans-serif' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f6ef7', boxShadow: '0 0 12px #4f6ef7', margin: '0 auto 12px', animation: 'pulse 1.5s ease infinite' }} />
          Loading WorkSuite…
        </div>
      </div>
    );
  }

  return (
    <AppCtx.Provider value={{ lang, t, theme }}>
      <style>{buildCSS()}</style>

      <div data-theme={theme} style={{height:"100vh",overflow:"hidden",background:"var(--bg)",color:"var(--tx)"}}>
      <div className="shell">

        {/* ── Top Bar ── */}
        <header className="topbar">
          <div className="logo">
            <div className="logo-dot"/>
            <span className="logo-jt">Work</span><span style={{color:"var(--tx2)",fontWeight:300}}>Suite</span>
          </div>
          <span className="proto-tag">{t("protoTag")}</span>

          <div className="sw-group">
            <button className={`sw-btn ${mod==="jt"?"active":""}`} onClick={()=>{ setMod("jt"); setView("calendar"); }}>
              {t("moduleSwitchJira")}
            </button>
            <button className={`sw-btn ${mod==="hd"?"active-green":""}`} onClick={()=>{ setMod("hd"); setView("map"); }}>
              {t("moduleSwitchHD")}
            </button>
          </div>

          <div className="top-right">
            <div className="sw-group">
              <button className={`sw-btn ${theme==="dark"?"active-theme":""}`} onClick={()=>setTheme("dark")}>🌙</button>
              <button className={`sw-btn ${theme==="light"?"active-theme":""}`} onClick={()=>setTheme("light")}>☀️</button>
            </div>
            <div className="sw-group">
              <button className={`sw-btn ${lang==="en"?"active":""}`} onClick={()=>setLang("en")}>EN</button>
              <button className={`sw-btn ${lang==="es"?"active":""}`} onClick={()=>setLang("es")}>ES</button>
            </div>
            <div className="o-dot"/>
            <div className="avatar">{CURRENT_USER.avatar}</div>
            <span className="u-name">{CURRENT_USER.name}</span>
            <span className={`r-tag ${CURRENT_USER.role==="admin"?"r-admin":"r-user"}`}>
              {CURRENT_USER.role==="admin"?t("roleAdmin"):t("roleUser")}
            </span>
            <button onClick={logout} style={{background:"transparent",border:"1px solid var(--bd)",borderRadius:"var(--r)",color:"var(--tx3)",fontSize:10,padding:"3px 8px",cursor:"pointer",fontWeight:600}}>
              Logout
            </button>
          </div>
        </header>

        {/* ── Navigation Bar ── */}
        <nav className="nav-bar">
          {mod==="jt" && view!=="admin" && (
            <button className={`n-btn sb-toggle ${sbOpen?"active":""}`} onClick={()=>setSbOpen(o=>!o)}>
              ⚙ Filters
            </button>
          )}
          {currentNavItems.map(item=>(
            <button key={item.id}
              className={`n-btn ${view===item.id?(mod==="hd"?"active-hd":"active"):""}`}
              onClick={()=>setView(item.id)}>
              {item.label}
            </button>
          ))}
          {isAdmin&&(
            <>
              <div className="n-sep"/>
              <button className={`n-btn ${view==="admin"?"active":""}`} onClick={()=>setView("admin")}>
                ⚙ {t("navAdmin")}
              </button>
            </>
          )}
        </nav>

        {/* ── Body ── */}
        <div className="body">
          {sbOpen && mod==="jt" && view!=="admin" && (
            <div className="sb-backdrop" onClick={()=>setSbOpen(false)}/>
          )}
          {mod==="jt" && view!=="admin" && (
            <JTFilterSidebar filters={filters} onApply={f=>{setFilters(f);setSbOpen(false);}} onExport={handleExport} mobileOpen={sbOpen} onMobileClose={()=>setSbOpen(false)}/>
          )}

          {mod==="jt" && view==="calendar" && (
            <main className="content">
              <CalendarView filters={filters} worklogs={worklogs} onDayClick={handleDayClick} onOpenLog={openLogModal}/>
            </main>
          )}
          {mod==="jt" && view==="day" && (
            <main className="content">
              <DayView date={activeDay} filters={filters} worklogs={worklogs} onDateChange={setActiveDay} onOpenLog={openLogModal} onDeleteWorklog={handleDeleteWorklog}/>
            </main>
          )}
          {mod==="jt" && view==="tasks" && (
            <main className="content">
              <TasksView filters={filters} onOpenLog={openLogModal}/>
            </main>
          )}
          {mod==="hd" && view==="map" && (
            <main className="content">
              <HDMapView hd={hd} onSeat={sid=>handleHdSeatClick(sid,TODAY)} currentUser={CURRENT_USER}/>
            </main>
          )}
          {mod==="hd" && view==="table" && (
            <main className="content">
              <HDTableView hd={hd} onCell={(sid,date)=>handleHdSeatClick(sid,date)} currentUser={CURRENT_USER}/>
            </main>
          )}
          {view==="admin" && (
            <AdminShell users={users} setUsers={setUsers} hd={hd} setHd={setHd} currentUser={CURRENT_USER}/>
          )}
        </div>
      </div>
      </div>

      {logModal && (
        <div>
          <LogWorklogModal initialDate={logModal.date} initialIssueKey={logModal.issueKey} onClose={()=>setLogModal(null)} onSave={handleSaveWorklog} currentUser={CURRENT_USER}/>
        </div>
      )}
      {hdModal && (
        <div>
          <HDReserveModal seatId={hdModal.seatId} initDate={hdModal.date} hd={hd} onConfirm={handleHdConfirm} onRelease={handleHdRelease} onClose={()=>setHdModal(null)} currentUser={CURRENT_USER}/>
        </div>
      )}
      {toast && (
        <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"11px 18px",borderRadius:"var(--r2)",fontSize:13,fontWeight:500,background:"var(--sf)",border:"1px solid var(--bd2)",color:"var(--tx)",boxShadow:"var(--shadow)",animation:"fadeIn .2s ease"}}>
          {toast}
        </div>
      )}
    </AppCtx.Provider>
  );
}
