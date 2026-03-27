// @ts-nocheck
// WorkSuite — Fase 2 — Prototype connected to real Supabase + real Jira API

import React, {
  useState, useMemo, useCallback,
  createContext, useContext, useRef, useEffect,
  Component
} from "react";
import { createPortal } from "react-dom";
import { supabase } from './shared/lib/api';
import { RetroBoard, AdminRetroTeams } from './RetroBoard';
import { DeployPlanner } from './modules/deploy-planner/ui/DeployPlanner.jsx';
import { useAuth } from './shared/hooks/useAuth';

// ── API helpers ────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

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

const DeskType = Object.freeze({ NONE:"none", HOTDESK:"hotdesk", FIXED:"fixed" });
const MODULES = [
  { id:"jt",     label:"Jira Tracker",  color:"var(--ac2)"   },
  { id:"hd",     label:"HotDesk",       color:"var(--green)" },
  { id:"retro",  label:"RetroBoard",    color:"#818cf8"      },
  { id:"deploy", label:"Deploy Planner",color:"#f59e0b"      },
];
const SeatStatus = Object.freeze({ FREE:"free", OCCUPIED:"occupied", FIXED:"fixed" });

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
    appName:"WorkSuite", protoTag:"UI Prototype",
    moduleSwitchJira:"Jira Tracker", moduleSwitchHD:"HotDesk",
    darkMode:"Dark", lightMode:"Light",
    navCalendar:"Calendar", navDay:"Day View", navTasks:"Tasks", navAdmin:"Admin",
    navMap:"Office Map", navTable:"Monthly View",
    dateRange:"Date range", filterByUser:"Filter by user", allUsers:"All users",
    spaces:"Spaces", taskType:"Task type", mySpaces:"Search spaces…",
    applyFilters:"Apply filters", exportCsv:"↓ Export CSV",
    exportHint:"Only hours within the selected range", clearSelection:"Clear",
    today:"Today", totalLabel:"Total", activeDays:"Active days",
    avgLabel:"Avg", perDay:"h/d", more:"more", logHours:"+ Log hours",
    worklogs:"worklogs", tasks:"tasks",
    noWorklogs:"No worklogs on this day", noWorklogsSub:"Try another day or user filter",
    logThisDay:"+ Log hours for this day", summaryByTask:"Summary by task",
    searchPlaceholder:"Search key, summary, user…", jqlGenerated:"JQL",
    noResults:"No results", clearFilter:"Clear",
    colKey:"Key", colSummary:"Summary", colType:"Type", colStatus:"Status",
    colPriority:"Priority", colProject:"Project", colAssignee:"Assignee",
    colEpic:"Epic", colTime:"Time", colAction:"Action", btnHours:"+ Hours",
    logWorklog:"Log worklog", taskField:"Task *", selectTask:"Select task…",
    dateField:"Date *", startTime:"Start time", timeLogged:"Time *",
    timePlaceholder:"2h, 1h 30m, 45m, 1.5", timeFormats:"Formats:",
    decimalHours:"(decimal h)", descField:"Description", descOptional:"(optional)",
    descPlaceholder:"What did you work on?", cancel:"Cancel",
    saveWorklog:"Save worklog", timeInvalid:"Invalid format", timeExceeds:"Max 160h", timeWarn:"That's a lot! Are you sure you want to log {h}h?",
    taskRequired:"Select a task", dateRequired:"Date required", savedFlash:"Worklog saved",
    adminSidebar:"Administration", adminSettings:"Settings", adminUsers:"Users", adminHotDesk:"HotDesk",
    settingsTitle:"Settings", jiraConnection:"Jira Cloud Connection",
    jiraUrl:"Jira URL", jiraEmail:"Account email", apiToken:"API Token",
    tokenHint:"Generate at id.atlassian.com → Security → API tokens",
    saveConfig:"Save configuration", savedOk:"Saved", connStatus:"Status",
    connInstance:"Instance", connProjects:"Projects", connLastSync:"Last sync",
    connected:"Connected", minsAgo:"3 minutes ago", hideToken:"Hide", showToken:"Show",
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
    csvImportTitle:"Bulk import users", csvDropzone:"Drop CSV here or click to browse",
    csvFormat:"Expected format:", csvFormatHint:"name, email, role (admin/user)",
    csvPreview:"Preview", csvRows:"rows detected", csvErrors:"rows with errors",
    csvImport:"Import users", csvImportDone:"users imported",
    csvDownloadTemplate:"Download template", csvCancel:"Cancel",
    hotdeskTitle:"HotDesk Configuration", hotdeskSeats:"Seat Management",
    hotdeskLegend:"Seat status today", assignSeat:"Assign seat",
    selectSeat:"Select a seat to configure",
    assignTo:"Assign to user", asFixed:"Mark as permanent",
    asFixedHint:"Seat will be locked for this person permanently",
    confirmAssign:"Assign", releaseBtn:"Release", fixedSeats:"Fixed seats",
    noFixed:"No fixed assignments", unlockSeat:"Unlock",
    officeMap:"Office Map", monthlyView:"Monthly View",
    freeSeats:"free today", seatsTotal:"seats",
    legendFree:"Free", legendOcc:"Occupied", legendFixed:"Fixed", legendMine:"My seat",
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
    spaces:"Espacios", taskType:"Tipo de tarea", mySpaces:"Buscar espacios…",
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
    saveWorklog:"Guardar worklog", timeInvalid:"Formato inválido", timeExceeds:"Máx 160h", timeWarn:"¡Eso es mucho! ¿Seguro que quieres registrar {h}h?",
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
    legendFree:"Libre", legendOcc:"Ocupado", legendFixed:"Fijo", legendMine:"Mi puesto",
    hdNoReserve:"Este puesto tiene asignación fija.",
    hdAlreadyOcc:"Puesto ya ocupado.", hdAlreadyRes:"Ya tienes reserva para esta fecha.",
    hdReleaseTitle:"Liberar reserva", hdReleaseQ:"¿Deseas liberar tu reserva?",
    hdReleaseBtn:"Liberar", hdReserveTitle:"Nueva reserva",
    hdSelectDates:"Selecciona fechas", hdConfirm:"Confirmar",
    hdReleasedOk:"Reserva liberada", hdReservedOk:"Reserva confirmada",
    hdAdminManage:"Gestionar puesto",
  }
};

const _memStore = {};
const StorageAdapter = {
  load()        { return _memStore["state"] ?? null; },
  save(state)   { _memStore["state"] = state; },
};

// ══════════════════════════════════════════════════════════════════
// MOCK DATA — fallback cuando Jira no está configurado
// ══════════════════════════════════════════════════════════════════

const MOCK_USERS = [
  { id:"u1", name:"Elena Martínez", email:"elena@co.com",   avatar:"EM", role:"admin", deskType:DeskType.FIXED,    active:true,  modules:["jt","hd"] },
  { id:"u2", name:"Carlos Ruiz",    email:"carlos@co.com",  avatar:"CR", role:"user",  deskType:DeskType.HOTDESK,  active:true,  modules:["jt","hd"] },
  { id:"u3", name:"Ana López",      email:"ana@co.com",     avatar:"AL", role:"user",  deskType:DeskType.HOTDESK,  active:true,  modules:["jt","hd"] },
  { id:"u4", name:"Marco Silva",    email:"marco@co.com",   avatar:"MS", role:"user",  deskType:DeskType.FIXED,    active:true,  modules:["jt","hd"] },
  { id:"u5", name:"Sofía Chen",     email:"sofia@co.com",   avatar:"SC", role:"user",  deskType:DeskType.HOTDESK,  active:false, modules:["jt"]      },
];

const SEATS = [
  {id:"A1",x:60,y:90},{id:"A2",x:124,y:90},{id:"A3",x:188,y:90},
  {id:"A4",x:60,y:160},{id:"A5",x:124,y:160},{id:"A6",x:188,y:160},
  {id:"B1",x:288,y:90},{id:"B2",x:352,y:90},{id:"B3",x:416,y:90},
  {id:"B4",x:288,y:160},{id:"B5",x:352,y:160},{id:"B6",x:416,y:160},
  {id:"C1",x:60,y:300},{id:"C2",x:130,y:300},{id:"C3",x:200,y:300},
  {id:"C4",x:270,y:300},{id:"C5",x:340,y:300},{id:"C6",x:410,y:300},
];

const TODAY = new Date().toISOString().slice(0,10);
const MOCK_TODAY = TODAY;

const MOCK_ISSUES_FALLBACK = [
  { id:1, key:"DEMO-1", summary:"Configure your Jira connection in Admin → Settings", type:"Task", status:"To Do", priority:"High", project:"DEMO", assignee:"", epic:"—", epicName:"—", hours:0, labels:[] },
];

const MOCK_PROJECTS_FALLBACK = [
  {key:"DEMO", name:"Demo — Configure Jira in Settings"},
];

const MOCK_WORKLOGS = {};

const INITIAL_HD_STATE = {
  fixed: {},
  reservations: [],
};

// ══════════════════════════════════════════════════════════════════
// CONTEXT
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
  const { t, jiraIssues } = useApp();
  const issues = jiraIssues || MOCK_ISSUES_FALLBACK;
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

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (cbRef.current && !cbRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = query.trim()
    ? issues.filter(i =>
        i.key.toLowerCase().includes(query.toLowerCase()) ||
        i.summary.toLowerCase().includes(query.toLowerCase()))
    : issues;

  const selectIssue = issue => {
    setIk(issue.key);
    setQuery(issue.key);
    setOpen(false);
    setEr(v => ({...v, ik:null}));
  };

  const ps = TimeParser.parse(tr), tp = ps > 0 ? TimeParser.format(ps) : null;

  const MAX_H = 160 * 3600; // 160h
  const WARN_H = 160 * 3600;
  const [warnConfirmed, setWarnConfirmed] = useState(false);
  const [showWarn, setShowWarn] = useState(false);

  const validate = () => {
    const e = {};
    if (!ik)   e.ik = t("taskRequired");
    if (!dt)   e.dt = t("dateRequired");
    if (ps<=0) e.tr = t("timeInvalid");
    if (ps>MAX_H) e.tr = t("timeExceeds");
    return e;
  };

  const submit = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setEr(errs); return; }
    // Warn if > 16h and not yet confirmed
    if (ps > 16 * 3600 && !warnConfirmed) {
      setShowWarn(true);
      return;
    }
    const iss = issues.find(i => i.key===ik);
    setOk(true);
    setTimeout(() => {
      onSave(dt, { id:`wl-${Date.now()}`, issue:ik, summary:iss?.summary||ik, type:iss?.type||"Task",
        epic:iss?.epic||"—", epicName:iss?.epicName||"—", author:currentUser.name,
        authorId:currentUser.id, time:tp, seconds:ps, started:st,
        project:iss?.project||"—", description:dc, isNew:true });
      onClose();
    }, 750);
  };

  const si = issues.find(i => i.key===ik);
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:480}}>
        <div className="mh"><div className="mt">⏱ {t("logWorklog")}</div><button className="mc" onClick={onClose}>×</button></div>
        {ok ? <div className="mbody"><div className="ok-fl">✓ {t("savedFlash")} — {tp} · {ik} · {dt}</div></div> : showWarn ? (
          <div className="mbody">
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:28,marginBottom:12}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:14,color:"var(--amber)",marginBottom:8}}>
                {t("timeWarn").replace("{h}", (ps/3600).toFixed(1))}
              </div>
              <div style={{fontSize:12,color:"var(--tx3)",marginBottom:20}}>
                {TimeParser.format(ps)} · {ik}
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                <button className="b-cancel" onClick={()=>setShowWarn(false)}>Cancelar</button>
                <button className="b-sub" style={{background:"var(--amber)"}} onClick={()=>{setWarnConfirmed(true);setShowWarn(false);setTimeout(()=>submit(),50);}}>
                  Sí, registrar {TimeParser.format(ps)}
                </button>
              </div>
            </div>
          </div>
        ) : (
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

function JTFilterSidebar({ filters, onApply, onExport, mobileOpen, onMobileClose, users, onProjectChange }) {
  const { t, jiraProjects } = useApp();
  const projects = jiraProjects || MOCK_PROJECTS_FALLBACK;
  const [l, sL] = useState(filters);
  const [spaceQ, setSpaceQ] = useState("");
  const filteredProjects = spaceQ.trim()
    ? projects.filter(p => p.key.toLowerCase().includes(spaceQ.toLowerCase()) || p.name.toLowerCase().includes(spaceQ.toLowerCase()))
    : projects;

  const ts = k => {
    const isAdding = !l.spaceKeys.includes(k);
    const newKeys = isAdding ? [...l.spaceKeys, k] : l.spaceKeys.filter(x => x !== k);
    sL(f => ({ ...f, spaceKeys: newKeys }));
    // Al seleccionar un proyecto, cargar sus issues automáticamente
    if (isAdding && onProjectChange) onProjectChange(k);
  };

  return (
    <aside className={`sb ${mobileOpen?"sb-open":""}`}>
      <div className="sb-s"><div className="sb-lbl">{t("dateRange")}</div>
        <input className="fi" type="date" value={l.from} onChange={e=>sL({...l,from:e.target.value})}/>
        <input className="fi" type="date" value={l.to}   onChange={e=>sL({...l,to:e.target.value})}/>
      </div>
      <div className="sb-s"><div className="sb-lbl">{t("filterByUser")}</div>
        <select className="fi" value={l.authorId} onChange={e=>sL({...l,authorId:e.target.value})}>
          <option value="">{t("allUsers")}</option>
          {(users||[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="sb-s">
        <div className="sb-lbl">{t("spaces")}{l.spaceKeys.length>0&&<span className="sb-cnt">({l.spaceKeys.length})</span>}</div>
        <input className="fi" placeholder={t("mySpaces")} value={spaceQ} onChange={e=>setSpaceQ(e.target.value)} style={{fontSize:11}}/>
        <div className="pick-l" style={{maxHeight:200,overflowY:"auto"}}>
          {filteredProjects.map(p=>{const on=l.spaceKeys.includes(p.key);return(
            <div key={p.key} className={`pick-i ${on?"on":""}`} onClick={()=>ts(p.key)}>
              <div className="cb">{on&&"✓"}</div><span className="kb">{p.key}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
            </div>
          );})}
          {filteredProjects.length===0&&<div style={{fontSize:11,color:"var(--tx3)",padding:"6px 8px"}}>Sin resultados</div>}
        </div>
        {l.spaceKeys.length>0&&<button className="btn-g" onClick={()=>sL({...l,spaceKeys:[]})}>{t("clearSelection")}</button>}
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
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
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
        <button className="btn-g" onClick={()=>{sYr(new Date().getFullYear());sMo(new Date().getMonth());}}>{t("today")}</button>
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

function TasksView({ filters, onOpenLog, worklogs }) {
  const { t, jiraIssues, jiraProjects } = useApp();
  const issues = jiraIssues || MOCK_ISSUES_FALLBACK;
  const projects = jiraProjects || MOCK_PROJECTS_FALLBACK;

  // Calcular horas imputadas en WorkSuite por issue key
  const hoursByIssue = useMemo(() => {
    const map = {};
    for (const dayWls of Object.values(worklogs || {})) {
      for (const wl of dayWls) {
        map[wl.issue] = (map[wl.issue] || 0) + wl.seconds;
      }
    }
    return map;
  }, [worklogs]);

  const [tf, stf] = useState([]);
  const [sr, ssr] = useState("");
  const [so, sso] = useState({key:"key",dir:"asc"});



  const filteredIssues = useMemo(()=>{
    let l=issues;
    if(filters.spaceKeys.length)l=l.filter(i=>filters.spaceKeys.includes(i.project));
    if(tf.length)l=l.filter(i=>tf.includes(i.type));
    if(sr){const q=sr.toLowerCase();l=l.filter(i=>i.key.toLowerCase().includes(q)||i.summary.toLowerCase().includes(q)||(i.assignee||"").toLowerCase().includes(q));}
    return[...l].sort((a,b)=>{const d=so.dir==="asc"?1:-1;if(so.key==="hours")return((a.hours||0)-(b.hours||0))*d;return(a[so.key]??"").localeCompare(b[so.key]??"")*d;});
  },[issues,filters,tf,sr,so]);

  const ts=k=>sso(s=>s.key===k?{...s,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"});
  const A=({k})=>so.key!==k?<span style={{fontSize:9,color:"var(--tx3)"}}>⇅</span>:<span style={{fontSize:9,color:"var(--ac2)"}}>{so.dir==="asc"?"↑":"↓"}</span>;
  const pc=p=>p==="Critical"?"p-crit":p==="High"?"p-high":p==="Medium"?"p-med":"p-low";
  const pt=[...new Set(issues.map(i=>i.type))];

  // Calcular horas imputadas en WorkSuite por issue
  const { worklogs: allWorklogs } = { worklogs: {} }; // se pasa desde arriba si hace falta

  const sc = s => {
    const sl = (s||'').toLowerCase();
    if (sl.includes('done') || sl.includes('cerrad') || sl.includes('complet') || sl.includes('resuelto')) return 's-done';
    if (sl.includes('progress') || sl.includes('curso') || sl.includes('proceso') || sl.includes('review') || sl.includes('testing')) return 's-prog';
    return 's-todo';
  };

  return(
    <div>
      <div className="tk-h">
        <div className="tk-t">{t("navTasks")}</div>
        <div className="c-bdg">{filteredIssues.length}/{issues.length}</div>
        <button className="btn-log" style={{marginLeft:"auto"}} onClick={()=>onOpenLog({})}>{t("logHours")}</button>
      </div>
      <div className="f-row">
        <input className="fi" style={{maxWidth:220}} type="search" placeholder={t("searchPlaceholder")} value={sr} onChange={e=>ssr(e.target.value)}/>
        {pt.map(ty=><button key={ty} className={`pill ${tf.includes(ty)?"on":""}`} onClick={()=>stf(f=>f.includes(ty)?f.filter(x=>x!==ty):[...f,ty])}>{ty}</button>)}
        {tf.length>0&&<button className="btn-g" onClick={()=>stf([])}>{t("clearFilter")}</button>}
      </div>
      {filteredIssues.length===0&&<div className="empty"><div className="empty-i">🔍</div><div>{t("noResults")}</div></div>}
      {filteredIssues.length>0&&<div style={{overflowX:"auto"}}><table><thead><tr>
        <th onClick={()=>ts("key")}>{t("colKey")} <A k="key"/></th>
        <th onClick={()=>ts("summary")}>{t("colSummary")} <A k="summary"/></th>
        <th>{t("colType")}</th>
        <th onClick={()=>ts("status")}>{t("colStatus")} <A k="status"/></th>
        <th onClick={()=>ts("priority")}>{t("colPriority")} <A k="priority"/></th>
        <th>{t("colProject")}</th>
        <th>{t("colAssignee")}</th>
        <th>{t("colEpic")}</th>
        <th title="Horas imputadas en WorkSuite">{t("colTime")}</th>
        <th>{t("colAction")}</th>
      </tr></thead><tbody>{filteredIssues.map((i,idx)=>{
        return <tr key={i.key||idx}>
          <td><span className="ik">{i.key}</span></td>
          <td><div className="ism">{i.summary}</div><div style={{marginTop:2}}>{(i.labels||[]).slice(0,3).map(l=><span key={l} className="tag">{l}</span>)}</div></td>
          <td><span className="t-pill">{i.type}</span></td>
          <td><span className={`s-b ${sc(i.status)}`}>{i.status}</span></td>
          <td><span className={pc(i.priority)}>{i.priority}</span></td>
          <td><span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--tx3)"}}>{i.project}</span></td>
          <td style={{fontSize:11}}>{i.assignee}</td>
          <td><span className="er">{i.epic}</span></td>
          <td className="hc">{hoursByIssue[i.key] ? TimeParser.format(hoursByIssue[i.key]) : "—"}</td>
          <td><button className="btn-log btn-log-sm" onClick={()=>onOpenLog({issueKey:i.key})}>{t("btnHours")}</button></td>
        </tr>;
      })}</tbody></table></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// HOTDESK — Office SVG
// ══════════════════════════════════════════════════════════════════

function OfficeSVG({ hd, onSeat, highlightSeat, currentUser, showOccupants=true }) {
  const { theme } = useApp();
  const C = theme === "light"
    ? { free:"#0f9060", occ:"#4f6ef7", fixed:"#c02828", amber:"#b86800",
        bd:"#d0d0e0", sf:"#ffffff", sf2:"#f0f0f8", sf3:"#e4e4ef", tx3:"#8888aa",
        zoneBg:"#f8f8fd", zoneBd:"#c0c0d8" }
    : { free:"#3ecf8e", occ:"#4f6ef7", fixed:"#e05252", amber:"#f5a623",
        bd:"#2a2a38", sf:"#141418", sf2:"#1b1b22", sf3:"#21212c", tx3:"#50506a",
        zoneBg:"#18181f", zoneBd:"#2a2a38" };

  const colOf = st => st===SeatStatus.FIXED ? C.fixed : st===SeatStatus.OCCUPIED ? C.occ : C.free;

  const SeatIcon = ({ seat }) => {
    const st     = ReservationService.statusOf(seat.id, MOCK_TODAY, hd.fixed, hd.reservations);
    const res    = ReservationService.resOf(seat.id, MOCK_TODAY, hd.reservations);
    const col    = colOf(st);
    const isMine = res?.userId === currentUser.id;
    const isMyFixed = hd.fixed[seat.id] === currentUser.name;
    const stroke = (isMine || isMyFixed) ? C.amber : col;
    const lbl    = hd.fixed[seat.id]
      ? hd.fixed[seat.id].split(" ")[0].slice(0,7)
      : res ? res.userName.split(" ")[0].slice(0,7) : "";
    const { x, y } = seat;
    const op = theme === "light" ? 0.18 : 0.10;
    return (
      <g className={onSeat?"hd-seat":""} onClick={()=>onSeat&&onSeat(seat.id)}>
        {highlightSeat===seat.id && <rect x={x-25} y={y-18} width={50} height={46} rx={9} fill="none" stroke={C.amber} strokeWidth={2} strokeDasharray="5 3"/>}
        {/* desk */}
        <rect x={x-21} y={y-10} width={42} height={22} rx={6} fill={col} fillOpacity={op} stroke={stroke} strokeWidth={isMine||isMyFixed?2:1.5}/>
        {/* monitor */}
        <rect x={x-8} y={y-8} width={16} height={10} rx={2} fill={col} fillOpacity={op*1.5} stroke={col} strokeOpacity={0.35} strokeWidth={1}/>
        {/* chair */}
        <rect x={x-11} y={y+14} width={22} height={12} rx={5} fill={col} fillOpacity={op} stroke={stroke} strokeWidth={1.2}/>
        {/* label */}
        <text x={x} y={y+34} textAnchor="middle" fill={col} fontSize={8} fontWeight={700} fontFamily="monospace">{seat.id}</text>
        {showOccupants && lbl && <text x={x} y={y+6} textAnchor="middle" fill={stroke} fontSize={7} fontWeight={700}>{lbl}</text>}
        {showOccupants && (isMine||isMyFixed) && <circle cx={x+17} cy={y-14} r={4} fill={C.amber} stroke={C.sf} strokeWidth={1}/>}
      </g>
    );
  };

  return (
    <svg viewBox="0 0 660 420" style={{width:"100%",display:"block",borderRadius:8}}>
      <rect x={0} y={0} width={660} height={420} rx={12} fill={C.sf2}/>
      {/* Right dividers */}
      <line x1={472} y1={0} x2={472} y2={420} stroke={C.bd} strokeWidth={1.5}/>
      <line x1={472} y1={210} x2={660} y2={210} stroke={C.bd} strokeWidth={1.5}/>
      {/* Meeting room */}
      <rect x={473} y={0} width={187} height={210} fill={C.sf3}/>
      <text x={566} y={85} textAnchor="middle" fill={C.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>MEETING</text>
      <text x={566} y={100} textAnchor="middle" fill={C.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>ROOM</text>
      <ellipse cx={566} cy={155} rx={52} ry={26} fill={C.sf2} stroke={C.bd} strokeWidth={1}/>
      {/* Kitchen */}
      <rect x={473} y={211} width={187} height={209} fill={C.sf3}/>
      <text x={566} y={295} textAnchor="middle" fill={C.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>KITCHEN /</text>
      <text x={566} y={311} textAnchor="middle" fill={C.tx3} fontSize={10} fontWeight={700} letterSpacing={2}>RESTROOMS</text>
      {/* Entrance */}
      <rect x={266} y={408} width={112} height={10} rx={3} fill={C.sf2} stroke={C.bd}/>
      <text x={322} y={416} textAnchor="middle" fill={C.tx3} fontSize={8} fontWeight={700} letterSpacing={1.5}>▲ ENTRANCE</text>
      {/* Zone boxes */}
      <rect x={16} y={28} width={216} height={170} rx={10} fill={C.zoneBg} stroke={C.zoneBd} strokeWidth={1.2}/>
      <text x={124} y={20} textAnchor="middle" fill={C.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE A</text>
      <rect x={244} y={28} width={216} height={170} rx={10} fill={C.zoneBg} stroke={C.zoneBd} strokeWidth={1.2}/>
      <text x={352} y={20} textAnchor="middle" fill={C.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE B</text>
      <rect x={16} y={238} width={444} height={170} rx={10} fill={C.zoneBg} stroke={C.zoneBd} strokeWidth={1.2}/>
      <text x={238} y={230} textAnchor="middle" fill={C.tx3} fontSize={9} fontWeight={700} letterSpacing={2}>ZONE C</text>
      {/* Seats */}
      {SEATS.map(seat => <SeatIcon key={seat.id} seat={seat}/>)}
    </svg>
  );
}

// ── Blueprint mini-map for tooltip — renders blueprint layout at small scale ─
function BlueprintMiniMap({ blueprint, hd, seatId }) {
  const canvasRef = useRef(null);
  const { theme } = useApp();
  const dk = theme !== 'light';

  const items = (() => {
    try { return Array.isArray(blueprint?.layout) ? blueprint.layout : []; } catch { return []; }
  })();

  const CELL=52, PAD=14, LH=18;

  function getSeatsForItem(item) {
    if(item.shape==='circle'){
      const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
      const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
      const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
      return Array.from({length:n},(_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return{id:pfx+(i+1),x:cx+R*Math.cos(a)-CELL/2+2,y:cy+R*Math.sin(a)-CELL/2+2,w:CELL-4,h:CELL-4};});
    }
    const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
    const tW=cols*CELL,tH=rows*CELL,sx=x+PAD+(w-PAD*2-tW)/2,sy=y+LH+PAD+(h-LH-PAD*2-tH)/2;
    const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
    let n=1;return Array.from({length:cols*rows},(_,i)=>{const r=Math.floor(i/cols),cc=i%cols;const s={id:pfx+n,x:sx+cc*CELL+2,y:sy+r*CELL+2,w:CELL-4,h:CELL-4};n++;return s;});
  }

  const allSeats = useMemo(()=>{
    const seats=[];
    items.forEach(item=>{
      if(item.type==='desk'||item.type==='circle'){
        const dis=item.disabled||[];
        getSeatsForItem(item).forEach(s=>{if(!dis.includes(s.id))seats.push(s);});
      }
    });
    return seats;
  },[blueprint?.id]);

  const bbox = useMemo(()=>{
    if(!items.length)return{minX:0,minY:0,maxX:400,maxY:300};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    items.forEach(i=>{if(i.x<minX)minX=i.x;if(i.y<minY)minY=i.y;if(i.x+i.w>maxX)maxX=i.x+i.w;if(i.y+i.h>maxY)maxY=i.y+i.h;});
    return{minX:minX-16,minY:minY-16,maxX:maxX+16,maxY:maxY+16};
  },[blueprint?.id]);

  useEffect(()=>{
    const cvs=canvasRef.current;if(!cvs)return;
    const ctx=cvs.getContext('2d');
    const W=cvs.width,H=cvs.height;
    ctx.clearRect(0,0,W,H);
    const bW=bbox.maxX-bbox.minX,bH=bbox.maxY-bbox.minY;
    const s=Math.min(W/bW,H/bH);
    const ox=(W-bW*s)/2-bbox.minX*s, oy=(H-bH*s)/2-bbox.minY*s;

    function rr(x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

    ctx.save();ctx.setTransform(s,0,0,s,ox,oy);

    // Draw non-cluster items as faint background
    items.forEach(i=>{
      const{x,y,w,h}=i;
      if(i.type==='zone'){ctx.fillStyle=dk?'rgba(40,30,80,.15)':'rgba(238,242,255,.5)';ctx.strokeStyle='rgba(129,140,248,.3)';ctx.lineWidth=1/s;ctx.setLineDash([4/s,3/s]);rr(x,y,w,h,5);ctx.fill();ctx.stroke();ctx.setLineDash([]);}
      else if(i.type==='room'){ctx.fillStyle=dk?'rgba(15,30,70,.3)':'rgba(219,234,254,.4)';ctx.strokeStyle='rgba(59,130,246,.3)';ctx.lineWidth=1/s;ctx.setLineDash([]);rr(x,y,w,h,4);ctx.fill();ctx.stroke();}
      else if(i.type==='wall'){ctx.strokeStyle=dk?'rgba(120,120,120,.5)':'rgba(100,100,110,.4)';ctx.lineWidth=3/s;ctx.setLineDash([]);ctx.lineCap='round';if(i.pts&&i.pts.length>=2){ctx.beginPath();ctx.moveTo(i.pts[0].x,i.pts[0].y);i.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();}else{rr(x,y,w,h,2);ctx.stroke();}ctx.lineCap='butt';}
      else if(i.type==='door'){
        const rad2=(i.angle||0)*Math.PI/180,sw2=i.w||48;
        const c2=Math.cos(rad2),s2=Math.sin(rad2);
        const gx2=x+sw2*c2,gy2=y+sw2*s2,lx2=x+sw2*s2,ly2=y-sw2*c2;
        ctx.strokeStyle='rgba(249,115,22,.7)';ctx.lineWidth=1.5/s;ctx.setLineDash([]);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(gx2,gy2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx2,ly2);ctx.stroke();
        ctx.lineWidth=0.6/s;ctx.setLineDash([3/s,3/s]);
        ctx.beginPath();ctx.arc(x,y,sw2,rad2,rad2-Math.PI/2,true);ctx.stroke();
        ctx.setLineDash([]);ctx.lineCap='butt';
      }
      else if(i.type==='window'){
        const rad3=(i.angle||0)*Math.PI/180,sw3=i.w||48,hth3=3;
        const c3=Math.cos(rad3),s3=Math.sin(rad3),px3=-s3,py3=c3;
        ctx.strokeStyle='rgba(56,189,248,.7)';ctx.lineWidth=1.5/s;ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo(x+px3*hth3,y+py3*hth3);ctx.lineTo(x+sw3*c3+px3*hth3,y+sw3*s3+py3*hth3);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x-px3*hth3,y-py3*hth3);ctx.lineTo(x+sw3*c3-px3*hth3,y+sw3*s3-py3*hth3);ctx.stroke();
        ctx.lineWidth=1/s;
        ctx.beginPath();ctx.moveTo(x+px3*hth3,y+py3*hth3);ctx.lineTo(x-px3*hth3,y-py3*hth3);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+sw3*c3+px3*hth3,y+sw3*s3+py3*hth3);ctx.lineTo(x+sw3*c3-px3*hth3,y+sw3*s3-py3*hth3);ctx.stroke();
      }
      else if(i.type==='desk'||i.type==='circle'){
        ctx.fillStyle=dk?'rgba(3,15,6,.3)':'rgba(240,253,244,.4)';
        ctx.strokeStyle='rgba(34,197,94,.2)';ctx.lineWidth=1/s;ctx.setLineDash([3/s,3/s]);
        if(i.shape==='circle'){const cx=i.x+i.w/2,cy=i.y+i.h/2,R=Math.min(i.w,i.h)/2;ctx.beginPath();ctx.arc(cx,cy,R,0,2*Math.PI);ctx.fill();ctx.stroke();}
        else{rr(i.x,i.y,i.w,i.h,5);ctx.fill();ctx.stroke();}
        ctx.setLineDash([]);
      }
    });

    // Draw all seats small
    allSeats.forEach(seat=>{
      const{x,y,w,h,id}=seat;
      const isTarget=id===seatId;
      const res=hd.reservations.find(r=>r.seatId===id&&r.date===TODAY);
      const isFixed=!!hd.fixed[id];
      const isMine=res?.userId===hd._currentUserId;
      let col;
      if(isTarget) col='#f59e0b';
      else if(isFixed) col='#ef4444';
      else if(res) col='#3b82f6';
      else col='#22c55e';
      ctx.fillStyle=col+(isTarget?'':'44');
      ctx.strokeStyle=col;
      ctx.lineWidth=(isTarget?2.5:0.8)/s;
      rr(x,y,w,h,3);ctx.fill();ctx.stroke();
      // Target gets a glow + label
      if(isTarget){
        ctx.fillStyle=col;
        ctx.font=`bold ${Math.max(8,10/s)}px monospace`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(id,x+w/2,y+h/2);
      }
    });

    ctx.restore();
  },[blueprint?.id, hd, seatId, theme]);

  return <canvas ref={canvasRef} width={440} height={280} style={{display:'block',width:'100%',borderRadius:6}}/>;
}

function SeatTooltip({ seatId, anchorX, anchorY, hd, currentUser, blueprint }) {
  const { theme } = useApp();
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: anchorX - 140, top: anchorY + 8 });

  // Enrich hd with currentUserId for mini-map coloring
  const hdWithUser = useMemo(()=>({...hd, _currentUserId: currentUser?.id}), [hd, currentUser?.id]);

  const res = hd.reservations.find(r=>r.seatId===seatId&&r.date===TODAY);
  const isFixed = !!hd.fixed[seatId];
  const isMine = res?.userId === currentUser?.id;
  const ownerName = isFixed ? hd.fixed[seatId] : res?.userName;

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
    <div ref={ref} className="hd-tooltip" data-theme={theme} style={{ left: pos.left, top: pos.top, width: 480 }}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:13,
          color: isMine?'var(--amber)': isFixed?'var(--red)': res?'var(--ac2)':'var(--green)'}}>
          {seatId}
        </span>
        <span style={{fontSize:10,padding:'2px 7px',borderRadius:10,fontWeight:600,
          background: isMine?'rgba(245,158,11,.12)': isFixed?'rgba(239,68,68,.12)': res?'rgba(59,130,246,.12)':'rgba(34,197,94,.12)',
          color: isMine?'#f59e0b': isFixed?'#ef4444': res?'#3b82f6':'#22c55e'}}>
          {isMine?'My seat': isFixed?'Fixed': res?'Occupied':'Free'}
        </span>
        {ownerName && <span style={{fontSize:10,color:'var(--tx3)',marginLeft:'auto'}}>{ownerName.split(' ')[0]}</span>}
      </div>
      {/* Mini-map showing position */}
      <div style={{background:'var(--sf2)',borderRadius:6,overflow:'hidden',border:'1px solid var(--bd)'}}>
        {blueprint
          ? <BlueprintMiniMap blueprint={blueprint} hd={hdWithUser} seatId={seatId}/>
          : <div style={{height:80,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'var(--tx3)'}}>No map available</div>
        }
      </div>
    </div>
  );
}

function HDMapView({ hd, onSeat, currentUser }) {
  const { t } = useApp();
  const freeCount = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.FREE).length;
  const occCount  = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.OCCUPIED).length;
  const fixCount  = SEATS.filter(s => ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations) === SeatStatus.FIXED).length;
  return (
    <div className="hd-map-wrap">
      <div className="hd-map-header">
        <div className="cal-stats" style={{marginLeft:0}}>
          <div className="chip">{t("legendFree")}: <strong style={{color:"var(--green)"}}>{freeCount}</strong></div>
          <div className="chip">{t("legendOcc")}: <strong style={{color:"var(--ac2)"}}>{occCount}</strong></div>
          <div className="chip">{t("legendFixed")}: <strong style={{color:"var(--red)"}}>{fixCount}</strong></div>
          <div className="chip">{t("seatsTotal")}: <strong>{SEATS.length}</strong></div>
        </div>
        <div className="hd-legend">
          {[[t("legendFree"),"var(--seat-free)"],[t("legendOcc"),"var(--seat-occ)"],[t("legendFixed"),"var(--seat-fixed)"],[t("legendMine"),"var(--amber)"]].map(([l,c])=>(
            <div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:c}}/>{l}</div>
          ))}
        </div>
      </div>
      <div className="hd-card"><OfficeSVG hd={hd} onSeat={onSeat} currentUser={currentUser}/></div>
      <div className="hd-sub">Click on a seat to reserve · <span style={{color:"var(--amber)"}}>● your reservation</span></div>
    </div>
  );
}

function HDTableView({ hd, onCell, currentUser, blueprint }) {
  const { t, lang } = useApp();
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
  const [tooltip, setTooltip] = useState(null);
  const [hidePast, setHidePast] = useState(false);

  const days = daysInMonth(yr, mo);
  function isoD(d) { return `${yr}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
  const prev = ()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1);
  const next = ()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1);
  const DOW_EN = ["S","M","T","W","T","F","S"];
  const DOW_ES = ["D","L","M","X","J","V","S"];
  const DOW    = lang==="es" ? DOW_ES : DOW_EN;

  // Get seats from blueprint, fallback to legacy SEATS
  const CELL=52,PAD=14,LH=18;
  const seats = useMemo(()=>{
    const items = (() => { try { return Array.isArray(blueprint?.layout) ? blueprint.layout : []; } catch { return []; }})();
    if(!items.length) return SEATS.map(s=>({...s}));
    const result=[];
    items.forEach(item=>{
      if(item.type!=='desk'&&item.type!=='circle') return;
      const dis=item.disabled||[];
      let seatList;
      if(item.shape==='circle'){
        const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
        const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
        const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
        seatList=Array.from({length:n},(_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return{id:pfx+(i+1)};});
      } else {
        const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
        const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
        let n=1;seatList=Array.from({length:cols*rows},()=>{const s={id:pfx+n};n++;return s;});
      }
      seatList.forEach(s=>{ if(!dis.includes(s.id)) result.push(s); });
    });
    return result;
  },[blueprint?.id]);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div className="cal-h" style={{marginBottom:10,flexShrink:0,padding:'0 4px'}}>
        <button className="n-arr" onClick={prev}>‹</button>
        <div className="cal-t">{fmtMonthYear(yr, mo, lang)}</div>
        <button className="n-arr" onClick={next}>›</button>
        <button onClick={()=>setHidePast(h=>!h)}
          style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',fontSize:11,fontWeight:600,
            border:`1px solid ${hidePast?'var(--ac)':'var(--bd)'}`,borderRadius:'var(--r)',
            background:hidePast?'var(--glow)':'var(--sf2)',color:hidePast?'var(--ac2)':'var(--tx2)',
            cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap'}}>
          {hidePast?'▼ All days':'▲ Future only'}
        </button>
        <div className="hd-legend" style={{marginLeft:"auto"}}>
          {[[t("legendFree"),"var(--seat-free)"],[t("legendOcc"),"var(--seat-occ)"],[t("legendFixed"),"var(--seat-fixed)"],["Mine","var(--amber)"]].map(([l,c])=>(
            <div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:c}}/>{l}</div>
          ))}
        </div>
      </div>

      {/* Scrollable table — horizontal + vertical */}
      <div style={{flex:1,overflow:'auto',borderRadius:'var(--r2)',border:'1px solid var(--bd)',background:'var(--sf)'}}>
        <table className="hd-tbl" style={{minWidth: 120 + seats.length * 52}}>
          <thead>
            <tr>
              <th className="hd-th date-col" style={{minWidth:90,left:0,zIndex:8}}>{lang==="es"?"Fecha":"Date"}</th>
              {seats.map(s => {
                const st = ReservationService.statusOf(s.id, MOCK_TODAY, hd.fixed, hd.reservations);
                const col = st===SeatStatus.FIXED ? "var(--seat-fixed)" : st===SeatStatus.OCCUPIED ? "var(--seat-occ)" : "var(--seat-free)";
                return (
                  <th key={s.id} className="hd-th seat-col"
                    style={{minWidth:48,cursor:'pointer'}}
                    onMouseEnter={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTooltip({ seatId:s.id, ax: r.left + r.width/2, ay: r.bottom });
                    }}
                    onMouseLeave={() => setTooltip(null)}>
                    <span style={{color:col,fontSize:10,fontWeight:700}}>{s.id}</span>
                    {hd.fixed[s.id] && (
                      <div style={{fontSize:7,color:"var(--red)",marginTop:1,fontWeight:400,lineHeight:1}}>
                        {hd.fixed[s.id].split(" ")[0].slice(0,6)}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({length:days},(_,i)=>i+1).filter(d=>!hidePast||isoD(d)>=MOCK_TODAY).map(d => {
              const iso   = isoD(d);
              const dow   = new Date(iso+"T00:00:00").getDay();
              const isWe  = dow===0||dow===6;
              const isTod = iso===MOCK_TODAY;
              const rowCls = isWe ? "hd-row-we" : isTod ? "hd-row-today" : "";
              return (
                <tr key={d} className={rowCls}>
                  <td className="hd-td date-cell" style={{
                    position:'sticky',left:0,zIndex:4,background:'var(--sf)',
                    color: isWe?"var(--tx3)": isTod?"var(--ac2)":"var(--tx2)",
                    fontWeight:isTod?600:400, minWidth:90, paddingLeft:10
                  }}>
                    {isTod && <span style={{color:"var(--ac2)",marginRight:3,fontSize:9}}>▶</span>}
                    <span style={{fontFamily:"var(--mono)",fontSize:11}}>{DOW[dow]}</span>
                    {" "}<span style={{fontFamily:"var(--mono)",fontSize:11}}>{String(d).padStart(2,"0")}</span>
                  </td>
                  {seats.map(seat => {
                    const st     = ReservationService.statusOf(seat.id, iso, hd.fixed, hd.reservations);
                    const res    = ReservationService.resOf(seat.id, iso, hd.reservations);
                    const isMine = res?.userId===currentUser.id;
                    const ownerName = st===SeatStatus.FIXED ? hd.fixed[seat.id] : res?.userName;
                    const ownerLabel = ownerName ? ownerName.split(" ")[0].slice(0,7) : "";
                    const cls    = isMine ? "mine" : st===SeatStatus.FIXED ? "fx" : st===SeatStatus.OCCUPIED ? "occ" : "free";
                    return (
                      <td key={seat.id} className="hd-td" style={{padding:2,minWidth:48}}>
                        {isWe ? (
                          <div style={{height:28,borderRadius:3,background:"var(--sf2)"}}/>
                        ) : (
                          <div className={`hd-cell ${cls}`}
                            style={{height:28,fontSize:9}}
                            onClick={() => onCell(seat.id, iso)}>
                            <div className={`hd-cell-dot ${cls}`}/>
                            {(st!==SeatStatus.FREE && ownerLabel) && (
                              <span className="hd-cell-name" style={{fontSize:9}}>{ownerLabel}</span>
                            )}
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

      {tooltip && (
        <SeatTooltip
          seatId={tooltip.seatId}
          anchorX={tooltip.ax}
          anchorY={tooltip.ay}
          hd={hd}
          currentUser={currentUser}
          blueprint={blueprint}
        />
      )}
    </div>
  );
}

function HDReserveModal({ seatId, initDate, hd, onConfirm, onRelease, onClose, currentUser }) {
  const { t, lang } = useApp();
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
  const [sel, sSel] = useState(initDate ? [initDate] : []);

  const date = initDate || MOCK_TODAY;
  const st    = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations);
  const res   = ReservationService.resOf(seatId, date, hd.reservations);
  const isMine = res?.userId === currentUser.id;

  // El puesto es "fijo" del usuario actual si está en fixed con su nombre
  const fixedOwner   = hd.fixed[seatId];
  const isMyFixed    = fixedOwner === currentUser.name;
  const isOtherFixed = st === SeatStatus.FIXED && !isMyFixed;

  // Fechas donde el usuario ya tiene reserva en OTRO puesto (para bloquear en el mini-cal)
  const myReservedDates = hd.reservations
    .filter(r => r.userId === currentUser.id && r.seatId !== seatId)
    .map(r => r.date);

  // Fechas ocupadas para este puesto (por otros)
  const occupiedDates = hd.reservations.filter(r => r.seatId === seatId).map(r => r.date);

  // Combinar: no puede seleccionar días donde ya reservó otro puesto
  const blockedDates = [...new Set([...occupiedDates, ...myReservedDates])];

  const toggle = iso => sSel(p => p.includes(iso) ? p.filter(x => x !== iso) : [...p, iso]);
  const prev = () => mo === 0 ? (sMo(11), sYr(y => y-1)) : sMo(m => m-1);
  const next = () => mo === 11 ? (sMo(0), sYr(y => y+1)) : sMo(m => m+1);

  // Título dinámico
  let title = t("hdReserveTitle");
  if (isMyFixed) title = isMine ? t("hdReleaseTitle") : "Mi puesto fijo";
  else if (isMine) title = t("hdReleaseTitle");
  else if (isOtherFixed) title = t("hdAdminManage");

  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mb" style={{maxWidth:400}}>
        <div className="mh">
          <div className="mt">🪑 {title}</div>
          <button className="mc" onClick={onClose}>×</button>
        </div>
        <div className="mbody">
          {/* Info del puesto */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
            <div style={{fontFamily:"var(--mono)",fontWeight:700,color:"var(--ac2)",fontSize:16}}>{seatId}</div>
            <div style={{fontSize:12}}>
              {isMyFixed && <div style={{color:"var(--amber)"}}>📌 Tu puesto permanente</div>}
              {isOtherFixed && <div style={{color:"var(--red)"}}>{t("legendFixed")}: {fixedOwner}</div>}
              {!st.includes && res && !isMine && <div style={{color:"var(--ac2)"}}>{t("legendOcc")}: {res.userName}</div>}
              {st === SeatStatus.FREE && <div style={{color:"var(--green)"}}>{t("legendFree")}</div>}
            </div>
          </div>

          {/* Bloqueo por puesto fijo de otro */}
          {isOtherFixed && (
            <div style={{fontSize:12,color:"var(--tx3)",padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
              {t("hdNoReserve")}
            </div>
          )}

          {/* Mi puesto fijo — puedo liberarlo para un día */}
          {isMyFixed && !isMine && (
            <div style={{fontSize:12,color:"var(--tx2)",lineHeight:1.6}}>
              Este es tu puesto permanente. Si no lo vas a usar hoy puedes liberarlo para que otro compañero lo ocupe.
              <button className="b-danger" style={{width:"100%",marginTop:10}} onClick={()=>onRelease(seatId, date)}>
                Liberar para hoy ({date})
              </button>
            </div>
          )}

          {/* Mi reserva — puedo liberarla */}
          {isMine && !isMyFixed && (
            <div>
              <div style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>{t("hdReleaseQ")}</div>
              <button className="b-danger" style={{width:"100%"}} onClick={()=>onRelease(seatId, date)}>{t("hdReleaseBtn")}</button>
            </div>
          )}

          {/* Puesto liberado por el fijo — otro puede reservar */}
          {isMyFixed && isMine && (
            <div style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>
              {t("hdReleaseQ")}
              <button className="b-danger" style={{width:"100%",marginTop:8}} onClick={()=>onRelease(seatId, date)}>{t("hdReleaseBtn")}</button>
            </div>
          )}

          {/* Reserva libre — seleccionar fechas (filtra días con otra reserva) */}
          {!isOtherFixed && !isMine && !isMyFixed && (
            <>
              {myReservedDates.includes(date) ? (
                <div style={{fontSize:12,color:"var(--amber)",padding:"8px 12px",background:"rgba(245,166,35,.07)",borderRadius:"var(--r)",border:"1px solid rgba(245,166,35,.25)"}}>
                  ⚠ {t("hdAlreadyRes")}
                </div>
              ) : (
                <>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <button className="n-arr" onClick={prev}>‹</button>
                    <span style={{fontSize:12,fontWeight:600,color:"var(--ac2)"}}>{fmtMonthYear(yr,mo,lang)}</span>
                    <button className="n-arr" onClick={next}>›</button>
                  </div>
                  <MiniCalendar year={yr} month={mo} selectedDates={sel} onToggleDate={toggle} occupiedDates={blockedDates}/>
                  {sel.length>0&&<div style={{fontSize:11,color:"var(--green)",background:"rgba(62,207,142,.07)",border:"1px solid rgba(62,207,142,.2)",borderRadius:"var(--r)",padding:"6px 10px"}}>{t("hdSelectDates")}: {sel.sort().join(", ")}</div>}
                </>
              )}
            </>
          )}
        </div>

        <div className="mf">
          <button className="b-cancel" onClick={onClose}>{t("cancel")}</button>
          {!isOtherFixed && !isMine && !isMyFixed && !myReservedDates.includes(date) && (
            <button className="b-sub" onClick={()=>onConfirm(seatId,sel)} disabled={sel.length===0}>
              {t("hdConfirm")} {sel.length>0&&`(${sel.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ADMIN — Settings Module
// ══════════════════════════════════════════════════════════════════

// ── SSO Config (solo admin) ──────────────────────────────────────
function SSOConfig() {
  const [cfg, setCfg] = useState({ ad_group_id: '', ad_group_name: '', allow_google: true, allow_microsoft: true });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [ok,      setOk]      = useState('');
  const [err,     setErr]     = useState('');

  useEffect(() => {
    supabase.from('sso_config').select('*').eq('id', 1).single()
      .then(({ data }) => {
        if (data) setCfg({
          ad_group_id:   data.ad_group_id   ?? '',
          ad_group_name: data.ad_group_name ?? '',
          allow_google:      data.allow_google      ?? true,
          allow_microsoft:   data.allow_microsoft   ?? true,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setErr(''); setOk('');
    const { error } = await supabase.from('sso_config').update({
      ad_group_id:   cfg.ad_group_id.trim()   || null,
      ad_group_name: cfg.ad_group_name.trim() || null,
      allow_google:      cfg.allow_google,
      allow_microsoft:   cfg.allow_microsoft,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (error) setErr(error.message);
    else { setOk('\u2713 Configuraci\u00f3n guardada'); setTimeout(() => setOk(''), 3000); }
    setSaving(false);
  };

  if (loading) return <div style={{color:'var(--tx3)',fontSize:12}}>Cargando...</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>

      {/* Providers habilitados */}
      <div>
        <div className="a-lbl" style={{marginBottom:10}}>Providers habilitados</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {[
            { key:'allow_microsoft', icon:'🏢', label:'Microsoft / Azure AD', desc:'Login con cuenta corporativa Microsoft 365' },
            { key:'allow_google',    icon:'🌐', label:'Google',               desc:'Login con cuenta Google' },
          ].map(({ key, icon, label, desc }) => (
            <div key={key}
              onClick={() => setCfg(c => ({ ...c, [key]: !c[key] }))}
              style={{
                display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                background:'var(--sf2)', borderRadius:'var(--r)',
                border:`1px solid ${cfg[key] ? 'rgba(62,207,142,.3)' : 'var(--bd)'}`,
                cursor:'pointer', transition:'var(--ease)',
              }}>
              <div style={{
                width:18, height:18, borderRadius:4, flexShrink:0,
                background: cfg[key] ? 'var(--green)' : 'transparent',
                border: `2px solid ${cfg[key] ? 'var(--green)' : 'var(--bd2)'}`,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {cfg[key] && <span style={{color:'#fff',fontSize:11,fontWeight:700,lineHeight:1}}>\u2713</span>}
              </div>
              <span style={{fontSize:16}}>{icon}</span>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'var(--tx)'}}>{label}</div>
                <div style={{fontSize:11,color:'var(--tx3)'}}>{desc}</div>
              </div>
              <div style={{marginLeft:'auto',fontSize:10,fontWeight:700,
                color: cfg[key] ? 'var(--green)' : 'var(--tx3)'}}>
                {cfg[key] ? 'ACTIVO' : 'INACTIVO'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grupo AD */}
      {cfg.allow_microsoft && (
        <div>
          <div className="a-lbl" style={{marginBottom:6}}>Restricci\u00f3n por grupo de Azure AD</div>
          <div style={{fontSize:11,color:'var(--tx3)',marginBottom:10,lineHeight:1.6}}>
            Solo los usuarios que pertenezcan a este grupo podr\u00e1n acceder con Microsoft.
            Deja en blanco para permitir cualquier cuenta de tu tenant.
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div>
              <div style={{fontSize:10,color:'var(--tx3)',marginBottom:4}}>Object ID del grupo</div>
              <input className="a-inp" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={cfg.ad_group_id}
                onChange={e => setCfg(c => ({ ...c, ad_group_id: e.target.value }))}
                style={{fontFamily:'var(--mono)',fontSize:12}}/>
              <div style={{fontSize:10,color:'var(--tx3)',marginTop:4}}>
                Azure Portal \u2192 Azure Active Directory \u2192 Groups \u2192 [tu grupo] \u2192 Object ID
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:'var(--tx3)',marginBottom:4}}>Nombre del grupo (referencia)</div>
              <input className="a-inp" placeholder="ej. WorkSuite-Users"
                value={cfg.ad_group_name}
                onChange={e => setCfg(c => ({ ...c, ad_group_name: e.target.value }))}/>
            </div>
          </div>
          {cfg.ad_group_id && (
            <div style={{marginTop:10,padding:'8px 12px',background:'rgba(62,207,142,.06)',
              border:'1px solid rgba(62,207,142,.2)',borderRadius:'var(--r)',fontSize:11,color:'var(--green)'}}>
              \u2713 Solo usuarios del grupo <strong>{cfg.ad_group_name || cfg.ad_group_id}</strong> podr\u00e1n entrar con Microsoft
            </div>
          )}
          {!cfg.ad_group_id && (
            <div style={{marginTop:10,padding:'8px 12px',background:'rgba(245,166,35,.06)',
              border:'1px solid rgba(245,166,35,.2)',borderRadius:'var(--r)',fontSize:11,color:'var(--amber)'}}>
              \u26a0 Sin restricci\u00f3n de grupo: cualquier usuario de tu tenant podr\u00e1 acceder
            </div>
          )}
        </div>
      )}

      <button className="btn-p" onClick={save} disabled={saving} style={{maxWidth:220}}>
        {saving ? 'Guardando...' : 'Guardar configuraci\u00f3n SSO'}
      </button>
      {ok  && <div className="saved-ok"><span className="dot-ok"/> {ok}</div>}
      {err && <div style={{fontSize:11,color:'var(--red)'}}>{err}</div>}

      {/* Instrucciones colapsables */}
      <SSOInstructions/>
    </div>
  );
}

function SSOInstructions() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{borderTop:'1px solid var(--bd)',paddingTop:12}}>
      <button className="btn-g" onClick={() => setOpen(o => !o)} style={{width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between'}}>
        <span>\u{2139} C\u00f3mo configurar los providers en los portales externos</span>
        <span>{open ? '\u25b2' : '\u25bc'}</span>
      </button>
      {open && (
        <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:16,fontSize:12,color:'var(--tx2)',lineHeight:1.7}}>
          <div>
            <div style={{fontWeight:700,color:'var(--tx)',marginBottom:6}}>\uD83C\uDFE2 Microsoft Azure AD</div>
            <ol style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:4}}>
              <li>Ve a <a href="https://portal.azure.com" target="_blank" rel="noreferrer" style={{color:'var(--ac2)'}}>portal.azure.com</a> \u2192 Azure Active Directory \u2192 App registrations \u2192 New registration</li>
              <li>Name: <code style={{fontFamily:'var(--mono)',background:'var(--sf3)',padding:'1px 5px',borderRadius:3}}>WorkSuite</code> \u2014 Supported account types: <em>this organizational directory only</em></li>
              <li>Redirect URI: <code style={{fontFamily:'var(--mono)',background:'var(--sf3)',padding:'1px 5px',borderRadius:3,fontSize:10}}>https://enclhswdbwbgxbjykdtj.supabase.co/auth/v1/callback</code></li>
              <li>Certificates & secrets \u2192 New client secret \u2192 copia el valor</li>
              <li>Token configuration \u2192 Add groups claim \u2192 Security groups</li>
              <li>En Supabase Dashboard \u2192 Authentication \u2192 Providers \u2192 Azure: pega Client ID, Secret y Tenant ID</li>
            </ol>
          </div>
          <div>
            <div style={{fontWeight:700,color:'var(--tx)',marginBottom:6}}>\uD83C\uDF10 Google</div>
            <ol style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:4}}>
              <li>Ve a <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{color:'var(--ac2)'}}>console.cloud.google.com</a> \u2192 APIs & Services \u2192 Credentials \u2192 Create OAuth 2.0 Client ID</li>
              <li>Redirect URI: <code style={{fontFamily:'var(--mono)',background:'var(--sf3)',padding:'1px 5px',borderRadius:3,fontSize:10}}>https://enclhswdbwbgxbjykdtj.supabase.co/auth/v1/callback</code></li>
              <li>En Supabase Dashboard \u2192 Authentication \u2192 Providers \u2192 Google: pega Client ID y Secret</li>
            </ol>
          </div>
          <div>
            <div style={{fontWeight:700,color:'var(--tx)',marginBottom:6}}>\uD83E\uDD1D Auth Hook (una sola vez)</div>
            <ol style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:4}}>
              <li>Supabase Dashboard \u2192 Authentication \u2192 Hooks</li>
              <li>Add hook \u2192 selecciona <em>Before User Creation</em></li>
              <li>Edge function: <code style={{fontFamily:'var(--mono)',background:'var(--sf3)',padding:'1px 5px',borderRadius:3}}>auth-hook-sso</code></li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Token personal Jira por usuario ──────────────────────────────
function PersonalJiraToken() {
  const [token,    setToken]    = useState('');
  const [show,     setShow]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [ok,       setOk]       = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('users').select('jira_api_token').eq('id', user.id).single()
        .then(({ data }) => setHasToken(!!data?.jira_api_token));
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from('users')
      .update({ jira_api_token: token.trim() || null })
      .eq('id', user.id);
    if (!error) {
      setHasToken(!!token.trim());
      setToken('');
      setOk(token.trim() ? '✓ Token guardado' : '✓ Token eliminado');
      setTimeout(() => setOk(''), 3000);
    }
    setSaving(false);
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:8,height:8,borderRadius:'50%',
          background:hasToken?'var(--green)':'var(--tx3)',
          boxShadow:hasToken?'0 0 5px var(--green)':'none'}}/>
        <span style={{fontSize:12,color:hasToken?'var(--green)':'var(--tx3)'}}>
          {hasToken
            ? 'Token personal configurado — tus imputaciones aparecerán con tu nombre en Jira'
            : 'Sin token personal — se usará el token del admin (con nota de autor en comentario)'}
        </span>
      </div>
      <div style={{display:'flex',gap:6}}>
        <input className="a-inp" type={show?'text':'password'}
          placeholder={hasToken ? '••••••••• (dejar vacío para eliminar)' : 'ATatt3x...'}
          value={token} onChange={e=>setToken(e.target.value)} style={{flex:1}}/>
        <button className="btn-g" onClick={()=>setShow(s=>!s)}
          style={{padding:'0 10px',flexShrink:0}}>
          {show?'Ocultar':'Mostrar'}
        </button>
      </div>
      <div style={{fontSize:10,color:'var(--tx3)',lineHeight:1.6}}>
        Genera tu token en{' '}
        <a href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank" rel="noreferrer" style={{color:'var(--ac2)'}}>
          id.atlassian.com → Security → API tokens
        </a>
      </div>
      <button className="btn-p" onClick={save} disabled={saving} style={{maxWidth:200}}>
        {saving ? 'Guardando...' : hasToken ? 'Actualizar token' : 'Guardar token'}
      </button>
      {ok && <div className="saved-ok"><span className="dot-ok"/> {ok}</div>}
    </div>
  );
}

function AdminSettings() {
  const { t } = useApp();
  const [jiraUrl,   setJiraUrl]   = useState("");
  const [email,     setEmail]     = useState("");
  const [token,     setToken]     = useState("");
  const [showTok,   setShowTok]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [conn,      setConn]      = useState(null);
  const [errMsg,    setErrMsg]    = useState("");
  const [okMsg,     setOkMsg]     = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/jira/connection`, { headers: await getAuthHeader() });
        const json = await res.json();
        if (json.ok && json.data) {
          setConn(json.data);
          setJiraUrl(json.data.base_url || "");
          setEmail(json.data.email || "");
        }
      } catch { } finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setErrMsg(""); setOkMsg("");
    if (!jiraUrl.trim() || !email.trim()) { setErrMsg("Completa URL y email"); return; }
    if (!conn && !token.trim()) { setErrMsg("Introduce el API Token"); return; }
    setSaving(true);
    try {
      const body: any = { baseUrl: jiraUrl.trim(), email: email.trim() };
      if (token.trim()) body.apiToken = token.trim();
      if (!token.trim() && conn) body.apiToken = "__keep__";
      const res  = await fetch(`${API_BASE}/jira/connection`, {
        method: "POST",
        headers: { ...await getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) { setErrMsg(json.error?.message || "Error al guardar"); return; }
      setConn({ base_url: jiraUrl.trim(), email: email.trim() });
      setToken("");
      setOkMsg("✓ Configuración guardada");
      setTimeout(() => setOkMsg(""), 3000);
    } catch { setErrMsg("Error de red"); } finally { setSaving(false); }
  };

  const handleDisconnect = async () => {
    await fetch(`${API_BASE}/jira/connection`, { method: "DELETE", headers: await getAuthHeader() });
    setConn(null); setJiraUrl(""); setEmail(""); setToken("");
    setOkMsg("Desconectado"); setTimeout(() => setOkMsg(""), 3000);
  };

  if (loading) return <div style={{padding:20,color:"var(--tx3)",fontSize:13}}>Cargando...</div>;

  return (
    <div>
      <div className="sec-t">{t("settingsTitle")}</div>
      <div className="sec-sub">Configure the connection to your Jira Cloud instance and global preferences.</div>
      <div className="a-card">
        <div className="a-ct">🔗 {t("jiraConnection")}</div>
        <div className="a-form">
          <div><div className="a-lbl">{t("jiraUrl")}</div><input className="a-inp" placeholder="https://yourcompany.atlassian.net" value={jiraUrl} onChange={e=>setJiraUrl(e.target.value)}/></div>
          <div><div className="a-lbl">{t("jiraEmail")}</div><input className="a-inp" type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div>
            <div className="a-lbl">{t("apiToken")}</div>
            <div style={{display:"flex",gap:6}}>
              <input className="a-inp" type={showTok?"text":"password"}
                placeholder={conn ? "••••••••• (dejar vacío para mantener)" : "ATatt3x..."}
                value={token} onChange={e=>setToken(e.target.value)} style={{flex:1}}/>
              <button className="btn-g" onClick={()=>setShowTok(s=>!s)} style={{padding:"0 10px",flexShrink:0}}>
                {showTok?t("hideToken"):t("showToken")}
              </button>
            </div>
            <div className="a-hint">{t("tokenHint")}</div>
          </div>
          <button className="btn-p" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : t("saveConfig")}</button>
          {conn && <button className="btn-g" onClick={handleDisconnect} style={{marginTop:4,color:"var(--red)",borderColor:"var(--red)"}}>Desconectar</button>}
          {errMsg && <div style={{marginTop:8,padding:"8px 12px",background:"rgba(229,62,62,.08)",border:"1px solid rgba(229,62,62,.25)",borderRadius:"var(--r)",color:"var(--red)",fontSize:12}}>{errMsg}</div>}
          {okMsg  && <div className="saved-ok"><span className="dot-ok"/>  {okMsg}</div>}
        </div>
      </div>
      <div className="a-card">
        <div className="a-ct">📡 Connection status</div>
        <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"10px 14px"}}>
          {conn ? (<>
            <div className="info-r"><span className="ik2">{t("connStatus")}</span><div style={{display:"flex",alignItems:"center",gap:5}}><div className="dot-ok"/><span className="iv" style={{color:"var(--green)"}}>{t("connected")}</span></div></div>
            <div className="info-r"><span className="ik2">{t("connInstance")}</span><span className="iv">{conn.base_url?.replace("https://","")}</span></div>
            <div className="info-r" style={{border:"none"}}><span className="ik2">Email</span><span className="iv">{conn.email}</span></div>
          </>) : (
            <div className="info-r" style={{border:"none"}}><span className="ik2">{t("connStatus")}</span><span className="iv" style={{color:"var(--tx3)"}}>No conectado</span></div>
          )}
        </div>
      </div>

      {/* ── Token personal del usuario ── */}
      <div className="a-card">
        <div className="a-ct">🔑 Mi token personal de Jira</div>
        <PersonalJiraToken />
      </div>

      {/* ── SSO & Acceso ── */}
      <div className="a-card">
        <div className="a-ct">🔐 SSO &amp; Control de acceso</div>
        <SSOConfig />
      </div>
    </div>
  );
}
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
  const submit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setEr(errs); return; }
    setDone(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ name: name.trim(), email: email.toLowerCase().trim(), password: pwd, role, deskType: desk })
      });
      const json = await res.json();
      if (!res.ok) { setEr({ email: json.error || 'Error creating user' }); setDone(false); return; }
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
        <div className="mh"><div className="mt">👤 {t("addUserBtn")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {t("userAdded")}</div></div>:(
          <>
            <div className="mbody">
              <div className="fr"><label className="fl">{t("fieldName")}</label><input className={`mi ${er.name?"err":""}`} placeholder="John Smith" value={name} onChange={e=>{setName(e.target.value);setEr(v=>({...v,name:null}));}} autoFocus/>{er.name&&<span className="em">{er.name}</span>}</div>
              <div className="fr2">
                <div className="fr"><label className="fl">{t("fieldEmail")}</label><input className={`mi ${er.email?"err":""}`} type="email" placeholder="john@co.com" value={email} onChange={e=>{setEmail(e.target.value);setEr(v=>({...v,email:null}));}}/>{er.email&&<span className="em">{er.email}</span>}</div>
                <div className="fr"><label className="fl">{t("fieldRole")}</label><select className="mi" value={role} onChange={e=>setRole(e.target.value)}><option value="user">{t("roleUser")}</option><option value="admin">{t("roleAdmin")}</option></select></div>
              </div>
              <div className="fr"><label className="fl">{t("fieldPassword")}</label><div style={{display:"flex",gap:6}}><input className={`mi ${er.pwd?"err":""}`} type={show?"text":"password"} placeholder="········" autoComplete="new-password" style={{flex:1}} value={pwd} onChange={e=>{setPwd(e.target.value);setEr(v=>({...v,pwd:null}));}}/><button className="btn-g" onClick={()=>setShow(s=>!s)} style={{flexShrink:0,padding:"0 10px"}}>{show?"🙈":"👁"}</button></div><PasswordStrength password={pwd}/>{er.pwd&&<span className="em">{er.pwd}</span>}</div>
              <div className="fr"><label className="fl">{t("fieldConfirm")}</label><input className={`mi ${er.conf?"err":""}`} type={show?"text":"password"} placeholder="········" autoComplete="new-password" value={conf} onChange={e=>{setConf(e.target.value);setEr(v=>({...v,conf:null}));}}/>{er.conf&&<span className="em">{er.conf}</span>}</div>
            </div>
            <div className="mf"><button className="b-cancel" onClick={onClose}>{t("cancel")}</button><button className="b-sub" onClick={submit}>{t("saveUser")}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

function ChangePasswordModal({ user, onClose }) {
  const { t } = useApp();
  const [pwd,  setPwd]  = useState("");
  const [conf, setConf] = useState("");
  const [show, setShow] = useState(false);
  const [er,   setEr]   = useState({});
  const [done, setDone] = useState(false);
  const validate = () => { const e = {}; if (pwd.length<8) e.pwd=t("errPasswordShort"); if (pwd!==conf) e.conf=t("errPasswordMatch"); return e; };
  const submit = () => { const errs=validate(); if (Object.keys(errs).length){setEr(errs);return;} setDone(true); setTimeout(()=>onClose(),850); };
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:420}}>
        <div className="mh"><div className="mt">🔑 {t("changePassword")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {t("passwordChanged")}</div></div>:(
          <><div className="mbody">
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--sf2)",borderRadius:"var(--r)",border:"1px solid var(--bd)"}}>
              <div className="avatar" style={{width:30,height:30,fontSize:10,flexShrink:0}}>{user.avatar}</div>
              <div><div style={{fontWeight:600}}>{user.name}</div><div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--tx3)"}}>{user.email}</div></div>
            </div>
            <div className="fr"><label className="fl">{t("newPassword")}</label><div style={{display:"flex",gap:6}}><input className={`mi ${er.pwd?"err":""}`} type={show?"text":"password"} placeholder="········" style={{flex:1}} autoFocus value={pwd} onChange={e=>{setPwd(e.target.value);setEr(v=>({...v,pwd:null}));}}/><button className="btn-g" onClick={()=>setShow(s=>!s)} style={{flexShrink:0,padding:"0 10px"}}>{show?"🙈":"👁"}</button></div><PasswordStrength password={pwd}/>{er.pwd&&<span className="em">{er.pwd}</span>}</div>
            <div className="fr"><label className="fl">{t("confirmPassword")}</label><input className={`mi ${er.conf?"err":""}`} type={show?"text":"password"} placeholder="········" autoComplete="new-password" value={conf} onChange={e=>{setConf(e.target.value);setEr(v=>({...v,conf:null}));}}/>{er.conf&&<span className="em">{er.conf}</span>}</div>
          </div><div className="mf"><button className="b-cancel" onClick={onClose}>{t("cancel")}</button><button className="b-sub" onClick={submit}>{t("updatePassword")}</button></div></>
        )}
      </div>
    </div>
  );
}

function CsvImportModal({ existingUsers, onClose, onImport }) {
  const { t } = useApp();
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
        <div className="mh"><div className="mt">📋 {t("csvImportTitle")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {cnt} {t("csvImportDone")}</div></div>:(
          <><div className="mbody">
            {!parsed&&(<><div className={`dropzone ${drag?"over":""}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files[0]);}} onClick={()=>fileRef.current?.click()}><div style={{fontSize:26,marginBottom:8}}>📂</div><div style={{fontSize:12,color:"var(--tx2)",fontWeight:500,marginBottom:4}}>{t("csvDropzone")}</div><div style={{fontSize:10,color:"var(--tx3)"}}>CSV only</div><input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>process(e.target.files[0])}/></div><button className="btn-g" style={{alignSelf:"flex-start"}} onClick={downloadTpl}>↓ {t("csvDownloadTemplate")}</button></>)}
            {parsed&&(<><div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:11,color:"var(--tx2)"}}><strong>{parsed.rows.length}</strong> {t("csvRows")}</span><span style={{fontSize:11,color:parsed.errorCount>0?"var(--amber)":"var(--tx2)"}}><strong>{parsed.errorCount}</strong> {t("csvErrors")}</span><span style={{fontSize:11,color:"var(--green)"}}><strong>{validRows.length}</strong> ready</span><button className="btn-g" style={{marginLeft:"auto",fontSize:10}} onClick={()=>setParsed(null)}>↩ Change</button></div><div className="csv-preview"><div className="csv-row hdr"><div className="csv-cell">#</div><div className="csv-cell">Name</div><div className="csv-cell">Email</div><div className="csv-cell">Role</div><div className="csv-cell">Status</div></div>{parsed.rows.map(r=>(<div key={r.idx} className={`csv-row ${!r.valid?"err-row":""}`}><div className="csv-cell" style={{color:"var(--tx3)"}}>{r.idx}</div><div className="csv-cell">{r.name||"—"}</div><div className="csv-cell">{r.email||"—"}</div><div className="csv-cell"><span className="r-tag r-user">{r.role}</span></div><div className="csv-err-tag">{r.valid?<span style={{color:"var(--green)"}}>✓ OK</span>:r.errors.join(" · ")}</div></div>))}</div></>)}
          </div><div className="mf"><button className="b-cancel" onClick={onClose}>{t("csvCancel")}</button>{parsed&&<button className="b-sub" onClick={handleImport} disabled={validRows.length===0}>{t("csvImport")} ({validRows.length})</button>}</div></>
        )}
      </div>
    </div>
  );
}

function AdminUsers({ users, setUsers, currentUser }) {
  const { t } = useApp();
  const [modal, setModal] = useState(null);
  const toggleRole   = id => setUsers(us=>us.map(u=>u.id===id?{...u,role:u.role==="admin"?"user":"admin"}:u));
  const toggleAccess = id => setUsers(us=>us.map(u=>u.id===id?{...u,active:!u.active}:u));
  const changeDeskType = (id, dt) => setUsers(us=>us.map(u=>u.id===id?{...u,deskType:dt}:u));
  const toggleModule = (id, modId) => setUsers(us=>us.map(u=>{ if (u.id!==id) return u; const mods = u.modules||["jt","hd","retro","deploy"]; return {...u, modules: mods.includes(modId) ? mods.filter(m=>m!==modId) : [...mods, modId]}; }));
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
          <thead><tr><th>{t("colUser")}</th><th>{t("colEmail")}</th><th>{t("colRole")}</th><th>{t("colDeskType")}</th><th>Módulos</th><th>{t("colAccess")}</th><th>{t("colActions")}</th></tr></thead>
          <tbody>{users.map(u=>(
            <tr key={u.id}>
              <td><div style={{display:"flex",alignItems:"center",gap:8}}><div className="avatar" style={{width:26,height:26,fontSize:9,flexShrink:0}}>{u.avatar}</div><span style={{fontWeight:500}}>{u.name}</span>{u.id===currentUser.id&&<span style={{fontSize:9,color:"var(--tx3)"}}>{t("you")}</span>}</div></td>
              <td style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--tx3)"}}>{u.email}</td>
              <td><span className={`r-tag ${u.role==="admin"?"r-admin":"r-user"}`}>{u.role==="admin"?t("roleAdmin"):t("roleUser")}</span></td>
              <td><div style={{display:"flex",gap:3}}>{[DeskType.NONE, DeskType.HOTDESK, DeskType.FIXED].map(dt=>(<button key={dt} onClick={()=>changeDeskType(u.id,dt)} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,border:`1px solid ${u.deskType===dt?DESK_COLORS[dt]:"var(--bd)"}`,background:u.deskType===dt?`${DESK_COLORS[dt]}15`:"transparent",color:u.deskType===dt?DESK_COLORS[dt]:"var(--tx3)",cursor:"pointer"}}>{DESK_LABELS[dt]}</button>))}</div></td>
              <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{MODULES.map(m=>{const hasMod=(u.modules||["jt","hd","retro","deploy"]).includes(m.id);return(<button key={m.id} onClick={()=>toggleModule(u.id,m.id)} style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:3,border:`1px solid ${hasMod?m.color:"var(--bd)"}`,background:hasMod?`${m.color}18`:"transparent",color:hasMod?m.color:"var(--tx3)",cursor:"pointer",textDecoration:hasMod?"none":"line-through"}}>{m.id.toUpperCase()}</button>);})}</div></td>
              <td><span style={{fontSize:11,fontWeight:500,color:u.active?"var(--green)":"var(--red)"}}>{u.active?t("statusActive"):t("statusBlocked")}</span></td>
              <td>
                <button className="act act-adm" onClick={()=>toggleRole(u.id)}>{u.role==="admin"?t("removeAdmin"):t("makeAdmin")}</button>
                <button className="act act-pwd" onClick={()=>setModal({type:"pwd",user:u})}>{t("changePwdBtn")}</button>
                {u.id!==currentUser.id&&<button className={`act ${u.active?"act-d":"act-a"}`} onClick={()=>toggleAccess(u.id)}>{u.active?t("blockUser"):t("unblockUser")}</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {modal==="add"&&<AddUserModal existingUsers={users} onClose={()=>setModal(null)} onSave={handleAdd}/>}
      {modal==="csv"&&<CsvImportModal existingUsers={users} onClose={()=>setModal(null)} onImport={handleImport}/>}
      {modal?.type==="pwd"&&<ChangePasswordModal user={modal.user} onClose={()=>setModal(null)}/>}
    </div>
  );
}

function AdminHotDesk({ hd, setHd, users }) {
  const { t } = useApp();
  const [buildings,  setBuildings]  = useState([]);
  const [floors,     setFloors]     = useState([]);
  const [selBldg,    setSelBldg]    = useState(null);
  const [selFloor,   setSelFloor]   = useState(null);
  const [selSeat,    setSelSeat]    = useState(null);
  const [selUser,    setSelUser]    = useState('');
  const [asFixed,    setAsFixed]    = useState(false);
  const [selDates,   setSelDates]   = useState([]);
  const [yr, sYr]  = useState(new Date().getFullYear());
  const [mo, sMo]  = useState(new Date().getMonth());
  const CELL=52,PAD=14,LH=18;
  const hotdeskUsers = users.filter(u => u.deskType===DeskType.HOTDESK || u.deskType===DeskType.FIXED);

  useEffect(()=>{
    supabase.from('buildings').select('*').eq('active',true).order('name')
      .then(({data})=>{if(data){setBuildings(data);if(data[0])setSelBldg(data[0]);}});
  },[]);

  useEffect(()=>{
    if(!selBldg){setFloors([]);setSelFloor(null);return;}
    supabase.from('blueprints').select('id,floor_name,floor_order,layout')
      .eq('building_id',selBldg.id).order('floor_order')
      .then(({data})=>{if(data){setFloors(data);setSelFloor(data[0]||null);}});
  },[selBldg?.id]);

  function getSeatsForItem(item) {
    if(item.shape==='circle'){
      const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
      const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
      const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
      return Array.from({length:n},(_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return{id:pfx+(i+1)};});
    }
    const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
    const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
    let n=1;return Array.from({length:cols*rows},()=>{const s={id:pfx+n};n++;return s;});
  }

  const seats = useMemo(()=>{
    const items=(() => { try { return Array.isArray(selFloor?.layout)?selFloor.layout:[]; } catch { return []; }})();
    if(!items.length) return SEATS.map(s=>({...s}));
    const result=[];
    items.forEach(item=>{
      if(item.type!=='desk'&&item.type!=='circle') return;
      const dis=item.disabled||[];
      getSeatsForItem(item).forEach(s=>{ if(!dis.includes(s.id)) result.push(s); });
    });
    return result;
  },[selFloor?.id]);

  const confirmAssign = async () => {
    if (!selSeat || !selUser) return;
    const usr = users.find(u=>u.id===selUser);
    if (asFixed) {
      setHd(h=>({ ...h, fixed:{ ...h.fixed, [selSeat]:usr?.name||selUser }, reservations:h.reservations.filter(r=>r.seatId!==selSeat) }));
      await supabase.from('fixed_assignments').upsert({seat_id:selSeat,user_id:selUser,user_name:usr?.name||selUser});
    } else {
      if (!selDates.length) return;
      setHd(h=>({ ...h, reservations:[ ...h.reservations.filter(r=>!selDates.includes(r.date)||r.seatId!==selSeat), ...selDates.map(date=>({seatId:selSeat,date,userId:selUser,userName:usr?.name||selUser})) ]}));
      const rows=selDates.map(d=>({id:`res-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,seat_id:selSeat,user_id:selUser,user_name:usr?.name||selUser,date:d}));
      await supabase.from('seat_reservations').upsert(rows,{onConflict:'seat_id,date'});
    }
    setSelSeat(null); setSelUser(''); setSelDates([]); setAsFixed(false);
  };

  const removeFixed = async (sid) => {
    setHd(h=>{ const f={...h.fixed}; delete f[sid]; return {...h,fixed:f}; });
    await supabase.from('fixed_assignments').delete().eq('seat_id',sid);
  };

  const occupiedForSeat = selSeat ? hd.reservations.filter(r=>r.seatId===selSeat).map(r=>r.date) : [];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,height:'100%',overflow:'hidden'}}>
      <div style={{flexShrink:0}}>
        <div className="sec-t">{t('hotdeskTitle')}</div>
        <div className="sec-sub">Assign seats and fixed allocations from the floor plan.</div>
      </div>

      {/* Building + Floor selectors */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
        {buildings.length > 0 ? <>
          <select className="a-inp" style={{width:'auto',fontSize:12,padding:'5px 10px'}}
            value={selBldg?.id||''} onChange={e=>{const b=buildings.find(x=>x.id===e.target.value);setSelBldg(b||null);}}>
            {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="a-inp" style={{width:'auto',fontSize:12,padding:'5px 10px'}}
            value={selFloor?.id||''} onChange={e=>{const fl=floors.find(x=>x.id===e.target.value);setSelFloor(fl||null);setSelSeat(null);}}>
            {floors.map(fl=><option key={fl.id} value={fl.id}>{fl.floor_name}</option>)}
          </select>
          <span style={{fontSize:11,color:'var(--tx3)'}}>{seats.length} seats</span>
        </> : (
          <div style={{fontSize:12,color:'var(--tx3)'}}>No buildings — create in Admin → Blueprint first.</div>
        )}
      </div>

      {/* Main layout: map left, controls right */}
      <div style={{display:'flex',gap:16,flex:1,minHeight:0,overflow:'hidden'}}>

        {/* Floor map */}
        <div style={{flex:'0 0 auto',width:420}}>
          <div style={{flex:1,minHeight:350}}>
          {selFloor ? <BlueprintHDMap
            hd={hd}
            blueprint={selFloor}
            currentUser={{id:''}}
            onSeat={sid=>{setSelSeat(sid);setSelDates([]);setSelUser('');setAsFixed(false);}}
            highlightSeat={selSeat}
          /> : <div style={{height:300,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize:12}}>Select a building & floor</div>}
        </div>

        </div>

        {/* Right: seat grid + assign panel */}
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:12,overflow:'auto'}}>

          {/* Seat grid */}
          <div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--tx3)',marginBottom:8}}>SELECT SEAT</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {seats.map(seat=>{
                const st=ReservationService.statusOf(seat.id,MOCK_TODAY,hd.fixed,hd.reservations);
                const isSel=selSeat===seat.id;
                return(
                  <button key={seat.id}
                    onClick={()=>{setSelSeat(seat.id);setSelDates([]);setSelUser('');setAsFixed(false);}}
                    style={{width:46,height:36,border:`1px solid ${isSel?'var(--ac)':st===SeatStatus.FIXED?'rgba(239,68,68,.4)':st===SeatStatus.OCCUPIED?'rgba(59,130,246,.35)':'var(--bd)'}`,
                      borderRadius:'var(--r)',background:isSel?'var(--glow)':st===SeatStatus.FIXED?'rgba(239,68,68,.06)':st===SeatStatus.OCCUPIED?'rgba(59,130,246,.06)':'var(--sf2)',
                      color:isSel?'var(--ac2)':st===SeatStatus.FIXED?'var(--red)':st===SeatStatus.OCCUPIED?'var(--ac2)':'var(--tx2)',
                      cursor:'pointer',fontSize:9,fontWeight:600,textAlign:'center',lineHeight:1.2,padding:'2px 3px',transition:'var(--ease)'}}>
                    {seat.id}
                    {hd.fixed[seat.id]&&<div style={{fontSize:7,lineHeight:1,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{hd.fixed[seat.id].split(' ')[0].slice(0,5)}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fixed seats summary */}
          {Object.keys(hd.fixed).length>0&&(
            <div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--tx3)',marginBottom:6}}>Fixed seats</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {Object.entries(hd.fixed).map(([sid,uname])=>(
                  <div key={sid} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 8px',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.2)',borderRadius:'var(--r)',fontSize:11}}>
                    <span style={{fontFamily:'var(--mono)',color:'var(--red)',fontWeight:700,fontSize:11}}>{sid}</span>
                    <span style={{color:'var(--tx2)'}}>{uname}</span>
                    <button onClick={()=>removeFixed(sid)} style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:12,padding:'0 2px',lineHeight:1}}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assign panel */}
          {selSeat ? (
            <div className="a-card" style={{marginBottom:0,flexShrink:0}}>
              <div className="a-ct">🪑 Assign — <span style={{color:'var(--ac2)',fontFamily:'var(--mono)'}}>{selSeat}</span>
                <span style={{fontSize:10,fontWeight:400,color:'var(--tx3)',marginLeft:8}}>
                  {hd.fixed[selSeat]?'Fixed: '+hd.fixed[selSeat]:hd.reservations.find(r=>r.seatId===selSeat&&r.date===MOCK_TODAY)?.userName||'Free today'}
                </span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <select className="a-inp" value={selUser} onChange={e=>setSelUser(e.target.value)} style={{cursor:'pointer'}}>
                  <option value="">— Select user —</option>
                  {hotdeskUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <div onClick={()=>setAsFixed(f=>!f)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--sf2)',borderRadius:'var(--r)',border:`1px solid ${asFixed?'rgba(239,68,68,.3)':'var(--bd)'}`,cursor:'pointer'}}>
                  <div style={{width:14,height:14,borderRadius:3,background:asFixed?'var(--red)':'transparent',border:`2px solid ${asFixed?'var(--red)':'var(--bd2)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {asFixed&&<span style={{color:'#fff',fontSize:9,fontWeight:700}}>✓</span>}
                  </div>
                  <div>
                    <div style={{fontSize:12,color:asFixed?'var(--red)':'var(--tx2)',fontWeight:asFixed?600:400}}>📌 Mark as permanent</div>
                    <div style={{fontSize:10,color:'var(--tx3)'}}>Seat permanently locked for this person</div>
                  </div>
                </div>
                {!asFixed&&(
                  <div>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--tx3)',marginBottom:6}}>Select dates</div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <button className="n-arr" onClick={()=>mo===0?(sMo(11),sYr(y=>y-1)):sMo(m=>m-1)}>‹</button>
                      <span style={{fontSize:11,fontWeight:600,color:'var(--ac2)'}}>{fmtMonthYear(yr,mo,'en')}</span>
                      <button className="n-arr" onClick={()=>mo===11?(sMo(0),sYr(y=>y+1)):sMo(m=>m+1)}>›</button>
                    </div>
                    <MiniCalendar year={yr} month={mo} selectedDates={selDates} onToggleDate={d=>setSelDates(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d])} occupiedDates={occupiedForSeat}/>
                    {selDates.length>0&&<div style={{fontSize:10,color:'var(--green)',marginTop:6}}>{selDates.length} date{selDates.length!==1?'s':''} selected</div>}
                  </div>
                )}
                <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                  <button className="b-cancel" onClick={()=>{setSelSeat(null);setSelUser('');setSelDates([]);}}>Cancel</button>
                  <button className="b-sub" onClick={confirmAssign} disabled={!selUser||(!asFixed&&selDates.length===0)}>
                    {asFixed?'📌 Assign permanently':'Assign ('+selDates.length+')'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{padding:16,background:'var(--sf2)',borderRadius:'var(--r2)',border:'1px solid var(--bd)',color:'var(--tx3)',fontSize:12,textAlign:'center'}}>
              ← Click a seat on the map or in the grid above to assign it
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// BLUEPRINT HD MAP — renders blueprint layout for seat reservation
// ══════════════════════════════════════════════════════════════════

function BlueprintHDMap({ hd, onSeat, currentUser, blueprint, highlightSeat=null }) {
  const { theme } = useApp();
  const canvasRef = useRef(null);
  const cwRef = useRef(null);
  const [hoveredSeat, setHoveredSeat] = useState(null);
  const [seatHoverInfo, setSeatHoverInfo] = useState(null); // {id, name, x, y}
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({x:0,y:0});

  const items = (() => {
    try { return Array.isArray(blueprint?.layout) ? blueprint.layout : []; } catch { return []; }
  })();

  // Calculate bounding box of all items to fit canvas
  const bbox = useMemo(() => {
    if(!items.length) return {minX:0,minY:0,maxX:800,maxY:600};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    items.forEach(i=>{
      if(i.pts&&i.pts.length){
        i.pts.forEach(p=>{ if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; });
      } else if(i.type==='door'||i.type==='window'){
        // Door/window pivot at (x,y), extends sw in rotated space — use loose bounds
        const sw=i.w||48;
        if(i.x-sw<minX)minX=i.x-sw; if(i.y-sw<minY)minY=i.y-sw;
        if(i.x+sw>maxX)maxX=i.x+sw; if(i.y+sw>maxY)maxY=i.y+sw;
      } else {
        if(i.x<minX) minX=i.x; if(i.y<minY) minY=i.y;
        if(i.x+i.w>maxX) maxX=i.x+i.w; if(i.y+i.h>maxY) maxY=i.y+i.h;
      }
    });
    return {minX:minX-20,minY:minY-20,maxX:maxX+20,maxY:maxY+20};
  }, [blueprint?.id]);

  const CELL=52,PAD=14,LH=18;
  const dk = theme==='dark';

  // Get seat positions from a cluster item
  function getSeatsForItem(item) {
    if(item.shape==='circle'){
      const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;
      const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));
      const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
      return Array.from({length:n},(_,i)=>{
        const a=(i/n)*2*Math.PI-Math.PI/2;
        return{id:pfx+(i+1),x:cx+R*Math.cos(a)-CELL/2+2,y:cy+R*Math.sin(a)-CELL/2+2,w:CELL-4,h:CELL-4};
      });
    }
    const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-LH)/CELL));
    const tW=cols*CELL,tH=rows*CELL,sx=x+PAD+(w-PAD*2-tW)/2,sy=y+LH+PAD+(h-LH-PAD*2-tH)/2;
    const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();
    let n=1;return Array.from({length:cols*rows},(_,i)=>{const r=Math.floor(i/cols),cc=i%cols;const s={id:pfx+n,x:sx+cc*CELL+2,y:sy+r*CELL+2,w:CELL-4,h:CELL-4};n++;return s;});
  }

  // All active seats from blueprint
  const allSeats = useMemo(() => {
    const seats = [];
    items.forEach(item=>{
      if(item.type==='desk'||item.type==='circle'){
        const dis=item.disabled||[];
        getSeatsForItem(item).forEach(s=>{
          if(!dis.includes(s.id)) seats.push({...s, clusterLabel:item.label});
        });
      }
    });
    return seats;
  }, [blueprint?.id]);

  useEffect(() => {
    const cw = cwRef.current;
    if(!cw) return;
    function resize() {
      const cvs = canvasRef.current;
      if(!cvs) return;
      const W = cw.clientWidth, H = cw.clientHeight;
      cvs.width = W; cvs.height = H;
      // Compute scale to fit bbox
      const bW = bbox.maxX-bbox.minX, bH = bbox.maxY-bbox.minY;
      const s = Math.min((W-40)/bW, (H-40)/bH, 1.5);
      const ox = (W - bW*s)/2 - bbox.minX*s;
      const oy = (H - bH*s)/2 - bbox.minY*s;
      setScale(s); setOffset({x:ox, y:oy});
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cw);
    return ()=>ro.disconnect();
  }, [bbox]);

  // Draw
  useEffect(() => {
    const cvs = canvasRef.current;
    if(!cvs) return;
    const ctx = cvs.getContext('2d');
    const W=cvs.width, H=cvs.height;
    ctx.clearRect(0,0,W,H);
    ctx.save();
    ctx.setTransform(scale,0,0,scale,offset.x,offset.y);

    function rr(x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

    // Draw items (background first: zones, walls, rooms, doors, windows)
    // Zones
    items.filter(i=>i.type==='zone').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(40,30,80,.2)':'rgba(238,242,255,.6)';ctx.strokeStyle='#818cf8';ctx.lineWidth=1;ctx.setLineDash([6,4]);
      rr(x,y,w,h,5);ctx.fill();ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=dk?'rgba(165,180,252,.85)':'#4338ca';ctx.font='700 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText((i.label||'Zone').toUpperCase(),x+w/2,y+h*0.22);
    });
    // Rooms
    items.filter(i=>i.type==='room').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(15,30,70,.5)':'rgba(219,234,254,.6)';ctx.strokeStyle='#3b82f6';ctx.lineWidth=1;ctx.setLineDash([]);
      rr(x,y,w,h,5);ctx.fill();ctx.stroke();
      ctx.fillStyle=dk?'#93c5fd':'#1e40af';ctx.font='600 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(i.label||'Room',x+w/2,y+h*0.22);
    });
    // Walls — polyline (pts[]) OR rect fallback
    items.filter(i=>i.type==='wall').forEach(i=>{
      ctx.strokeStyle=dk?'#777':'#999';ctx.lineWidth=4;ctx.setLineDash([]);ctx.lineCap='round';ctx.lineJoin='round';
      if(i.pts&&i.pts.length>=2){
        ctx.beginPath();ctx.moveTo(i.pts[0].x,i.pts[0].y);
        i.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
        ctx.stroke();
      } else {
        ctx.fillStyle=dk?'rgba(70,70,70,.5)':'rgba(140,140,140,.3)';
        rr(i.x,i.y,i.w,i.h,2);ctx.fill();ctx.stroke();
      }
      ctx.lineCap='butt';ctx.lineJoin='miter';
    });
    // Doors — pure world-coordinate math, NO ctx.translate/rotate
    // Avoids any potential conflict with the outer scale transform.
    // angle=0: gap→right, leaf→up(into building). arc in upper-right.
    // angle=90: gap→down, leaf→right, arc in lower-right.
    items.filter(i=>i.type==='door').forEach(i=>{
      const{x,y}=i;
      const rad=(i.angle||0)*Math.PI/180;
      const sw=i.w||48;
      const cA=Math.cos(rad),sA=Math.sin(rad);
      // Gap end = (x + sw*cos, y + sw*sin)
      const gx=x+sw*cA, gy=y+sw*sA;
      // Leaf end = (x + sw*sin, y - sw*cos)  [perpendicular, inward]
      const lx=x+sw*sA, ly=y-sw*cA;
      ctx.strokeStyle='#fb923c';ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.lineCap='round';
      // Gap line
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(gx,gy);ctx.stroke();
      // Leaf
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx,ly);ctx.stroke();
      // Arc: from gap direction (rad) anticlockwise to leaf direction (rad-PI/2)
      ctx.lineWidth=0.8;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.arc(x,y,sw,rad,rad-Math.PI/2,true);ctx.stroke();
      if(i.double){
        ctx.setLineDash([]);ctx.lineWidth=1.5;
        // Second leaf from gap-end going same perpendicular dir
        ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+sw*sA,gy-sw*cA);ctx.stroke();
        ctx.lineWidth=0.8;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.arc(gx,gy,sw,rad+Math.PI,rad-Math.PI/2,false);ctx.stroke();
      }
      ctx.setLineDash([]);ctx.lineCap='butt';
    });
    // Windows — pure world-coordinate math, NO ctx.translate/rotate
    // Two parallel lines straddling the wall, with end ticks.
    items.filter(i=>i.type==='window').forEach(i=>{
      const{x,y}=i;
      const rad=(i.angle||0)*Math.PI/180;
      const sw=i.w||48,hth=3; // half-thickness = 3 (total 6)
      const cA=Math.cos(rad),sA=Math.sin(rad);
      // Perpendicular unit vector (rotated 90° from gap direction)
      const px=-sA,py=cA;
      // Four corners
      const x1=x+px*hth, y1=y+py*hth;
      const x2=x+sw*cA+px*hth, y2=y+sw*sA+py*hth;
      const x3=x+sw*cA-px*hth, y3=y+sw*sA-py*hth;
      const x4=x-px*hth, y4=y-py*hth;
      ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.5;ctx.setLineDash([]);
      // Line 1 (one side of wall)
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      // Line 2 (other side of wall)
      ctx.beginPath();ctx.moveTo(x4,y4);ctx.lineTo(x3,y3);ctx.stroke();
      // End ticks
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x4,y4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x3,y3);ctx.stroke();
      if(i.double){
        const mx=x+sw/2*cA, my=y+sw/2*sA;
        ctx.beginPath();ctx.moveTo(mx+px*hth,my+py*hth);ctx.lineTo(mx-px*hth,my-py*hth);ctx.stroke();
      }
    });

    // Draw clusters (border + zone label)
    items.filter(i=>i.type==='desk'||i.type==='circle').forEach(i=>{
      const{x,y,w,h}=i;
      ctx.fillStyle=dk?'rgba(3,15,6,.4)':'rgba(240,253,244,.5)';
      ctx.strokeStyle=dk?'rgba(34,197,94,.3)':'rgba(22,101,52,.25)';
      ctx.lineWidth=1;ctx.setLineDash([5,4]);
      if(i.shape==='circle'){const cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2;ctx.beginPath();ctx.arc(cx,cy,R,0,2*Math.PI);ctx.fill();ctx.stroke();}
      else{rr(x,y,w,h,7);ctx.fill();ctx.stroke();}
      ctx.setLineDash([]);
      // Zone label — just above first row of seats (not at top of cluster box)
      const seats=getSeatsForItem(i);
      if(seats.length>0){
        const firstY=Math.min(...seats.map(s=>s.y));
        ctx.fillStyle=dk?'rgba(134,239,172,.5)':'rgba(22,101,52,.5)';
        ctx.font='500 9px var(--font-sans,sans-serif)';
        ctx.textAlign='center';ctx.textBaseline='bottom';
        ctx.fillText((i.label||'Zone').toUpperCase(),x+w/2,firstY-4);
      }
    });

    // Draw seats
    allSeats.forEach(s=>{
      const{x,y,w,h,id}=s;
      const res=hd.reservations.find(r=>r.seatId===id&&r.date===TODAY);
      const isFixed=!!hd.fixed[id];
      const isMine=res?.userId===currentUser.id;
      const isOcc=!!res||isFixed;
      const isHov=hoveredSeat===id;
      let fc,sc,tc;
      if(isFixed){fc=dk?'rgba(80,0,0,.55)':'rgba(254,226,226,.8)';sc='#ef4444';tc=dk?'#fca5a5':'#991b1b';}
      else if(isMine){fc=dk?'rgba(60,40,0,.6)':'rgba(255,251,235,.8)';sc='#f59e0b';tc=dk?'#fcd34d':'#92400e';}
      else if(isOcc){fc=dk?'rgba(20,30,80,.55)':'rgba(219,234,254,.8)';sc='#3b82f6';tc=dk?'#93c5fd':'#1e40af';}
      else{fc=dk?'rgba(5,35,12,.65)':'rgba(220,252,231,.85)';sc=isHov?'#4ade80':'#22c55e';tc=dk?'#86efac':'#166534';}
      ctx.fillStyle=fc;ctx.strokeStyle=sc;ctx.lineWidth=isHov?2:1;
      rr(x,y,w,h,5);ctx.fill();ctx.stroke();
      if(!isOcc&&!isHov){ctx.fillStyle='rgba(255,255,255,.02)';ctx.strokeStyle=sc+'33';ctx.lineWidth=.4;rr(x+3,y+3,w-6,h-6,3);ctx.fill();ctx.stroke();}
      // Highlight ring for admin-selected seat
      if(id===highlightSeat){ctx.strokeStyle='#f59e0b';ctx.lineWidth=2.5;ctx.setLineDash([]);rr(x-3,y-3,w+6,h+6,7);ctx.stroke();}
      // Only show seat ID — color conveys status
      ctx.fillStyle=tc;ctx.font='bold 9px monospace';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(id,x+w/2,y+h/2);
    });

    ctx.restore();
  }, [items, hd, scale, offset, hoveredSeat, theme]);

  // Hit test seat in canvas coords
  function seatAt(px,py){
    const wx=(px-offset.x)/scale, wy=(py-offset.y)/scale;
    return allSeats.find(s=>wx>=s.x&&wx<=s.x+s.w&&wy>=s.y&&wy<=s.y+s.h)||null;
  }

  const freeCount = allSeats.filter(s=>!hd.fixed[s.id]&&!hd.reservations.find(r=>r.seatId===s.id&&r.date===TODAY)).length;
  const occCount  = allSeats.filter(s=>hd.reservations.find(r=>r.seatId===s.id&&r.date===TODAY)).length;
  const fixCount  = allSeats.filter(s=>hd.fixed[s.id]).length;

  return (
    <div className="hd-map-wrap">
      <div className="hd-map-header">
        <div className="cal-stats" style={{marginLeft:0}}>
          <div className="chip">Free: <strong style={{color:'var(--green)'}}>{freeCount}</strong></div>
          <div className="chip">Occupied: <strong style={{color:'var(--ac2)'}}>{occCount}</strong></div>
          <div className="chip">Fixed: <strong style={{color:'var(--red)'}}>{fixCount}</strong></div>
          <div className="chip">Total: <strong>{allSeats.length}</strong></div>
        </div>
        <div className="hd-legend">
          {[['Free','var(--seat-free)'],['Occupied','var(--seat-occ)'],['Fixed','var(--seat-fixed)'],['Mine','var(--amber)']].map(([l,col])=>(
            <div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:col}}/>{l}</div>
          ))}
        </div>
      </div>
      <div className="hd-card" ref={cwRef} style={{position:'relative',height:'calc(100vh - 220px)',minHeight:400,padding:0,overflow:'hidden'}}>
        <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%',
          cursor: hoveredSeat ? 'pointer' : 'default'}}
          onMouseMove={e=>{
            const r=canvasRef.current?.getBoundingClientRect();
            if(!r)return;
            const s=seatAt(e.clientX-r.left,e.clientY-r.top);
            setHoveredSeat(s?.id||null);
            if(s){
              const res=hd.reservations.find(rv=>rv.seatId===s.id&&rv.date===TODAY);
              const isFixed=!!hd.fixed[s.id];
              const name=isFixed?hd.fixed[s.id]:res?.userName||null;
              setSeatHoverInfo({id:s.id,name,x:e.clientX,y:e.clientY});
            }else{setSeatHoverInfo(null);}
          }}
          onMouseLeave={()=>{setHoveredSeat(null);setSeatHoverInfo(null);}}
          onClick={e=>{
            const r=canvasRef.current?.getBoundingClientRect();
            if(!r)return;
            const s=seatAt(e.clientX-r.left,e.clientY-r.top);
            if(s) onSeat(s.id);
          }}
        />
        {!allSeats.length && (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize:13,flexDirection:'column',gap:8}}>
            <span style={{fontSize:24}}>🗺</span>
            <span>No seats in this blueprint. Edit it in Admin → Blueprint.</span>
          </div>
        )}
      </div>
      {seatHoverInfo&&(
        <div style={{position:'fixed',left:seatHoverInfo.x+14,top:seatHoverInfo.y-10,
          background:'var(--sf)',border:'1px solid var(--bd2)',borderRadius:'var(--r)',
          padding:'5px 10px',zIndex:9901,pointerEvents:'none',
          boxShadow:'var(--shadow)',animation:'mbIn .1s ease',whiteSpace:'nowrap'}}>
          <span style={{fontFamily:'var(--mono)',fontWeight:700,color:hoveredSeat?'var(--ac2)':'var(--tx)',fontSize:12}}>{seatHoverInfo.id}</span>
          {seatHoverInfo.name&&<span style={{fontSize:11,color:'var(--tx2)',marginLeft:8}}>{seatHoverInfo.name}</span>}
          {!seatHoverInfo.name&&<span style={{fontSize:11,color:'var(--green)',marginLeft:8}}>Free</span>}
        </div>
      )}
      <div className="hd-sub">Click on a green seat to reserve · <span style={{color:'var(--amber)'}}>● your reservation</span></div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// BLUEPRINT EDITOR — Admin module
// ══════════════════════════════════════════════════════════════════

function AdminBlueprint() {
  const [buildings, setBuildings]   = useState([]);
  const [selBldg,   setSelBldg]     = useState(null);
  const [floors,    setFloors]      = useState([]);
  const [selFloor,  setSelFloor]    = useState(null);
  const [saving,    setSaving]      = useState(false);
  const [msg,       setMsg]         = useState('');
  const [showEdit,  setShowEdit]    = useState(false);
  const [bForm,     setBForm]       = useState({name:'',address:''});
  const [collapsed, setCollapsed]   = useState({}); // {[bId]: bool}
  const [editorKey, setEditorKey]   = useState(0);
  const dragFloorRef = useRef(null);

  useEffect(() => {
    supabase.from('buildings').select('*').eq('active',true).order('name')
      .then(({data})=>{ if(data) setBuildings(data); });
  }, []);

  useEffect(() => {
    if(!selBldg){setFloors([]);setSelFloor(null);return;}
    supabase.from('blueprints').select('id,floor_name,floor_order,layout')
      .eq('building_id',selBldg.id).order('floor_order')
      .then(({data})=>{ if(data){setFloors(data);if(!selFloor||!data.find(f=>f.id===selFloor.id))setSelFloor(data[0]||null);}});
  }, [selBldg?.id]);

  const saveBuilding = async () => {
    if(!bForm.name.trim()) return;
    setSaving(true);
    const{data,error}=await supabase.from('buildings').insert({name:bForm.name.trim(),address:bForm.address.trim()||null}).select().single();
    if(!error&&data){setBuildings(b=>[...b,data]);setSelBldg(data);setBForm({name:'',address:''});setShowEdit(false);setMsg('Building created');setTimeout(()=>setMsg(''),3000);}
    setSaving(false);
  };

  const addFloor = async () => {
    if(!selBldg) return;
    const name=prompt('Floor name:','Floor '+(floors.length+1));
    if(!name) return;
    const{data,error}=await supabase.from('blueprints').insert({building_id:selBldg.id,floor_name:name,floor_order:floors.length,layout:[]}).select().single();
    if(!error&&data){setFloors(f=>[...f,data]);setSelFloor(data);}
  };

  const deleteFloor = async (id) => {
    if(!confirm('Delete this floor and its layout?')) return;
    await supabase.from('blueprints').delete().eq('id',id);
    const next=floors.filter(f=>f.id!==id);
    setFloors(next);
    setSelFloor(selFloor?.id===id?(next[0]||null):selFloor);
  };

  const renameFloor = async (id) => {
    const fl=floors.find(f=>f.id===id);
    const nv=prompt('Rename:',fl?.floor_name||'');
    if(!nv||!nv.trim()) return;
    await supabase.from('blueprints').update({floor_name:nv.trim()}).eq('id',id);
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
    await Promise.all(next.map((f,i)=>supabase.from('blueprints').update({floor_order:i}).eq('id',f.id)));
  };

  const saveLayout = async (layout) => {
    if(!selFloor) return;
    setSaving(true);
    const{error}=await supabase.from('blueprints').update({layout,updated_at:new Date().toISOString()}).eq('id',selFloor.id);
    if(!error){
      setFloors(f=>f.map(fl=>fl.id===selFloor.id?{...fl,layout}:fl));
      setSelFloor(sf=>sf?.id===selFloor.id?{...sf,layout}:sf);
      setMsg('✓ Blueprint saved');setTimeout(()=>setMsg(''),3000);
    }else setMsg('Error: '+error.message);
    setSaving(false);
  };

  const deleteBuilding = async (id) => {
    if(!confirm('Delete building and ALL its floors?')) return;
    await supabase.from('buildings').delete().eq('id',id);
    setBuildings(b=>b.filter(x=>x.id!==id));
    if(selBldg?.id===id){setSelBldg(null);setFloors([]);setSelFloor(null);}
  };

  const renameBuilding = async (b) => {
    const nv=prompt('Building name:',b.name);
    if(!nv||!nv.trim()) return;
    await supabase.from('buildings').update({name:nv.trim()}).eq('id',b.id);
    setBuildings(bs=>bs.map(x=>x.id===b.id?{...x,name:nv.trim()}:x));
    if(selBldg?.id===b.id) setSelBldg(sb=>({...sb,name:nv.trim()}));
  };

  return (
    <div style={{display:'flex',gap:0,height:'100%',flex:1,minHeight:0}}>
      {/* Sidebar: buildings + collapsible floors */}
      <div style={{width:220,borderRight:'1px solid var(--bd)',display:'flex',flexDirection:'column',background:'var(--sf)',overflow:'hidden',flexShrink:0}}>
        <div style={{padding:'8px 10px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--tx3)'}}>Buildings</span>
          <button className="btn-g" onClick={()=>setShowEdit(s=>!s)} style={{fontSize:10,padding:'2px 8px'}}>+ Add</button>
        </div>

        {showEdit && (
          <div style={{padding:'8px 10px',borderBottom:'1px solid var(--bd)',display:'flex',flexDirection:'column',gap:6,background:'var(--sf2)',flexShrink:0}}>
            <input className="a-inp" placeholder="Building name *" value={bForm.name} onChange={e=>setBForm(b=>({...b,name:e.target.value}))} style={{fontSize:11,padding:'4px 7px'}}/>
            <input className="a-inp" placeholder="Address (optional)" value={bForm.address} onChange={e=>setBForm(b=>({...b,address:e.target.value}))} style={{fontSize:11,padding:'4px 7px'}}/>
            <div style={{display:'flex',gap:5}}>
              <button className="b-cancel" style={{flex:1,padding:'4px',fontSize:11}} onClick={()=>setShowEdit(false)}>Cancel</button>
              <button className="b-sub" style={{flex:1,padding:'4px',fontSize:11}} onClick={saveBuilding} disabled={saving}>Save</button>
            </div>
          </div>
        )}

        <div style={{flex:1,overflowY:'auto'}}>
          {buildings.length===0 && <div style={{padding:'14px 10px',fontSize:11,color:'var(--tx3)'}}>No buildings yet</div>}
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
                  }} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)',fontSize:10,padding:'0 4px 0 0',flexShrink:0}}>
                    {isCollapsed?'▶':'▼'}
                  </button>
                  <div style={{flex:1,fontWeight:600,fontSize:12,color:isSelB?'var(--ac2)':'var(--tx)',cursor:'pointer',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                    onClick={()=>{setSelBldg(b);setCollapsed(c=>({...c,[b.id]:false}));}}>
                    🏢 {b.name}
                  </div>
                  <button onClick={e=>{e.stopPropagation();renameBuilding(b);}} style={{background:'none',border:'none',cursor:'pointer',fontSize:10,color:'var(--tx3)',padding:'1px 3px',opacity:.6}}>✎</button>
                  <button onClick={e=>{e.stopPropagation();deleteBuilding(b.id);}} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--tx3)',padding:'1px 3px',opacity:.6}}>×</button>
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
                        <span style={{flex:1,fontSize:11,color:selFloor?.id===fl.id?'var(--ac2)':'var(--tx2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {fl.floor_name}
                        </span>
                        <button onClick={e=>{e.stopPropagation();moveFloor(fl.id,-1);}} disabled={idx===0}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize:10,color:'var(--tx3)',padding:'1px 2px',opacity:idx===0?.2:1}} title="Move up">↑</button>
                        <button onClick={e=>{e.stopPropagation();moveFloor(fl.id,1);}} disabled={idx===bFloors.length-1}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize:10,color:'var(--tx3)',padding:'1px 2px',opacity:idx===bFloors.length-1?.2:1}} title="Move down">↓</button>
                        <button onClick={e=>{e.stopPropagation();renameFloor(fl.id);}}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize:10,color:'var(--tx3)',padding:'1px 3px'}}>✎</button>
                        <button onClick={e=>{e.stopPropagation();deleteFloor(fl.id);}}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--tx3)',padding:'1px 3px'}}>×</button>
                      </div>
                    ))}
                    <button className="btn-g" onClick={addFloor} style={{fontSize:10,padding:'3px 8px',margin:'4px 8px',width:'calc(100% - 16px)'}}>+ Add floor</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {msg&&<div style={{padding:'6px 10px',fontSize:11,color:'var(--green)',borderTop:'1px solid var(--bd)',flexShrink:0}}>{msg}</div>}
      </div>

      {/* Right: editor */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {!selBldg||!selFloor ? (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize:13}}>
            {buildings.length===0?'Create a building first':'Select a building and floor to edit its blueprint'}
          </div>
        ) : (
          <BlueprintEditorPanel key={editorKey+'-'+selFloor.id} floor={selFloor} onSave={saveLayout} saving={saving} msg={msg}/>
        )}
      </div>
    </div>
  );
}

// ── Blueprint editor panel (wraps the canvas editor) ─────────────
function BlueprintEditorPanel({ floor, onSave, saving, msg }) {
  const [items, setItems] = useState(() => {
    try { return Array.isArray(floor.layout) ? floor.layout : []; } catch { return []; }
  });

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'6px 12px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:10,background:'var(--sf)',flexShrink:0}}>
        <span style={{fontWeight:600,fontSize:13,color:'var(--tx)'}}>{floor.floor_name}</span>
        <span style={{fontSize:11,color:'var(--tx3)',marginLeft:'auto'}}>{items.filter(i=>i.type==='desk'||i.type==='circle').length} clusters</span>
        {msg&&<span style={{fontSize:11,color:'var(--green)'}}>{msg}</span>}
        <button className="btn-p" style={{padding:'5px 14px',width:'auto'}} onClick={()=>onSave(items)} disabled={saving}>
          {saving?'Saving…':'💾 Save blueprint'}
        </button>
      </div>
      <BlueprintCanvas items={items} onChange={setItems}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BUILDING SELECTOR — shown in HotDesk before map
// ─────────────────────────────────────────────────────────────────
// ── Building/Floor dropdown selectors (used in HotDesk nav bar) ──────────────
function BuildingFloorSelectors({ selectedBuilding, selectedBlueprint, onChange }) {
  const [buildings, setBuildings] = useState([]);
  const [floors,    setFloors]    = useState([]);

  useEffect(() => {
    supabase.from('buildings').select('*').eq('active',true).order('name')
      .then(({data})=>{
        if(!data) return;
        setBuildings(data);
        // Auto-select: last used from localStorage, or first building
        const lastBid = localStorage.getItem('ws_last_building');
        const b = data.find(x=>x.id===lastBid) || data[0];
        if(b && !selectedBuilding) onChange(b, null);
      });
  }, []);

  useEffect(() => {
    if(!selectedBuilding){setFloors([]);return;}
    supabase.from('blueprints').select('id,floor_name,floor_order,layout')
      .eq('building_id',selectedBuilding.id).order('floor_order')
      .then(({data})=>{
        if(!data) return;
        setFloors(data);
        // Auto-select: last used floor or first
        const lastFid = localStorage.getItem('ws_last_floor_'+selectedBuilding.id);
        const fl = data.find(x=>x.id===lastFid) || data[0];
        if(fl && (!selectedBlueprint || selectedBlueprint.id !== fl.id)) {
          onChange(selectedBuilding, fl);
        }
      });
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
    <span style={{fontSize:11,color:'var(--tx3)',padding:'0 8px'}}>No buildings — configure in Admin → Blueprint</span>
  );

  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <select
        value={selectedBuilding?.id||''}
        onChange={e=>selectBuilding(e.target.value)}
        style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:'var(--r)',
          padding:'4px 8px',fontSize:11,color:'var(--tx)',outline:'none',cursor:'pointer',fontFamily:'inherit'}}>
        <option value="">— Building —</option>
        {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <select
        value={selectedBlueprint?.id||''}
        onChange={e=>selectFloor(e.target.value)}
        disabled={!selectedBuilding||floors.length===0}
        style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:'var(--r)',
          padding:'4px 8px',fontSize:11,color:'var(--tx)',outline:'none',cursor:'pointer',fontFamily:'inherit',
          opacity:(!selectedBuilding||floors.length===0)?0.5:1}}>
        <option value="">— Floor —</option>
        {floors.map(fl=><option key={fl.id} value={fl.id}>{fl.floor_name}</option>)}
      </select>
    </div>
  );
}

// Legacy full-page selector kept for no-buildings case
function BuildingSelector({ onSelect }) {
  return (
    <div style={{padding:32,textAlign:'center',color:'var(--tx3)'}}>
      <div style={{fontSize:24,marginBottom:12}}>🏢</div>
      <div style={{fontSize:13,marginBottom:6}}>No buildings configured yet</div>
      <div style={{fontSize:11}}>An admin needs to create a building and blueprint in Admin → Blueprint</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BLUEPRINT CANVAS (self-contained, used inside AdminBlueprint)
// ─────────────────────────────────────────────────────────────────
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
    ['zone','wall','door','window','room','desk','circle'].forEach(type=>{S.items.filter(i=>i.type===type).forEach(i=>{ctx.save();drawItem(ctx,i,S.sel===i||(!S.sel&&(S.multiSel||[]).includes(i)));ctx.restore();});});
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
          cursor:'pointer',fontSize:12,fontFamily:'inherit',gap:4,...extra}}>
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
                color,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:isActive?600:400,whiteSpace:'nowrap',transition:'all .12s'}}>
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
        <div style={{padding:'6px 8px',fontSize:9,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--tx3)',borderBottom:'1px solid var(--bd)'}}>Properties</div>
        <div style={{padding:'8px',flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:7}}>
          {!selItem && <div style={{fontSize:11,color:'var(--tx3)',textAlign:'center',padding:'12px 0'}}>Select an element</div>}
          {selItem && <>
            {isCl && <>
              <div>
                <div style={{fontSize:9,fontWeight:600,color:'var(--tx3)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:3}}>Zone name</div>
                <input className="a-inp" defaultValue={selItem.label||''} style={{fontSize:11,padding:'3px 6px'}}
                  onChange={e=>pChange('label',e.target.value,false)}
                  onKeyDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}/>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:600,color:'var(--tx3)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:3}}>Seat prefix</div>
                <input className="a-inp" defaultValue={selItem.prefix||''} maxLength={4} style={{fontSize:11,padding:'3px 6px'}}
                  onChange={e=>pChange('prefix',e.target.value,false)}
                  onKeyDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}/>
              </div>
              <div style={{textAlign:'center',padding:'4px',background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.2)',borderRadius:4,fontSize:11,color:'#22c55e',fontWeight:700,fontFamily:'var(--mono)'}}>
                {seats.length-dis.filter(d=>seats.some(s=>s.id===d)).length} active · {dis.length} off
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:600,color:'var(--tx3)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:4}}>Seats (click = disable)</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:2}}>
                  {seats.map(s=>(
                    <span key={s.id}
                      onClick={()=>{saveH();if(!selItem.disabled)selItem.disabled=[];selItem.disabled.includes(s.id)?selItem.disabled=selItem.disabled.filter(d=>d!==s.id):selItem.disabled.push(s.id);onChange([...S.items]);draw();re();}}
                      style={{padding:'1px 4px',borderRadius:2,fontSize:9,fontFamily:'var(--mono)',cursor:'pointer',border:'1px solid',
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
                <div style={{fontSize:9,fontWeight:600,color:'var(--tx3)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:3}}>Label</div>
                <input className="a-inp" defaultValue={selItem.label||''} style={{fontSize:11,padding:'3px 6px'}}
                  onChange={e=>pChange('label',e.target.value,false)}
                  onKeyDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}/>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
              {[['W','w'],['H','h'],['X','x'],['Y','y']].map(([l,k])=>(
                <div key={k}>
                  <div style={{fontSize:9,color:'var(--tx3)',marginBottom:2}}>{l}</div>
                  <input className="a-inp" type="number" step={GRID} defaultValue={selItem[k]} style={{fontSize:11,padding:'3px 5px'}}
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
                    color:selItem.double?'#fb923c':'var(--tx2)',cursor:'pointer',fontSize:10,fontFamily:'inherit'}}>
                  {selItem.double?'Double':'Single'}
                </button>
                <button title="Rotate 90°" onClick={()=>{saveH();selItem.angle=((selItem.angle||0)+90)%360;onChange([...S.items]);draw();re();}}
                  style={{padding:'4px 8px',border:'1px solid var(--bd)',borderRadius:4,background:'var(--sf2)',
                    color:'var(--tx2)',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                  ↻ 90°
                </button>
              </div>
              <div style={{fontSize:9,color:'var(--tx3)',marginTop:2}}>Rotation: {selItem.angle||0}°</div>
            </>}
            <button onClick={()=>{if(!S.sel)return;saveH();S.items=S.items.filter(i=>i!==S.sel);S.sel=null;onChange([...S.items]);draw();re();}}
              style={{padding:'4px',border:'1px solid rgba(239,68,68,.2)',borderRadius:4,background:'transparent',color:'#ef4444',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>✕ Delete</button>
          </>}
        </div>
      </div>
      </div>{/* end canvas+props */}
      {/* Tooltip portal — renders on document.body to escape overflow:hidden stacking contexts */}
      {tbTip && createPortal(
        <div style={{position:'fixed',left:tbTip.x,top:tbTip.y,transform:'translate(-50%,-100%)',
          background:'#1a1a28',color:'#c8c8e8',fontSize:11,fontWeight:500,
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

// ══════════════════════════════════════════════════════════════════
// ROLE MANAGER
// ══════════════════════════════════════════════════════════════════

const ALL_MODULES = [
  {id:'jt',    label:'Jira Tracker'},
  {id:'hd',    label:'HotDesk'},
  {id:'retro', label:'RetroBoard 🔁'},
];

const ALL_ADMIN_PERMS = [
  {id:'users',      label:'Users',            desc:'Create, edit and deactivate users'},
  {id:'hotdesk',    label:'HotDesk Config',   desc:'Manage seat assignments and fixed allocations'},
  {id:'blueprint',  label:'Blueprint Editor', desc:'Create and edit floor plans'},
  {id:'settings',   label:'General Settings', desc:'Jira connection and platform-wide settings'},
  {id:'jira_config',label:'Jira Config',      desc:'Connect and configure Jira integration'},
  {id:'sso',        label:'SSO / Auth',       desc:'Configure SSO providers'},
  {id:'roles',      label:'Role Manager',     desc:'Create and edit permission roles'},
  {id:'retro_teams',    label:'Retro Teams',     desc:'Create and manage retrospective teams'},
  {id:'retro_sessions', label:'Retro Sessions',  desc:'View and manage past retro sessions'},
];

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


// Shell wrapper to load teams from Supabase for admin
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


function AdminShell({ users, setUsers, hd, setHd, currentUser }) {
  const { t } = useApp();
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
    { id:"settings",   icon:"⚙",  label:t("adminSettings") },
    { id:"users",      icon:"👥", label:t("adminUsers"),  badge:"Admin" },
    { id:"roles",      icon:"🛡", label:"Roles & Perms" },
    { id:"hotdesk",    icon:"🪑", label:t("adminHotDesk"),hd:true },
    { id:"blueprint",  icon:"🗺", label:"Blueprint" },
    { id:"retroteams", icon:"🔁", label:"Retro Teams" },
  ];
  return (
    <div className="admin-wrap">
      <nav className="admin-nav">
        <div className="admin-nav-t">{t("adminSidebar")}</div>
        {NAV.map(item=>(<button key={item.id} className={`an-btn ${mod===item.id ? (item.hd?"active-hd":"active") : ""}`} onClick={()=>setMod(item.id)}><span className="an-icon">{item.icon}</span><span>{item.label}</span>{item.badge&&<span className="an-badge">{item.badge}</span>}</button>))}
      </nav>
      <div className="admin-content">
        {mod==="settings"  && <AdminSettings/>}
        {mod==="users"     && <AdminUsers users={users} setUsers={setUsers} currentUser={currentUser}/>}
        {mod==="hotdesk"   && <AdminHotDesk hd={hd} setHd={setHd} users={users}/>}
        {mod==="roles"     && <AdminRoles/>}
        {mod==="blueprint" && <AdminBlueprint/>}
        {mod==="retroteams" && <AdminRetroTeamsShell users={users}/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CSS
// ══════════════════════════════════════════════════════════════════

const buildCSS = () => `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--body:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;--r:5px;--r2:8px;--ease:all .15s ease;--bg:#0d0d10;--sf:#141418;--sf2:#1b1b22;--sf3:#21212c;--bd:#2a2a38;--bd2:#383850;--ac:#4f6ef7;--ac2:#7b93ff;--glow:rgba(79,110,247,.12);--green:#3ecf8e;--amber:#f5a623;--red:#e05252;--purple:#b57cf6;--tx:#e4e4ef;--tx2:#8888a8;--tx3:#50506a;--shadow:0 8px 30px rgba(0,0,0,.55);--seat-free:#3ecf8e;--seat-occ:#4f6ef7;--seat-fixed:#e05252;color-scheme:dark;}
[data-theme="dark"]{--bg:#0d0d10;--sf:#141418;--sf2:#1b1b22;--sf3:#21212c;--bd:#2a2a38;--bd2:#383850;--ac:#4f6ef7;--ac2:#7b93ff;--glow:rgba(79,110,247,.12);--green:#3ecf8e;--amber:#f5a623;--red:#e05252;--purple:#b57cf6;--tx:#e4e4ef;--tx2:#8888a8;--tx3:#50506a;--shadow:0 8px 30px rgba(0,0,0,.55);--seat-free:#3ecf8e;--seat-occ:#4f6ef7;--seat-fixed:#e05252;color-scheme:dark;}
[data-theme="light"]{--bg:#f0f0f6;--sf:#ffffff;--sf2:#f5f5fb;--sf3:#eaeaf2;--bd:#dcdce8;--bd2:#c4c4d8;--ac:#4f6ef7;--ac2:#2d4fd0;--glow:rgba(79,110,247,.07);--green:#0f9060;--amber:#b86800;--red:#c02828;--purple:#7030b0;--tx:#181826;--tx2:#4a4a70;--tx3:#9494b8;--shadow:0 8px 30px rgba(0,0,0,.1);--seat-free:#0f9060;--seat-occ:#4f6ef7;--seat-fixed:#c02828;color-scheme:light;}
html,body,#root{background:#0d0d10;color:#e4e4ef;margin:0;padding:0;}
body{font-family:'Inter',system-ui,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:5px;height:5px;}::-webkit-scrollbar-track{background:var(--bg);}::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:3px;}
.shell{display:flex;flex-direction:column;height:100vh;overflow:hidden;background:var(--bg);color:var(--tx);}
.topbar{display:flex;align-items:center;gap:10px;padding:0 18px;height:48px;background:var(--sf);border-bottom:1px solid var(--bd);flex-shrink:0;}
.logo{font-size:14px;font-weight:700;letter-spacing:-.3px;display:flex;align-items:center;gap:7px;}
.logo-dot{width:7px;height:7px;border-radius:50%;background:var(--ac);box-shadow:0 0 8px var(--ac);}
.top-right{margin-left:auto;display:flex;align-items:center;gap:8px;}
.avatar{width:28px;height:28px;border-radius:50%;background:var(--ac);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;border:1px solid var(--bd2);flex-shrink:0;}
.u-name{font-size:12px;font-weight:500;color:var(--tx2);}
.o-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 5px var(--green);}
.sw-group{display:flex;gap:2px;border:1px solid var(--bd2);border-radius:var(--r2);overflow:hidden;padding:2px;}
.sw-group.mod-group{background:var(--sf2);gap:3px;border:1px solid var(--bd);}
.sw-btn{font-size:11px;font-weight:600;padding:5px 12px;background:transparent;border:none;color:var(--tx3);cursor:pointer;transition:var(--ease);letter-spacing:.02em;white-space:nowrap;border-radius:6px;}
.sw-btn:hover{color:var(--tx2);background:rgba(255,255,255,.06);}
.sw-btn.active{background:rgba(99,102,241,.18);color:#818cf8;box-shadow:inset 0 0 0 1px rgba(99,102,241,.4);}
.sw-btn.active-green{background:rgba(74,222,128,.15);color:var(--green);box-shadow:inset 0 0 0 1px rgba(74,222,128,.35);}
.sw-btn.active-retro{background:rgba(167,139,250,.15);color:#a78bfa;box-shadow:inset 0 0 0 1px rgba(167,139,250,.35);}.sw-btn.active-deploy{background:rgba(245,158,11,.15);color:#f59e0b;box-shadow:inset 0 0 0 1px rgba(245,158,11,.35);}
.sw-btn.active-theme{background:var(--sf3);color:var(--tx);}
.r-tag{font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:3px;}
.r-admin{background:rgba(245,166,35,.12);color:var(--amber);border:1px solid rgba(245,166,35,.3);}
.r-user{background:var(--sf3);color:var(--tx3);border:1px solid var(--bd);}
.nav-bar{display:flex;align-items:center;gap:2px;padding:0 18px;height:38px;background:var(--sf);border-bottom:1px solid var(--bd);flex-shrink:0;}
.n-btn{font-size:11px;font-weight:600;letter-spacing:.02em;padding:5px 12px;border-radius:var(--r);border:1px solid transparent;cursor:pointer;background:transparent;color:var(--tx3);transition:var(--ease);}
.n-btn:hover{color:var(--tx2);background:var(--sf3);}
.n-btn.active{color:var(--ac2);background:var(--glow);border-color:rgba(79,110,247,.28);}
.n-btn.active-hd{color:var(--green);background:rgba(62,207,142,.06);border-color:rgba(62,207,142,.25);}
.n-sep{width:1px;height:16px;background:var(--bd);margin:0 4px;}
.body{display:flex;flex:1;overflow:hidden;background:var(--bg);}
.content{flex:1;overflow-y:auto;padding:20px;background:var(--bg);}
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
.cb{width:16px;height:16px;border-radius:4px;border:2px solid var(--bd2);background:var(--sf3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:transparent;transition:var(--ease);line-height:1;}
.pick-i.on .cb{background:var(--ac);border-color:var(--ac);color:#fff;box-shadow:0 0 0 3px rgba(79,110,247,.2);}
.kb{font-family:var(--mono);color:var(--ac2);font-size:10px;font-weight:500;}
.btn-p{font-size:12px;font-weight:600;width:100%;padding:8px;border-radius:var(--r);border:none;background:var(--ac);color:#fff;cursor:pointer;transition:var(--ease);}
.btn-p:hover{background:var(--ac2);}
.btn-g{font-size:11px;font-weight:500;padding:4px 10px;border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.btn-g:hover{color:var(--tx);background:var(--sf3);border-color:var(--bd2);}
.btn-exp{font-size:11px;font-weight:600;width:100%;padding:7px;border-radius:var(--r);border:1px solid var(--bd2);background:var(--sf2);color:var(--green);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:var(--ease);}
.btn-exp:hover{background:rgba(62,207,142,.07);border-color:var(--green);}
.btn-log{font-size:11px;font-weight:600;padding:6px 12px;border-radius:var(--r);border:1px solid rgba(79,110,247,.3);background:var(--glow);color:var(--ac2);cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:var(--ease);}
.btn-log:hover{background:rgba(79,110,247,.18);border-color:var(--ac);}
.btn-log-sm{font-size:10px;padding:4px 9px;}
.cal-h{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;}
.cal-t{font-size:20px;font-weight:700;letter-spacing:-.3px;color:var(--tx);}
.n-arr{width:28px;height:28px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;color:var(--tx2);transition:var(--ease);}
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
.pwd-meter{display:flex;gap:3px;margin-top:4px;}
.pwd-seg{height:3px;flex:1;border-radius:2px;background:var(--bd2);}
.pwd-seg.weak{background:var(--red);}
.pwd-seg.fair{background:var(--amber);}
.pwd-seg.strong{background:var(--green);}
.dropzone{border:2px dashed var(--bd2);border-radius:var(--r2);padding:28px 20px;text-align:center;cursor:pointer;transition:var(--ease);background:var(--sf2);}
.dropzone:hover,.dropzone.over{border-color:var(--ac);background:var(--glow);}
.csv-preview{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;max-height:200px;overflow-y:auto;}
.csv-row{display:grid;grid-template-columns:28px 1fr 1fr 70px 1fr;font-size:11px;border-bottom:1px solid var(--bd);}
.csv-row:last-child{border-bottom:none;}
.csv-row.hdr{background:var(--sf3);font-size:9px;font-weight:700;text-transform:uppercase;color:var(--tx3);}
.csv-row.err-row{background:rgba(224,82,82,.04);}
.csv-cell{padding:7px 10px;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.csv-err-tag{font-size:9px;color:var(--red);padding:7px 10px;}
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
.hd-map-wrap{display:flex;flex-direction:column;gap:12px;}
.hd-map-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
.hd-card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);padding:16px;}
.hd-legend{display:flex;gap:14px;flex-wrap:wrap;}
.hd-leg{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tx2);}
.hd-leg-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0;}
.hd-seat{cursor:pointer;transition:filter .12s;}
.hd-seat:hover{filter:brightness(1.25) drop-shadow(0 0 5px rgba(100,200,255,.3));}
.hd-table-wrap{overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);}
.hd-tbl{border-collapse:collapse;font-size:11px;width:100%;}
.hd-th{padding:9px 4px;text-align:center;border-bottom:2px solid var(--bd);background:var(--sf);color:var(--tx3);font-size:9px;font-weight:700;text-transform:uppercase;min-width:44px;white-space:nowrap;position:sticky;top:0;z-index:6;}
.hd-th.seat-col{color:var(--ac2);font-family:var(--mono);cursor:help;}
.hd-th.date-col{position:sticky;left:0;top:0;z-index:8;background:var(--sf);text-align:left;padding-left:12px;min-width:96px;border-right:2px solid var(--bd);}
.hd-td{padding:2px;border-bottom:1px solid var(--bd);background:var(--sf);}
.hd-td.date-cell{position:sticky;left:0;z-index:4;background:var(--sf);padding:0 12px;border-right:2px solid var(--bd);white-space:nowrap;font-size:11px;height:34px;vertical-align:middle;color:var(--tx2);}
tr.hd-row-we > td.hd-td{background:var(--sf2) !important;}
tr.hd-row-today > td.hd-td{background:rgba(139,92,246,.12) !important;border-top:1px solid rgba(139,92,246,.2);border-bottom:1px solid rgba(139,92,246,.2);}
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
.hd-cell-name{margin-left:6px;font-size:9px;line-height:1;color:var(--tx2);max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hd-tooltip{position:fixed;z-index:9900;background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);padding:12px;box-shadow:var(--shadow);width:480px;pointer-events:none;animation:mbIn .15s ease;}
.hd-tooltip-title{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3);margin-bottom:8px;}
/* Tooltips handled via React state - see BpTooltip component */
/* Action button click flash */
.tb-btn:active,.tb-flash{background:rgba(79,110,247,.25) !important;border-color:var(--ac) !important;color:var(--ac2) !important;transform:scale(.94);}
.tb-btn{transition:all .12s;}
.seat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px;}
.seat-btn{background:var(--sf2);border:2px solid var(--bd);border-radius:var(--r2);padding:10px 4px;cursor:pointer;color:var(--tx2);font-size:12px;font-weight:500;text-align:center;line-height:1.4;transition:var(--ease);}
.seat-btn:hover{border-color:var(--bd2);color:var(--tx);}
.seat-btn.sel{border-color:var(--ac);color:var(--ac2);background:var(--glow);}
.seat-btn.is-fixed{border-color:rgba(224,82,82,.4);color:var(--red);}
.seat-btn.is-occ{border-color:rgba(79,110,247,.3);color:var(--ac2);}
.mini-cal{user-select:none;}
.mini-day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.mini-dh{text-align:center;font-size:9px;font-weight:700;color:var(--tx3);padding:2px 0;}
.mini-day{text-align:center;border-radius:4px;padding:4px 2px;font-size:11px;cursor:pointer;border:1px solid transparent;transition:var(--ease);color:var(--tx2);}
.mini-day.dis{color:var(--tx3);opacity:.35;cursor:not-allowed;}
.mini-day.sel{background:rgba(62,207,142,.15);border-color:var(--green);color:var(--green);font-weight:700;}
.mini-day.occ{background:rgba(79,110,247,.1);border-color:rgba(79,110,247,.3);color:var(--ac2);}
.mini-day.avail:hover{background:var(--sf3);border-color:var(--bd2);}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.cb-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);box-shadow:var(--shadow);z-index:200;max-height:220px;overflow-y:auto;}
.cb-opt{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--bd);}
.cb-opt:last-child{border-bottom:none;}
.cb-opt:hover,.cb-opt.cb-sel{background:var(--glow);}
.cb-key{font-family:var(--mono);font-size:11px;color:var(--ac2);font-weight:600;min-width:72px;flex-shrink:0;}
.cb-sum{font-size:12px;color:var(--tx);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cb-prj{font-family:var(--mono);font-size:9px;color:var(--tx3);flex-shrink:0;}
@media(max-width:900px){.sb{width:200px;min-width:200px;}.proto-tag,.u-name,.r-tag,.o-dot{display:none;}}
@media(max-width:700px){.topbar{padding:0 12px;gap:6px;height:44px;}.nav-bar{padding:0 10px;gap:1px;height:36px;overflow-x:auto;}.n-btn{padding:4px 8px;font-size:10px;}.content{padding:12px;}.cc{min-height:52px;padding:4px;}.chrs{font-size:13px;}.cdots{display:none;}.cal-h{gap:6px;}.cal-t{font-size:16px;}.dh{flex-direction:column;gap:10px;}.dn{flex-wrap:wrap;}.fr2{grid-template-columns:1fr;}.mb{max-width:100% !important;margin:0;border-radius:var(--r2) var(--r2) 0 0;position:fixed;bottom:0;left:0;right:0;max-height:92vh;}.ov{align-items:flex-end;padding:0;}.admin-nav{width:160px;min-width:160px;}}
@media(max-width:480px){.topbar{height:40px;}.cal-stats{display:none;}.cc{min-height:40px;padding:3px;}.cday{font-size:10px;}.chrs{font-size:11px;}.admin-wrap{flex-direction:column;}.admin-nav{width:100%;flex-direction:row;height:44px;overflow-x:auto;padding:6px 10px;border-right:none;border-bottom:1px solid var(--bd);}.admin-content{padding:14px;}.an-btn{padding:6px 10px;font-size:11px;white-space:nowrap;}.seat-grid{grid-template-columns:repeat(4,1fr);}}
`;

// ══════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ══════════════════════════════════════════════════════════════════

function WorkSuiteApp() {
  const { user: authUser, logout } = useAuth();

  const [lang,  setLang]  = useState("en");
  const [theme, setTheme] = useState("dark");
  const [mod,   setMod]   = useState("jt");
  const [loadingData, setLoadingData] = useState(true);
  const [activeDay, setActiveDay] = useState(TODAY);
  const [filters,   setFilters]   = useState({
    from: TODAY.slice(0, 7) + '-01',
    to:   TODAY.slice(0, 7) + '-' + new Date(parseInt(TODAY.slice(0,4)), parseInt(TODAY.slice(5,7)), 0).getDate().toString().padStart(2,'0'),
    authorId: '', spaceKeys: [], jql: ''
  });
  const [worklogs,  setWorklogs]  = useState({});
  const [logModal,  setLogModal]  = useState(null);
  const [hd,        setHd]        = useState({ fixed: {}, reservations: [] });
  const [hdModal,   setHdModal]   = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null); // {id, name}
  const [selectedBlueprint, setSelectedBlueprint] = useState(null); // {id, floor_name, layout}
  const [toast,     setToast]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [view,      setView]      = useState("calendar");
  const [sbOpen,    setSbOpen]    = useState(false);

  // ── Estado de issues y proyectos de Jira ──────────────────────
  const [jiraIssues,   setJiraIssues]   = useState(MOCK_ISSUES_FALLBACK);
  const [jiraProjects, setJiraProjects] = useState(MOCK_PROJECTS_FALLBACK);

  const CURRENT_USER = authUser ? {
    id:       authUser.id,
    name:     authUser.name,
    email:    authUser.email,
    avatar:   authUser.avatar || (authUser.name || 'U').slice(0,2).toUpperCase(),
    role:     authUser.role,
    deskType: authUser.desk_type || 'hotdesk',
    active:   authUser.active !== false,
    modules:  authUser.modules || ["jt","hd","retro","deploy"],
  } : { id: '', name: 'Loading...', email: '', avatar: '..', role: 'user', deskType: 'hotdesk', active: true, modules: ["jt","hd","retro","deploy"] };

  useEffect(() => {
    if (!authUser) { setLoadingData(false); return; }
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
          modules: u.modules || ["jt","hd","retro","deploy"],
        })));

        const fixed = {};
        (fixedRes.data ?? []).forEach(fa => {
          const source = fa.user_name || fa.user_id || "";
          const resolved = usersRes.data?.find(u => u.id===source)?.name || source;
          fixed[fa.seat_id] = resolved;
        });
        const reservations = (resRes.data ?? []).map(r => ({
          seatId: r.seat_id, date: r.date.slice(0,10),
          userId: r.user_id, userName: r.user_name,
        }));
        setHd({ fixed, reservations });

        if (seatsRes.data?.length) {
          seatsRes.data.forEach(s => {
            const seat = SEATS.find(ss => ss.id === s.id);
            if (seat) { seat.x = s.x; seat.y = s.y; }
          });
        }

        // ── Cargar issues y proyectos reales de Jira ──────────────
        try {
          const authHeaders = await getAuthHeader();
          const headers = { ...authHeaders, 'Content-Type': 'application/json' };

          const projRes = await fetch(`${API_BASE}/jira/projects`, { headers });
          const projJson = await projRes.json();

          if (projJson.ok && projJson.data?.length) {
            if (cancelled) return;
            setJiraProjects(projJson.data.map(p => ({ key: p.key, name: p.name })));

            // Preferir ANDURIL si existe, si no el primero
            const preferred = projJson.data.find(p => p.key === 'ANDURIL') ?? projJson.data[0];
            const issRes = await fetch(`${API_BASE}/jira/issues?project=${preferred.key}`, { headers });
            const issJson = await issRes.json();

            if (issJson.ok && issJson.data?.length && !cancelled) {
              setJiraIssues(issJson.data.map((i, idx) => ({
                id:       idx + 1,
                key:      i.key,
                summary:  i.summary,
                type:     i.type,
                status:   i.status,
                priority: i.priority ?? 'Medium',
                project:  i.project,
                assignee: i.assignee ?? '',
                epic:     i.epic ?? '—',
                epicName: i.epicName ?? '—',
                hours:    0,
                labels:   i.labels ?? [],
              })));
            }
          }
        } catch (jiraErr) {
          // Jira no configurado — mantener fallback, no es error crítico
          console.info('Jira not configured or unreachable:', jiraErr);
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

  const t = useCallback(k => TRANSLATIONS[lang]?.[k] ?? TRANSLATIONS.en[k] ?? k, [lang]);

  const activeDayRef = useRef(activeDay);
  useEffect(() => { activeDayRef.current = activeDay; }, [activeDay]);

  const openLogModal = useCallback(({ date, issueKey } = {}) => {
    setLogModal({ date: date || activeDayRef.current, issueKey: issueKey || '' });
  }, []);

  const handleSaveWorklog = useCallback(async (date, wl) => {
    setWorklogs(p => ({ ...p, [date]: [...(p[date] || []), wl] }));
    try {
      const { error } = await supabase.from('worklogs').insert({
        id: wl.id, issue_key: wl.issue, issue_summary: wl.summary,
        issue_type: wl.type, epic_key: wl.epic, epic_name: wl.epicName,
        project_key: wl.project, author_id: CURRENT_USER.id, author_name: CURRENT_USER.name,
        date, started_at: wl.started, seconds: wl.seconds, description: wl.description || '',
      });
      if (error) { console.error('Save worklog error:', error.message); return; }

      // ── Sync automático a Jira ──────────────────────────────────
      try {
        const startedAt = `${date}T${wl.started}:00.000+0000`;
        const headers = { ...await getAuthHeader(), 'Content-Type': 'application/json' };
        const syncRes = await fetch(`${API_BASE}/jira/worklogs/${wl.issue}/sync`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            worklogId:   wl.id,
            seconds:     wl.seconds,
            startedAt,
            description: wl.description || '',
          }),
        });
        const syncJson = await syncRes.json();
        if (syncJson.ok) {
          setWorklogs(p => ({
            ...p,
            [date]: (p[date] || []).map(w =>
              w.id === wl.id ? { ...w, syncedToJira: true } : w
            ),
          }));
          notify('✓ Worklog guardado y sincronizado con Jira');
        } else {
          notify('Worklog guardado (sync Jira: ' + (syncJson.error?.message || 'error') + ')');
        }
      } catch (syncErr) {
        console.error('Jira sync failed:', syncErr);
        notify('Worklog guardado (Jira no disponible)');
      }
    } catch (err) { console.error('Save worklog failed:', err); }
  }, [CURRENT_USER.id, CURRENT_USER.name]);

  const handleDeleteWorklog = useCallback(async (date, id) => {
    setWorklogs(p => {
      const u = (p[date] || []).filter(w => w.id !== id);
      if (!u.length) { const { [date]: _, ...r } = p; return r; }
      return { ...p, [date]: u };
    });
    try {
      const { error } = await supabase.from('worklogs').delete().eq('id', id);
      if (error) console.error('Delete worklog error:', error.message);
    } catch (err) { console.error('Delete worklog failed:', err); }
  }, []);

  const handleExport = f => CsvService.exportWorklogs(worklogs, f.from, f.to, f.authorId || null, f.spaceKeys);
  const handleDayClick = d => { setActiveDay(d); setView('day'); };

  const loadJiraIssues = useCallback(async (projectKey) => {
    try {
      const headers = { ...await getAuthHeader(), 'Content-Type': 'application/json' };
      const res  = await fetch(`${API_BASE}/jira/issues?project=${projectKey}`, { headers });
      const json = await res.json();
      if (json.ok && json.data?.length) {
        setJiraIssues(json.data.map((i, idx) => ({
          id: idx + 1, key: i.key, summary: i.summary, type: i.type,
          status: i.status, priority: i.priority ?? 'Medium', project: i.project,
          assignee: i.assignee ?? '', epic: i.epic ?? '—', epicName: i.epicName ?? '—',
          hours: 0, labels: i.labels ?? [],
        })));
      }
    } catch (e) { console.error('loadJiraIssues failed:', e); }
  }, []);

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
    setHd(h => ({
      ...h,
      reservations: [
        ...h.reservations.filter(r => !dates.includes(r.date) || r.seatId !== seatId),
        ...dates.map(d => ({ seatId, date: d, userId: CURRENT_USER.id, userName: CURRENT_USER.name })),
      ],
    }));
    setHdModal(null);
    notify(`✓ ${t('hdReservedOk')} — ${seatId}`);
    try {
      const rows = dates.map(d => ({
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        seat_id: seatId, user_id: CURRENT_USER.id, user_name: CURRENT_USER.name, date: d,
      }));
      const { error } = await supabase.from('seat_reservations').upsert(rows, { onConflict: 'seat_id,date' });
      if (error) console.error('Reserve error:', error.message);
    } catch (err) { console.error('Reserve failed:', err); }
  };

  const handleHdRelease = async (seatId, date) => {
    setHd(h => ({ ...h, reservations: h.reservations.filter(r => !(r.seatId === seatId && r.date === date)) }));
    setHdModal(null);
    notify(t('hdReleasedOk'));
    try {
      const { error } = await supabase.from('seat_reservations')
        .delete().eq('seat_id', seatId).eq('date', date).eq('user_id', CURRENT_USER.id);
      if (error) console.error('Release error:', error.message);
    } catch (err) { console.error('Release failed:', err); }
  };

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

  const handleBuildingFloorChange = useCallback((b, fl) => {
    setSelectedBuilding(b);
    setSelectedBlueprint(fl);
  }, []);

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

  // Guard: if somehow rendered without auth, return null so parent can redirect
  if (!authUser) return null;

  return (
    <AppCtx.Provider value={{ lang, t, theme, jiraIssues, jiraProjects }}>
      <style>{buildCSS()}</style>
      <div data-theme={theme} style={{height:"100vh",overflow:"hidden",background:"var(--bg)",color:"var(--tx)"}}>
      <div className="shell">

        <header className="topbar">
          <div className="logo">
            <div className="logo-dot"/>
            <span style={{color:"var(--ac2)",fontWeight:700}}>Work</span><span style={{color:"var(--tx2)",fontWeight:300}}>Suite</span>
          </div>
          <div className="sw-group mod-group">
            {(CURRENT_USER.modules||["jt","hd","retro"]).includes("jt") && (
              <button className={`sw-btn ${mod==="jt"?"active":""}`} onClick={()=>{ setMod("jt"); setView("calendar"); }}>📋 {t("moduleSwitchJira")}</button>
            )}
            {(CURRENT_USER.modules||["jt","hd","retro"]).includes("hd") && (
              <button className={`sw-btn ${mod==="hd"?"active-green":""}`} onClick={()=>{ setMod("hd"); setView("map"); }}>🪑 {t("moduleSwitchHD")}</button>
            )}
            {(CURRENT_USER.modules||["jt","hd","retro","deploy"]).includes("retro") && (
              <button className={`sw-btn ${mod==="retro"?"active-retro":""}`} onClick={()=>{ setMod("retro"); setView("retro"); }}>🔁 RetroBoard</button>
            )}
            {(CURRENT_USER.modules||["jt","hd","retro","deploy"]).includes("deploy") && (
              <button className={`sw-btn ${mod==="deploy"?"active-deploy":""}`} onClick={()=>{ setMod("deploy"); setView("deploy"); }}>🚀 Deploy Planner</button>
            )}
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
            <span className={`r-tag ${CURRENT_USER.role==="admin"?"r-admin":"r-user"}`}>{CURRENT_USER.role==="admin"?t("roleAdmin"):t("roleUser")}</span>
            <button onClick={()=>setView("admin")}
                style={{
                  background: view==="admin" ? "var(--ac)" : "rgba(79,110,247,.15)",
                  border: `1px solid ${view==="admin" ? "var(--ac)" : "rgba(79,110,247,.4)"}`,
                  borderRadius: "var(--r)",
                  color: view==="admin" ? "#fff" : "var(--ac2)",
                  fontSize: 11, fontWeight: 700, padding: "5px 12px",
                  cursor: "pointer", transition: "var(--ease)",
                  display: "flex", alignItems: "center", gap: 6,
                  boxShadow: view==="admin" ? "0 0 10px rgba(79,110,247,.3)" : "none",
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                {isAdmin ? 'Admin' : 'Config'}
              </button>
            <button onClick={logout} style={{background:"transparent",border:"1px solid var(--bd)",borderRadius:"var(--r)",color:"var(--tx3)",fontSize:10,padding:"3px 8px",cursor:"pointer",fontWeight:600}}>
              Logout
            </button>
          </div>
        </header>

        {mod !== "retro" && mod !== "deploy" && <nav className="nav-bar">
          {currentNavItems.map(item=>(
            <button key={item.id}
              className={`n-btn ${view===item.id?(mod==="hd"?"active-hd":"active"):""}`}
              onClick={()=>setView(item.id)}>
              {item.label}
            </button>
          ))}
          {mod==="hd" && view!=="admin" && (
            <>
              <div className="n-sep"/>
              <BuildingFloorSelectors
                selectedBuilding={selectedBuilding}
                selectedBlueprint={selectedBlueprint}
                onChange={handleBuildingFloorChange}
              />
            </>
          )}

        </nav>}

        <div className="body">
          {mod==="jt" && view!=="admin" && (
            <JTFilterSidebar filters={filters} onApply={f=>{setFilters(f);setSbOpen(false);}} onExport={handleExport} mobileOpen={sbOpen} onMobileClose={()=>setSbOpen(false)} users={users} onProjectChange={loadJiraIssues}/>
          )}
          {mod==="jt" && view==="calendar" && (<main className="content"><CalendarView filters={filters} worklogs={worklogs} onDayClick={handleDayClick} onOpenLog={openLogModal}/></main>)}
          {mod==="jt" && view==="day"      && (<main className="content"><DayView date={activeDay} filters={filters} worklogs={worklogs} onDateChange={setActiveDay} onOpenLog={openLogModal} onDeleteWorklog={handleDeleteWorklog}/></main>)}
          {mod==="jt" && view==="tasks"    && (<main className="content"><TasksView filters={filters} onOpenLog={openLogModal} worklogs={worklogs}/></main>)}
          {mod==="hd" && view==="map"      && (
            <main className="content">
              {selectedBlueprint
                ? <BlueprintHDMap hd={hd} onSeat={sid=>handleHdSeatClick(sid,TODAY)} currentUser={CURRENT_USER} blueprint={selectedBlueprint}/>
                : <div style={{padding:32,textAlign:'center',color:'var(--tx3)',fontSize:13}}>Select a building and floor above to see the map</div>
              }
            </main>
          )}
          {mod==="hd" && view==="table"    && (
            <main className="content">
              <HDTableView hd={hd} onCell={(sid,date)=>handleHdSeatClick(sid,date)} currentUser={CURRENT_USER} blueprint={selectedBlueprint}/>
            </main>
          )}
          {mod==="retro" && view!=="admin" && (
            <main className="content" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%"}}>
              <RetroBoard currentUser={CURRENT_USER} wsUsers={users} lang={lang}/>
            </main>
          )}
          {mod==="deploy" && view!=="admin" && (
            <main className="content" style={{padding:0,overflow:"auto"}}>
              <DeployPlanner currentUser={CURRENT_USER}/>
            </main>
          )}
          {view==="admin" && (<AdminShell users={users} setUsers={setUsers} hd={hd} setHd={setHd} currentUser={CURRENT_USER}/>)}
        </div>
      </div>
      </div>

      {logModal && (
        <LogWorklogModal initialDate={logModal.date} initialIssueKey={logModal.issueKey} onClose={()=>setLogModal(null)} onSave={handleSaveWorklog} currentUser={CURRENT_USER}/>
      )}
      {hdModal && (
        <HDReserveModal seatId={hdModal.seatId} initDate={hdModal.date} hd={hd} onConfirm={handleHdConfirm} onRelease={handleHdRelease} onClose={()=>setHdModal(null)} currentUser={CURRENT_USER}/>
      )}
      {toast && (
        <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"11px 18px",borderRadius:"var(--r2)",fontSize:13,fontWeight:500,background:"var(--sf)",border:"1px solid var(--bd2)",color:"var(--tx)",boxShadow:"var(--shadow)",animation:"fadeIn .2s ease"}}>
          {toast}
        </div>
      )}
    </AppCtx.Provider>
  );
}

export default WorkSuiteApp;
