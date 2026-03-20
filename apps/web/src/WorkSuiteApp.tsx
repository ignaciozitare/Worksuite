// WorkSuite — Fase 2
// FIX: eliminado @ts-nocheck — tipos completos añadidos

import {
  useState, useMemo, useCallback,
  createContext, useContext, useRef, useEffect,
  type JSX,
} from "react";
import { supabase } from "./shared/lib/api";
import { useAuth } from "./shared/hooks/useAuth";

// ── TIPOS ─────────────────────────────────────────────────────────
interface WorklogUI {
  id: string; issue: string; summary: string; type: string;
  epic: string; epicName: string; project: string;
  author: string; authorId: string;
  time: string; seconds: number; started: string;
  description: string; syncedToJira: boolean; isNew?: boolean;
}
type WorklogsMap = Record<string, WorklogUI[]>;
interface HdReservationUI { seatId: string; date: string; userId: string; userName: string; }
interface HdState { fixed: Record<string, string>; reservations: HdReservationUI[]; }
interface SeatDef { id: string; x: number; y: number; }
interface MockIssue {
  id: number; key: string; summary: string; type: string;
  status: string; priority: string; project: string; assignee: string;
  epic: string; epicName: string; hours: number; labels: string[];
}
interface MockUserUI {
  id: string; name: string; email: string; avatar: string;
  role: string; deskType: string; active: boolean;
}
interface Filters { from: string; to: string; authorId: string; spaceKeys: string[]; jql: string; }
interface AppCtxValue { lang: string; t: (k: string) => string; theme: string; }
interface CurrentUser {
  id: string; name: string; email: string;
  avatar: string; role: string; deskType: string; active: boolean;
}
interface CsvRow { idx: number; name: string; email: string; role: string; errors: string[]; valid: boolean; }

// ── HELPERS DB→UI ─────────────────────────────────────────────────
function dbWlToUI(r: Record<string, unknown>): WorklogUI {
  const s = (r["seconds"] as number) ?? 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return {
    id: r["id"] as string, issue: r["issue_key"] as string,
    summary: (r["issue_summary"] as string) ?? (r["issue_key"] as string),
    type: (r["issue_type"] as string) ?? "Task",
    epic: (r["epic_key"] as string) ?? "—", epicName: (r["epic_name"] as string) ?? "—",
    project: (r["project_key"] as string) ?? "—",
    author: r["author_name"] as string, authorId: r["author_id"] as string,
    time: h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`,
    seconds: s, started: ((r["started_at"] as string) ?? "09:00").slice(0, 5),
    description: (r["description"] as string) ?? "", syncedToJira: (r["synced_to_jira"] as boolean) ?? false,
  };
}
function wlsToMap(rows: Record<string, unknown>[]): WorklogsMap {
  const map: WorklogsMap = {};
  for (const r of rows) {
    const date = (r["date"] as string).slice(0, 10);
    if (!map[date]) map[date] = [];
    map[date]!.push(dbWlToUI(r));
  }
  return map;
}

// ── DOMAIN ────────────────────────────────────────────────────────
const DT = Object.freeze({ NONE: "none", HOTDESK: "hotdesk", FIXED: "fixed" });
const SS = Object.freeze({ FREE: "free", OCCUPIED: "occupied", FIXED: "fixed" });

const TimeParser = {
  parse(raw: string): number {
    const s = (raw || "").trim().toLowerCase();
    const hm = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(?:(\d+)\s*m)?$/);
    if (hm) return Math.round((parseFloat(hm[1]!) + (hm[2] ? parseInt(hm[2]) / 60 : 0)) * 3600);
    const mm = s.match(/^(\d+)\s*m$/); if (mm) return parseInt(mm[1]!) * 60;
    const hh = s.match(/^(\d+(?:\.\d+)?)$/); if (hh) return Math.round(parseFloat(hh[1]!) * 3600);
    return 0;
  },
  fmt(s: number): string {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (!h) return `${m}m`; if (!m) return `${h}h`; return `${h}h ${m}m`;
  },
  toH: (s: number): number => Math.round((s / 3600) * 100) / 100,
};

const WlSvc = {
  filter(all: WorklogsMap, from: string, to: string, aid: string | null): WorklogsMap {
    const r: WorklogsMap = {};
    for (const [d, wls] of Object.entries(all)) {
      if (d < from || d > to) continue;
      const f = aid ? wls.filter(w => w.authorId === aid) : wls;
      if (f.length) r[d] = f;
    }
    return r;
  },
  byEpic(wls: WorklogUI[]): { key: string; name: string; items: WorklogUI[] }[] {
    const m = new Map<string, { key: string; name: string; items: WorklogUI[] }>();
    for (const w of wls) {
      if (!m.has(w.epic)) m.set(w.epic, { key: w.epic, name: w.epicName, items: [] });
      m.get(w.epic)!.items.push(w);
    }
    return [...m.values()];
  },
};

const ResSvc = {
  statusOf(seat: string, date: string, fixed: Record<string, string>, res: HdReservationUI[]): string {
    if (fixed[seat]) return SS.FIXED;
    return res.find(r => r.seatId === seat && r.date === date) ? SS.OCCUPIED : SS.FREE;
  },
  resOf(seat: string, date: string, res: HdReservationUI[]): HdReservationUI | null {
    return res.find(r => r.seatId === seat && r.date === date) ?? null;
  },
};

const CsvSvc = {
  parse(raw: string, existing: string[]): { rows: CsvRow[]; errCount: number } {
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { rows: [], errCount: 0 };
    const start = lines[0]!.toLowerCase().includes("name") ? 1 : 0;
    const rows: CsvRow[] = lines.slice(start).map((line, i) => {
      const [name = "", email = "", role = "user"] = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const errors: string[] = [];
      if (!name) errors.push("Name required");
      if (!email) errors.push("Email required");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email");
      else if (existing.includes(email.toLowerCase())) errors.push("Already exists");
      return { idx: start + i + 1, name, email, role: ["admin", "user"].includes(role.toLowerCase()) ? role.toLowerCase() : "user", errors, valid: !errors.length };
    });
    return { rows, errCount: rows.filter(r => !r.valid).length };
  },
  export(wls: WorklogsMap, from: string, to: string, aid: string | null, spaceKeys: string[]): void {
    const f = WlSvc.filter(wls, from, to, aid);
    const rows: string[][] = [["Date", "Issue", "Summary", "Epic", "EpicName", "Type", "Project", "Author", "Start", "Time", "Hours", "Desc"]];
    for (const [d, ws] of Object.entries(f))
      for (const w of ws) {
        if (spaceKeys.length && !spaceKeys.includes(w.project)) continue;
        rows.push([d, w.issue, `"${w.summary}"`, w.epic, `"${w.epicName}"`, w.type, w.project, w.author, w.started, w.time, (w.seconds / 3600).toFixed(2), `"${w.description || ""}"`]);
      }
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `worklogs_${from}_${to}.csv`; a.click(); URL.revokeObjectURL(url);
  },
};

// ── i18n ──────────────────────────────────────────────────────────
const TR: Record<string, Record<string, string>> = {
  en: {
    appName:"WorkSuite",protoTag:"UI Prototype",moduleSwitchJira:"Jira Tracker",moduleSwitchHD:"HotDesk",
    navCalendar:"Calendar",navDay:"Day View",navTasks:"Tasks",navAdmin:"Admin",navMap:"Office Map",navTable:"Monthly View",
    dateRange:"Date range",filterByUser:"Filter by user",allUsers:"All users",spaces:"Projects",
    extraJql:"Additional JQL",applyFilters:"Apply filters",exportCsv:"↓ Export CSV",
    exportHint:"Only hours within the selected range",clearSelection:"Clear",
    today:"Today",totalLabel:"Total",activeDays:"Active days",avgLabel:"Avg",perDay:"h/d",more:"more",
    logHours:"+ Log hours",worklogs:"worklogs",tasks:"tasks",
    noWorklogs:"No worklogs on this day",noWorklogsSub:"Try another day or user filter",
    logThisDay:"+ Log hours for this day",summaryByTask:"Summary by task",
    searchPlaceholder:"Search key, summary, user…",jqlGenerated:"JQL",noResults:"No results",clearFilter:"Clear",
    colKey:"Key",colSummary:"Summary",colType:"Type",colStatus:"Status",colPriority:"Priority",
    colProject:"Project",colAssignee:"Assignee",colEpic:"Epic",colTime:"Time",colAction:"Action",btnHours:"+ Hours",
    logWorklog:"Log worklog",taskField:"Task *",selectTask:"Select task…",dateField:"Date *",
    startTime:"Start time",timeLogged:"Time *",timePlaceholder:"2h, 1h 30m, 45m, 1.5",timeFormats:"Formats:",
    decimalHours:"(decimal h)",descField:"Description",descOptional:"(optional)",
    descPlaceholder:"What did you work on?",cancel:"Cancel",saveWorklog:"Save worklog",
    timeInvalid:"Invalid format",timeExceeds:"Max 24h",taskRequired:"Select a task",
    dateRequired:"Date required",savedFlash:"Worklog saved",
    adminSidebar:"Administration",adminSettings:"Settings",adminUsers:"Users",adminHotDesk:"HotDesk",
    settingsTitle:"Settings",jiraConnection:"Jira Cloud Connection",jiraUrl:"Jira URL",
    jiraEmail:"Account email",apiToken:"API Token",
    tokenHint:"Generate at id.atlassian.com → Security → API tokens",
    saveConfig:"Save configuration",savedOk:"Saved",connStatus:"Status",connInstance:"Instance",
    connProjects:"Projects",connLastSync:"Last sync",connected:"Connected",minsAgo:"3 minutes ago",
    hideToken:"Hide",showToken:"Show",usersTitle:"User management",usersSynced:"users",
    addUserBtn:"+ Add user",importCsvBtn:"↑ Import CSV",fieldName:"Full name *",fieldEmail:"Email *",
    fieldRole:"App role",fieldDeskType:"Desk type",fieldPassword:"Password *",fieldConfirm:"Confirm password *",
    changePassword:"Change password",changePwdBtn:"Change pwd",newPassword:"New password *",
    confirmPassword:"Confirm new password *",saveUser:"Save user",updatePassword:"Update password",
    colUser:"User",colEmail:"Email",colRole:"Role",colDeskType:"Desk",colAccess:"Access",colActions:"Actions",
    roleAdmin:"Admin",roleUser:"User",deskNone:"—",deskHotdesk:"Hotdesk",deskFixed:"Fixed",
    statusActive:"Active",statusBlocked:"Blocked",makeAdmin:"Make admin",removeAdmin:"Remove admin",
    blockUser:"Block",unblockUser:"Unblock",you:"(you)",errNameRequired:"Name required",
    errEmailRequired:"Email required",errEmailInvalid:"Invalid email",errEmailExists:"Email already registered",
    errPasswordShort:"Min 8 characters",errPasswordMatch:"Passwords don't match",
    userAdded:"User added",passwordChanged:"Password updated",
    csvImportTitle:"Bulk import users",csvDropzone:"Drop CSV here or click to browse",
    csvFormat:"Expected format:",csvFormatHint:"name, email, role (admin/user)",csvPreview:"Preview",
    csvRows:"rows detected",csvErrors:"rows with errors",csvImport:"Import users",csvImportDone:"users imported",
    csvDownloadTemplate:"Download template",csvCancel:"Cancel",
    hotdeskTitle:"HotDesk Configuration",assignSeat:"Assign seat",selectSeat:"Select a seat to configure",
    assignTo:"Assign to user",asFixed:"Mark as permanent",asFixedHint:"Seat will be locked permanently",
    confirmAssign:"Assign",fixedSeats:"Fixed seats",
    freeSeats:"free today",seatsTotal:"seats",legendFree:"Free",legendOcc:"Occupied",legendFixed:"Fixed",
    hdNoReserve:"This seat has a fixed assignment.",hdAlreadyOcc:"Seat already taken.",
    hdAlreadyRes:"You already have a reservation for this date.",
    hdReleaseTitle:"Release reservation",hdReleaseQ:"Release your reservation?",hdReleaseBtn:"Release",
    hdReserveTitle:"New reservation",hdSelectDates:"Select dates",hdConfirm:"Confirm",
    hdReleasedOk:"Reservation released",hdReservedOk:"Reserved",hdAdminManage:"Manage seat",
    syncToJira:"Sync to Jira",syncedToJira:"synced to Jira",syncing:"Syncing…",
    errorSaving:"Error saving",errorDeleting:"Error deleting",errorReserving:"Error reserving",
    errorReleasing:"Error releasing",errorSyncing:"Sync error",exported:"Exported",
    saved:"Saved",deleted:"Deleted",updated:"Updated",reservationConfirmed:"Reservation confirmed",
    reservationReleased:"Reservation released",userAdded2:"User added",imported:"Imported",
    assigned:"Assigned",unassigned:"Unassigned",
    jiraNotConnected:"Not connected",jiraAllFieldsRequired:"All fields are required",
    jiraTesting:"Testing connection…",jiraConnected:"Connected successfully",
    generateToken:"Generate token",pasteToken:"Paste your token here",
    disconnect:"Disconnect",saveConfig:"Save & connect",dark:"Dark",light:"Light",
    account:"Account",settings:"Settings",hotdesk:"HotDesk",tracker:"Tracker",
    admin:"Admin",mapView:"Map",tableView:"Table",addWorklog:"Add worklog",
    filters:"Filters",total:"Total",calendar:"Calendar",day:"Day",tasks:"Tasks",
    free:"Free",occupied:"Occupied",fixed:"Fixed",yourSeat:"Your seat",
    yourReservation:"Your reservation",available:"Available",reserve:"Reserve",
    release:"Release",reserveSeat:"Reserve seat",date:"Date",confirm:"Confirm",
    cancel:"Cancel",edit:"Edit",delete:"Delete",seat:"Seat",status:"Status",
    user:"User",users:"Users",hotdeskAdmin:"HotDesk admin",selectSeat:"Select seat",
    selectUser:"Select user",assign:"Assign",unassign:"Unassign",
    name:"Name",email:"Email",role:"Role",deskType:"Desk type",active:"Active",
    inactive:"Inactive",activate:"Activate",deactivate:"Deactivate",
    pwd:"Password",addUser:"Add user",importCsv:"Import CSV",
    changePassword:"Change password",newPassword:"New password",
    confirmPassword:"Confirm password",pwdTooShort:"Min 6 characters",pwdMismatch:"Passwords don't match",
    parse:"Parse",valid:"Valid",errors:"Errors",import:"Import",
    nameRequired:"Name required",invalidEmail:"Invalid email",
    userAdded:"User added",deleted2:"Deleted",
  },
  es: {
    appName:"WorkSuite",protoTag:"Prototipo UI",moduleSwitchJira:"Jira Tracker",moduleSwitchHD:"HotDesk",
    navCalendar:"Calendario",navDay:"Vista día",navTasks:"Tareas",navAdmin:"Admin",navMap:"Mapa oficina",navTable:"Vista mensual",
    dateRange:"Rango de fechas",filterByUser:"Filtrar por usuario",allUsers:"Todos",spaces:"Proyectos",
    extraJql:"JQL adicional",applyFilters:"Aplicar filtros",exportCsv:"↓ Exportar CSV",
    exportHint:"Solo horas en el rango seleccionado",clearSelection:"Limpiar",
    today:"Hoy",totalLabel:"Total",activeDays:"Días activos",avgLabel:"Promedio",perDay:"h/día",more:"más",
    logHours:"+ Imputar horas",worklogs:"worklogs",tasks:"tareas",
    noWorklogs:"Sin worklogs en este día",noWorklogsSub:"Prueba otro día o usuario",
    logThisDay:"+ Imputar horas este día",summaryByTask:"Resumen por tarea",
    searchPlaceholder:"Buscar clave, resumen, usuario…",jqlGenerated:"JQL",noResults:"Sin resultados",clearFilter:"Limpiar",
    colKey:"Clave",colSummary:"Resumen",colType:"Tipo",colStatus:"Estado",colPriority:"Prioridad",
    colProject:"Proyecto",colAssignee:"Asignado",colEpic:"Épica",colTime:"Tiempo",colAction:"Acción",btnHours:"+ Horas",
    logWorklog:"Imputar horas",taskField:"Tarea *",selectTask:"Selecciona tarea…",dateField:"Fecha *",
    startTime:"Hora inicio",timeLogged:"Tiempo *",timePlaceholder:"2h, 1h 30m, 45m, 1.5",timeFormats:"Formatos:",
    decimalHours:"(horas decimales)",descField:"Descripción",descOptional:"(opcional)",
    descPlaceholder:"¿En qué trabajaste?",cancel:"Cancelar",saveWorklog:"Guardar worklog",
    timeInvalid:"Formato inválido",timeExceeds:"Máx 24h",taskRequired:"Selecciona una tarea",
    dateRequired:"Fecha requerida",savedFlash:"Worklog guardado",
    adminSidebar:"Administración",adminSettings:"Configuración",adminUsers:"Usuarios",adminHotDesk:"HotDesk",
    settingsTitle:"Configuración",jiraConnection:"Conexión Jira Cloud",jiraUrl:"URL de Jira",
    jiraEmail:"Email de la cuenta",apiToken:"API Token",
    tokenHint:"Genera el token en id.atlassian.com → Seguridad → API tokens",
    saveConfig:"Guardar configuración",savedOk:"Guardado",connStatus:"Estado",connInstance:"Instancia",
    connProjects:"Proyectos",connLastSync:"Último sync",connected:"Conectado",minsAgo:"hace 3 minutos",
    hideToken:"Ocultar",showToken:"Ver",usersTitle:"Gestión de usuarios",usersSynced:"usuarios",
    addUserBtn:"+ Agregar usuario",importCsvBtn:"↑ Importar CSV",fieldName:"Nombre completo *",fieldEmail:"Email *",
    fieldRole:"Rol en la app",fieldDeskType:"Tipo de puesto",fieldPassword:"Contraseña *",fieldConfirm:"Confirmar contraseña *",
    changePassword:"Cambiar contraseña",changePwdBtn:"Cambiar clave",newPassword:"Nueva contraseña *",
    confirmPassword:"Confirmar nueva contraseña *",saveUser:"Guardar usuario",updatePassword:"Actualizar contraseña",
    colUser:"Usuario",colEmail:"Email",colRole:"Rol",colDeskType:"Puesto",colAccess:"Acceso",colActions:"Acciones",
    roleAdmin:"Admin",roleUser:"Usuario",deskNone:"—",deskHotdesk:"Hotdesk",deskFixed:"Fijo",
    statusActive:"Activo",statusBlocked:"Bloqueado",makeAdmin:"Hacer admin",removeAdmin:"Quitar admin",
    blockUser:"Bloquear",unblockUser:"Desbloquear",you:"(tú)",errNameRequired:"Nombre obligatorio",
    errEmailRequired:"Email obligatorio",errEmailInvalid:"Email inválido",errEmailExists:"Email ya registrado",
    errPasswordShort:"Mín 8 caracteres",errPasswordMatch:"Las contraseñas no coinciden",
    userAdded:"Usuario añadido",passwordChanged:"Contraseña actualizada",
    csvImportTitle:"Importación masiva de usuarios",csvDropzone:"Arrastra CSV aquí o haz clic",
    csvFormat:"Formato esperado:",csvFormatHint:"nombre, email, rol (admin/user)",csvPreview:"Vista previa",
    csvRows:"filas detectadas",csvErrors:"filas con errores",csvImport:"Importar usuarios",csvImportDone:"usuarios importados",
    csvDownloadTemplate:"Descargar plantilla",csvCancel:"Cancelar",
    hotdeskTitle:"Configuración HotDesk",assignSeat:"Asignar puesto",selectSeat:"Selecciona un puesto para configurarlo",
    assignTo:"Asignar a usuario",asFixed:"Marcar como permanente",asFixedHint:"El puesto quedará bloqueado para esta persona",
    confirmAssign:"Asignar",fixedSeats:"Puestos fijos",
    freeSeats:"libres hoy",seatsTotal:"puestos",legendFree:"Libre",legendOcc:"Ocupado",legendFixed:"Fijo",
    hdNoReserve:"Este puesto tiene asignación fija.",hdAlreadyOcc:"Puesto ya ocupado.",
    hdAlreadyRes:"Ya tienes reserva para esta fecha.",
    hdReleaseTitle:"Liberar reserva",hdReleaseQ:"¿Deseas liberar tu reserva?",hdReleaseBtn:"Liberar",
    hdReserveTitle:"Nueva reserva",hdSelectDates:"Selecciona fechas",hdConfirm:"Confirmar",
    hdReleasedOk:"Reserva liberada",hdReservedOk:"Reserva confirmada",hdAdminManage:"Gestionar puesto",
    syncToJira:"Sincronizar a Jira",syncedToJira:"sincronizado a Jira",syncing:"Sincronizando…",
    errorSaving:"Error al guardar",errorDeleting:"Error al eliminar",errorReserving:"Error al reservar",
    errorReleasing:"Error al liberar",errorSyncing:"Error de sincronización",exported:"Exportado",
    saved:"Guardado",deleted:"Eliminado",updated:"Actualizado",reservationConfirmed:"Reserva confirmada",
    reservationReleased:"Reserva liberada",userAdded2:"Usuario añadido",imported:"Importados",
    assigned:"Asignado",unassigned:"Desasignado",
    jiraNotConnected:"No conectado",jiraAllFieldsRequired:"Todos los campos son obligatorios",
    jiraTesting:"Probando conexión…",jiraConnected:"Conectado correctamente",
    generateToken:"Generar token",pasteToken:"Pega tu token aquí",
    disconnect:"Desconectar",saveConfig:"Guardar y conectar",dark:"Oscuro",light:"Claro",
    account:"Cuenta",settings:"Configuración",hotdesk:"HotDesk",tracker:"Tracker",
    admin:"Admin",mapView:"Mapa",tableView:"Tabla",addWorklog:"Añadir worklog",
    filters:"Filtros",total:"Total",calendar:"Calendario",day:"Día",tasks:"Tareas",
    free:"Libre",occupied:"Ocupado",fixed:"Fijo",yourSeat:"Tu puesto",
    yourReservation:"Tu reserva",available:"Disponible",reserve:"Reservar",
    release:"Liberar",reserveSeat:"Reservar puesto",date:"Fecha",confirm:"Confirmar",
    cancel:"Cancelar",edit:"Editar",delete:"Eliminar",seat:"Puesto",status:"Estado",
    user:"Usuario",users:"Usuarios",hotdeskAdmin:"Admin HotDesk",selectSeat:"Seleccionar puesto",
    selectUser:"Seleccionar usuario",assign:"Asignar",unassign:"Desasignar",
    name:"Nombre",email:"Email",role:"Rol",deskType:"Tipo de puesto",active:"Activo",
    inactive:"Inactivo",activate:"Activar",deactivate:"Desactivar",
    pwd:"Contraseña",addUser:"Añadir usuario",importCsv:"Importar CSV",
    changePassword:"Cambiar contraseña",newPassword:"Nueva contraseña",
    confirmPassword:"Confirmar contraseña",pwdTooShort:"Mín 6 caracteres",pwdMismatch:"Las contraseñas no coinciden",
    parse:"Analizar",valid:"Válidos",errors:"Errores",import:"Importar",
    nameRequired:"Nombre obligatorio",invalidEmail:"Email inválido",
    userAdded:"Usuario añadido",deleted2:"Eliminado",
  },
};

// ── MOCK DATA (issue #8 pendiente) ────────────────────────────────
const MOCK_USERS: MockUserUI[] = [
  {id:"u1",name:"Elena Martínez",email:"elena@co.com",avatar:"EM",role:"admin",deskType:DT.FIXED,active:true},
  {id:"u2",name:"Carlos Ruiz",email:"carlos@co.com",avatar:"CR",role:"user",deskType:DT.HOTDESK,active:true},
  {id:"u3",name:"Ana López",email:"ana@co.com",avatar:"AL",role:"user",deskType:DT.HOTDESK,active:true},
  {id:"u4",name:"Marco Silva",email:"marco@co.com",avatar:"MS",role:"user",deskType:DT.FIXED,active:true},
  {id:"u5",name:"Sofía Chen",email:"sofia@co.com",avatar:"SC",role:"user",deskType:DT.HOTDESK,active:false},
];
const SEATS: SeatDef[] = [
  {id:"A1",x:75,y:80},{id:"A2",x:135,y:80},{id:"A3",x:195,y:80},
  {id:"A4",x:75,y:140},{id:"A5",x:135,y:140},{id:"A6",x:195,y:140},
  {id:"B1",x:262,y:80},{id:"B2",x:322,y:80},{id:"B3",x:382,y:80},
  {id:"B4",x:262,y:140},{id:"B5",x:322,y:140},{id:"B6",x:382,y:140},
  {id:"C1",x:75,y:282},{id:"C2",x:135,y:282},{id:"C3",x:195,y:282},
  {id:"C4",x:255,y:282},{id:"C5",x:315,y:282},{id:"C6",x:375,y:282},
];
const MOCK_ISSUES: MockIssue[] = [
  {id:1,key:"PLAT-142",summary:"Refactor auth service with JWT RS256",type:"Story",status:"In Progress",priority:"High",project:"PLAT",assignee:"Elena Martínez",epic:"PLAT-100",epicName:"Security Q1",hours:12.5,labels:["backend","security"]},
  {id:2,key:"PLAT-143",summary:"Add rate limiting to API Gateway",type:"Task",status:"In Progress",priority:"High",project:"PLAT",assignee:"Elena Martínez",epic:"PLAT-100",epicName:"Security Q1",hours:6.0,labels:["backend","infra"]},
  {id:3,key:"MOB-87",summary:"Crash on iOS 17 opening notifications",type:"Bug",status:"Done",priority:"Critical",project:"MOB",assignee:"Carlos Ruiz",epic:"MOB-50",epicName:"Stability",hours:3.5,labels:["ios","hotfix"]},
  {id:4,key:"MOB-91",summary:"Migrate to React Native 0.73",type:"Task",status:"In Progress",priority:"Medium",project:"MOB",assignee:"Elena Martínez",epic:"MOB-80",epicName:"Tech Debt",hours:8.0,labels:["rn","upgrade"]},
  {id:5,key:"DATA-34",summary:"ETL pipeline for product metrics",type:"Story",status:"To Do",priority:"Medium",project:"DATA",assignee:"Ana López",epic:"DATA-20",epicName:"Analytics v2",hours:0,labels:["etl","bigquery"]},
  {id:6,key:"DATA-38",summary:"KPI dashboard in Metabase",type:"Task",status:"Done",priority:"Low",project:"DATA",assignee:"Ana López",epic:"DATA-20",epicName:"Analytics v2",hours:5.5,labels:["bi","metabase"]},
  {id:7,key:"OPS-19",summary:"Migrate clusters to EKS 1.29",type:"Spike",status:"In Progress",priority:"High",project:"OPS",assignee:"Marco Silva",epic:"OPS-10",epicName:"K8s Upgrade",hours:14.0,labels:["k8s","aws"]},
  {id:8,key:"PLAT-149",summary:"Document REST endpoints in OpenAPI 3.1",type:"Task",status:"To Do",priority:"Low",project:"PLAT",assignee:"Elena Martínez",epic:"PLAT-110",epicName:"DX Improve",hours:0,labels:["docs","api"]},
  {id:9,key:"MOB-95",summary:"Implement offline mode with SQLite",type:"Story",status:"To Do",priority:"High",project:"MOB",assignee:"Carlos Ruiz",epic:"MOB-90",epicName:"Offline Mode",hours:0,labels:["offline","sqlite"]},
  {id:10,key:"OPS-22",summary:"SLO alerts with Prometheus + Grafana",type:"Task",status:"Done",priority:"Medium",project:"OPS",assignee:"Marco Silva",epic:"OPS-10",epicName:"K8s Upgrade",hours:7.0,labels:["monitoring"]},
];
const MOCK_PROJECTS = [
  {key:"PLAT",name:"Platform Core"},{key:"MOB",name:"Mobile App"},
  {key:"DATA",name:"Data & Analytics"},{key:"OPS",name:"DevOps & Infra"},
];
const TODAY = new Date().toISOString().slice(0, 10);
const API_BASE = (import.meta as Record<string, unknown>).env
  ? ((import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? "http://localhost:3001")
  : "http://localhost:3001";

// ── CSS ───────────────────────────────────────────────────────────
const buildCSS = (): string => `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--body:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;--r:5px;--r2:8px;--ease:all .15s ease;}
[data-theme="dark"]{--bg:#0d0d10;--sf:#141418;--sf2:#1b1b22;--sf3:#21212c;--bd:#2a2a38;--bd2:#383850;--ac:#4f6ef7;--ac2:#7b93ff;--glow:rgba(79,110,247,.12);--green:#3ecf8e;--amber:#f5a623;--red:#e05252;--purple:#b57cf6;--tx:#e4e4ef;--tx2:#8888a8;--tx3:#50506a;--shadow:0 8px 30px rgba(0,0,0,.55);--seat-free:#3ecf8e;--seat-occ:#4f6ef7;--seat-fixed:#e05252;color-scheme:dark;}
[data-theme="light"]{--bg:#f0f0f6;--sf:#ffffff;--sf2:#f5f5fb;--sf3:#eaeaf2;--bd:#dcdce8;--bd2:#c4c4d8;--ac:#4f6ef7;--ac2:#2d4fd0;--glow:rgba(79,110,247,.07);--green:#0f9060;--amber:#b86800;--red:#c02828;--purple:#7030b0;--tx:#181826;--tx2:#4a4a70;--tx3:#9494b8;--shadow:0 8px 30px rgba(0,0,0,.1);--seat-free:#0f9060;--seat-occ:#4f6ef7;--seat-fixed:#c02828;color-scheme:light;}
html,body,#root{background:#0d0d10;color:#e4e4ef;margin:0;padding:0;}
body{font-family:'Inter',system-ui,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:5px;height:5px;}::-webkit-scrollbar-track{background:var(--bg);}::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:3px;}
.shell{display:flex;flex-direction:column;height:100vh;overflow:hidden;background:var(--bg);color:var(--tx);}
.topbar{display:flex;align-items:center;gap:10px;padding:0 18px;height:48px;background:var(--sf);border-bottom:1px solid var(--bd);flex-shrink:0;}
.logo{font-size:14px;font-weight:700;letter-spacing:-.3px;display:flex;align-items:center;gap:7px;}
.logo-dot{width:7px;height:7px;border-radius:50%;background:var(--ac);box-shadow:0 0 8px var(--ac);}
.logo-jt{color:var(--ac2);}
.proto-tag{font-size:10px;font-weight:500;background:rgba(79,110,247,.08);border:1px solid rgba(79,110,247,.18);border-radius:4px;padding:2px 8px;color:var(--ac2);}
.top-right{margin-left:auto;display:flex;align-items:center;gap:8px;}
.avatar{width:28px;height:28px;border-radius:50%;background:var(--ac);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;border:1px solid var(--bd2);flex-shrink:0;}
.u-name{font-size:12px;font-weight:500;color:var(--tx2);}
.o-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 5px var(--green);}
.sw-group{display:flex;border:1px solid var(--bd2);border-radius:var(--r);overflow:hidden;}
.sw-btn{font-size:10px;font-weight:700;padding:4px 10px;background:transparent;border:none;color:var(--tx3);cursor:pointer;transition:var(--ease);letter-spacing:.03em;white-space:nowrap;}
.sw-btn:hover{color:var(--tx2);background:var(--sf3);}
.sw-btn.active{background:var(--ac);color:#fff;}.sw-btn.active-green{background:var(--green);color:#fff;}.sw-btn.active-theme{background:var(--sf3);color:var(--tx);}
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
.fi:focus{border-color:var(--ac);}.fi::placeholder{color:var(--tx3);}select.fi{cursor:pointer;}
textarea.fi{resize:vertical;min-height:52px;font-family:var(--mono);font-size:11px;}
.pick-l{display:flex;flex-direction:column;gap:2px;}
.pick-i{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:var(--r);cursor:pointer;user-select:none;font-size:12px;color:var(--tx2);transition:background .1s;}
.pick-i:hover{background:var(--sf3);}.pick-i.on{background:var(--glow);color:var(--tx);}
.cb{width:13px;height:13px;border-radius:3px;border:1px solid var(--bd2);background:var(--sf3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:8px;color:transparent;transition:var(--ease);}
.pick-i.on .cb{background:var(--ac);border-color:var(--ac);color:#fff;}
.kb{font-family:var(--mono);color:var(--ac2);font-size:10px;font-weight:500;}
.btn-p{font-size:12px;font-weight:600;width:100%;padding:8px;border-radius:var(--r);border:none;background:var(--ac);color:#fff;cursor:pointer;transition:var(--ease);}
.btn-p:hover{background:var(--ac2);}
.btn-g{font-size:11px;font-weight:500;padding:4px 10px;border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.btn-g:hover{color:var(--tx);background:var(--sf3);border-color:var(--bd2);}
.btn-exp{font-size:11px;font-weight:600;width:100%;padding:7px;border-radius:var(--r);border:1px solid var(--bd2);background:var(--sf2);color:var(--green);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:var(--ease);}
.btn-exp:hover{background:rgba(62,207,142,.07);border-color:var(--green);}
.btn-jira{font-size:11px;font-weight:600;padding:4px 8px;border-radius:var(--r);border:1px solid #0052cc;background:#0052cc18;color:#4c9aff;cursor:pointer;transition:var(--ease);}
.btn-jira:hover{background:#0052cc30;border-color:#4c9aff;}
.badge-synced{font-size:10px;font-weight:600;padding:3px 7px;border-radius:var(--r);background:rgba(62,207,142,.12);color:var(--green);border:1px solid rgba(62,207,142,.25);white-space:nowrap;}
.set-divider{height:1px;background:var(--bd1);margin:20px 0;}
.jira-settings{display:flex;flex-direction:column;gap:10px;padding:16px;background:var(--sf2);border-radius:var(--r);border:1px solid var(--bd1);}
.jira-hdr{display:flex;align-items:center;gap:12px;margin-bottom:4px;}
.jira-logo{font-size:22px;}
.jira-title{font-weight:600;font-size:14px;color:var(--tx1);}
.jira-sub{font-size:11px;color:var(--tx3);margin-top:1px;}
.jira-link{font-size:10px;color:var(--blue);text-decoration:none;margin-left:6px;}
.jira-link:hover{text-decoration:underline;}
.btn-show{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--tx3);cursor:pointer;font-size:11px;padding:2px 4px;}
.jira-msg{font-size:12px;padding:7px 10px;border-radius:var(--r);margin-top:2px;}
.jira-msg-ok{background:rgba(62,207,142,.1);color:var(--green);border:1px solid rgba(62,207,142,.2);}
.jira-msg-err{background:rgba(255,85,85,.1);color:#ff6b6b;border:1px solid rgba(255,85,85,.2);}
.jira-msg-loading{background:rgba(100,160,255,.1);color:#4c9aff;border:1px solid rgba(100,160,255,.2);}
.jira-footer{display:flex;justify-content:flex-end;margin-top:4px;}
.btn-log{font-size:11px;font-weight:600;padding:6px 12px;border-radius:var(--r);border:1px solid rgba(79,110,247,.3);background:var(--glow);color:var(--ac2);cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:var(--ease);}
.btn-log:hover{background:rgba(79,110,247,.18);border-color:var(--ac);}.btn-log-sm{font-size:10px;padding:4px 9px;}
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
.cc:hover{border-color:var(--bd2);background:var(--sf2);}.cc:hover .cadd{opacity:1;}
.cc.today::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac);}
.cc.today{border-color:rgba(79,110,247,.35);}
.cc.other{background:transparent!important;border-color:transparent!important;pointer-events:none;}.cc.other .cday{color:var(--tx3);opacity:.3;}
.cc.active{border-color:var(--ac2);background:var(--glow);}.cc.has-d{background:var(--sf2);}
.ctop{display:flex;align-items:flex-start;justify-content:space-between;}
.cday{font-family:var(--mono);font-size:11px;font-weight:500;color:var(--tx3);}.cc.today .cday{color:var(--ac2);}
.cadd{opacity:0;font-size:12px;color:var(--ac2);background:var(--glow);border:1px solid rgba(79,110,247,.25);border-radius:3px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;transition:opacity .15s;cursor:pointer;flex-shrink:0;}
.chrs{font-family:var(--mono);font-size:17px;font-weight:600;line-height:1.1;color:var(--tx);}
.chrs span{font-size:10px;font-weight:400;color:var(--tx3);}
.cdots{display:flex;flex-direction:column;gap:1px;margin-top:auto;}
.cdot{font-family:var(--mono);font-size:9px;color:var(--tx3);display:flex;align-items:center;gap:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cdot::before{content:'';width:3px;height:3px;border-radius:50%;background:var(--ac);flex-shrink:0;}
.dh{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;}
.dd{font-size:21px;font-weight:700;letter-spacing:-.4px;color:var(--tx);}
.dsub{font-size:12px;color:var(--tx2);margin-top:4px;}.dsub strong{color:var(--green);font-family:var(--mono);}
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
.wlc:hover .del-wl{opacity:1;}.del-wl:hover{color:var(--red);}
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
.s-todo{background:rgba(128,128,160,.1);color:var(--tx3);}.s-prog{background:rgba(79,110,247,.1);color:var(--ac2);}.s-done{background:rgba(62,207,142,.1);color:var(--green);}
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
.mh{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;border-bottom:1px solid var(--bd);}
.mt{font-size:14px;font-weight:700;color:var(--tx);}
.mc{background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;padding:2px 6px;border-radius:3px;transition:var(--ease);}
.mc:hover{color:var(--tx2);background:var(--sf3);}
.mbody{padding:18px;display:flex;flex-direction:column;gap:14px;}
.mf{padding:12px 18px 16px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--bd);}
.fr{display:flex;flex-direction:column;gap:5px;}.fr2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.fl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tx3);}
.mi{width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:7px 10px;color:var(--tx);font-family:var(--body);font-size:12px;outline:none;transition:border-color .15s;}
.mi:focus{border-color:var(--ac);}.mi::placeholder{color:var(--tx3);}.mi.err{border-color:var(--red);}
option{background:var(--sf2);color:var(--tx);}
.fh{font-size:10px;color:var(--tx3);}.em{font-size:10px;color:var(--red);}
.tp{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--sf3);border-radius:var(--r);font-family:var(--mono);font-size:12px;}
.tv{color:var(--green);font-weight:500;}.tl{color:var(--tx3);}
.b-cancel{font-size:12px;font-weight:500;padding:8px 14px;border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.b-cancel:hover{background:var(--sf3);}
.b-sub{font-size:12px;font-weight:600;padding:8px 18px;border-radius:var(--r);border:none;background:var(--ac);color:#fff;cursor:pointer;transition:var(--ease);}
.b-sub:hover{background:var(--ac2);}.b-sub:disabled{opacity:.4;cursor:not-allowed;}
.b-danger{font-size:12px;font-weight:600;padding:8px 18px;border-radius:var(--r);border:none;background:var(--red);color:#fff;cursor:pointer;transition:var(--ease);}
.ok-fl{display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(62,207,142,.08);border:1px solid rgba(62,207,142,.22);border-radius:var(--r);font-size:12px;color:var(--green);}
.pwd-meter{display:flex;gap:3px;margin-top:4px;}
.pwd-seg{height:3px;flex:1;border-radius:2px;background:var(--bd2);}
.pwd-seg.weak{background:var(--red);}.pwd-seg.fair{background:var(--amber);}.pwd-seg.strong{background:var(--green);}
.dropzone{border:2px dashed var(--bd2);border-radius:var(--r2);padding:28px 20px;text-align:center;cursor:pointer;transition:var(--ease);background:var(--sf2);}
.dropzone:hover,.dropzone.over{border-color:var(--ac);background:var(--glow);}
.csv-preview{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;max-height:200px;overflow-y:auto;}
.csv-row{display:grid;grid-template-columns:28px 1fr 1fr 70px 1fr;font-size:11px;border-bottom:1px solid var(--bd);}
.csv-row:last-child{border-bottom:none;}.csv-row.hdr{background:var(--sf3);font-size:9px;font-weight:700;text-transform:uppercase;color:var(--tx3);}
.csv-row.err-row{background:rgba(224,82,82,.04);}
.csv-cell{padding:7px 10px;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.csv-err-tag{font-size:9px;color:var(--red);padding:7px 10px;}
.admin-wrap{display:flex;flex:1;overflow:hidden;}
.admin-nav{width:196px;min-width:196px;background:var(--sf);border-right:1px solid var(--bd);padding:16px 10px;display:flex;flex-direction:column;gap:4px;flex-shrink:0;}
.admin-nav-t{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3);padding:0 8px 10px;border-bottom:1px solid var(--bd);margin-bottom:6px;}
.an-btn{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:var(--r);border:1px solid transparent;background:transparent;color:var(--tx2);cursor:pointer;transition:var(--ease);font-size:12px;font-weight:500;text-align:left;}
.an-btn:hover{background:var(--sf3);color:var(--tx);}
.an-btn.active{background:var(--glow);color:var(--ac2);border-color:rgba(79,110,247,.22);}
.an-btn.active-hd{background:rgba(62,207,142,.07);color:var(--green);border-color:rgba(62,207,142,.22);}
.an-icon{font-size:14px;width:20px;text-align:center;flex-shrink:0;}
.an-badge{margin-left:auto;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;background:rgba(245,166,35,.1);color:var(--amber);}
.admin-content{flex:1;overflow-y:auto;padding:24px;}
.sec-t{font-size:18px;font-weight:700;letter-spacing:-.3px;margin-bottom:4px;color:var(--tx);}
.sec-sub{font-size:12px;color:var(--tx3);margin-bottom:20px;}
.a-card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);padding:20px;margin-bottom:16px;}
.a-ct{font-size:13px;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--bd);color:var(--tx);}
.a-form{display:flex;flex-direction:column;gap:12px;}
.a-lbl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tx3);margin-bottom:3px;}
.a-inp{width:100%;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);padding:7px 10px;color:var(--tx);font-family:var(--mono);font-size:12px;outline:none;transition:border-color .15s;}
.a-inp:focus{border-color:var(--ac);}.a-hint{font-size:10px;color:var(--tx3);}
.info-r{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bd);}
.info-r:last-child{border-bottom:none;}.ik2{font-size:11px;color:var(--tx3);}
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
.hd-seat{cursor:pointer;transition:filter .12s;}.hd-seat:hover{filter:brightness(1.25) drop-shadow(0 0 5px rgba(100,200,255,.3));}
.hd-sub{font-size:10px;color:var(--tx3);text-align:center;margin-top:8px;}
.hd-table-wrap{overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r2);}
.hd-tbl{border-collapse:collapse;font-size:11px;width:100%;}
.hd-th{padding:9px 4px;text-align:center;border-bottom:2px solid var(--bd);background:var(--sf);color:var(--tx3);font-size:9px;font-weight:700;text-transform:uppercase;min-width:44px;white-space:nowrap;position:sticky;top:0;z-index:6;}
.hd-th.seat-col{color:var(--ac2);font-family:var(--mono);cursor:help;}
.hd-th.date-col{position:sticky;left:0;top:0;z-index:8;background:var(--sf);text-align:left;padding-left:12px;min-width:96px;border-right:2px solid var(--bd);}
.hd-td{padding:2px;border-bottom:1px solid var(--bd);}
.hd-td.date-cell{position:sticky;left:0;z-index:4;background:var(--sf);padding:0 12px;border-right:2px solid var(--bd);white-space:nowrap;font-size:11px;height:34px;vertical-align:middle;color:var(--tx2);}
tr.hd-row-we>td.hd-td{background:var(--sf2)!important;}
tr.hd-row-today>td.hd-td{background:rgba(79,110,247,.05)!important;}
tr.hd-row-we>td.hd-td.date-cell{background:var(--sf2)!important;color:var(--tx3);}
tr.hd-row-today>td.hd-td.date-cell{background:rgba(79,110,247,.07)!important;color:var(--ac2);}
.hd-cell{cursor:pointer;border-radius:3px;height:30px;width:100%;display:flex;align-items:center;justify-content:center;transition:all .1s;}
.hd-cell:hover{filter:brightness(1.15);transform:scale(1.08);}
.hd-cell-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.hd-cell.free{background:rgba(62,207,142,.09);border:1px solid rgba(62,207,142,.32);}
.hd-cell.occ{background:rgba(79,110,247,.09);border:1px solid rgba(79,110,247,.32);}
.hd-cell.fx{background:rgba(224,82,82,.09);border:1px solid rgba(224,82,82,.32);}
.hd-cell.mine{background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.55);}
.hd-cell-dot.free{background:var(--seat-free);}.hd-cell-dot.occ{background:var(--seat-occ);}.hd-cell-dot.fx{background:var(--seat-fixed);}.hd-cell-dot.mine{background:var(--amber);}
.hd-cell-name{margin-left:6px;font-size:9px;line-height:1;color:var(--tx2);max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hd-tooltip{position:fixed;z-index:9900;background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);padding:12px;box-shadow:var(--shadow);width:280px;pointer-events:none;animation:mbIn .15s ease;}
.hd-tooltip-title{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3);margin-bottom:8px;}
.seat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px;}
.seat-btn{background:var(--sf2);border:2px solid var(--bd);border-radius:var(--r2);padding:10px 4px;cursor:pointer;color:var(--tx2);font-size:12px;font-weight:500;text-align:center;line-height:1.4;transition:var(--ease);}
.seat-btn:hover{border-color:var(--bd2);color:var(--tx);}.seat-btn.sel{border-color:var(--ac);color:var(--ac2);background:var(--glow);}
.seat-btn.is-fixed{border-color:rgba(224,82,82,.4);color:var(--red);}.seat-btn.is-occ{border-color:rgba(79,110,247,.3);color:var(--ac2);}
.mini-cal{user-select:none;}.mini-day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.mini-dh{text-align:center;font-size:9px;font-weight:700;color:var(--tx3);padding:2px 0;}
.mini-day{text-align:center;border-radius:4px;padding:4px 2px;font-size:11px;cursor:pointer;border:1px solid transparent;transition:var(--ease);color:var(--tx2);}
.mini-day.dis{color:var(--tx3);opacity:.35;cursor:not-allowed;}
.mini-day.sel{background:rgba(62,207,142,.15);border-color:var(--green);color:var(--green);font-weight:700;}
.mini-day.occ{background:rgba(79,110,247,.1);border-color:rgba(79,110,247,.3);color:var(--ac2);}
.mini-day.avail:hover{background:var(--sf3);border-color:var(--bd2);}
.cb-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);box-shadow:var(--shadow);z-index:200;max-height:220px;overflow-y:auto;}
.cb-opt{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--bd);}
.cb-opt:last-child{border-bottom:none;}.cb-opt:hover,.cb-opt.cb-sel{background:var(--glow);}
.cb-key{font-family:var(--mono);font-size:11px;color:var(--ac2);font-weight:600;min-width:72px;flex-shrink:0;}
.cb-sum{font-size:12px;color:var(--tx);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cb-prj{font-family:var(--mono);font-size:9px;color:var(--tx3);flex-shrink:0;}
/* ── ROOT LAYOUT ── */
.ws-root{display:flex;flex-direction:column;min-height:100vh;background:var(--bg);color:var(--tx);font-family:var(--body);}
.ws-hdr{display:flex;align-items:center;gap:12px;padding:0 20px;height:52px;background:var(--sf);border-bottom:1px solid var(--bd);flex-shrink:0;}
.ws-brand{font-size:15px;font-weight:700;letter-spacing:-.4px;color:var(--tx);}
.ws-nav{display:flex;align-items:center;gap:4px;margin-left:16px;}
.ws-user{display:flex;align-items:center;gap:8px;margin-left:auto;}
.ws-uname{font-size:12px;color:var(--tx2);}
.av{width:28px;height:28px;border-radius:50%;background:var(--ac);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;}
.ws-body{flex:1;display:flex;flex-direction:column;overflow:hidden;}
.ws-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:var(--r);font-size:13px;font-weight:500;z-index:9999;box-shadow:var(--shadow);}
.toast-ok{background:var(--green);color:#fff;}
.toast-err{background:var(--red);color:#fff;}
/* ── NAV BUTTONS ── */
.nav-btn{font-size:12px;font-weight:600;padding:6px 14px;border-radius:var(--r);border:1px solid transparent;background:transparent;color:var(--tx3);cursor:pointer;transition:var(--ease);}
.nav-btn:hover{color:var(--tx2);background:var(--sf2);}
.nav-btn.active{color:var(--ac2);background:var(--glow);border-color:rgba(79,110,247,.28);}
.vt-btn{font-size:11px;font-weight:600;padding:5px 12px;border-radius:var(--r);border:1px solid var(--bd);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:var(--ease);}
.vt-btn:hover{background:var(--sf3);color:var(--tx);}
.vt-btn.active{background:var(--ac);color:#fff;border-color:var(--ac);}
.view-toggle{display:flex;gap:4px;}
.date-fi{width:150px;}
.sb-toggle{white-space:nowrap;}
/* ── TRACKER ── */
.tracker-toolbar{display:flex;align-items:center;gap:8px;padding:12px 20px;background:var(--sf);border-bottom:1px solid var(--bd);flex-wrap:wrap;}
.tracker-body{flex:1;display:flex;overflow:hidden;}
/* ── CALENDAR VIEW ── */
.cv{flex:1;padding:20px;overflow-y:auto;}
.cv-hdr{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.cv-title{font-size:16px;font-weight:700;color:var(--tx);}
.cv-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}
.cv-dh{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);text-align:center;padding:6px 0;}
.cv-cell{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);min-height:90px;padding:6px;display:flex;flex-direction:column;gap:3px;cursor:pointer;transition:var(--ease);}
.cv-cell:hover{border-color:var(--bd2);background:var(--sf2);}
.cv-cell.today{border-color:rgba(79,110,247,.5);background:var(--glow);}
.cv-cell.off{opacity:.25;pointer-events:none;}
.cv-dn{font-size:11px;font-weight:600;color:var(--tx3);margin-bottom:2px;}
.cv-cell.today .cv-dn{color:var(--ac2);}
.cv-bar{font-size:11px;font-weight:700;color:var(--green);font-family:var(--mono);}
.cv-chip{display:flex;align-items:center;justify-content:space-between;background:var(--glow);border:1px solid rgba(79,110,247,.2);border-radius:3px;padding:2px 5px;font-size:10px;}
.cv-key{font-family:var(--mono);color:var(--ac2);font-weight:600;}
.cv-del{background:none;border:none;cursor:pointer;color:var(--tx3);font-size:11px;padding:0 2px;}
.cv-del:hover{color:var(--red);}
.cv-more{font-size:9px;color:var(--tx3);}
/* ── DAY VIEW ── */
.dv{flex:1;padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;}
.dv-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
.dv-row{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);padding:12px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.dv-key{font-family:var(--mono);font-size:11px;color:var(--ac2);font-weight:600;min-width:80px;}
.dv-sum{flex:1;font-size:12px;font-weight:500;color:var(--tx);min-width:120px;}
.dv-time{font-family:var(--mono);font-size:13px;color:var(--green);font-weight:600;}
.dv-start{font-size:11px;color:var(--tx3);}
.dv-desc{width:100%;font-size:11px;color:var(--tx2);font-style:italic;}
.dv-acts{display:flex;gap:6px;margin-left:auto;align-items:center;}
/* ── TASKS VIEW ── */
.tv{flex:1;padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;}
.tv-epic{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);}
.tv-epic-hdr{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--bd);background:var(--sf2);}
.tv-epic-key{font-family:var(--mono);font-size:11px;color:var(--purple);font-weight:600;}
.tv-epic-t{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--green);}
.tv-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 14px;border-bottom:1px solid var(--bd);}
.tv-row:last-child{border-bottom:none;}
.tv-issue{font-family:var(--mono);font-size:10px;color:var(--ac2);font-weight:600;min-width:80px;}
.tv-sum{flex:1;font-size:12px;color:var(--tx);min-width:120px;}
.tv-author{font-size:11px;color:var(--tx3);min-width:80px;}
.tv-time{font-family:var(--mono);font-size:12px;color:var(--green);font-weight:600;}
.tv-date{font-size:10px;color:var(--tx3);}
.tv-acts{display:flex;gap:6px;align-items:center;margin-left:auto;}
/* ── HOTDESK NEW ── */
.hd-toolbar{display:flex;align-items:center;gap:10px;padding:12px 20px;background:var(--sf);border-bottom:1px solid var(--bd);flex-wrap:wrap;}
.hd-map{flex:1;padding:20px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;}
.hd-legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;}
.leg{font-size:11px;color:var(--tx2);display:flex;align-items:center;gap:5px;}
.leg::before{content:'';display:inline-block;width:10px;height:10px;border-radius:2px;}
.leg-free::before{background:var(--green);}
.leg-occ::before{background:var(--ac);}
.leg-fixed::before{background:var(--red);}
.leg-mine::before{background:var(--amber);}
.office-svg{width:100%;max-width:640px;border-radius:var(--r2);border:1px solid var(--bd);}
.office-bg{fill:var(--sf);stroke:var(--bd);stroke-width:1;}
.office-furn{fill:var(--sf2);stroke:var(--bd);stroke-width:1;}
.office-lbl{font-size:11px;fill:var(--tx3);text-anchor:middle;dominant-baseline:middle;}
.seat-g{cursor:pointer;}
.seat-rect{fill:var(--sf3);stroke:var(--bd2);stroke-width:1;transition:all .15s;}
.seat-g.seat-free .seat-rect{fill:rgba(62,207,142,.15);stroke:var(--green);}
.seat-g.seat-occupied .seat-rect{fill:rgba(79,110,247,.15);stroke:var(--ac);}
.seat-g.seat-fixed .seat-rect{fill:rgba(224,82,82,.15);stroke:var(--red);}
.seat-g.mine .seat-rect{stroke:var(--amber);stroke-width:2;}
.seat-g.hov .seat-rect{filter:brightness(1.3);}
.seat-num{font-size:9px;fill:var(--tx2);text-anchor:middle;dominant-baseline:middle;font-weight:600;}
.seat-tip{position:fixed;bottom:80px;right:20px;background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r);padding:10px 14px;box-shadow:var(--shadow);z-index:100;min-width:140px;}
.tip-id{font-family:var(--mono);font-size:12px;color:var(--ac2);font-weight:700;margin-bottom:6px;}
.tip-row{font-size:12px;color:var(--tx2);}
.tip-free{font-size:12px;color:var(--green);}
/* ── ADMIN NEW ── */
.admin-shell{flex:1;display:flex;flex-direction:column;overflow:hidden;}
.admin-tabs{display:flex;gap:4px;padding:12px 20px;background:var(--sf);border-bottom:1px solid var(--bd);}
.admin-tab{font-size:12px;font-weight:600;padding:6px 16px;border-radius:var(--r);border:1px solid transparent;background:transparent;color:var(--tx3);cursor:pointer;transition:var(--ease);text-transform:capitalize;}
.admin-tab:hover{background:var(--sf2);color:var(--tx);}
.admin-tab.active{background:var(--glow);color:var(--ac2);border-color:rgba(79,110,247,.28);}
.admin-settings{padding:24px;max-width:540px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;}
.admin-settings h3{font-size:16px;font-weight:700;color:var(--tx);}
.set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.set-email{font-size:12px;color:var(--tx3);}
.admin-section{padding:20px;display:flex;flex-direction:column;gap:12px;flex:1;overflow-y:auto;}
.admin-sec-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;}
.admin-sec-hdr h3{font-size:15px;font-weight:700;color:var(--tx);}
.admin-acts{display:flex;gap:8px;}
.admin-tbl{width:100%;border-collapse:collapse;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);}
.admin-tbl th{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);padding:10px 12px;text-align:left;border-bottom:1px solid var(--bd);background:var(--sf2);}
.admin-tbl td{padding:10px 12px;border-bottom:1px solid var(--bd);font-size:12px;color:var(--tx2);}
.admin-tbl tr:hover td{background:var(--sf2);}
.admin-tbl tr.inactive td{opacity:.5;}
.tbl-acts{display:flex;gap:6px;}
.usr-av{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--ac);color:#fff;font-size:9px;font-weight:700;margin-right:6px;}
.badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:9px;font-weight:600;text-transform:uppercase;}
.badge-free,.badge-active{background:rgba(62,207,142,.1);color:var(--green);border:1px solid rgba(62,207,142,.2);}
.badge-occupied,.badge-inactive{background:rgba(128,128,160,.1);color:var(--tx3);border:1px solid var(--bd);}
.badge-fixed{background:rgba(224,82,82,.1);color:var(--red);border:1px solid rgba(224,82,82,.2);}
.btn-danger{font-size:11px;font-weight:600;padding:4px 10px;border-radius:var(--r);border:1px solid rgba(224,82,82,.3);background:rgba(224,82,82,.08);color:var(--red);cursor:pointer;transition:var(--ease);}
.btn-danger:hover{background:rgba(224,82,82,.15);}
.err-msg{font-size:12px;color:var(--red);padding:6px 10px;background:rgba(224,82,82,.08);border:1px solid rgba(224,82,82,.2);border-radius:var(--r);}
.lbl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tx3);}
.hd-assign-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
/* ── MODALS NEW ── */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;backdrop-filter:blur(4px);}
.modal{background:var(--sf);border:1px solid var(--bd2);border-radius:var(--r2);width:100%;max-width:440px;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:12px;padding:0;}
.modal-lg{max-width:600px;}
.modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;border-bottom:1px solid var(--bd);}
.modal-hdr span{font-size:14px;font-weight:700;color:var(--tx);}
.modal-x{background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;padding:2px 6px;border-radius:3px;}
.modal-x:hover{color:var(--tx2);background:var(--sf3);}
.modal label,.modal .lbl{display:block;padding:0 18px;}
.modal .fi{margin:0 18px;width:calc(100% - 36px);}
.modal-footer{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;border-top:1px solid var(--bd);}
.modal-hint{font-size:11px;color:var(--tx3);padding:0 18px;}
.modal .err-msg{margin:0 18px;}
.csv-ta{min-height:80px;font-family:var(--mono);font-size:11px;}
.csv-preview{margin:0 18px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;}
.csv-row{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;padding:6px 10px;border-bottom:1px solid var(--bd);font-size:11px;}
.csv-row:last-child{border-bottom:none;}
.csv-row.ok{color:var(--tx2);}
.csv-row.err{background:rgba(224,82,82,.05);}
.csv-n{color:var(--tx);}
.csv-e{color:var(--tx3);}
.csv-r{font-family:var(--mono);font-size:10px;color:var(--ac2);}
.csv-err{font-size:10px;color:var(--red);}
.csv-sum{padding:6px 10px;font-size:11px;color:var(--tx3);border-top:1px solid var(--bd);}
`;

// ── CONTEXT ───────────────────────────────────────────────────────
const AppCtx = createContext<AppCtxValue | null>(null);
const useApp = (): AppCtxValue => useContext(AppCtx)!;

// ── HELPERS ───────────────────────────────────────────────────────
const MN_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MN_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DY_EN = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DY_ES = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

function dimInMonth(y: number, m: number): number { return new Date(y, m + 1, 0).getDate(); }
function fstMon(y: number, m: number): number { return (new Date(y, m, 1).getDay() + 6) % 7; }
function isoYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function fmtMY(y: number, m: number, lang: string): string {
  return lang === "es" ? `${MN_ES[m]} ${y}` : `${MN_EN[m]} ${y}`;
}
function fmtFull(iso: string, lang: string): string {
  const d = new Date(iso + "T00:00:00");
  const ms = lang === "es" ? MN_ES : MN_EN;
  if (lang === "es") {
    const dn = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    return `${dn[d.getDay()]}, ${d.getDate()} de ${ms[d.getMonth()]!.toLowerCase()} de ${d.getFullYear()}`;
  }
  const dn = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return `${dn[d.getDay()]}, ${ms[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function addD(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
  const so = (first.getDay() + 6) % 7, eo = (7 - last.getDay()) % 7;
  const cells = [];
  for (let i = -so; i <= last.getDate() - 1 + eo; i++) {
    const d = new Date(year, month, 1 + i);
    cells.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isCurr: d.getMonth() === month, isToday: d.toISOString().slice(0, 10) === TODAY });
  }
  return cells;
}
function mkAvatar(n: string): string { return (n || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2); }
function validEmail(e: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ── SHARED COMPONENTS ─────────────────────────────────────────────
function PwdStrength({pwd}: {pwd: string}): JSX.Element | null {
  if (!pwd) return null;
  const score = [/.{8,}/,/[A-Z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(r => r.test(pwd)).length;
  const lv = score <= 1 ? "weak" : score <= 3 ? "fair" : "strong";
  const clr: Record<string,string> = {weak:"var(--red)",fair:"var(--amber)",strong:"var(--green)"};
  return (
    <div>
      <div className="pwd-meter">{[0,1,2,3].map(i => <div key={i} className={`pwd-seg ${i < score ? lv : ""}`}/>)}</div>
      <div style={{fontSize:10,color:clr[lv],marginTop:2}}>{score<=1?"Weak":score<=3?"Fair":"Strong"}</div>
    </div>
  );
}

interface MiniCalProps { year:number; month:number; selectedDates:string[]; onToggle:(iso:string)=>void; occupied?:string[]; }
function MiniCal({year,month,selectedDates,onToggle,occupied=[]}: MiniCalProps): JSX.Element {
  const {lang} = useApp();
  const DAYS = lang === "es" ? DY_ES : DY_EN;
  const days = dimInMonth(year, month), first = fstMon(year, month);
  return (
    <div className="mini-cal">
      <div className="mini-day-grid">
        {DAYS.map(d => <div key={d} className="mini-dh">{d}</div>)}
        {Array.from({length: first}).map((_, i) => <div key={"e"+i}/>)}
        {Array.from({length: days}, (_, i) => i + 1).map(d => {
          const iso = isoYMD(year, month, d);
          const dow = (new Date(iso + "T00:00:00").getDay() + 6) % 7;
          const dis = dow >= 5 || iso < TODAY || occupied.includes(iso);
          const isSel = selectedDates.includes(iso);
          const isOcc = occupied.includes(iso);
          let cls = "mini-day ";
          if (dis) cls += "dis"; else if (isSel) cls += "sel"; else if (isOcc) cls += "occ"; else cls += "avail";
          return <div key={d} className={cls} onClick={() => !dis && onToggle(iso)}>{d}</div>;
        })}
      </div>
    </div>
  );
}

// ── LOG WORKLOG MODAL ─────────────────────────────────────────────
interface LWProps { initDate:string; initKey?:string; issues:MockIssue[]; onClose:()=>void; onSave:(d:string,w:WorklogUI)=>void; cu:CurrentUser; }
function LogWorklogModal({initDate,initKey,issues,onClose,onSave,cu}: LWProps): JSX.Element {
  const {t} = useApp();
  const [ik,setIk] = useState(initKey||""); const [qry,setQry] = useState(initKey||"");
  const [open,setOpen] = useState(false); const [dt,setDt] = useState(initDate||TODAY);
  const [tr,setTr] = useState(""); const [st,setSt] = useState("09:00"); const [dc,setDc] = useState("");
  const [er,setEr] = useState<Record<string,string|null>>({}); const [ok,setOk] = useState(false);
  const cbRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (cbRef.current && !cbRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const filtered = qry.trim() ? issues.filter(i => i.key.toLowerCase().includes(qry.toLowerCase()) || i.summary.toLowerCase().includes(qry.toLowerCase())) : issues;
  const sel = (i: MockIssue) => { setIk(i.key); setQry(i.key); setOpen(false); setEr(v => ({...v, ik: null})); };
  const ps = TimeParser.parse(tr), tp = ps > 0 ? TimeParser.fmt(ps) : null;
  const validate = (): Record<string,string> => {
    const e: Record<string,string> = {};
    if (!ik) e["ik"] = t("taskRequired"); if (!dt) e["dt"] = t("dateRequired");
    if (ps <= 0) e["tr"] = t("timeInvalid"); if (ps > 86400) e["tr"] = t("timeExceeds");
    return e;
  };
  const submit = () => {
    const errs = validate(); if (Object.keys(errs).length) { setEr(errs); return; }
    const iss = issues.find(i => i.key === ik);
    setOk(true);
    setTimeout(() => {
      onSave(dt, { id: `wl-${Date.now()}`, issue: ik, summary: iss?.summary??ik, type: iss?.type??"Task",
        epic: iss?.epic??"—", epicName: iss?.epicName??"—", author: cu.name, authorId: cu.id,
        time: tp??"", seconds: ps, started: st, project: iss?.project??"—",
        description: dc, isNew: true, syncedToJira: false });
      onClose();
    }, 750);
  };
  const si = issues.find(i => i.key === ik);
  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mb" style={{maxWidth:480}}>
        <div className="mh"><div className="mt">⏱ {t("logWorklog")}</div><button className="mc" onClick={onClose}>×</button></div>
        {ok ? <div className="mbody"><div className="ok-fl">✓ {t("savedFlash")} — {tp} · {ik} · {dt}</div></div> : (<>
          <div className="mbody">
            <div className="fr">
              <label className="fl">{t("taskField")}</label>
              <div ref={cbRef} style={{position:"relative"}}>
                <input className={`mi ${er["ik"]?"err":""}`} placeholder={t("selectTask")} value={qry} autoComplete="off"
                  onChange={e => { setQry(e.target.value); setIk(""); setOpen(true); setEr(v => ({...v,ik:null})); }}
                  onFocus={() => setOpen(true)} style={{fontFamily:"var(--mono)",fontSize:12}}/>
                {open && filtered.length > 0 && (
                  <div className="cb-drop">
                    {filtered.map(i => (
                      <div key={i.key} className={`cb-opt ${i.key===ik?"cb-sel":""}`} onMouseDown={e => { e.preventDefault(); sel(i); }}>
                        <span className="cb-key">{i.key}</span><span className="cb-sum">{i.summary}</span><span className="cb-prj">{i.project}</span>
                      </div>
                    ))}
                  </div>
                )}
                {open && filtered.length === 0 && <div className="cb-drop"><div style={{padding:"10px 12px",color:"var(--tx3)",fontSize:12}}>No results</div></div>}
              </div>
              {er["ik"] && <span className="em">{er["ik"]}</span>}
              {si && <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}><span className="t-pill">{si.type}</span><span className="er" style={{fontSize:10}}>{si.epic} · {si.epicName}</span></div>}
            </div>
            <div className="fr2">
              <div className="fr"><label className="fl">{t("dateField")}</label><input className={`mi ${er["dt"]?"err":""}`} type="date" value={dt} onChange={e => { setDt(e.target.value); setEr(v => ({...v,dt:null})); }}/>{er["dt"] && <span className="em">{er["dt"]}</span>}</div>
              <div className="fr"><label className="fl">{t("startTime")}</label><input className="mi" type="time" value={st} onChange={e => setSt(e.target.value)}/></div>
            </div>
            <div className="fr">
              <label className="fl">{t("timeLogged")}</label>
              <input className={`mi ${er["tr"]?"err":""}`} placeholder={t("timePlaceholder")} value={tr} onChange={e => { setTr(e.target.value); setEr(v => ({...v,tr:null})); }} style={{fontFamily:"var(--mono)"}} autoFocus/>
              <span className="fh">{t("timeFormats")} <code>2h</code> · <code>1h 30m</code> · <code>45m</code> · <code>1.5</code> {t("decimalHours")}</span>
              {er["tr"] && <span className="em">{er["tr"]}</span>}
              {tp && !er["tr"] && <div className="tp"><span className="tl">→</span><span className="tv">{tp}</span><span className="tl">({(ps/3600).toFixed(2)}h)</span></div>}
            </div>
            <div className="fr">
              <label className="fl">{t("descField")} <span style={{color:"var(--tx3)",textTransform:"none",letterSpacing:0}}>{t("descOptional")}</span></label>
              <textarea className="mi" style={{minHeight:56,resize:"vertical",fontFamily:"var(--body)",fontSize:12}} placeholder={t("descPlaceholder")} value={dc} onChange={e => setDc(e.target.value)}/>
            </div>
          </div>
          <div className="mf"><button className="b-cancel" onClick={onClose}>{t("cancel")}</button><button className="b-sub" onClick={submit} disabled={!ik||ps<=0}>{t("saveWorklog")}</button></div>
        </>)}
      </div>
    </div>
  );
}

// ── JT FILTER SIDEBAR ─────────────────────────────────────────────
interface JTSBProps { filters:Filters; users:MockUserUI[]; projects:{key:string;name:string}[]; onApply:(f:Filters)=>void; onExport:(f:Filters)=>void; mobileOpen:boolean; onMobileClose:()=>void; }
function JTFilterSidebar({filters,users,projects,onApply,onExport,mobileOpen}: JTSBProps): JSX.Element {
  const {t} = useApp();
  const [l,sL] = useState<Filters>(filters);
  const ts = (k: string) => sL(f => ({...f, spaceKeys: f.spaceKeys.includes(k) ? f.spaceKeys.filter(x => x!==k) : [...f.spaceKeys, k]}));
  return (
    <aside className={`sb ${mobileOpen ? "sb-open" : ""}`}>
      <div className="sb-s"><div className="sb-lbl">{t("dateRange")}</div>
        <input className="fi" type="date" value={l.from} onChange={e => sL({...l, from: e.target.value})}/>
        <input className="fi" type="date" value={l.to} onChange={e => sL({...l, to: e.target.value})}/>
      </div>
      <div className="sb-s"><div className="sb-lbl">{t("filterByUser")}</div>
        <select className="fi" value={l.authorId} onChange={e => sL({...l, authorId: e.target.value})}>
          <option value="">{t("allUsers")}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="sb-s">
        <div className="sb-lbl">{t("spaces")}{l.spaceKeys.length > 0 && <span className="sb-cnt">({l.spaceKeys.length})</span>}</div>
        <div className="pick-l">
          {projects.map(p => { const on = l.spaceKeys.includes(p.key); return (
            <div key={p.key} className={`pick-i ${on?"on":""}`} onClick={() => ts(p.key)}>
              <div className="cb">{on && "✓"}</div><span className="kb">{p.key}</span><span>{p.name}</span>
            </div>
          );})}
        </div>
        {l.spaceKeys.length > 0 && <button className="btn-g" onClick={() => sL({...l, spaceKeys: []})}>{t("clearSelection")}</button>}
      </div>
      <div className="sb-s"><div className="sb-lbl">{t("extraJql")}</div>
        <textarea className="fi" placeholder="priority = High" value={l.jql} onChange={e => sL({...l, jql: e.target.value})}/>
      </div>
      <button className="btn-p" onClick={() => onApply(l)}>{t("applyFilters")}</button>
      <button className="btn-exp" onClick={() => onExport(l)}>{t("exportCsv")}</button>
      <div style={{fontSize:10,color:"var(--tx3)",textAlign:"center",lineHeight:1.5,marginTop:-8}}>{t("exportHint")}</div>
    </aside>
  );
}

// ── CALENDAR / DAY / TASKS VIEWS ──────────────────────────────────
interface CVProps { wls: WorklogsMap; cu: CurrentUser; onAdd: (d: string) => void; onEdit: (w: WorklogUI) => void; onDelete: (w: WorklogUI) => void; }
function CalendarView({ wls, cu, onAdd, onEdit, onDelete }: CVProps): JSX.Element {
  const { t } = useApp();
  const today = new Date(); const [yr, setYr] = useState(today.getFullYear()); const [mo, setMo] = useState(today.getMonth());
  const grid = buildGrid(yr, mo);
  const total = useMemo(() => {
    const s = grid.flatMap(c => c.isCurr ? (wls[c.date] ?? []) : []).reduce((a, w) => a + w.seconds, 0);
    return TimeParser.fmt(s);
  }, [grid, wls]);
  return (
    <div className="cv">
      <div className="cv-hdr">
        <button className="btn-g" onClick={() => { const d = new Date(yr, mo - 1); setYr(d.getFullYear()); setMo(d.getMonth()); }}>‹</button>
        <span className="cv-title">{fmtMY(yr, mo, "es")} — {t("total")}: {total}</span>
        <button className="btn-g" onClick={() => { const d = new Date(yr, mo + 1); setYr(d.getFullYear()); setMo(d.getMonth()); }}>›</button>
      </div>
      <div className="cv-grid">
        {["L","M","X","J","V","S","D"].map(d => <div key={d} className="cv-dh">{d}</div>)}
        {grid.map(cell => {
          const dayWls = wls[cell.date] ?? [];
          const secs = dayWls.reduce((a, w) => a + w.seconds, 0);
          return (
            <div key={cell.date} className={`cv-cell ${!cell.isCurr?"off":""} ${cell.isToday?"today":""}`}>
              <div className="cv-dn" onClick={() => onAdd(cell.date)}>{cell.day}</div>
              {secs > 0 && <div className="cv-bar">{TimeParser.fmt(secs)}</div>}
              {dayWls.slice(0, 2).map(w => (
                <div key={w.id} className="cv-chip" title={w.summary} onClick={() => onEdit(w)}>
                  <span className="cv-key">{w.issue}</span>
                  {(cu.role === "admin" || cu.deskType !== "fixed") && <button className="cv-del" onClick={e => { e.stopPropagation(); onDelete(w); }}>×</button>}
                </div>
              ))}
              {dayWls.length > 2 && <div className="cv-more">+{dayWls.length - 2}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DVProps { date: string; wls: WorklogUI[]; cu: CurrentUser; onAdd: () => void; onEdit: (w: WorklogUI) => void; onDelete: (w: WorklogUI) => void; onSync: (w: WorklogUI) => void; }
function DayView({ date, wls, cu, onAdd, onEdit, onDelete, onSync }: DVProps): JSX.Element {
  const { t } = useApp();
  const total = TimeParser.fmt(wls.reduce((a, w) => a + w.seconds, 0));
  return (
    <div className="dv">
      <div className="dv-hdr">
        <span>{fmtFull(date, "es")} — {t("total")}: {total}</span>
        <button className="btn-p" onClick={onAdd}>+ {t("addWorklog")}</button>
      </div>
      {wls.length === 0 && <div className="empty">{t("noWorklogs")}</div>}
      {wls.map(w => (
        <div key={w.id} className="dv-row">
          <div className="dv-key">{w.issue}</div>
          <div className="dv-sum">{w.summary}</div>
          <div className="dv-time">{w.time}</div>
          <div className="dv-start">{w.started}</div>
          {w.description && <div className="dv-desc">{w.description}</div>}
          {(cu.role === "admin" || w.authorId === cu.id) && (
            <div className="dv-acts">
              <button className="btn-g" onClick={() => onEdit(w)}>{t("edit")}</button>
              <button className="btn-danger" onClick={() => onDelete(w)}>{t("delete")}</button>
              {!w.syncedToJira && <button className="btn-jira" onClick={() => onSync(w)} title={t("syncToJira")}>⬆ Jira</button>}
              {w.syncedToJira && <span className="badge-synced">✓ Jira</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface TVProps { wls: WorklogsMap; cu: CurrentUser; filters: Filters; onEdit: (w: WorklogUI) => void; onDelete: (w: WorklogUI) => void; onSync: (w: WorklogUI) => void; }
function TasksView({ wls, cu, filters, onEdit, onDelete, onSync }: TVProps): JSX.Element {
  const { t } = useApp();
  const filtered = WlSvc.filter(wls, filters.from, filters.to, filters.authorId || null);
  const allWls = Object.values(filtered).flat();
  const byEpic = WlSvc.byEpic(allWls);
  if (!allWls.length) return <div className="empty">{t("noWorklogs")}</div>;
  return (
    <div className="tv">
      {byEpic.map(eg => (
        <div key={eg.key} className="tv-epic">
          <div className="tv-epic-hdr"><span className="tv-epic-key">{eg.key}</span><span>{eg.name}</span><span className="tv-epic-t">{TimeParser.fmt(eg.items.reduce((a, w) => a + w.seconds, 0))}</span></div>
          {eg.items.map(w => (
            <div key={w.id} className="tv-row">
              <div className="tv-issue">{w.issue}</div>
              <div className="tv-sum">{w.summary}</div>
              <div className="tv-author">{w.author}</div>
              <div className="tv-time">{w.time}</div>
              <div className="tv-date">{w.started.slice(0,5)} {fmtFull(w.started.slice(0,10) || TODAY, "es").slice(0,10)}</div>
              {(cu.role === "admin" || w.authorId === cu.id) && (
                <div className="tv-acts">
                  <button className="btn-g" onClick={() => onEdit(w)}>{t("edit")}</button>
                  <button className="btn-danger" onClick={() => onDelete(w)}>{t("delete")}</button>
                  {!w.syncedToJira && <button className="btn-jira" onClick={() => onSync(w)} title={t("syncToJira")}>⬆ Jira</button>}
                  {w.syncedToJira && <span className="badge-synced">✓ Jira</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── HOTDESK OFFICE MAP ────────────────────────────────────────────
interface OSVGProps { seats: SeatDef[]; fixed: Record<string,string>; res: HdReservationUI[]; date: string; cu: CurrentUser; onSeatClick: (s: SeatDef) => void; hovSeat: string | null; setHov: (id: string | null) => void; }
function OfficeSVG({ seats, fixed, res, date, cu, onSeatClick, hovSeat, setHov }: OSVGProps): JSX.Element {
  return (
    <svg viewBox="0 0 620 400" className="office-svg">
      <rect x="10" y="10" width="600" height="380" rx="12" className="office-bg"/>
      <rect x="270" y="30" width="80" height="50" rx="4" className="office-furn" /><text x="310" y="62" className="office-lbl">🚪</text>
      <rect x="30" y="30" width="100" height="60" rx="4" className="office-furn" /><text x="80" y="65" className="office-lbl">SALA A</text>
      <rect x="490" y="30" width="100" height="60" rx="4" className="office-furn" /><text x="540" y="65" className="office-lbl">SALA B</text>
      {seats.map(s => {
        const st = ResSvc.statusOf(s.id, date, fixed, res);
        const isMine = fixed[s.id] === cu.id || res.find(r => r.seatId === s.id && r.date === date && r.userId === cu.id);
        const hov = hovSeat === s.id;
        return (
          <g key={s.id} transform={`translate(${s.x},${s.y})`} className={`seat-g seat-${st} ${isMine?"mine":""} ${hov?"hov":""}`}
            onClick={() => onSeatClick(s)} onMouseEnter={() => setHov(s.id)} onMouseLeave={() => setHov(null)}>
            <rect x="-18" y="-14" width="36" height="28" rx="5" className="seat-rect"/>
            <text y="5" className="seat-num">{s.id.replace("S","")}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface STProps { seat: SeatDef; fixed: Record<string,string>; res: HdReservationUI[]; date: string; users: MockUserUI[]; }
function SeatTooltip({ seat, fixed, res, date, users }: STProps): JSX.Element {
  const { t } = useApp();
  const fixedUid = fixed[seat.id];
  const fixedUser = fixedUid ? users.find(u => u.id === fixedUid) : null;
  const reservation = ResSvc.resOf(seat.id, date, res);
  return (
    <div className="seat-tip">
      <div className="tip-id">{seat.id}</div>
      {fixedUser && <div className="tip-row">🔒 {fixedUser.name}</div>}
      {!fixedUser && reservation && <div className="tip-row">📅 {reservation.userName}</div>}
      {!fixedUser && !reservation && <div className="tip-free">{t("available")}</div>}
    </div>
  );
}

interface HDMVProps { hd: HdState; seats: SeatDef[]; users: MockUserUI[]; cu: CurrentUser; date: string; onReserve: (seatId: string) => void; onRelease: (seatId: string) => void; }
function HDMapView({ hd, seats, users, cu, date, onReserve, onRelease }: HDMVProps): JSX.Element {
  const { t } = useApp();
  const [hovSeat, setHov] = useState<string | null>(null);
  const handleClick = (s: SeatDef): void => {
    const st = ResSvc.statusOf(s.id, date, hd.fixed, hd.reservations);
    const res = ResSvc.resOf(s.id, date, hd.reservations);
    if (st === SS.FIXED) return;
    if (st === SS.OCCUPIED && res?.userId === cu.id) onRelease(s.id);
    else if (st === SS.FREE) onReserve(s.id);
  };
  const myRes = hd.reservations.filter(r => r.userId === cu.id && r.date === date);
  const myFixed = Object.entries(hd.fixed).find(([, uid]) => uid === cu.id)?.[0];
  return (
    <div className="hd-map">
      <div className="hd-legend">
        <span className="leg leg-free">{t("free")}</span>
        <span className="leg leg-occ">{t("occupied")}</span>
        <span className="leg leg-fixed">{t("fixed")}</span>
        {myFixed && <span className="leg leg-mine">📌 {t("yourSeat")}: {myFixed}</span>}
        {!myFixed && myRes.length > 0 && <span className="leg leg-mine">✅ {t("yourReservation")}: {myRes[0]!.seatId}</span>}
      </div>
      <OfficeSVG seats={seats} fixed={hd.fixed} res={hd.reservations} date={date} cu={cu} onSeatClick={handleClick} hovSeat={hovSeat} setHov={setHov} />
      {hovSeat && (() => { const s = seats.find(x => x.id === hovSeat); return s ? <SeatTooltip seat={s} fixed={hd.fixed} res={hd.reservations} date={date} users={users} /> : null; })()}
    </div>
  );
}

interface HDTVProps { hd: HdState; seats: SeatDef[]; users: MockUserUI[]; cu: CurrentUser; date: string; onReserve: (seatId: string) => void; onRelease: (seatId: string) => void; }
function HDTableView({ hd, seats, users, cu, date, onReserve, onRelease }: HDTVProps): JSX.Element {
  const { t } = useApp();
  return (
    <table className="hd-tbl">
      <thead><tr><th>{t("seat")}</th><th>{t("status")}</th><th>{t("user")}</th><th></th></tr></thead>
      <tbody>
        {seats.map(s => {
          const st = ResSvc.statusOf(s.id, date, hd.fixed, hd.reservations);
          const fixedUser = hd.fixed[s.id] ? users.find(u => u.id === hd.fixed[s.id]) : null;
          const res = ResSvc.resOf(s.id, date, hd.reservations);
          const userName = fixedUser?.name ?? res?.userName ?? "—";
          const canRelease = st === SS.OCCUPIED && res?.userId === cu.id;
          const canReserve = st === SS.FREE && cu.deskType === DT.HOTDESK;
          return (
            <tr key={s.id} className={`hdr-${st}`}>
              <td>{s.id}</td>
              <td><span className={`badge badge-${st}`}>{t(st)}</span></td>
              <td>{userName}</td>
              <td>
                {canReserve && <button className="btn-p" onClick={() => onReserve(s.id)}>{t("reserve")}</button>}
                {canRelease && <button className="btn-danger" onClick={() => onRelease(s.id)}>{t("release")}</button>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface HDRMProps { seatId: string; date: string; onConfirm: (seatId: string, date: string) => void; onClose: () => void; }
function HDReserveModal({ seatId, date, onConfirm, onClose }: HDRMProps): JSX.Element {
  const { t } = useApp();
  const [selDate, setSelDate] = useState(date);
  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr"><span>{t("reserveSeat")} {seatId}</span><button className="modal-x" onClick={onClose}>×</button></div>
        <label className="lbl">{t("date")}</label>
        <input className="fi" type="date" value={selDate} min={TODAY} onChange={e => setSelDate(e.target.value)}/>
        <div className="modal-footer">
          <button className="btn-g" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-p" onClick={() => onConfirm(seatId, selDate)}>{t("confirm")}</button>
        </div>
      </div>
    </div>
  );
}

// ── ADMIN COMPONENTS ─────────────────────────────────────────────
// ── JiraSettings — conexión Jira por usuario ──────────────────────────────────
type JiraConnStatus = "idle" | "loading" | "ok" | "err";
interface JiraConn { baseUrl: string; email: string; connectedAt: string | null; }

function JiraSettings({ cu }: { cu: CurrentUser }): JSX.Element {
  const { t } = useApp();
  const [conn, setConn] = useState<JiraConn | null>(null);
  const [url,  setUrl]  = useState("");
  const [mail, setMail] = useState(cu.email);
  const [tok,  setTok]  = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<JiraConnStatus>("idle");
  const [msg, setMsg] = useState("");

  // Cargar conexión existente al montar
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/jira/connection`, {
          headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}` },
        });
        if (res.ok) {
          const { data } = await res.json() as { data: { base_url: string; email: string; connected_at: string } | null };
          if (data) {
            setConn({ baseUrl: data.base_url, email: data.email, connectedAt: data.connected_at });
            setUrl(data.base_url);
            setMail(data.email);
          }
        }
      } catch { /* sin conexión previa */ }
    })();
  }, []);

  const getToken = async (): Promise<string> =>
    (await supabase.auth.getSession()).data.session?.access_token ?? "";

  const handleSave = async (): Promise<void> => {
    if (!url || !mail || !tok) { setMsg(t("jiraAllFieldsRequired")); setStatus("err"); return; }
    setStatus("loading"); setMsg(t("jiraTesting"));
    try {
      const res = await fetch(`${API_BASE}/jira/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({ baseUrl: url, email: mail, apiToken: tok }),
      });
      const body = await res.json() as { ok: boolean; error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Error desconocido");
      setConn({ baseUrl: url, email: mail, connectedAt: new Date().toISOString() });
      setTok(""); setStatus("ok"); setMsg(t("jiraConnected"));
    } catch (e) { setStatus("err"); setMsg(String(e)); }
  };

  const handleDisconnect = async (): Promise<void> => {
    await fetch(`${API_BASE}/jira/connection`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    setConn(null); setUrl(""); setTok(""); setStatus("idle"); setMsg("");
  };

  return (
    <div className="jira-settings">
      <div className="jira-hdr">
        <span className="jira-logo">🔵</span>
        <div>
          <div className="jira-title">Jira Cloud</div>
          <div className="jira-sub">{conn ? `${conn.baseUrl}` : t("jiraNotConnected")}</div>
        </div>
        {conn && <span className="badge-synced">✓ {t("connected")}</span>}
      </div>

      <label className="lbl">URL de Jira</label>
      <input className="fi" placeholder="https://tuempresa.atlassian.net" value={url} onChange={e => setUrl(e.target.value)} disabled={!!conn}/>

      <label className="lbl">{t("jiraEmail")}</label>
      <input className="fi" type="email" value={mail} onChange={e => setMail(e.target.value)} disabled={!!conn}/>

      <label className="lbl">{t("apiToken")}
        <a className="jira-link" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer"> ↗ {t("generateToken")}</a>
      </label>
      <div style={{position:"relative"}}>
        <input className="fi" type={show?"text":"password"} placeholder={conn ? "••••••••••••" : t("pasteToken")} value={tok} onChange={e => setTok(e.target.value)}/>
        <button className="btn-show" onClick={() => setShow(s => !s)}>{show ? t("hideToken") : t("showToken")}</button>
      </div>

      {msg && <div className={`jira-msg jira-msg-${status}`}>{msg}</div>}

      <div className="jira-footer">
        {!conn
          ? <button className="btn-p" onClick={() => void handleSave()} disabled={status==="loading"}>{status==="loading" ? t("syncing") : t("saveConfig")}</button>
          : <button className="btn-danger" onClick={() => void handleDisconnect()}>{t("disconnect")}</button>
        }
      </div>
    </div>
  );
}

interface ASProps { cu: CurrentUser; onLogout: () => void; lang: string; setLang: (l: string) => void; theme: string; setTheme: (t: string) => void; }
function AdminSettings({ cu, onLogout, lang, setLang, theme, setTheme }: ASProps): JSX.Element {
  const { t } = useApp();
  return (
    <div className="admin-settings">
      <h3>{t("settings")}</h3>
      <div className="set-row"><label className="lbl">{t("language")}</label>
        <select className="fi" value={lang} onChange={e => setLang(e.target.value)}>
          <option value="es">Español</option><option value="en">English</option>
        </select>
      </div>
      <div className="set-row"><label className="lbl">{t("theme")}</label>
        <select className="fi" value={theme} onChange={e => setTheme(e.target.value)}>
          <option value="dark">{t("dark")}</option><option value="light">{t("light")}</option>
        </select>
      </div>
      <div className="set-row">
        <div><div className="lbl">{t("account")}</div><div className="set-email">{cu.email}</div></div>
        <button className="btn-danger" onClick={onLogout}>{t("logout")}</button>
      </div>
      <div className="set-divider"/>
      <JiraSettings cu={cu}/>
    </div>
  );
}

interface AUMProps { onClose: () => void; onSave: (u: { name: string; email: string; role: string; deskType: string }) => void; }
function AddUserModal({ onClose, onSave }: AUMProps): JSX.Element {
  const { t } = useApp();
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [role, setRole] = useState("user"); const [deskType, setDeskType] = useState(DT.HOTDESK);
  const err = !name.trim() ? t("nameRequired") : !validEmail(email) ? t("invalidEmail") : null;
  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr"><span>{t("addUser")}</span><button className="modal-x" onClick={onClose}>×</button></div>
        <label className="lbl">{t("name")}</label><input className="fi" value={name} onChange={e => setName(e.target.value)}/>
        <label className="lbl">{t("email")}</label><input className="fi" type="email" value={email} onChange={e => setEmail(e.target.value)}/>
        <label className="lbl">{t("role")}</label>
        <select className="fi" value={role} onChange={e => setRole(e.target.value)}>
          <option value="user">{t("user")}</option><option value="admin">{t("admin")}</option>
        </select>
        <label className="lbl">{t("deskType")}</label>
        <select className="fi" value={deskType} onChange={e => setDeskType(e.target.value)}>
          <option value={DT.HOTDESK}>{t("hotdesk")}</option>
          <option value={DT.FIXED}>{t("fixed")}</option>
          <option value={DT.NONE}>{t("none")}</option>
        </select>
        {err && <div className="err-msg">{err}</div>}
        <div className="modal-footer">
          <button className="btn-g" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-p" disabled={!!err} onClick={() => !err && onSave({ name, email, role, deskType })}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

interface CPMProps { userId: string; onClose: () => void; onSave: (userId: string, pwd: string) => void; }
function ChangePasswordModal({ userId, onClose, onSave }: CPMProps): JSX.Element {
  const { t } = useApp();
  const [pwd, setPwd] = useState(""); const [confirm, setConfirm] = useState("");
  const err = pwd.length < 6 ? t("pwdTooShort") : pwd !== confirm ? t("pwdMismatch") : null;
  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr"><span>{t("changePassword")}</span><button className="modal-x" onClick={onClose}>×</button></div>
        <label className="lbl">{t("newPassword")}</label><input className="fi" type="password" value={pwd} onChange={e => setPwd(e.target.value)}/>
        <PwdStrength pwd={pwd}/>
        <label className="lbl">{t("confirmPassword")}</label><input className="fi" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}/>
        {err && <div className="err-msg">{err}</div>}
        <div className="modal-footer">
          <button className="btn-g" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-p" disabled={!!err} onClick={() => !err && onSave(userId, pwd)}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

interface CIMProps { users: MockUserUI[]; onClose: () => void; onImport: (rows: CsvRow[]) => void; }
function CsvImportModal({ users, onClose, onImport }: CIMProps): JSX.Element {
  const { t } = useApp();
  const [raw, setRaw] = useState(""); const [parsed, setParsed] = useState<CsvRow[]>([]);
  const existing = users.map(u => u.email.toLowerCase());
  const handleParse = (): void => { const { rows } = CsvSvc.parse(raw, existing); setParsed(rows); };
  const validRows = parsed.filter(r => r.valid);
  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-hdr"><span>{t("importCsv")}</span><button className="modal-x" onClick={onClose}>×</button></div>
        <p className="modal-hint">name,email,role (hotdesk|fixed|none)</p>
        <textarea className="fi csv-ta" placeholder="Ana García,ana@co.com,hotdesk" value={raw} onChange={e => setRaw(e.target.value)}/>
        <button className="btn-g" onClick={handleParse}>{t("parse")}</button>
        {parsed.length > 0 && (
          <div className="csv-preview">
            {parsed.map(r => (
              <div key={r.idx} className={`csv-row ${r.valid?"ok":"err"}`}>
                <span className="csv-n">{r.name}</span><span className="csv-e">{r.email}</span><span className="csv-r">{r.role}</span>
                {r.errors.map((e, i) => <span key={i} className="csv-err">{e}</span>)}
              </div>
            ))}
            <div className="csv-sum">{t("valid")}: {validRows.length} / {t("errors")}: {parsed.length - validRows.length}</div>
          </div>
        )}
        <div className="modal-footer">
          <button className="btn-g" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-p" disabled={!validRows.length} onClick={() => onImport(validRows)}>{t("import")} ({validRows.length})</button>
        </div>
      </div>
    </div>
  );
}

interface AUsersProps { users: MockUserUI[]; onAdd: () => void; onChangePwd: (uid: string) => void; onToggle: (uid: string) => void; onDelete: (uid: string) => void; onImport: () => void; }
function AdminUsers({ users, onAdd, onChangePwd, onToggle, onDelete, onImport }: AUsersProps): JSX.Element {
  const { t } = useApp();
  return (
    <div className="admin-section">
      <div className="admin-sec-hdr">
        <h3>{t("users")}</h3>
        <div className="admin-acts"><button className="btn-g" onClick={onImport}>{t("importCsv")}</button><button className="btn-p" onClick={onAdd}>+ {t("addUser")}</button></div>
      </div>
      <table className="admin-tbl">
        <thead><tr><th>{t("name")}</th><th>{t("email")}</th><th>{t("role")}</th><th>{t("deskType")}</th><th>{t("active")}</th><th></th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={!u.active ? "inactive" : ""}>
              <td><div className="usr-av">{u.avatar}</div><span>{u.name}</span></td>
              <td>{u.email}</td><td>{u.role}</td><td>{u.deskType}</td>
              <td><span className={`badge ${u.active?"badge-free":"badge-occupied"}`}>{u.active ? t("active") : t("inactive")}</span></td>
              <td className="tbl-acts">
                <button className="btn-g" onClick={() => onChangePwd(u.id)}>{t("pwd")}</button>
                <button className="btn-g" onClick={() => onToggle(u.id)}>{u.active ? t("deactivate") : t("activate")}</button>
                <button className="btn-danger" onClick={() => onDelete(u.id)}>{t("delete")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AHDProps { seats: SeatDef[]; fixed: Record<string,string>; users: MockUserUI[]; onAssign: (seatId: string, userId: string) => void; onUnassign: (seatId: string) => void; }
function AdminHotDesk({ seats, fixed, users, onAssign, onUnassign }: AHDProps): JSX.Element {
  const { t } = useApp();
  const [selSeat, setSelSeat] = useState(""); const [selUser, setSelUser] = useState("");
  const fixedUsers = users.filter(u => u.deskType === DT.FIXED);
  return (
    <div className="admin-section">
      <h3>{t("hotdeskAdmin")}</h3>
      <div className="hd-assign-form">
        <select className="fi" value={selSeat} onChange={e => setSelSeat(e.target.value)}>
          <option value="">{t("selectSeat")}</option>
          {seats.map(s => <option key={s.id} value={s.id}>{s.id}{fixed[s.id] ? ` (${users.find(u => u.id === fixed[s.id])?.name ?? "?"})` : ""}</option>)}
        </select>
        <select className="fi" value={selUser} onChange={e => setSelUser(e.target.value)}>
          <option value="">{t("selectUser")}</option>
          {fixedUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button className="btn-p" disabled={!selSeat || !selUser} onClick={() => { onAssign(selSeat, selUser); setSelSeat(""); setSelUser(""); }}>{t("assign")}</button>
      </div>
      <table className="admin-tbl">
        <thead><tr><th>{t("seat")}</th><th>{t("user")}</th><th></th></tr></thead>
        <tbody>
          {seats.filter(s => fixed[s.id]).map(s => {
            const u = users.find(x => x.id === fixed[s.id]);
            return (
              <tr key={s.id}>
                <td>{s.id}</td><td>{u?.name ?? "—"}</td>
                <td><button className="btn-danger" onClick={() => onUnassign(s.id)}>{t("unassign")}</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type AdminTab = "users" | "hotdesk" | "settings";
interface AdminShellProps { cu: CurrentUser; users: MockUserUI[]; seats: SeatDef[]; fixed: Record<string,string>; lang: string; setLang: (l: string) => void; theme: string; setTheme: (t: string) => void; onLogout: () => void; onAddUser: () => void; onChangePwd: (uid: string) => void; onToggleUser: (uid: string) => void; onDeleteUser: (uid: string) => void; onCsvImport: () => void; onAssign: (s: string, u: string) => void; onUnassign: (s: string) => void; }
function AdminShell(p: AdminShellProps): JSX.Element {
  const { t } = useApp();
  const [tab, setTab] = useState<AdminTab>("users");
  return (
    <div className="admin-shell">
      <div className="admin-tabs">
        {(["users","hotdesk","settings"] as AdminTab[]).map(tb => (
          <button key={tb} className={`admin-tab ${tab===tb?"active":""}`} onClick={() => setTab(tb)}>{t(tb)}</button>
        ))}
      </div>
      {tab === "users" && <AdminUsers users={p.users} onAdd={p.onAddUser} onChangePwd={p.onChangePwd} onToggle={p.onToggleUser} onDelete={p.onDeleteUser} onImport={p.onCsvImport}/>}
      {tab === "hotdesk" && <AdminHotDesk seats={p.seats} fixed={p.fixed} users={p.users} onAssign={p.onAssign} onUnassign={p.onUnassign}/>}
      {tab === "settings" && <AdminSettings cu={p.cu} onLogout={p.onLogout} lang={p.lang} setLang={p.setLang} theme={p.theme} setTheme={p.setTheme}/>}
    </div>
  );
}

// ── ROOT COMPONENT ───────────────────────────────────────────────
type MainTab = "tracker" | "hotdesk" | "admin";
type TrackerView = "calendar" | "day" | "tasks";
type HdView = "map" | "table";

function WorkSuiteApp(): JSX.Element {
  // ── auth ──
  const { user: authUser, logout } = useAuth();
  const cu: CurrentUser = authUser
    ? { id: authUser.id, name: authUser.user_metadata?.name ?? authUser.email ?? "User", email: authUser.email ?? "", avatar: mkAvatar(authUser.user_metadata?.name ?? authUser.email ?? "?"), role: authUser.user_metadata?.role ?? "user", deskType: authUser.user_metadata?.deskType ?? DT.HOTDESK, active: true }
    : { id: "local", name: "Demo User", email: "demo@worksuite.local", avatar: "DU", role: "admin", deskType: DT.HOTDESK, active: true };

  // ── i18n / theme ──
  const [lang, setLang] = useState<string>(() => localStorage.getItem("ws-lang") ?? "es");
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("ws-theme") ?? "dark");
  const t = useCallback((k: string): string => (TR[lang as keyof typeof TR] ?? TR.es)[k as keyof typeof TR.es] ?? k, [lang]);
  useEffect(() => { localStorage.setItem("ws-lang", lang); }, [lang]);
  useEffect(() => { localStorage.setItem("ws-theme", theme); document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // ── CSS injection ──
  useEffect(() => {
    const id = "ws-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style"); el.id = id; el.textContent = buildCSS(); document.head.appendChild(el);
    }
  }, []);

  // ── nav ──
  const [tab, setTab] = useState<MainTab>("tracker");
  const [tView, setTView] = useState<TrackerView>("calendar");
  const [hdView, setHdView] = useState<HdView>("map");
  const [selDate, setSelDate] = useState<string>(TODAY);
  const [filters, setFilters] = useState<Filters>({ from: TODAY.slice(0,8)+"01", to: TODAY, authorId: "", spaceKeys: [], jql: "" });
  const [sbOpen, setSbOpen] = useState(false);

  // ── data — worklogs ──
  const [wls, setWls] = useState<WorklogsMap>({});

  // ── data — hotdesk ──
  const [hd, setHd] = useState<HdState>({ fixed: {}, reservations: [] });

  // ── data — users ──
  const [users, setUsers] = useState<MockUserUI[]>(MOCK_USERS);

  // ── data — Jira ──
  const [jiraIssues,   setJiraIssues]   = useState<MockIssue[]>(MOCK_ISSUES);
  const [jiraProjects, setJiraProjects] = useState<{key:string;name:string}[]>(MOCK_PROJECTS);

  // ── modals ──
  const [lwModal, setLwModal] = useState<{ date: string; key?: string } | null>(null);
  const [editWl, setEditWl] = useState<WorklogUI | null>(null);
  const [hdModal, setHdModal] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [changePwdUid, setChangePwdUid] = useState<string | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  // ── toast ──
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok"): void => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }, []);

  // ── loadAll from Supabase + Jira ──
  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [wlRes, resRes, fixRes] = await Promise.all([
        supabase.from("worklogs").select("*").order("date", { ascending: false }),
        supabase.from("seat_reservations").select("*"),
        supabase.from("fixed_assignments").select("*"),
      ]);
      if (wlRes.data) setWls(wlsToMap(wlRes.data as Record<string, unknown>[]));
      if (resRes.data) {
        const res: HdReservationUI[] = (resRes.data as Record<string, unknown>[]).map(r => ({
          seatId: r["seat_id"] as string, date: (r["date"] as string).slice(0, 10),
          userId: r["user_id"] as string, userName: r["user_name"] as string ?? "—",
        }));
        const fix: Record<string, string> = {};
        if (fixRes.data) { for (const r of fixRes.data as Record<string, unknown>[]) { fix[r["seat_id"] as string] = r["user_id"] as string; } }
        setHd({ fixed: fix, reservations: res });
      }
    } catch (e) { console.error("loadAll error", e); }

    // Cargar proyectos e issues desde la API (JiraCloudAdapter si hay credenciales, Mock si no)
    try {
      const projRes = await fetch(`${API_BASE}/jira/projects`);
      if (projRes.ok) {
        const { data: projs } = await projRes.json() as { data: {key:string;name:string}[] };
        setJiraProjects(projs);
        const firstKey = projs.find(p => p.key === "ANDURIL")?.key ?? projs[0]?.key;
        if (firstKey) {
          const issRes = await fetch(`${API_BASE}/jira/issues?project=${firstKey}`);
          if (issRes.ok) {
            const { data: issues } = await issRes.json() as { data: MockIssue[] };
            setJiraIssues(issues);
          }
        }
      }
    } catch (e) { console.warn("Jira load (usando datos mock):", e); }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── worklog handlers ──
  const handleSaveWorklog = useCallback(async (date: string, key: string, secs: number, started: string, desc: string): Promise<void> => {
    const snapshot = { ...wls };
    const issue = jiraIssues.find(i => i.key === key);
    const newEntry: WorklogUI = {
      id: crypto.randomUUID(), issue: key, summary: issue?.summary ?? key,
      type: issue?.type ?? "Task", epic: issue?.epic ?? "—", epicName: issue?.epicName ?? "—",
      project: issue?.project ?? "—", author: cu.name, authorId: cu.id,
      time: TimeParser.fmt(secs), seconds: secs, started, description: desc, syncedToJira: false, isNew: true,
    };
    setWls(prev => ({ ...prev, [date]: [...(prev[date] ?? []), newEntry] }));
    try {
      const { error } = await supabase.from("worklogs").insert({
        id: newEntry.id, issue_key: key, issue_summary: newEntry.summary,
        issue_type: newEntry.type, epic_key: newEntry.epic, epic_name: newEntry.epicName,
        project_key: newEntry.project, author_name: cu.name, author_id: cu.id,
        date, seconds: secs, started_at: `${date}T${started}:00`, description: desc, synced_to_jira: false,
      });
      if (error) throw error;
      setLwModal(null); setEditWl(null); showToast(t("saved"));
    } catch (e) { setWls(snapshot); showToast(t("errorSaving"), "err"); console.error(e); }
  }, [wls, cu, t, showToast]);

  const handleDeleteWorklog = useCallback(async (w: WorklogUI, date: string): Promise<void> => {
    const snapshot = { ...wls };
    setWls(prev => { const next = { ...prev }; if (next[date]) { next[date] = next[date]!.filter(x => x.id !== w.id); if (!next[date]!.length) delete next[date]; } return next; });
    try {
      const { error } = await supabase.from("worklogs").delete().eq("id", w.id);
      if (error) throw error;
      showToast(t("deleted"));
    } catch (e) { setWls(snapshot); showToast(t("errorDeleting"), "err"); console.error(e); }
  }, [wls, t, showToast]);

  // ── sync worklog → Jira ──
  const handleSyncWorklog = useCallback(async (w: WorklogUI, date: string): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/jira/worklogs/${w.issue}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worklogId: w.id, seconds: w.seconds, startedAt: `${date}T${w.started}:00.000+0000`, description: w.description }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Actualiza flag en estado local
      setWls(prev => {
        const next = { ...prev };
        if (next[date]) next[date] = next[date]!.map(x => x.id === w.id ? { ...x, syncedToJira: true } : x);
        return next;
      });
      showToast(`✓ ${w.issue} ${t("syncedToJira")}`);
    } catch (e) { showToast(t("errorSyncing"), "err"); console.error(e); }
  }, [t, showToast]);

  // ── hotdesk handlers ──
  const handleHdConfirm = useCallback(async (seatId: string, date: string): Promise<void> => {
    const snapshot = { ...hd };
    const newRes: HdReservationUI = { seatId, date, userId: cu.id, userName: cu.name };
    setHd(prev => ({ ...prev, reservations: [...prev.reservations, newRes] }));
    setHdModal(null);
    try {
      const { error } = await supabase.from("seat_reservations").upsert(
        { seat_id: seatId, date, user_id: cu.id, user_name: cu.name },
        { onConflict: ["seat_id", "date"] }
      );
      if (error) throw error;
      showToast(t("reservationConfirmed"));
    } catch (e) { setHd(snapshot); showToast(t("errorReserving"), "err"); console.error(e); }
  }, [hd, cu, t, showToast]);

  const handleHdRelease = useCallback(async (seatId: string): Promise<void> => {
    const snapshot = { ...hd };
    setHd(prev => ({ ...prev, reservations: prev.reservations.filter(r => !(r.seatId === seatId && r.date === selDate && r.userId === cu.id)) }));
    try {
      const { error } = await supabase.from("seat_reservations").delete().eq("seat_id", seatId).eq("date", selDate).eq("user_id", cu.id);
      if (error) throw error;
      showToast(t("reservationReleased"));
    } catch (e) { setHd(snapshot); showToast(t("errorReleasing"), "err"); console.error(e); }
  }, [hd, selDate, cu, t, showToast]);

  // ── admin handlers ──
  const handleAddUser = useCallback((u: { name: string; email: string; role: string; deskType: string }): void => {
    const nu: MockUserUI = { id: crypto.randomUUID(), name: u.name, email: u.email, role: u.role, deskType: u.deskType, avatar: mkAvatar(u.name), active: true };
    setUsers(prev => [...prev, nu]); setAddUserOpen(false); showToast(t("userAdded"));
  }, [t, showToast]);

  const handleToggleUser = useCallback((uid: string): void => {
    setUsers(prev => prev.map(u => u.id === uid ? { ...u, active: !u.active } : u)); showToast(t("updated"));
  }, [t, showToast]);

  const handleDeleteUser = useCallback((uid: string): void => {
    setUsers(prev => prev.filter(u => u.id !== uid)); showToast(t("deleted"));
  }, [t, showToast]);

  const handleCsvImport = useCallback((rows: CsvRow[]): void => {
    const newUsers: MockUserUI[] = rows.map(r => ({ id: crypto.randomUUID(), name: r.name, email: r.email, role: r.role === "admin" ? "admin" : "user", deskType: [DT.HOTDESK, DT.FIXED, DT.NONE].includes(r.role) ? r.role : DT.HOTDESK, avatar: mkAvatar(r.name), active: true }));
    setUsers(prev => [...prev, ...newUsers]); setCsvImportOpen(false); showToast(`${t("imported")} ${rows.length}`);
  }, [t, showToast]);

  const handleAssign = useCallback((seatId: string, userId: string): void => {
    setHd(prev => ({ ...prev, fixed: { ...prev.fixed, [seatId]: userId } })); showToast(t("assigned"));
  }, [t, showToast]);

  const handleUnassign = useCallback((seatId: string): void => {
    setHd(prev => { const f = { ...prev.fixed }; delete f[seatId]; return { ...prev, fixed: f }; }); showToast(t("unassigned"));
  }, [t, showToast]);

  const ctxVal: AppCtxValue = useMemo(() => ({ lang, t, theme }), [lang, t, theme]);

  // ── render ──
  return (
    <AppCtx.Provider value={ctxVal}>
      <div className={`ws-root ${theme}`} data-theme={theme}>
        {/* HEADER */}
        <header className="ws-hdr">
          <div className="ws-brand">WorkSuite</div>
          <nav className="ws-nav">
            {(["tracker","hotdesk"] as MainTab[]).map(tb => (
              <button key={tb} className={`nav-btn ${tab===tb?"active":""}`} onClick={() => setTab(tb)}>{t(tb)}</button>
            ))}
            {cu.role === "admin" && <button className={`nav-btn ${tab==="admin"?"active":""}`} onClick={() => setTab("admin")}>{t("admin")}</button>}
          </nav>
          <div className="ws-user">
            <div className="av">{cu.avatar}</div>
            <span className="ws-uname">{cu.name}</span>
          </div>
        </header>

        {/* TRACKER */}
        {tab === "tracker" && (
          <div className="ws-body">
            <div className="tracker-toolbar">
              <div className="view-toggle">
                {(["calendar","day","tasks"] as TrackerView[]).map(v => (
                  <button key={v} className={`vt-btn ${tView===v?"active":""}`} onClick={() => setTView(v)}>{t(v)}</button>
                ))}
              </div>
              {tView === "day" && <input className="fi date-fi" type="date" value={selDate} onChange={e => setSelDate(e.target.value)}/>}
              {tView !== "calendar" && <button className="btn-g sb-toggle" onClick={() => setSbOpen(o => !o)}>{t("filters")}</button>}
              <button className="btn-p" onClick={() => setLwModal({ date: selDate })}>{t("addWorklog")}</button>
            </div>
            <div className="tracker-body">
              {tView === "calendar" && <CalendarView wls={wls} cu={cu} onAdd={d => { setSelDate(d); setLwModal({ date: d }); }} onEdit={w => setEditWl(w)} onDelete={w => void handleDeleteWorklog(w, w.started?.slice(0,10) ?? selDate)}/>}
              {tView === "day" && <DayView date={selDate} wls={wls[selDate] ?? []} cu={cu} onAdd={() => setLwModal({ date: selDate })} onEdit={w => setEditWl(w)} onDelete={w => void handleDeleteWorklog(w, selDate)} onSync={w => void handleSyncWorklog(w, selDate)}/>}
              {tView === "tasks" && <TasksView wls={wls} cu={cu} filters={filters} onEdit={w => setEditWl(w)} onDelete={w => void handleDeleteWorklog(w, w.started?.slice(0,10) ?? TODAY)} onSync={w => void handleSyncWorklog(w, w.started?.slice(0,10) ?? TODAY)}/>}
              {(tView === "day" || tView === "tasks") && sbOpen && (
                <JTFilterSidebar filters={filters} users={users} projects={jiraProjects} onApply={f => { setFilters(f); setSbOpen(false); }} onExport={f => { const r = WlSvc.filter(wls, f.from, f.to, f.authorId || null); console.info("Export", r); showToast(t("exported")); }} mobileOpen={sbOpen} onMobileClose={() => setSbOpen(false)}/>
              )}
            </div>
          </div>
        )}

        {/* HOTDESK */}
        {tab === "hotdesk" && (
          <div className="ws-body">
            <div className="hd-toolbar">
              <input className="fi date-fi" type="date" value={selDate} onChange={e => setSelDate(e.target.value)}/>
              <div className="view-toggle">
                <button className={`vt-btn ${hdView==="map"?"active":""}`} onClick={() => setHdView("map")}>{t("mapView")}</button>
                <button className={`vt-btn ${hdView==="table"?"active":""}`} onClick={() => setHdView("table")}>{t("tableView")}</button>
              </div>
            </div>
            {hdView === "map" && <HDMapView hd={hd} seats={SEATS} users={users} cu={cu} date={selDate} onReserve={id => setHdModal(id)} onRelease={id => void handleHdRelease(id)}/>}
            {hdView === "table" && <HDTableView hd={hd} seats={SEATS} users={users} cu={cu} date={selDate} onReserve={id => setHdModal(id)} onRelease={id => void handleHdRelease(id)}/>}
          </div>
        )}

        {/* ADMIN */}
        {tab === "admin" && cu.role === "admin" && (
          <div className="ws-body">
            <AdminShell cu={cu} users={users} seats={SEATS} fixed={hd.fixed} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} onLogout={() => void logout()} onAddUser={() => setAddUserOpen(true)} onChangePwd={uid => setChangePwdUid(uid)} onToggleUser={handleToggleUser} onDeleteUser={handleDeleteUser} onCsvImport={() => setCsvImportOpen(true)} onAssign={handleAssign} onUnassign={handleUnassign}/>
          </div>
        )}

        {/* MODALS */}
        {(lwModal || editWl) && (
          <LogWorklogModal
            initDate={editWl ? (editWl.started?.slice(0,10) ?? selDate) : lwModal?.date ?? selDate}
            initKey={editWl?.issue ?? lwModal?.key}
            issues={jiraIssues}
            cu={cu}
            onClose={() => { setLwModal(null); setEditWl(null); }}
            onSave={(date, key, secs, started, desc) => void handleSaveWorklog(date, key, secs, started, desc)}
          />
        )}
        {hdModal && <HDReserveModal seatId={hdModal} date={selDate} onConfirm={(sid, d) => void handleHdConfirm(sid, d)} onClose={() => setHdModal(null)}/>}
        {addUserOpen && <AddUserModal onClose={() => setAddUserOpen(false)} onSave={handleAddUser}/>}
        {changePwdUid && <ChangePasswordModal userId={changePwdUid} onClose={() => setChangePwdUid(null)} onSave={(uid, pwd) => { console.info("Change pwd for", uid, pwd); setChangePwdUid(null); showToast(t("saved")); }}/>}
        {csvImportOpen && <CsvImportModal users={users} onClose={() => setCsvImportOpen(false)} onImport={handleCsvImport}/>}

        {/* TOAST */}
        {toast && <div className={`ws-toast toast-${toast.type}`}>{toast.msg}</div>}
      </div>
    </AppCtx.Provider>
  );
}

export default WorkSuiteApp;
