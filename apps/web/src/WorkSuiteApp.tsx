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
import { DeployPlanner } from './modules/deploy-planner';
import EnvTracker, { AdminEnvEnvironments, AdminEnvRepositories, AdminEnvPolicy } from './EnvTracker';
import { useAuth } from './shared/hooks/useAuth';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

function dbWorklogToUI(row) {
  const seconds = row.seconds ?? 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const time = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  return {
    id: row.id, issue: row.issue_key,
    summary: row.issue_summary ?? row.issue_key,
    type: row.issue_type ?? 'Task', epic: row.epic_key ?? '—',
    epicName: row.epic_name ?? '—', project: row.project_key ?? '—',
    author: row.author_name, authorId: row.author_id, time,
    seconds, started: (row.started_at ?? '09:00').slice(0, 5),
    description: row.description ?? '', syncedToJira: row.synced_to_jira ?? false,
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

const DeskType = Object.freeze({ NONE:"none", HOTDESK:"hotdesk", FIXED:"fixed" });
const MODULES = [
  { id:"jt",         label:"Jira Tracker",  color:"var(--ac2)"   },
  { id:"hd",         label:"HotDesk",       color:"var(--green)" },
  { id:"retro",      label:"RetroBoard",    color:"#818cf8"      },
  { id:"deploy",     label:"Deploy Planner",color:"#f59e0b"      },
  { id:"envtracker", label:"Environments",  color:"#22d3ee"      },
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

const TRANSLATIONS = {
  en: {
    appName:"WorkSuite", moduleSwitchJira:"Jira Tracker", moduleSwitchHD:"HotDesk",
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
    saveWorklog:"Save worklog", timeInvalid:"Invalid format", timeExceeds:"Max 160h",
    timeWarn:"That's a lot! Are you sure you want to log {h}h?",
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
    appName:"WorkSuite", moduleSwitchJira:"Jira Tracker", moduleSwitchHD:"HotDesk",
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
    saveWorklog:"Guardar worklog", timeInvalid:"Formato inválido", timeExceeds:"Máx 160h",
    timeWarn:"¡Eso es mucho! ¿Seguro que quieres registrar {h}h?",
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

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_EN   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAYS_ES   = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

function buildCalGrid(year, month) {
  const first = new Date(year,month,1), last = new Date(year,month+1,0);
  const so = (first.getDay()+6)%7, eo = (7-last.getDay())%7;
  const cells = [];
  const TODAY = new Date().toISOString().slice(0,10);
  for (let i = -so; i <= last.getDate()-1+eo; i++) {
    const d = new Date(year,month,1+i);
    cells.push({ date:d.toISOString().slice(0,10), day:d.getDate(), isCurrentMonth:d.getMonth()===month, isToday:d.toISOString().slice(0,10)===TODAY });
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

const TODAY = new Date().toISOString().slice(0,10);
const MOCK_TODAY = TODAY;

const SEATS = [
  {id:"A1",x:60,y:90},{id:"A2",x:124,y:90},{id:"A3",x:188,y:90},
  {id:"A4",x:60,y:160},{id:"A5",x:124,y:160},{id:"A6",x:188,y:160},
  {id:"B1",x:288,y:90},{id:"B2",x:352,y:90},{id:"B3",x:416,y:90},
  {id:"B4",x:288,y:160},{id:"B5",x:352,y:160},{id:"B6",x:416,y:160},
  {id:"C1",x:60,y:300},{id:"C2",x:130,y:300},{id:"C3",x:200,y:300},
  {id:"C4",x:270,y:300},{id:"C5",x:340,y:300},{id:"C6",x:410,y:300},
];

const MOCK_ISSUES_FALLBACK = [
  { id:1, key:"DEMO-1", summary:"Configure your Jira connection in Admin → Settings", type:"Task", status:"To Do", priority:"High", project:"DEMO", assignee:"", epic:"—", epicName:"—", hours:0, labels:[] },
];
const MOCK_PROJECTS_FALLBACK = [{ key:"DEMO", name:"Demo — Configure Jira in Settings" }];

// ── Context ────────────────────────────────────────────────────
const INITIAL_HD_STATE = { fixed: {}, reservations: [] };

// ════════════════════════════════════════════════════════════════
// SHARED COMPONENTS (MiniCalendar, PasswordStrength, etc.)
// ════════════════════════════════════════════════════════════════

function PasswordStrength({ password }) {
  if (!password) return null;
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length;
  const level = score<=1?"weak":score<=3?"fair":"strong";
  const label = score<=1?"Weak":score<=3?"Fair":"Strong";
  const colors = { weak:"var(--red)", fair:"var(--amber)", strong:"var(--green)" };
  return (
    <div>
      <div className="pwd-meter">{[0,1,2,3].map(i=><div key={i} className={`pwd-seg ${i<score?level:""}`}/>)}</div>
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
          const isWe = dow>=5, isPast = iso < MOCK_TODAY, isOcc = occupiedDates.includes(iso), isSel = selectedDates.includes(iso);
          const dis = isWe || isPast || isOcc;
          let cls = "mini-day ";
          if (dis) cls += "dis"; else if (isSel) cls += "sel"; else if (isOcc) cls += "occ"; else cls += "avail";
          return <div key={d} className={cls} onClick={() => !dis && onToggleDate(iso)}>{d}</div>;
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// JIRA TRACKER COMPONENTS
// ════════════════════════════════════════════════════════════════

function LogWorklogModal({ initialDate, initialIssueKey, onClose, onSave, currentUser }) {
  const { t, jiraIssues } = useApp();
  const issues = jiraIssues || MOCK_ISSUES_FALLBACK;
  const [ik, setIk] = useState(initialIssueKey||"");
  const [query, setQuery] = useState(initialIssueKey||"");
  const [open, setOpen] = useState(false);
  const [dt, setDt] = useState(initialDate||MOCK_TODAY);
  const [tr, setTr] = useState("");
  const [st, setSt] = useState("09:00");
  const [dc, setDc] = useState("");
  const [er, setEr] = useState({});
  const [ok, setOk] = useState(false);
  const [warnConfirmed, setWarnConfirmed] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const cbRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (cbRef.current && !cbRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = query.trim()
    ? issues.filter(i => i.key.toLowerCase().includes(query.toLowerCase()) || i.summary.toLowerCase().includes(query.toLowerCase()))
    : issues;

  const selectIssue = issue => { setIk(issue.key); setQuery(issue.key); setOpen(false); setEr(v=>({...v,ik:null})); };
  const ps = TimeParser.parse(tr), tp = ps > 0 ? TimeParser.format(ps) : null;
  const MAX_H = 160 * 3600;

  const validate = () => {
    const e = {};
    if (!ik) e.ik = t("taskRequired");
    if (!dt) e.dt = t("dateRequired");
    if (ps<=0) e.tr = t("timeInvalid");
    if (ps>MAX_H) e.tr = t("timeExceeds");
    return e;
  };

  const submit = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setEr(errs); return; }
    if (ps > 16 * 3600 && !warnConfirmed) { setShowWarn(true); return; }
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
        {ok ? <div className="mbody"><div className="ok-fl">✓ {t("savedFlash")} — {tp} · {ik} · {dt}</div></div>
        : showWarn ? (
          <div className="mbody">
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:28,marginBottom:12}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:14,color:"var(--amber)",marginBottom:8}}>{t("timeWarn").replace("{h}", (ps/3600).toFixed(1))}</div>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                <button className="b-cancel" onClick={()=>setShowWarn(false)}>Cancelar</button>
                <button className="b-sub" style={{background:"var(--amber)"}} onClick={()=>{setWarnConfirmed(true);setShowWarn(false);setTimeout(()=>submit(),50);}}>Sí, registrar {TimeParser.format(ps)}</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mbody">
              <div className="fr">
                <label className="fl">{t("taskField")}</label>
                <div ref={cbRef} style={{position:"relative"}}>
                  <input className={`mi ${er.ik?"err":""}`} placeholder={t("selectTask")} value={query} autoComplete="off"
                    onChange={e=>{setQuery(e.target.value);setIk("");setOpen(true);setEr(v=>({...v,ik:null}));}}
                    onFocus={()=>setOpen(true)} style={{fontFamily:"var(--mono)",fontSize:12}}/>
                  {open && filtered.length > 0 && (
                    <div className="cb-drop">
                      {filtered.map(i=>(
                        <div key={i.key} className={`cb-opt ${i.key===ik?"cb-sel":""}`} onMouseDown={e=>{e.preventDefault();selectIssue(i);}}>
                          <span className="cb-key">{i.key}</span><span className="cb-sum">{i.summary}</span><span className="cb-prj">{i.project}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {open && filtered.length===0 && <div className="cb-drop"><div style={{padding:"10px 12px",color:"var(--tx3)",fontSize:12}}>No results for "{query}"</div></div>}
                </div>
                {er.ik&&<span className="em">{er.ik}</span>}
                {si && <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap",alignItems:"center"}}><span className="t-pill">{si.type}</span><span className="er" style={{fontSize:10}}>{si.epic} · {si.epicName}</span></div>}
              </div>
              <div className="fr2">
                <div className="fr"><label className="fl">{t("dateField")}</label><input className={`mi ${er.dt?"err":""}`} type="date" value={dt} onChange={e=>{setDt(e.target.value);setEr(v=>({...v,dt:null}));}}/>{er.dt&&<span className="em">{er.dt}</span>}</div>
                <div className="fr"><label className="fl">{t("startTime")}</label><input className="mi" type="time" value={st} onChange={e=>setSt(e.target.value)}/></div>
              </div>
              <div className="fr">
                <label className="fl">{t("timeLogged")}</label>
                <input className={`mi ${er.tr?"err":""}`} placeholder={t("timePlaceholder")} value={tr} onChange={e=>{setTr(e.target.value);setEr(v=>({...v,tr:null}));}} style={{fontFamily:"var(--mono)"}} autoFocus/>
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
    if (isAdding && onProjectChange) onProjectChange(k);
  };
  return (
    <aside className={`sb ${mobileOpen?"sb-open":""}`}>
      <div className="sb-s"><div className="sb-lbl">{t("dateRange")}</div>
        <input className="fi" type="date" value={l.from} onChange={e=>sL({...l,from:e.target.value})}/>
        <input className="fi" type="date" value={l.to} onChange={e=>sL({...l,to:e.target.value})}/>
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
        </div>
        {l.spaceKeys.length>0&&<button className="btn-g" onClick={()=>sL({...l,spaceKeys:[]})}>{t("clearSelection")}</button>}
      </div>
      <button className="btn-p" onClick={()=>onApply(l)}>{t("applyFilters")}</button>
      <button className="btn-exp" onClick={()=>onExport(l)}>{t("exportCsv")}</button>
      <div style={{fontSize:10,color:"var(--tx3)",textAlign:"center",lineHeight:1.5,marginTop:-8}}>{t("exportHint")}</div>
    </aside>
  );
}

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
              {top.length>0&&<div className="cdots">{top.map(k=><div key={k} className="cdot">{k}</div>)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ date, filters, worklogs, onDateChange, onOpenLog, onDeleteWorklog }) {
  const { t, lang } = useApp();
  const af  = worklogs[date]||[];
  const fl  = filters.authorId ? af.filter(w=>w.authorId===filters.authorId) : af;
  const ts  = fl.reduce((s,w)=>s+w.seconds,0);
  const eps = WorklogService.groupByEpic(fl);
  function addDays(iso,n){const d=new Date(iso+"T00:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
  return (
    <div>
      <div className="dh">
        <div>
          <div className="dd">{formatFullDate(date, lang)}</div>
          <div className="dsub">{t("totalLabel")}: <strong>{TimeParser.toHours(ts).toFixed(2)}h</strong>{" · "}{fl.length} {t("worklogs")}</div>
        </div>
        <div className="dn">
          <button className="n-arr" onClick={()=>onDateChange(addDays(date,-1))}>‹</button>
          <button className="btn-g" onClick={()=>onDateChange(MOCK_TODAY)}>{t("today")}</button>
          <button className="n-arr" onClick={()=>onDateChange(addDays(date,1))}>›</button>
          <button className="btn-log" onClick={()=>onOpenLog({date})}>{t("logHours")}</button>
        </div>
      </div>
      {fl.length===0&&<div className="empty"><div className="empty-i">📭</div><div>{t("noWorklogs")}</div><button className="btn-log" style={{marginTop:10}} onClick={()=>onOpenLog({date})}>{t("logThisDay")}</button></div>}
      {eps.map(ep=>{
        const es=ep.items.reduce((s,w)=>s+w.seconds,0);
        return(<div key={ep.key} className="eb"><div className="eh"><span className="ek">{ep.key}</span><span className="en">{ep.name}</span><span className="ehrs">{TimeParser.toHours(es).toFixed(1)}h</span></div>
          {ep.items.map(w=><div key={w.id} className={`wlc ${w.isNew?"new":""}`}><div className="wlk">{w.issue}</div><div style={{flex:1,minWidth:0}}><div className="wls">{w.summary}</div></div><div className="wlr"><div className="wlt">{w.time}</div><div className="wlm">{w.started} · {w.author}</div></div><span className="t-pill">{w.type}</span><button className="del-wl" onClick={()=>onDeleteWorklog(date,w.id)}>×</button></div>)}
        </div>);
      })}
    </div>
  );
}

function TasksView({ filters, onOpenLog, worklogs }) {
  const { t, jiraIssues, jiraProjects } = useApp();
  const issues = jiraIssues || MOCK_ISSUES_FALLBACK;
  const hoursByIssue = useMemo(() => {
    const map = {};
    for (const dayWls of Object.values(worklogs || {})) {
      for (const wl of dayWls) { map[wl.issue] = (map[wl.issue] || 0) + wl.seconds; }
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
  const sc=s=>{const sl=(s||'').toLowerCase();if(sl.includes('done')||sl.includes('cerrad')||sl.includes('complet'))return 's-done';if(sl.includes('progress')||sl.includes('curso')||sl.includes('review'))return 's-prog';return 's-todo';};
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
        <th>{t("colType")}</th><th>{t("colStatus")}</th><th>{t("colPriority")}</th>
        <th>{t("colProject")}</th><th>{t("colAssignee")}</th><th>{t("colEpic")}</th>
        <th>{t("colTime")}</th><th>{t("colAction")}</th>
      </tr></thead><tbody>{filteredIssues.map((i,idx)=>(
        <tr key={i.key||idx}>
          <td><span className="ik">{i.key}</span></td>
          <td><div className="ism">{i.summary}</div></td>
          <td><span className="t-pill">{i.type}</span></td>
          <td><span className={`s-b ${sc(i.status)}`}>{i.status}</span></td>
          <td><span className={pc(i.priority)}>{i.priority}</span></td>
          <td><span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--tx3)"}}>{i.project}</span></td>
          <td style={{fontSize:11}}>{i.assignee}</td>
          <td><span className="er">{i.epic}</span></td>
          <td className="hc">{hoursByIssue[i.key] ? TimeParser.format(hoursByIssue[i.key]) : "—"}</td>
          <td><button className="btn-log btn-log-sm" onClick={()=>onOpenLog({issueKey:i.key})}>{t("btnHours")}</button></td>
        </tr>
      ))}</tbody></table></div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// HOTDESK COMPONENTS (BlueprintHDMap, HDTableView, etc.)
// — kept from original, no changes needed —
// ════════════════════════════════════════════════════════════════

function BlueprintHDMap({ hd, onSeat, currentUser, blueprint, highlightSeat=null }) {
  const { theme } = useApp();
  const canvasRef = useRef(null);
  const cwRef = useRef(null);
  const [hoveredSeat, setHoveredSeat] = useState(null);
  const [seatHoverInfo, setSeatHoverInfo] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({x:0,y:0});
  const items = (() => { try { return Array.isArray(blueprint?.layout) ? blueprint.layout : []; } catch { return []; }})();
  const bbox = useMemo(() => {
    if(!items.length) return {minX:0,minY:0,maxX:800,maxY:600};
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    items.forEach(i=>{if(i.pts&&i.pts.length){i.pts.forEach(p=>{if(p.x<minX)minX=p.x;if(p.y<minY)minY=p.y;if(p.x>maxX)maxX=p.x;if(p.y>maxY)maxY=p.y;});}else if(i.type==='door'||i.type==='window'){const sw=i.w||48;if(i.x-sw<minX)minX=i.x-sw;if(i.y-sw<minY)minY=i.y-sw;if(i.x+sw>maxX)maxX=i.x+sw;if(i.y+sw>maxY)maxY=i.y+sw;}else{if(i.x<minX)minX=i.x;if(i.y<minY)minY=i.y;if(i.x+i.w>maxX)maxX=i.x+i.w;if(i.y+i.h>maxY)maxY=i.y+i.h;}});
    return{minX:minX-20,minY:minY-20,maxX:maxX+20,maxY:maxY+20};
  },[blueprint?.id]);
  const CELL=52,PAD=14,dk=theme==='dark';
  function getSeatsForItem(item){if(item.shape==='circle'){const{x,y,w,h}=item,cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2-PAD-CELL/2;const n=Math.max(1,Math.floor(2*Math.PI*Math.max(R,1)/(CELL+8)));const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();return Array.from({length:n},(_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return{id:pfx+(i+1),x:cx+R*Math.cos(a)-CELL/2+2,y:cy+R*Math.sin(a)-CELL/2+2,w:CELL-4,h:CELL-4};});}const{x,y,w,h}=item,cols=Math.max(1,Math.floor((w-PAD*2)/CELL)),rows=Math.max(1,Math.floor((h-PAD*2-18)/CELL));const tW=cols*CELL,tH=rows*CELL,sx=x+PAD+(w-PAD*2-tW)/2,sy=y+18+PAD+(h-18-PAD*2-tH)/2;const pfx=((item.prefix||item.label||'A').replace(/\s/g,'').slice(0,3)||'A').toUpperCase();let n=1;return Array.from({length:cols*rows},(_,i)=>{const r=Math.floor(i/cols),c=i%cols;const s={id:pfx+n,x:sx+c*CELL+2,y:sy+r*CELL+2,w:CELL-4,h:CELL-4};n++;return s;});}
  const allSeats = useMemo(()=>{const seats=[];items.forEach(item=>{if(item.type==='desk'||item.type==='circle'){const dis=item.disabled||[];getSeatsForItem(item).forEach(s=>{if(!dis.includes(s.id))seats.push({...s,clusterLabel:item.label});});}});return seats;},[blueprint?.id]);
  const scaleRef=useRef(scale),offsetRef=useRef(offset);
  useEffect(()=>{scaleRef.current=scale;},[scale]);
  useEffect(()=>{offsetRef.current=offset;},[offset]);
  useEffect(()=>{
    const cw=cwRef.current,cvs=canvasRef.current;if(!cw||!cvs)return;
    function resize(){const W=cw.clientWidth,H=cw.clientHeight;cvs.width=W;cvs.height=H;const bW=bbox.maxX-bbox.minX,bH=bbox.maxY-bbox.minY;if(bW<=0||bH<=0)return;const s=Math.min((W-40)/bW,(H-40)/bH,1.5);const ox=(W-bW*s)/2-bbox.minX*s;const oy=(H-bH*s)/2-bbox.minY*s;setScale(s);setOffset({x:ox,y:oy});}
    resize();
    const ro=new ResizeObserver(resize);ro.observe(cw);
    function onWheel(e){e.preventDefault();const rect=cvs.getBoundingClientRect();const mx=e.clientX-rect.left,my=e.clientY-rect.top;const cur=scaleRef.current;const ns=Math.max(0.15,Math.min(4,cur+(e.deltaY<0?0.12:-0.12)));const ratio=ns/cur;const ox=offsetRef.current.x,oy=offsetRef.current.y;setScale(ns);setOffset({x:mx-(mx-ox)*ratio,y:my-(my-oy)*ratio});}
    cvs.addEventListener('wheel',onWheel,{passive:false});
    let panActive=false,px0=0,py0=0,ox0=0,oy0=0;
    function onMouseDown(e){if(e.button!==0&&e.button!==1)return;if(e.button===1)e.preventDefault();panActive=true;px0=e.clientX;py0=e.clientY;ox0=offsetRef.current.x;oy0=offsetRef.current.y;cvs.style.cursor='grabbing';}
    function onMouseMove(e){if(!panActive)return;setOffset({x:ox0+(e.clientX-px0),y:oy0+(e.clientY-py0)});}
    function onMouseUp(){if(!panActive)return;panActive=false;cvs.style.cursor='default';}
    cvs.addEventListener('mousedown',onMouseDown);window.addEventListener('mousemove',onMouseMove);window.addEventListener('mouseup',onMouseUp);
    return()=>{ro.disconnect();cvs.removeEventListener('wheel',onWheel);cvs.removeEventListener('mousedown',onMouseDown);window.removeEventListener('mousemove',onMouseMove);window.removeEventListener('mouseup',onMouseUp);};
  },[bbox]);
  useEffect(()=>{
    const cvs=canvasRef.current;if(!cvs)return;
    const ctx=cvs.getContext('2d');const W=cvs.width,H=cvs.height;
    ctx.clearRect(0,0,W,H);ctx.save();ctx.setTransform(scale,0,0,scale,offset.x,offset.y);
    function rr(x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
    items.filter(i=>i.type==='zone').forEach(i=>{const{x,y,w,h}=i;ctx.fillStyle=dk?'rgba(40,30,80,.2)':'rgba(238,242,255,.6)';ctx.strokeStyle='#818cf8';ctx.lineWidth=1;ctx.setLineDash([6,4]);rr(x,y,w,h,5);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=dk?'rgba(165,180,252,.85)':'#4338ca';ctx.font='700 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((i.label||'Zone').toUpperCase(),x+w/2,y+h*0.22);});
    items.filter(i=>i.type==='room').forEach(i=>{const{x,y,w,h}=i;ctx.fillStyle=dk?'rgba(15,30,70,.5)':'rgba(219,234,254,.6)';ctx.strokeStyle='#3b82f6';ctx.lineWidth=1;ctx.setLineDash([]);rr(x,y,w,h,5);ctx.fill();ctx.stroke();ctx.fillStyle=dk?'#93c5fd':'#1e40af';ctx.font='600 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i.label||'Room',x+w/2,y+h*0.22);});
    items.filter(i=>i.type==='wall').forEach(i=>{ctx.strokeStyle=dk?'#777':'#999';ctx.lineWidth=4;ctx.setLineDash([]);ctx.lineCap='round';ctx.lineJoin='round';if(i.pts&&i.pts.length>=2){ctx.beginPath();ctx.moveTo(i.pts[0].x,i.pts[0].y);i.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();}else{ctx.fillStyle=dk?'rgba(70,70,70,.5)':'rgba(140,140,140,.3)';rr(i.x,i.y,i.w,i.h,2);ctx.fill();ctx.stroke();}ctx.lineCap='butt';ctx.lineJoin='miter';});
    items.filter(i=>i.type==='desk'||i.type==='circle').forEach(i=>{const{x,y,w,h}=i;ctx.fillStyle=dk?'rgba(3,15,6,.4)':'rgba(240,253,244,.5)';ctx.strokeStyle=dk?'rgba(34,197,94,.3)':'rgba(22,101,52,.25)';ctx.lineWidth=1;ctx.setLineDash([5,4]);if(i.shape==='circle'){const cx=x+w/2,cy=y+h/2,R=Math.min(w,h)/2;ctx.beginPath();ctx.arc(cx,cy,R,0,2*Math.PI);ctx.fill();ctx.stroke();}else{rr(x,y,w,h,7);ctx.fill();ctx.stroke();}ctx.setLineDash([]);const seats=getSeatsForItem(i);if(seats.length>0){const firstY=Math.min(...seats.map(s=>s.y));ctx.fillStyle=dk?'rgba(134,239,172,.5)':'rgba(22,101,52,.5)';ctx.font='500 9px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText((i.label||'Zone').toUpperCase(),x+w/2,firstY-4);}});
    allSeats.forEach(s=>{const{x,y,w,h,id}=s;const res=hd.reservations.find(r=>r.seatId===id&&r.date===TODAY);const isFixed=!!hd.fixed[id];const isMine=res?.userId===currentUser.id;const isHov=hoveredSeat===id;let fc,sc2,tc;if(isFixed){fc=dk?'rgba(80,0,0,.55)':'rgba(254,226,226,.8)';sc2='#ef4444';tc=dk?'#fca5a5':'#991b1b';}else if(isMine){fc=dk?'rgba(60,40,0,.6)':'rgba(255,251,235,.8)';sc2='#f59e0b';tc=dk?'#fcd34d':'#92400e';}else if(!!res){fc=dk?'rgba(20,30,80,.55)':'rgba(219,234,254,.8)';sc2='#3b82f6';tc=dk?'#93c5fd':'#1e40af';}else{fc=dk?'rgba(5,35,12,.65)':'rgba(220,252,231,.85)';sc2=isHov?'#4ade80':'#22c55e';tc=dk?'#86efac':'#166534';}ctx.fillStyle=fc;ctx.strokeStyle=sc2;ctx.lineWidth=isHov?2:1;rr(x,y,w,h,5);ctx.fill();ctx.stroke();if(id===highlightSeat){ctx.strokeStyle='#f59e0b';ctx.lineWidth=2.5;ctx.setLineDash([]);rr(x-3,y-3,w+6,h+6,7);ctx.stroke();}ctx.fillStyle=tc;ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(id,x+w/2,y+h/2);});
    ctx.restore();
  },[items,hd,scale,offset,hoveredSeat,theme]);
  function seatAt(px,py){const wx=(px-offset.x)/scale,wy=(py-offset.y)/scale;return allSeats.find(s=>wx>=s.x&&wx<=s.x+s.w&&wy>=s.y&&wy<=s.y+s.h)||null;}
  const freeCount=allSeats.filter(s=>!hd.fixed[s.id]&&!hd.reservations.find(r=>r.seatId===s.id&&r.date===TODAY)).length;
  const occCount=allSeats.filter(s=>hd.reservations.find(r=>r.seatId===s.id&&r.date===TODAY)).length;
  const fixCount=allSeats.filter(s=>hd.fixed[s.id]).length;
  const zoomBy=(delta)=>{const cvs=canvasRef.current;if(!cvs)return;const cx=cvs.width/2,cy=cvs.height/2;const ns=Math.max(0.15,Math.min(4,scale+delta));const ratio=ns/scale;setScale(ns);setOffset(o=>({x:cx-(cx-o.x)*ratio,y:cy-(cy-o.y)*ratio}));};
  const fitToView=()=>{const cvs=canvasRef.current;if(!cvs)return;const W=cvs.width,H=cvs.height,PAD2=40;const bW=bbox.maxX-bbox.minX,bH=bbox.maxY-bbox.minY;if(bW<=0||bH<=0){setScale(1);setOffset({x:0,y:0});return;}const s=Math.min((W-PAD2*2)/bW,(H-PAD2*2)/bH,1.5);setScale(s);setOffset({x:(W-bW*s)/2-bbox.minX*s,y:(H-bH*s)/2-bbox.minY*s});};
  return(
    <div className="hd-map-wrap">
      <div className="hd-map-header">
        <div className="cal-stats" style={{marginLeft:0}}>
          <div className="chip">Free: <strong style={{color:'var(--green)'}}>{freeCount}</strong></div>
          <div className="chip">Occupied: <strong style={{color:'var(--ac2)'}}>{occCount}</strong></div>
          <div className="chip">Fixed: <strong style={{color:'var(--red)'}}>{fixCount}</strong></div>
          <div className="chip">Total: <strong>{allSeats.length}</strong></div>
        </div>
        <div className="hd-legend">{[['Free','var(--seat-free)'],['Occupied','var(--seat-occ)'],['Fixed','var(--seat-fixed)'],['Mine','var(--amber)']].map(([l,col])=>(<div key={l} className="hd-leg"><div className="hd-leg-dot" style={{background:col}}/>{l}</div>))}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
        <button onClick={()=>zoomBy(0.15)} style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:6,width:28,height:28,fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx2)',lineHeight:1}}>+</button>
        <button onClick={()=>zoomBy(-0.15)} style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:6,width:28,height:28,fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx2)',lineHeight:1}}>−</button>
        <button onClick={fitToView} style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:6,padding:'0 10px',height:28,fontSize:11,cursor:'pointer',color:'var(--tx2)',fontFamily:'inherit',fontWeight:600}}>⊡ Fit</button>
        <span style={{fontSize:11,color:'var(--tx3)',marginLeft:2}}>{Math.round(scale*100)}%</span>
      </div>
      <div className="hd-card" ref={cwRef} style={{position:'relative',height:'calc(100vh - 260px)',minHeight:400,padding:0,overflow:'hidden'}}>
        <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%',cursor:hoveredSeat?'pointer':'default'}}
          onMouseMove={e=>{const r=canvasRef.current?.getBoundingClientRect();if(!r)return;const s=seatAt(e.clientX-r.left,e.clientY-r.top);setHoveredSeat(s?.id||null);if(s){const res=hd.reservations.find(rv=>rv.seatId===s.id&&rv.date===TODAY);const isFixed=!!hd.fixed[s.id];const name=isFixed?hd.fixed[s.id]:res?.userName||null;setSeatHoverInfo({id:s.id,name,x:e.clientX,y:e.clientY});}else{setSeatHoverInfo(null);}}}
          onMouseLeave={()=>{setHoveredSeat(null);setSeatHoverInfo(null);}}
          onClick={e=>{const r=canvasRef.current?.getBoundingClientRect();if(!r)return;const s=seatAt(e.clientX-r.left,e.clientY-r.top);if(s)onSeat(s.id);}}
        />
        {!allSeats.length&&(<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx3)',fontSize:13,flexDirection:'column',gap:8}}><span style={{fontSize:24}}>🗺</span><span>No seats in this blueprint.</span></div>)}
      </div>
      {seatHoverInfo&&(<div style={{position:'fixed',left:seatHoverInfo.x+14,top:seatHoverInfo.y-10,background:'var(--sf)',border:'1px solid var(--bd2)',borderRadius:'var(--r)',padding:'5px 10px',zIndex:9901,pointerEvents:'none',boxShadow:'var(--shadow)',whiteSpace:'nowrap'}}><span style={{fontFamily:'var(--mono)',fontWeight:700,color:'var(--ac2)',fontSize:12}}>{seatHoverInfo.id}</span>{seatHoverInfo.name&&<span style={{fontSize:11,color:'var(--tx2)',marginLeft:8}}>{seatHoverInfo.name}</span>}{!seatHoverInfo.name&&<span style={{fontSize:11,color:'var(--green)',marginLeft:8}}>Free</span>}</div>)}
    </div>
  );
}

function BuildingFloorSelectors({ selectedBuilding, selectedBlueprint, onChange }) {
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  useEffect(()=>{supabase.from('buildings').select('*').eq('active',true).order('name').then(({data})=>{if(!data)return;setBuildings(data);const b=data[0];if(b&&!selectedBuilding)onChange(b,null);});}, []);
  useEffect(()=>{if(!selectedBuilding){setFloors([]);return;}supabase.from('blueprints').select('id,floor_name,floor_order,layout').eq('building_id',selectedBuilding.id).order('floor_order').then(({data})=>{if(!data)return;setFloors(data);const fl=data[0];if(fl&&(!selectedBlueprint||selectedBlueprint.id!==fl.id))onChange(selectedBuilding,fl);});}, [selectedBuilding?.id]);
  if(buildings.length===0)return<span style={{fontSize:11,color:'var(--tx3)',padding:'0 8px'}}>No buildings — configure in Admin → Blueprint</span>;
  return(
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <select value={selectedBuilding?.id||''} onChange={e=>{const b=buildings.find(x=>x.id===e.target.value);if(b){setFloors([]);onChange(b,null);}}} style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:'var(--r)',padding:'4px 8px',fontSize:11,color:'var(--tx)',outline:'none',cursor:'pointer',fontFamily:'inherit'}}>
        <option value="">— Building —</option>
        {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <select value={selectedBlueprint?.id||''} onChange={e=>{const fl=floors.find(x=>x.id===e.target.value);if(fl&&selectedBuilding)onChange(selectedBuilding,fl);}} disabled={!selectedBuilding||floors.length===0} style={{background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:'var(--r)',padding:'4px 8px',fontSize:11,color:'var(--tx)',outline:'none',cursor:'pointer',fontFamily:'inherit',opacity:(!selectedBuilding||floors.length===0)?0.5:1}}>
        <option value="">— Floor —</option>
        {floors.map(fl=><option key={fl.id} value={fl.id}>{fl.floor_name}</option>)}
      </select>
    </div>
  );
}

function HDReserveModal({ seatId, initDate, hd, onConfirm, onRelease, onClose, currentUser }) {
  const { t, lang } = useApp();
  const [yr, sYr] = useState(new Date().getFullYear());
  const [mo, sMo] = useState(new Date().getMonth());
  const [sel, sSel] = useState(initDate ? [initDate] : []);
  const date = initDate || MOCK_TODAY;
  const st = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations);
  const res = ReservationService.resOf(seatId, date, hd.reservations);
  const isMine = res?.userId === currentUser.id;
  const fixedOwner = hd.fixed[seatId];
  const isMyFixed = fixedOwner === currentUser.name;
  const isOtherFixed = st === SeatStatus.FIXED && !isMyFixed;
  const myReservedDates = hd.reservations.filter(r => r.userId === currentUser.id && r.seatId !== seatId).map(r => r.date);
  const occupiedDates = hd.reservations.filter(r => r.seatId === seatId).map(r => r.date);
  const blockedDates = [...new Set([...occupiedDates, ...myReservedDates])];
  const toggle = iso => sSel(p => p.includes(iso) ? p.filter(x => x !== iso) : [...p, iso]);
  const prev = () => mo === 0 ? (sMo(11), sYr(y => y-1)) : sMo(m => m-1);
  const next = () => mo === 11 ? (sMo(0), sYr(y => y+1)) : sMo(m => m+1);
  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mb" style={{maxWidth:400}}>
        <div className="mh"><div className="mt">🪑 {seatId}</div><button className="mc" onClick={onClose}>×</button></div>
        <div className="mbody">
          {isOtherFixed && <div style={{fontSize:12,color:"var(--tx3)"}}>{t("hdNoReserve")}</div>}
          {isMine && !isMyFixed && (<div><div style={{fontSize:12,color:"var(--tx2)",marginBottom:8}}>{t("hdReleaseQ")}</div><button className="b-danger" style={{width:"100%"}} onClick={()=>onRelease(seatId,date)}>{t("hdReleaseBtn")}</button></div>)}
          {!isOtherFixed && !isMine && !isMyFixed && !myReservedDates.includes(date) && (
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <button className="n-arr" onClick={prev}>‹</button>
                <span style={{fontSize:12,fontWeight:600,color:"var(--ac2)"}}>{fmtMonthYear(yr,mo,lang)}</span>
                <button className="n-arr" onClick={next}>›</button>
              </div>
              <MiniCalendar year={yr} month={mo} selectedDates={sel} onToggleDate={toggle} occupiedDates={blockedDates}/>
              {sel.length>0&&<div style={{fontSize:11,color:"var(--green)"}}>{t("hdSelectDates")}: {sel.sort().join(", ")}</div>}
            </>
          )}
          {myReservedDates.includes(date) && !isMine && !isOtherFixed && <div style={{fontSize:12,color:"var(--amber)"}}>⚠ {t("hdAlreadyRes")}</div>}
        </div>
        <div className="mf">
          <button className="b-cancel" onClick={onClose}>{t("cancel")}</button>
          {!isOtherFixed && !isMine && !isMyFixed && !myReservedDates.includes(date) && (
            <button className="b-sub" onClick={()=>onConfirm(seatId,sel)} disabled={sel.length===0}>{t("hdConfirm")} {sel.length>0&&`(${sel.length})`}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ADMIN COMPONENTS
// ════════════════════════════════════════════════════════════════

function PersonalJiraToken() {
  const [token,setToken]=useState('');const [show,setShow]=useState(false);const [saving,setSaving]=useState(false);const [hasToken,setHasToken]=useState(false);const [ok,setOk]=useState('');
  useEffect(()=>{supabase.auth.getUser().then(({data:{user}})=>{if(!user)return;supabase.from('users').select('jira_api_token').eq('id',user.id).single().then(({data})=>setHasToken(!!data?.jira_api_token));});}, []);
  const save=async()=>{setSaving(true);const{data:{user}}=await supabase.auth.getUser();if(!user){setSaving(false);return;}const{error}=await supabase.from('users').update({jira_api_token:token.trim()||null}).eq('id',user.id);if(!error){setHasToken(!!token.trim());setToken('');setOk(token.trim()?'✓ Token guardado':'✓ Token eliminado');setTimeout(()=>setOk(''),3000);}setSaving(false);};
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:8,height:8,borderRadius:'50%',background:hasToken?'var(--green)':'var(--tx3)',boxShadow:hasToken?'0 0 5px var(--green)':'none'}}/><span style={{fontSize:12,color:hasToken?'var(--green)':'var(--tx3)'}}>{hasToken?'Token personal configurado':'Sin token personal'}</span></div>
      <div style={{display:'flex',gap:6}}><input className="a-inp" type={show?'text':'password'} placeholder={hasToken?'••••••••• (dejar vacío para eliminar)':'ATatt3x...'} value={token} onChange={e=>setToken(e.target.value)} style={{flex:1}}/><button className="btn-g" onClick={()=>setShow(s=>!s)} style={{padding:'0 10px',flexShrink:0}}>{show?'Ocultar':'Mostrar'}</button></div>
      <button className="btn-p" onClick={save} disabled={saving} style={{maxWidth:200}}>{saving?'Guardando...':hasToken?'Actualizar token':'Guardar token'}</button>
      {ok&&<div className="saved-ok"><span className="dot-ok"/> {ok}</div>}
    </div>
  );
}

function AdminSettings() {
  const { t } = useApp();
  const [jiraUrl,setJiraUrl]=useState("");const [email,setEmail]=useState("");const [token,setToken]=useState("");const [showTok,setShowTok]=useState(false);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [conn,setConn]=useState(null);const [errMsg,setErrMsg]=useState("");const [okMsg,setOkMsg]=useState("");
  useEffect(()=>{(async()=>{try{const res=await fetch(`${API_BASE}/jira/connection`,{headers:await getAuthHeader()});const json=await res.json();if(json.ok&&json.data){setConn(json.data);setJiraUrl(json.data.base_url||"");setEmail(json.data.email||"");}}catch{}finally{setLoading(false);}})();},[]);
  const handleSave=async()=>{setErrMsg("");setOkMsg("");if(!jiraUrl.trim()||!email.trim()){setErrMsg("Completa URL y email");return;}if(!conn&&!token.trim()){setErrMsg("Introduce el API Token");return;}setSaving(true);try{const body={baseUrl:jiraUrl.trim(),email:email.trim()};if(token.trim())body.apiToken=token.trim();if(!token.trim()&&conn)body.apiToken="__keep__";const res=await fetch(`${API_BASE}/jira/connection`,{method:"POST",headers:{...await getAuthHeader(),"Content-Type":"application/json"},body:JSON.stringify(body)});const json=await res.json();if(!json.ok){setErrMsg(json.error?.message||"Error al guardar");return;}setConn({base_url:jiraUrl.trim(),email:email.trim()});setToken("");setOkMsg("✓ Configuración guardada");setTimeout(()=>setOkMsg(""),3000);}catch{setErrMsg("Error de red");}finally{setSaving(false);}};
  if(loading)return<div style={{padding:20,color:"var(--tx3)",fontSize:13}}>Cargando...</div>;
  return(
    <div>
      <div className="sec-t">{t("settingsTitle")}</div>
      <div className="a-card">
        <div className="a-ct">🔗 {t("jiraConnection")}</div>
        <div className="a-form">
          <div><div className="a-lbl">{t("jiraUrl")}</div><input className="a-inp" placeholder="https://yourcompany.atlassian.net" value={jiraUrl} onChange={e=>setJiraUrl(e.target.value)}/></div>
          <div><div className="a-lbl">{t("jiraEmail")}</div><input className="a-inp" type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div><div className="a-lbl">{t("apiToken")}</div><div style={{display:"flex",gap:6}}><input className="a-inp" type={showTok?"text":"password"} placeholder={conn?"•••••••••":"ATatt3x..."} value={token} onChange={e=>setToken(e.target.value)} style={{flex:1}}/><button className="btn-g" onClick={()=>setShowTok(s=>!s)} style={{padding:"0 10px",flexShrink:0}}>{showTok?t("hideToken"):t("showToken")}</button></div><div className="a-hint">{t("tokenHint")}</div></div>
          <button className="btn-p" onClick={handleSave} disabled={saving}>{saving?"Guardando...":t("saveConfig")}</button>
          {conn&&<button className="btn-g" onClick={async()=>{await fetch(`${API_BASE}/jira/connection`,{method:"DELETE",headers:await getAuthHeader()});setConn(null);setJiraUrl("");setEmail("");setToken("");}} style={{marginTop:4,color:"var(--red)",borderColor:"var(--red)"}}>Desconectar</button>}
          {errMsg&&<div style={{marginTop:8,padding:"8px 12px",background:"rgba(229,62,62,.08)",border:"1px solid rgba(229,62,62,.25)",borderRadius:"var(--r)",color:"var(--red)",fontSize:12}}>{errMsg}</div>}
          {okMsg&&<div className="saved-ok"><span className="dot-ok"/> {okMsg}</div>}
        </div>
      </div>
      <div className="a-card"><div className="a-ct">🔑 Mi token personal de Jira</div><PersonalJiraToken/></div>
    </div>
  );
}

function AddUserModal({ existingUsers, onClose, onSave }) {
  const { t } = useApp();
  const [name,setName]=useState("");const [email,setEmail]=useState("");const [role,setRole]=useState("user");const [pwd,setPwd]=useState("");const [conf,setConf]=useState("");const [show,setShow]=useState(false);const [er,setEr]=useState({});const [done,setDone]=useState(false);
  const existEmails=existingUsers.map(u=>u.email.toLowerCase());
  const validate=()=>{const e={};if(!name.trim())e.name=t("errNameRequired");if(!email.trim())e.email=t("errEmailRequired");else if(!isValidEmail(email))e.email=t("errEmailInvalid");else if(existEmails.includes(email.toLowerCase()))e.email=t("errEmailExists");if(pwd.length<8)e.pwd=t("errPasswordShort");if(pwd!==conf)e.conf=t("errPasswordMatch");return e;};
  const submit=async()=>{const errs=validate();if(Object.keys(errs).length){setEr(errs);return;}setDone(true);try{const{data:{session}}=await supabase.auth.getSession();const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token}`,'apikey':import.meta.env.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({name:name.trim(),email:email.toLowerCase().trim(),password:pwd,role,deskType:"hotdesk"})});const json=await res.json();if(!res.ok){setEr({email:json.error||'Error'});setDone(false);return;}const u=json.user;onSave({id:u.id,name:u.name,email:u.email,avatar:u.avatar||makeAvatar(u.name),role:u.role,deskType:u.desk_type||'hotdesk',active:u.active});setTimeout(()=>onClose(),600);}catch(err){setEr({email:String(err)});setDone(false);}};
  return(
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:490}}>
        <div className="mh"><div className="mt">👤 {t("addUserBtn")}</div><button className="mc" onClick={onClose}>×</button></div>
        {done?<div className="mbody"><div className="ok-fl">✓ {t("userAdded")}</div></div>:(
          <><div className="mbody">
            <div className="fr"><label className="fl">{t("fieldName")}</label><input className={`mi ${er.name?"err":""}`} placeholder="John Smith" value={name} onChange={e=>{setName(e.target.value);setEr(v=>({...v,name:null}));}} autoFocus/>{er.name&&<span className="em">{er.name}</span>}</div>
            <div className="fr2">
              <div className="fr"><label className="fl">{t("fieldEmail")}</label><input className={`mi ${er.email?"err":""}`} type="email" placeholder="john@co.com" value={email} onChange={e=>{setEmail(e.target.value);setEr(v=>({...v,email:null}));}}/>{er.email&&<span className="em">{er.email}</span>}</div>
              <div className="fr"><label className="fl">{t("fieldRole")}</label><select className="mi" value={role} onChange={e=>setRole(e.target.value)}><option value="user">{t("roleUser")}</option><option value="admin">{t("roleAdmin")}</option></select></div>
            </div>
            <div className="fr"><label className="fl">{t("fieldPassword")}</label><div style={{display:"flex",gap:6}}><input className={`mi ${er.pwd?"err":""}`} type={show?"text":"password"} placeholder="········" autoComplete="new-password" style={{flex:1}} value={pwd} onChange={e=>{setPwd(e.target.value);setEr(v=>({...v,pwd:null}));}}/><button className="btn-g" onClick={()=>setShow(s=>!s)} style={{flexShrink:0,padding:"0 10px"}}>{show?"🙈":"👁"}</button></div><PasswordStrength password={pwd}/>{er.pwd&&<span className="em">{er.pwd}</span>}</div>
            <div className="fr"><label className="fl">{t("fieldConfirm")}</label><input className={`mi ${er.conf?"err":""}`} type={show?"text":"password"} placeholder="········" autoComplete="new-password" value={conf} onChange={e=>{setConf(e.target.value);setEr(v=>({...v,conf:null}));}}/>{er.conf&&<span className="em">{er.conf}</span>}</div>
          </div><div className="mf"><button className="b-cancel" onClick={onClose}>{t("cancel")}</button><button className="b-sub" onClick={submit}>{t("saveUser")}</button></div></>
        )}
      </div>
    </div>
  );
}

function AdminUsers({ users, setUsers, currentUser }) {
  const { t } = useApp();
  const [modal, setModal] = useState(null);
  const toggleRole=id=>setUsers(us=>us.map(u=>u.id===id?{...u,role:u.role==="admin"?"user":"admin"}:u));
  const toggleAccess=id=>setUsers(us=>us.map(u=>u.id===id?{...u,active:!u.active}:u));
  const changeDeskType=(id,dt)=>setUsers(us=>us.map(u=>u.id===id?{...u,deskType:dt}:u));
  const toggleModule=(id,modId)=>setUsers(us=>us.map(u=>{if(u.id!==id)return u;const mods=u.modules||["jt","hd","retro","deploy"];return{...u,modules:mods.includes(modId)?mods.filter(m=>m!==modId):[...mods,modId]};}));
  const DESK_COLORS={[DeskType.NONE]:"var(--tx3)",[DeskType.HOTDESK]:"var(--ac2)",[DeskType.FIXED]:"var(--red)"};
  const DESK_LABELS={[DeskType.NONE]:"—",[DeskType.HOTDESK]:"HD",[DeskType.FIXED]:"FX"};
  return(
    <div>
      <div className="sec-t">{t("usersTitle")}</div>
      <div className="users-bar">
        <button className="btn-p" style={{width:"auto",padding:"7px 14px"}} onClick={()=>setModal("add")}>{t("addUserBtn")}</button>
      </div>
      <div className="a-card" style={{padding:0,overflow:"hidden"}}>
        <table className="ut"><thead><tr><th>{t("colUser")}</th><th>{t("colEmail")}</th><th>{t("colRole")}</th><th>{t("colDeskType")}</th><th>Módulos</th><th>{t("colAccess")}</th><th>{t("colActions")}</th></tr></thead>
        <tbody>{users.map(u=>(
          <tr key={u.id}>
            <td><div style={{display:"flex",alignItems:"center",gap:8}}><div className="avatar" style={{width:26,height:26,fontSize:9,flexShrink:0}}>{u.avatar}</div><span style={{fontWeight:500}}>{u.name}</span>{u.id===currentUser.id&&<span style={{fontSize:9,color:"var(--tx3)"}}>{t("you")}</span>}</div></td>
            <td style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--tx3)"}}>{u.email}</td>
            <td><span className={`r-tag ${u.role==="admin"?"r-admin":"r-user"}`}>{u.role==="admin"?t("roleAdmin"):t("roleUser")}</span></td>
            <td><div style={{display:"flex",gap:3}}>{[DeskType.NONE,DeskType.HOTDESK,DeskType.FIXED].map(dt=>(<button key={dt} onClick={()=>changeDeskType(u.id,dt)} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,border:`1px solid ${u.deskType===dt?DESK_COLORS[dt]:"var(--bd)"}`,background:u.deskType===dt?`${DESK_COLORS[dt]}15`:"transparent",color:u.deskType===dt?DESK_COLORS[dt]:"var(--tx3)",cursor:"pointer"}}>{DESK_LABELS[dt]}</button>))}</div></td>
            <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{MODULES.map(m=>{const hasMod=(u.modules||["jt","hd","retro","deploy"]).includes(m.id);return(<button key={m.id} onClick={()=>toggleModule(u.id,m.id)} style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:3,border:`1px solid ${hasMod?m.color:"var(--bd)"}`,background:hasMod?`${m.color}18`:"transparent",color:hasMod?m.color:"var(--tx3)",cursor:"pointer",textDecoration:hasMod?"none":"line-through"}}>{m.id.toUpperCase()}</button>);})}</div></td>
            <td><span style={{fontSize:11,fontWeight:500,color:u.active?"var(--green)":"var(--red)"}}>{u.active?t("statusActive"):t("statusBlocked")}</span></td>
            <td>
              <button className="act act-adm" onClick={()=>toggleRole(u.id)}>{u.role==="admin"?t("removeAdmin"):t("makeAdmin")}</button>
              {u.id!==currentUser.id&&<button className={`act ${u.active?"act-d":"act-a"}`} onClick={()=>toggleAccess(u.id)}>{u.active?t("blockUser"):t("unblockUser")}</button>}
            </td>
          </tr>
        ))}</tbody></table>
      </div>
      {modal==="add"&&<AddUserModal existingUsers={users} onClose={()=>setModal(null)} onSave={u=>setUsers(us=>[...us,u])}/>}
    </div>
  );
}

// ── Admin Deploy Planner Config ───────────────────────────────

function AdminDeployConfig() {
  const [statuses,setStatuses]=React.useState([]);
  const [newStatus,setNewStatus]=React.useState({name:"",color:"#6b7280",is_final:false});
  const [repoGroups,setRepoGroups]=React.useState([]);
  const [newGroupName,setNewGroupName]=React.useState("");
  const [expandedGroup,setExpandedGroup]=React.useState(null);
  const [newRepoName,setNewRepoName]=React.useState("");
  const [dragging,setDragging]=React.useState(null);
  const [dragOver,setDragOver]=React.useState(null);

  React.useEffect(()=>{
    supabase.from("dp_release_statuses").select("*").order("ord").then(({data})=>{if(data)setStatuses(data);});
    supabase.from("dp_repo_groups").select("*").order("name").then(({data})=>{if(data)setRepoGroups(data);});
  },[]);

  const addRelStatus=async()=>{if(!newStatus.name.trim())return;const hex=newStatus.color;const{data}=await supabase.from("dp_release_statuses").insert({name:newStatus.name,color:hex,bg_color:hex+"20",border:hex+"66",is_final:newStatus.is_final,ord:statuses.length}).select().single();if(data){setStatuses(s=>[...s,data]);setNewStatus({name:"",color:"#6b7280",is_final:false});}};
  const delRelStatus=async(id)=>{await supabase.from("dp_release_statuses").delete().eq("id",id);setStatuses(s=>s.filter(x=>x.id!==id));};
  const onDragEnd=async()=>{if(dragging===null||dragOver===null||dragging===dragOver){setDragging(null);setDragOver(null);return;}const reordered=[...statuses];const[moved]=reordered.splice(dragging,1);reordered.splice(dragOver,0,moved);const updated=reordered.map((s,i)=>({...s,ord:i}));setStatuses(updated);setDragging(null);setDragOver(null);await Promise.all(updated.map(s=>supabase.from("dp_release_statuses").update({ord:s.ord}).eq("id",s.id)));};
  const addGroup=async()=>{if(!newGroupName.trim())return;const{data}=await supabase.from("dp_repo_groups").insert({name:newGroupName.trim(),repos:[]}).select().single();if(data){setRepoGroups(g=>[...g,data]);setNewGroupName("");setExpandedGroup(data.id);}};
  const deleteGroup=async(id)=>{await supabase.from("dp_repo_groups").delete().eq("id",id);setRepoGroups(g=>g.filter(x=>x.id!==id));};
  const addRepoToGroup=async(groupId,repoName)=>{if(!repoName.trim())return;const group=repoGroups.find(g=>g.id===groupId);if(!group||group.repos.includes(repoName.trim()))return;const updated=[...group.repos,repoName.trim()];await supabase.from("dp_repo_groups").update({repos:updated}).eq("id",groupId);setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,repos:updated}:g));setNewRepoName("");};
  const removeRepoFromGroup=async(groupId,repoName)=>{const group=repoGroups.find(g=>g.id===groupId);if(!group)return;const updated=group.repos.filter(r=>r!==repoName);await supabase.from("dp_repo_groups").update({repos:updated}).eq("id",groupId);setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,repos:updated}:g));};

  // FIX #5: renameGroup optimista — state antes del await
  const renameGroup=async(groupId,name)=>{
    setRepoGroups(gs=>gs.map(g=>g.id===groupId?{...g,name}:g));
    await supabase.from("dp_repo_groups").update({name}).eq("id",groupId);
  };

  return(
    <div style={{maxWidth:700}}>
      <div className="sec-t">🚀 Deploy Planner</div>
      <div className="a-card">
        <div className="a-ct">Estados de Release</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
          {statuses.map((st,i)=>(
            <div key={st.id} draggable onDragStart={()=>setDragging(i)} onDragOver={e=>{e.preventDefault();setDragOver(i);}} onDragEnd={onDragEnd}
              style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:dragOver===i?"var(--glow)":"var(--sf2)",borderRadius:8,border:`1px solid ${dragOver===i?"var(--ac)":"var(--bd)"}`,cursor:"grab"}}>
              <span style={{color:"var(--tx3)",fontSize:12}}>⠿</span>
              <div style={{width:14,height:14,borderRadius:3,background:st.color,flexShrink:0}}/>
              <span style={{flex:1,fontSize:13,fontWeight:600,color:"var(--tx)"}}>{st.name}</span>
              {st.is_final&&<span style={{fontSize:9,color:"var(--tx3)",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"1px 6px"}}>Final</span>}
              <button onClick={()=>delRelStatus(st.id)} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:14}}>×</button>
            </div>
          ))}
        </div>
        <div style={{padding:"12px 14px",background:"var(--sf2)",borderRadius:8,border:"1px dashed var(--bd)"}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={newStatus.name} onChange={e=>setNewStatus(s=>({...s,name:e.target.value}))} placeholder="Nombre del estado"
              style={{flex:2,minWidth:130,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 10px",color:"var(--tx)",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
            <input type="color" value={newStatus.color} onChange={e=>setNewStatus(s=>({...s,color:e.target.value}))} style={{width:32,height:28,border:"none",background:"none",cursor:"pointer",padding:0}}/>
            <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"var(--tx3)",cursor:"pointer"}}>
              <input type="checkbox" checked={newStatus.is_final} onChange={e=>setNewStatus(s=>({...s,is_final:e.target.checked}))}/>Estado final
            </label>
            <button onClick={addRelStatus} style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:5,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>+ Añadir</button>
          </div>
        </div>
      </div>

      <div className="a-card" style={{marginTop:16}}>
        <div className="a-ct">Grupos de repositorios</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
          {repoGroups.map(group=>(
            <div key={group.id} style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:expandedGroup===group.id?"1px solid var(--bd)":"none"}}>
                <button onClick={()=>setExpandedGroup(expandedGroup===group.id?null:group.id)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:11,padding:0}}>
                  {expandedGroup===group.id?"▼":"▶"}
                </button>
                {/* FIX #5: input controlled con onChange que actualiza optimistamente */}
                <input value={group.name} onChange={e=>renameGroup(group.id,e.target.value)}
                  style={{flex:1,background:"none",border:"none",outline:"none",fontSize:13,fontWeight:600,color:"var(--tx)",fontFamily:"inherit"}}/>
                <span style={{fontSize:10,color:"var(--tx3)"}}>{group.repos.length} repos</span>
                <button onClick={()=>deleteGroup(group.id)} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:14}}>×</button>
              </div>
              {expandedGroup===group.id&&(
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                    {group.repos.length===0&&<span style={{fontSize:11,color:"var(--tx3)"}}>Sin repositorios</span>}
                    {group.repos.map(repo=>(
                      <div key={repo} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:20,fontSize:11,color:"var(--tx2)"}}>
                        <span>⬡</span><span>{repo}</span>
                        <button onClick={()=>removeRepoFromGroup(group.id,repo)} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:12,lineHeight:1,padding:0}}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <input placeholder="Nombre del repo…" value={expandedGroup===group.id?newRepoName:""} onChange={e=>setNewRepoName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addRepoToGroup(group.id,newRepoName);}}
                      style={{flex:1,background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 10px",color:"var(--tx)",fontSize:11,fontFamily:"inherit",outline:"none"}}/>
                    <button onClick={()=>addRepoToGroup(group.id,newRepoName)} style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"6px 12px",fontSize:11,color:"var(--tx2)",cursor:"pointer",fontFamily:"inherit"}}>+ Añadir</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {repoGroups.length===0&&<div style={{fontSize:11,color:"var(--tx3)"}}>Sin grupos configurados</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addGroup();}} placeholder="Nombre del grupo…"
            style={{flex:1,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:5,padding:"8px 12px",color:"var(--tx)",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
          <button onClick={addGroup} style={{background:"var(--ac)",color:"#fff",border:"none",borderRadius:5,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>+ Nuevo grupo</button>
        </div>
      </div>
    </div>
  );
}

function AdminEnvTrackerSection() {
  const [sub,setSub]=React.useState("environments");
  const SUB=[{id:"environments",label:"Entornos",icon:"🖥️"},{id:"repositories",label:"Repositorios",icon:"📦"},{id:"policy",label:"Política",icon:"📋"}];
  return(
    <div>
      <div className="sec-t">🖥️ Environments</div>
      <div className="sec-sub" style={{marginBottom:16}}>Gestiona entornos de despliegue, repositorios y política de reservas.</div>
      <div style={{display:"flex",gap:4,marginBottom:20,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:10,padding:4,width:"fit-content"}}>
        {SUB.map(s=>(<button key={s.id} onClick={()=>setSub(s.id)} style={{background:sub===s.id?"var(--ac)":"transparent",color:sub===s.id?"#fff":"var(--tx3)",border:"none",borderRadius:7,cursor:"pointer",fontWeight:sub===s.id?600:400,fontSize:12,padding:"5px 14px",fontFamily:"inherit"}}>{s.icon} {s.label}</button>))}
      </div>
      <div className="a-card">
        {sub==="environments"&&<AdminEnvEnvironments supabase={supabase}/>}
        {sub==="repositories"&&<AdminEnvRepositories supabase={supabase}/>}
        {sub==="policy"&&<AdminEnvPolicy supabase={supabase}/>}
      </div>
    </div>
  );
}

function AdminRetroTeamsShell({ users }) {
  const [teams,setTeams]=React.useState([]);
  React.useEffect(()=>{if(supabase){Promise.all([supabase.from("retro_teams").select("*"),supabase.from("retro_team_members").select("*")]).then(([{data:td},{data:md}])=>{const t=(td||[]).map(t=>({...t,members:(md||[]).filter(m=>m.team_id===t.id).map(m=>{const u=users.find(x=>x.id===m.user_id);return{...m,name:u?.name,email:u?.email};})}));setTeams(t);});}},[users.length]);
  return <AdminRetroTeams wsUsers={users} teams={teams} setTeams={setTeams}/>;
}

function AdminShell({ users, setUsers, hd, setHd, currentUser }) {
  const { t } = useApp();
  const isAdmin = currentUser.role === 'admin';
  const [mod, setMod] = useState("settings");
  if (!isAdmin) {
    return (<div className="admin-content" style={{maxWidth:600}}><div className="sec-t">Configuración personal</div><div className="a-card"><div className="a-ct">🔑 Token personal de Jira</div><PersonalJiraToken/></div></div>);
  }
  const NAV=[
    {id:"settings",icon:"⚙",label:t("adminSettings")},
    {id:"users",icon:"👥",label:t("adminUsers")},
    {id:"hotdesk",icon:"🪑",label:t("adminHotDesk")},
    {id:"retroteams",icon:"🔁",label:"Retro Teams"},
    {id:"deploy",icon:"🚀",label:"Deploy Planner"},
    {id:"envtracker",icon:"🖥️",label:"Environments"},
  ];
  return(
    <div className="admin-wrap">
      <nav className="admin-nav">
        <div className="admin-nav-t">{t("adminSidebar")}</div>
        {NAV.map(item=>(<button key={item.id} className={`an-btn ${mod===item.id?"active":""}`} onClick={()=>setMod(item.id)}><span className="an-icon">{item.icon}</span><span>{item.label}</span></button>))}
      </nav>
      <div className="admin-content">
        {mod==="settings"&&<AdminSettings/>}
        {mod==="users"&&<AdminUsers users={users} setUsers={setUsers} currentUser={currentUser}/>}
        {mod==="retroteams"&&<AdminRetroTeamsShell users={users}/>}
        {mod==="deploy"&&<AdminDeployConfig/>}
        {mod==="envtracker"&&<AdminEnvTrackerSection/>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// CSS
// ════════════════════════════════════════════════════════════════

const buildCSS = () => `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--body:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;--r:5px;--r2:8px;--ease:all .15s ease;--bg:#0d0d10;--sf:#141418;--sf2:#1b1b22;--sf3:#21212c;--bd:#2a2a38;--bd2:#383850;--ac:#4f6ef7;--ac2:#7b93ff;--glow:rgba(79,110,247,.12);--green:#3ecf8e;--amber:#f5a623;--red:#e05252;--purple:#b57cf6;--tx:#e4e4ef;--tx2:#8888a8;--tx3:#50506a;--shadow:0 8px 30px rgba(0,0,0,.55);--seat-free:#3ecf8e;--seat-occ:#4f6ef7;--seat-fixed:#e05252;color-scheme:dark;}
[data-theme="light"]{--bg:#f0f0f6;--sf:#ffffff;--sf2:#f5f5fb;--sf3:#eaeaf2;--bd:#dcdce8;--bd2:#c4c4d8;--ac:#4f6ef7;--ac2:#2d4fd0;--glow:rgba(79,110,247,.07);--green:#0f9060;--amber:#b86800;--red:#c02828;--tx:#181826;--tx2:#4a4a70;--tx3:#9494b8;--shadow:0 8px 30px rgba(0,0,0,.1);--seat-free:#0f9060;--seat-occ:#4f6ef7;--seat-fixed:#c02828;color-scheme:light;}
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
.sw-btn.active-retro{background:rgba(167,139,250,.15);color:#a78bfa;box-shadow:inset 0 0 0 1px rgba(167,139,250,.35);}
.sw-btn.active-deploy{background:rgba(245,158,11,.15);color:#f59e0b;box-shadow:inset 0 0 0 1px rgba(245,158,11,.35);}
.sw-btn.active-env{background:rgba(34,211,238,.15);color:#22d3ee;box-shadow:inset 0 0 0 1px rgba(34,211,238,.35);}
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
.pick-l{display:flex;flex-direction:column;gap:2px;}
.pick-i{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:var(--r);cursor:pointer;user-select:none;font-size:12px;color:var(--tx2);transition:background .1s;}
.pick-i:hover{background:var(--sf3);}
.pick-i.on{background:var(--glow);color:var(--tx);}
.cb{width:16px;height:16px;border-radius:4px;border:2px solid var(--bd2);background:var(--sf3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:transparent;transition:var(--ease);line-height:1;}
.pick-i.on .cb{background:var(--ac);border-color:var(--ac);color:#fff;}
.kb{font-family:var(--mono);color:var(--ac2);font-size:10px;font-weight:500;}
.btn-p{font-size:12px;font-weight:600;width:100%;padding:8px;border-radius:var(--r);border:none;background:var(--ac);color:#fff;cursor:pointer;transition:var(--ease);}
.btn-g{font-size:11px;font-weight:500;padding:4px 10px;border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.btn-exp{font-size:11px;font-weight:600;width:100%;padding:7px;border-radius:var(--r);border:1px solid var(--bd2);background:var(--sf2);color:var(--green);cursor:pointer;transition:var(--ease);}
.btn-log{font-size:11px;font-weight:600;padding:6px 12px;border-radius:var(--r);border:1px solid rgba(79,110,247,.3);background:var(--glow);color:var(--ac2);cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:var(--ease);}
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
.wlc.new{border-color:rgba(62,207,142,.3);background:rgba(62,207,142,.04);}
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
.f-row{display:flex;gap:7px;margin-bottom:12px;flex-wrap:wrap;align-items:center;}
.pill{font-size:10px;font-weight:600;padding:4px 10px;border-radius:20px;border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.pill.on{background:var(--glow);border-color:rgba(79,110,247,.28);color:var(--ac2);}
table{width:100%;border-collapse:collapse;}
th{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);padding:8px 10px;text-align:left;border-bottom:1px solid var(--bd);background:var(--sf);}
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
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:8px;color:var(--tx3);font-size:12px;}
.empty-i{font-size:28px;margin-bottom:4px;}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;backdrop-filter:blur(4px);}
.mb{background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);width:100%;box-shadow:var(--shadow);max-height:90vh;overflow-y:auto;}
.mh{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;border-bottom:1px solid var(--bd);}
.mt{font-size:14px;font-weight:700;color:var(--tx);}
.mc{background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;padding:2px 6px;}
.mbody{padding:18px;display:flex;flex-direction:column;gap:14px;}
.mf{padding:12px 18px 16px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--bd);}
.fr{display:flex;flex-direction:column;gap:5px;}
.fr2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.fl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tx3);}
.mi{width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:7px 10px;color:var(--tx);font-family:var(--body);font-size:12px;outline:none;}
.mi:focus{border-color:var(--ac);}
.mi.err{border-color:var(--red);}
.em{font-size:10px;color:var(--red);}
.tp{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--sf3);border-radius:var(--r);font-family:var(--mono);font-size:12px;}
.tv{color:var(--green);font-weight:500;}.tl{color:var(--tx3);}
.b-cancel{font-size:12px;font-weight:500;padding:8px 14px;border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;}
.b-sub{font-size:12px;font-weight:600;padding:8px 18px;border-radius:var(--r);border:none;background:var(--ac);color:#fff;cursor:pointer;}
.b-sub:disabled{opacity:.4;cursor:not-allowed;}
.b-danger{font-size:12px;font-weight:600;padding:8px 18px;border-radius:var(--r);border:none;background:var(--red);color:#fff;cursor:pointer;}
.ok-fl{display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(62,207,142,.08);border:1px solid rgba(62,207,142,.22);border-radius:var(--r);font-size:12px;color:var(--green);}
.pwd-meter{display:flex;gap:3px;margin-top:4px;}
.pwd-seg{height:3px;flex:1;border-radius:2px;background:var(--bd2);}
.pwd-seg.weak{background:var(--red);}
.pwd-seg.fair{background:var(--amber);}
.pwd-seg.strong{background:var(--green);}
.admin-wrap{display:flex;flex:1;overflow:hidden;background:var(--bg);}
.admin-nav{width:196px;min-width:196px;background:var(--sf);border-right:1px solid var(--bd);padding:16px 10px;display:flex;flex-direction:column;gap:4px;flex-shrink:0;}
.admin-nav-t{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3);padding:0 8px 10px;border-bottom:1px solid var(--bd);margin-bottom:6px;}
.an-btn{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:var(--r);border:1px solid transparent;background:transparent;color:var(--tx2);cursor:pointer;transition:var(--ease);font-size:12px;font-weight:500;text-align:left;}
.an-btn:hover{background:var(--sf3);color:var(--tx);}
.an-btn.active{background:var(--glow);color:var(--ac2);border-color:rgba(79,110,247,.22);}
.an-icon{font-size:14px;width:20px;text-align:center;flex-shrink:0;}
.admin-content{flex:1;overflow-y:auto;padding:24px;}
.sec-t{font-size:18px;font-weight:700;letter-spacing:-.3px;margin-bottom:4px;color:var(--tx);}
.sec-sub{font-size:12px;color:var(--tx3);margin-bottom:20px;}
.a-card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);padding:20px;margin-bottom:16px;}
.a-ct{font-size:13px;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--bd);color:var(--tx);}
.a-form{display:flex;flex-direction:column;gap:12px;}
.a-lbl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tx3);margin-bottom:3px;}
.a-inp{width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:7px 10px;color:var(--tx);font-family:var(--mono);font-size:12px;outline:none;}
.a-inp:focus{border-color:var(--ac);}
.a-hint{font-size:10px;color:var(--tx3);}
.info-r{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bd);}
.dot-ok{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 5px var(--green);}
.saved-ok{font-size:11px;color:var(--green);display:flex;align-items:center;gap:5px;margin-top:4px;}
.users-bar{display:flex;align-items:center;gap:8px;margin-bottom:16px;}
.ut{width:100%;border-collapse:collapse;}
.ut th{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);padding:10px 14px;text-align:left;border-bottom:1px solid var(--bd);background:var(--sf);}
.ut td{padding:10px 14px;border-bottom:1px solid var(--bd);font-size:12px;color:var(--tx2);background:var(--sf);}
.ut tr:hover td{background:var(--sf2);}
.act{font-size:10px;font-weight:600;padding:3px 9px;border-radius:3px;border:1px solid var(--bd);background:transparent;cursor:pointer;transition:var(--ease);margin-right:4px;}
.act-d{color:var(--red);border-color:rgba(224,82,82,.2);}
.act-a{color:var(--green);border-color:rgba(62,207,142,.2);}
.act-adm{color:var(--amber);border-color:rgba(245,166,35,.2);}
.hd-map-wrap{display:flex;flex-direction:column;gap:12px;}
.hd-map-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
.hd-card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);padding:16px;}
.hd-legend{display:flex;gap:14px;flex-wrap:wrap;}
.hd-leg{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tx2);}
.hd-leg-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0;}
.hd-tbl{border-collapse:collapse;font-size:11px;width:100%;}
.hd-th{padding:9px 4px;text-align:center;border-bottom:2px solid var(--bd);background:var(--sf);color:var(--tx3);font-size:9px;font-weight:700;text-transform:uppercase;min-width:44px;white-space:nowrap;position:sticky;top:0;z-index:6;}
.hd-td{padding:2px;border-bottom:1px solid var(--bd);background:var(--sf);}
.hd-cell{cursor:pointer;border-radius:3px;height:30px;width:100%;display:flex;align-items:center;justify-content:center;transition:all .1s;}
.hd-cell:hover{filter:brightness(1.15);transform:scale(1.08);}
.hd-cell-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.hd-cell.free{background:rgba(62,207,142,.09);border:1px solid rgba(62,207,142,.32);}
.hd-cell.occ{background:rgba(79,110,247,.09);border:1px solid rgba(79,110,247,.32);}
.hd-cell.mine{background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.55);}
.hd-cell-dot.free{background:var(--seat-free);}
.hd-cell-dot.occ{background:var(--seat-occ);}
.hd-cell-dot.mine{background:var(--amber);}
.mini-cal{user-select:none;}
.mini-day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.mini-dh{text-align:center;font-size:9px;font-weight:700;color:var(--tx3);padding:2px 0;}
.mini-day{text-align:center;border-radius:4px;padding:4px 2px;font-size:11px;cursor:pointer;border:1px solid transparent;transition:var(--ease);color:var(--tx2);}
.mini-day.dis{color:var(--tx3);opacity:.35;cursor:not-allowed;}
.mini-day.sel{background:rgba(62,207,142,.15);border-color:var(--green);color:var(--green);font-weight:700;}
.mini-day.avail:hover{background:var(--sf3);border-color:var(--bd2);}
.cb-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);box-shadow:var(--shadow);z-index:200;max-height:220px;overflow-y:auto;}
.cb-opt{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--bd);}
.cb-opt:hover,.cb-opt.cb-sel{background:var(--glow);}
.cb-key{font-family:var(--mono);font-size:11px;color:var(--ac2);font-weight:600;min-width:72px;flex-shrink:0;}
.cb-sum{font-size:12px;color:var(--tx);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cb-prj{font-family:var(--mono);font-size:9px;color:var(--tx3);flex-shrink:0;}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
`;

// ════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ════════════════════════════════════════════════════════════════

function WorkSuiteApp() {
  const { user: authUser, logout } = useAuth();
  const [lang,  setLang]  = useState("es");
  const [theme, setTheme] = useState("dark");
  const [mod,   setMod]   = useState("jt");
  const [loadingData, setLoadingData] = useState(true);
  const [activeDay, setActiveDay] = useState(TODAY);
  const [filters, setFilters] = useState({
    from: TODAY.slice(0,7)+'-01',
    to:   TODAY.slice(0,7)+'-'+new Date(parseInt(TODAY.slice(0,4)),parseInt(TODAY.slice(5,7)),0).getDate().toString().padStart(2,'0'),
    authorId:'', spaceKeys:[], jql:''
  });
  const [worklogs,  setWorklogs]  = useState({});
  const [logModal,  setLogModal]  = useState(null);
  const [hd,        setHd]        = useState({ fixed:{}, reservations:[] });
  const [hdModal,   setHdModal]   = useState(null);
  const [selectedBuilding,   setSelectedBuilding]   = useState(null);
  const [selectedBlueprint,  setSelectedBlueprint]  = useState(null);
  const [toast,     setToast]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [view,      setView]      = useState("calendar");
  const [jiraIssues,   setJiraIssues]   = useState(MOCK_ISSUES_FALLBACK);
  const [jiraProjects, setJiraProjects] = useState(MOCK_PROJECTS_FALLBACK);

  const CURRENT_USER = authUser ? {
    id:       authUser.id,
    name:     authUser.name,
    email:    authUser.email,
    avatar:   authUser.avatar || (authUser.name||'U').slice(0,2).toUpperCase(),
    role:     authUser.role,
    deskType: authUser.desk_type || 'hotdesk',
    active:   authUser.active !== false,
    modules:  authUser.modules || ["jt","hd","retro","deploy","envtracker"],
  } : { id:'', name:'Loading...', email:'', avatar:'..', role:'user', deskType:'hotdesk', active:true, modules:["jt","hd","retro","deploy","envtracker"] };

  useEffect(() => {
    if (!authUser) { setLoadingData(false); return; }
    let cancelled = false;
    async function loadAll() {
      setLoadingData(true);
      try {
        const [wlRes, usersRes, resRes, fixedRes] = await Promise.all([
          supabase.from('worklogs').select('*').order('date', { ascending: false }),
          supabase.from('users').select('*').order('name'),
          supabase.from('seat_reservations').select('*'),
          supabase.from('fixed_assignments').select('*'),
        ]);
        if (cancelled) return;
        if (wlRes.data) setWorklogs(worklogsArrayToMap(wlRes.data));
        if (usersRes.data) setUsers(usersRes.data.map(u => ({
          id:u.id, name:u.name, email:u.email,
          avatar:u.avatar||u.name.slice(0,2).toUpperCase(),
          role:u.role, deskType:u.desk_type, active:u.active,
          modules:u.modules||["jt","hd","retro","deploy","envtracker"],
        })));
        const fixed = {};
        (fixedRes.data??[]).forEach(fa => { fixed[fa.seat_id] = fa.user_name||fa.user_id||""; });
        const reservations = (resRes.data??[]).map(r => ({
          seatId:r.seat_id, date:r.date.slice(0,10), userId:r.user_id, userName:r.user_name,
        }));
        setHd({ fixed, reservations });
        try {
          const authHeaders = await getAuthHeader();
          const headers = { ...authHeaders, 'Content-Type': 'application/json' };
          const projRes = await fetch(`${API_BASE}/jira/projects`, { headers });
          const projJson = await projRes.json();
          if (projJson.ok && projJson.data?.length) {
            if (cancelled) return;
            setJiraProjects(projJson.data.map(p => ({ key:p.key, name:p.name })));
            const preferred = projJson.data.find(p => p.key === 'ANDURIL') ?? projJson.data[0];
            const issRes = await fetch(`${API_BASE}/jira/issues?project=${preferred.key}`, { headers });
            const issJson = await issRes.json();
            if (issJson.ok && issJson.data?.length && !cancelled) {
              setJiraIssues(issJson.data.map((i,idx) => ({
                id:idx+1, key:i.key, summary:i.summary, type:i.type, status:i.status,
                priority:i.priority??'Medium', project:i.project, assignee:i.assignee??'',
                epic:i.epic??'—', epicName:i.epicName??'—', hours:0, labels:i.labels??[],
              })));
            }
          }
        } catch(e) { console.info('Jira not configured:', e); }
      } catch(err) { console.error('loadAll failed:', err); }
      finally { if (!cancelled) setLoadingData(false); }
    }
    void loadAll();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  const t = useCallback(k => TRANSLATIONS[lang]?.[k] ?? TRANSLATIONS.en[k] ?? k, [lang]);
  const activeDayRef = useRef(activeDay);
  useEffect(() => { activeDayRef.current = activeDay; }, [activeDay]);
  const openLogModal = useCallback(({ date, issueKey } = {}) => { setLogModal({ date:date||activeDayRef.current, issueKey:issueKey||'' }); }, []);

  const handleSaveWorklog = useCallback(async (date, wl) => {
    setWorklogs(p => ({ ...p, [date]: [...(p[date]||[]), wl] }));
    try {
      const { error } = await supabase.from('worklogs').insert({
        id:wl.id, issue_key:wl.issue, issue_summary:wl.summary, issue_type:wl.type,
        epic_key:wl.epic, epic_name:wl.epicName, project_key:wl.project,
        author_id:CURRENT_USER.id, author_name:CURRENT_USER.name,
        date, started_at:wl.started, seconds:wl.seconds, description:wl.description||'',
      });
      if (error) { console.error('Save worklog error:', error.message); return; }
      try {
        const startedAt = `${date}T${wl.started}:00.000+0000`;
        const headers = { ...await getAuthHeader(), 'Content-Type': 'application/json' };
        const syncRes = await fetch(`${API_BASE}/jira/worklogs/${wl.issue}/sync`, {
          method:'POST', headers, body:JSON.stringify({ worklogId:wl.id, seconds:wl.seconds, startedAt, description:wl.description||'' }),
        });
        const syncJson = await syncRes.json();
        if (syncJson.ok) notify('✓ Worklog guardado y sincronizado con Jira');
        else notify('Worklog guardado (sync Jira: '+(syncJson.error?.message||'error')+')');
      } catch(syncErr) { notify('Worklog guardado (Jira no disponible)'); }
    } catch(err) { console.error('Save worklog failed:', err); }
  }, [CURRENT_USER.id, CURRENT_USER.name]);

  const handleDeleteWorklog = useCallback(async (date, id) => {
    setWorklogs(p => { const u=(p[date]||[]).filter(w=>w.id!==id); if(!u.length){const{[date]:_,...r}=p;return r;}return{...p,[date]:u}; });
    try { await supabase.from('worklogs').delete().eq('id', id); } catch(err) { console.error(err); }
  }, []);

  const handleExport = f => CsvService.exportWorklogs(worklogs, f.from, f.to, f.authorId||null, f.spaceKeys);
  const handleDayClick = d => { setActiveDay(d); setView('day'); };
  const loadJiraIssues = useCallback(async (projectKey) => {
    try {
      const headers = { ...await getAuthHeader(), 'Content-Type': 'application/json' };
      const res = await fetch(`${API_BASE}/jira/issues?project=${projectKey}`, { headers });
      const json = await res.json();
      if (json.ok && json.data?.length) {
        setJiraIssues(json.data.map((i,idx)=>({ id:idx+1, key:i.key, summary:i.summary, type:i.type, status:i.status, priority:i.priority??'Medium', project:i.project, assignee:i.assignee??'', epic:i.epic??'—', epicName:i.epicName??'—', hours:0, labels:i.labels??[] })));
      }
    } catch(e) { console.error(e); }
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
    setHd(h=>({ ...h, reservations:[...h.reservations.filter(r=>!dates.includes(r.date)||r.seatId!==seatId), ...dates.map(d=>({seatId,date:d,userId:CURRENT_USER.id,userName:CURRENT_USER.name}))] }));
    setHdModal(null);
    notify(`✓ ${t('hdReservedOk')} — ${seatId}`);
    try {
      const rows = dates.map(d=>({ id:`res-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, seat_id:seatId, user_id:CURRENT_USER.id, user_name:CURRENT_USER.name, date:d }));
      await supabase.from('seat_reservations').upsert(rows, { onConflict:'seat_id,date' });
    } catch(err) { console.error(err); }
  };

  const handleHdRelease = async (seatId, date) => {
    setHd(h=>({ ...h, reservations:h.reservations.filter(r=>!(r.seatId===seatId&&r.date===date)) }));
    setHdModal(null);
    notify(t('hdReleasedOk'));
    try { await supabase.from('seat_reservations').delete().eq('seat_id',seatId).eq('date',date).eq('user_id',CURRENT_USER.id); } catch(err) { console.error(err); }
  };

  const handleBuildingFloorChange = useCallback((b, fl) => { setSelectedBuilding(b); setSelectedBlueprint(fl); }, []);

  const jtNavItems = [{ id:'calendar', label:t('navCalendar') }, { id:'day', label:t('navDay') }, { id:'tasks', label:t('navTasks') }];
  const hdNavItems = [{ id:'map', label:t('navMap') }, { id:'table', label:t('navTable') }];
  const currentNavItems = mod === 'jt' ? jtNavItems : hdNavItems;

  if (loadingData) {
    return (
      <div style={{ minHeight:'100vh', background:'#0d0d10', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ color:'#50506a', fontSize:13, fontFamily:'Inter, sans-serif', textAlign:'center' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#4f6ef7', boxShadow:'0 0 12px #4f6ef7', margin:'0 auto 12px' }}/>
          Loading WorkSuite…
        </div>
      </div>
    );
  }

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

          {/* ── Module switcher ── */}
          <div className="sw-group mod-group">
            {(CURRENT_USER.modules||[]).includes("jt") && (
              <button className={`sw-btn ${mod==="jt"?"active":""}`} onClick={()=>{setMod("jt");setView("calendar");}}>📋 {t("moduleSwitchJira")}</button>
            )}
            {(CURRENT_USER.modules||[]).includes("hd") && (
              <button className={`sw-btn ${mod==="hd"?"active-green":""}`} onClick={()=>{setMod("hd");setView("map");}}>🪑 {t("moduleSwitchHD")}</button>
            )}
            {(CURRENT_USER.modules||[]).includes("retro") && (
              <button className={`sw-btn ${mod==="retro"?"active-retro":""}`} onClick={()=>{setMod("retro");setView("retro");}}>🔁 RetroBoard</button>
            )}
            {(CURRENT_USER.modules||[]).includes("deploy") && (
              <button className={`sw-btn ${mod==="deploy"?"active-deploy":""}`} onClick={()=>{setMod("deploy");setView("deploy");}}>🚀 Deploy Planner</button>
            )}
            {/* FIX #1: Botón Environments */}
            {(CURRENT_USER.modules||[]).includes("envtracker") && (
              <button className={`sw-btn ${mod==="envtracker"?"active-env":""}`} onClick={()=>{setMod("envtracker");setView("envtracker");}}>🖥️ Environments</button>
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
              style={{ background:view==="admin"?"var(--ac)":"rgba(79,110,247,.15)", border:`1px solid ${view==="admin"?"var(--ac)":"rgba(79,110,247,.4)"}`, borderRadius:"var(--r)", color:view==="admin"?"#fff":"var(--ac2)", fontSize:11, fontWeight:700, padding:"5px 12px", cursor:"pointer", transition:"var(--ease)", display:"flex", alignItems:"center", gap:6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              {CURRENT_USER.role==="admin"?'Admin':'Config'}
            </button>
            <button onClick={logout} style={{background:"transparent",border:"1px solid var(--bd)",borderRadius:"var(--r)",color:"var(--tx3)",fontSize:10,padding:"3px 8px",cursor:"pointer",fontWeight:600}}>Logout</button>
          </div>
        </header>

        {mod!=="retro"&&mod!=="deploy"&&mod!=="envtracker"&&(
          <nav className="nav-bar">
            {currentNavItems.map(item=>(
              <button key={item.id} className={`n-btn ${view===item.id?(mod==="hd"?"active-hd":"active"):""}`} onClick={()=>setView(item.id)}>{item.label}</button>
            ))}
            {mod==="hd"&&view!=="admin"&&(
              <>
                <div className="n-sep"/>
                <BuildingFloorSelectors selectedBuilding={selectedBuilding} selectedBlueprint={selectedBlueprint} onChange={handleBuildingFloorChange}/>
              </>
            )}
          </nav>
        )}

        <div className="body">
          {mod==="jt"&&view!=="admin"&&(
            <JTFilterSidebar filters={filters} onApply={f=>{setFilters(f);}} onExport={handleExport} mobileOpen={false} onMobileClose={()=>{}} users={users} onProjectChange={loadJiraIssues}/>
          )}
          {mod==="jt"&&view==="calendar"&&(<main className="content"><CalendarView filters={filters} worklogs={worklogs} onDayClick={handleDayClick} onOpenLog={openLogModal}/></main>)}
          {mod==="jt"&&view==="day"&&(<main className="content"><DayView date={activeDay} filters={filters} worklogs={worklogs} onDateChange={setActiveDay} onOpenLog={openLogModal} onDeleteWorklog={handleDeleteWorklog}/></main>)}
          {mod==="jt"&&view==="tasks"&&(<main className="content"><TasksView filters={filters} onOpenLog={openLogModal} worklogs={worklogs}/></main>)}
          {mod==="hd"&&view==="map"&&(
            <main className="content">
              {selectedBlueprint
                ? <BlueprintHDMap hd={hd} onSeat={sid=>handleHdSeatClick(sid,TODAY)} currentUser={CURRENT_USER} blueprint={selectedBlueprint}/>
                : <div style={{padding:32,textAlign:'center',color:'var(--tx3)',fontSize:13}}>Selecciona un edificio y planta arriba para ver el mapa</div>
              }
            </main>
          )}
          {mod==="hd"&&view==="table"&&(<main className="content" style={{padding:0,height:"100%",overflow:"hidden"}}><div style={{padding:16,height:"100%",overflow:"auto"}}></div></main>)}
          {mod==="retro"&&view!=="admin"&&(
            <main className="content" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%"}}>
              <RetroBoard currentUser={CURRENT_USER} wsUsers={users} lang={lang}/>
            </main>
          )}
          {mod==="deploy"&&view!=="admin"&&(
            <main className="content" style={{padding:0,overflow:"auto"}}>
              <DeployPlanner currentUser={CURRENT_USER}/>
            </main>
          )}
          {/* FIX #1: Environments module */}
          {mod==="envtracker"&&view!=="admin"&&(
            <main className="content" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%"}}>
              <EnvTracker supabase={supabase} currentUser={CURRENT_USER} wsUsers={users}/>
            </main>
          )}
          {view==="admin"&&(
            <AdminShell users={users} setUsers={setUsers} hd={hd} setHd={setHd} currentUser={CURRENT_USER}/>
          )}
        </div>
      </div>
      </div>

      {logModal&&(<LogWorklogModal initialDate={logModal.date} initialIssueKey={logModal.issueKey} onClose={()=>setLogModal(null)} onSave={handleSaveWorklog} currentUser={CURRENT_USER}/>)}
      {hdModal&&(<HDReserveModal seatId={hdModal.seatId} initDate={hdModal.date} hd={hd} onConfirm={handleHdConfirm} onRelease={handleHdRelease} onClose={()=>setHdModal(null)} currentUser={CURRENT_USER}/>)}
      {toast&&(<div style={{position:"fixed",bottom:20,right:20,zIndex:9999,padding:"11px 18px",borderRadius:"var(--r2)",fontSize:13,fontWeight:500,background:"var(--sf)",border:"1px solid var(--bd2)",color:"var(--tx)",boxShadow:"var(--shadow)"}}>{toast}</div>)}
    </AppCtx.Provider>
  );
}

export default WorkSuiteApp;
