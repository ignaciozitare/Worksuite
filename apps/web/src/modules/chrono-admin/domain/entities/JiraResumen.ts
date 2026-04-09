export interface EmpleadoJiraResumen {
  userId: string;
  nombre: string;
  email: string;
  minutosJira: number;         // total logged in Jira Tracker this month
  minutosFichaje: number;      // total from ch_fichajes this month
  diferencia: number;          // fichaje - jira
  proyectos: { key: string; name: string; minutos: number }[];
}
