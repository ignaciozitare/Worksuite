import type { EmpleadoJiraResumen } from '../entities/JiraResumen';

export interface IJiraResumenRepository {
  getResumenMes(mes: string): Promise<EmpleadoJiraResumen[]>;
  getResumenEmpleado(userId: string, mes: string): Promise<EmpleadoJiraResumen | null>;
}
