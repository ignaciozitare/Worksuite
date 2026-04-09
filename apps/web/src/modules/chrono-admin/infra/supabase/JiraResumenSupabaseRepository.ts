// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IJiraResumenRepository } from '../../domain/ports/IJiraResumenRepository';
import type { EmpleadoJiraResumen } from '../../domain/entities/JiraResumen';

function lastDayOfMonth(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

export class JiraResumenSupabaseRepository implements IJiraResumenRepository {
  constructor(private db: SupabaseClient) {}

  async getResumenMes(mes: string): Promise<EmpleadoJiraResumen[]> {
    const desde = `${mes}-01`;
    const hasta = lastDayOfMonth(mes);

    const [worklogsRes, fichajesRes, usersRes] = await Promise.all([
      this.db
        .from('worklogs')
        .select('author_id, seconds, project_key')
        .gte('started_at', desde)
        .lte('started_at', `${hasta}T23:59:59`),
      this.db
        .from('ch_fichajes')
        .select('user_id, minutos_trabajados')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .in('estado', ['completo', 'aprobado']),
      this.db
        .from('users')
        .select('id, name, email'),
    ]);

    if (worklogsRes.error) throw worklogsRes.error;
    if (fichajesRes.error) throw fichajesRes.error;
    if (usersRes.error) throw usersRes.error;

    const worklogs = worklogsRes.data ?? [];
    const fichajes = fichajesRes.data ?? [];
    const users = usersRes.data ?? [];

    const userMap = new Map(users.map((u: any) => [u.id, { name: u.name, email: u.email }]));

    // Group worklogs by author_id → total minutes + projects breakdown
    const jiraByUser = new Map<string, { totalSeconds: number; projects: Map<string, number> }>();
    for (const wl of worklogs) {
      const entry = jiraByUser.get(wl.author_id) ?? { totalSeconds: 0, projects: new Map() };
      entry.totalSeconds += wl.seconds ?? 0;
      const projSeconds = entry.projects.get(wl.project_key) ?? 0;
      entry.projects.set(wl.project_key, projSeconds + (wl.seconds ?? 0));
      jiraByUser.set(wl.author_id, entry);
    }

    // Group fichajes by user_id → total minutos_trabajados
    const fichajeByUser = new Map<string, number>();
    for (const f of fichajes) {
      fichajeByUser.set(f.user_id, (fichajeByUser.get(f.user_id) ?? 0) + (f.minutos_trabajados ?? 0));
    }

    // Collect all user IDs that appear in either worklogs or fichajes
    const allUserIds = new Set([...jiraByUser.keys(), ...fichajeByUser.keys()]);

    return [...allUserIds].map((userId) => {
      const user = userMap.get(userId);
      const jiraEntry = jiraByUser.get(userId);
      const minutosJira = jiraEntry ? Math.round(jiraEntry.totalSeconds / 60) : 0;
      const minutosFichaje = fichajeByUser.get(userId) ?? 0;

      const proyectos: { key: string; name: string; minutos: number }[] = [];
      if (jiraEntry) {
        for (const [projectKey, seconds] of jiraEntry.projects) {
          proyectos.push({
            key: projectKey,
            name: projectKey,
            minutos: Math.round(seconds / 60),
          });
        }
      }

      return {
        userId,
        nombre: user?.name ?? user?.email ?? 'Desconocido',
        email: user?.email ?? '',
        minutosJira,
        minutosFichaje,
        diferencia: minutosFichaje - minutosJira,
        proyectos,
      };
    });
  }

  async getResumenEmpleado(userId: string, mes: string): Promise<EmpleadoJiraResumen | null> {
    const desde = `${mes}-01`;
    const hasta = lastDayOfMonth(mes);

    const [worklogsRes, fichajesRes, userRes] = await Promise.all([
      this.db
        .from('worklogs')
        .select('seconds, project_key')
        .eq('author_id', userId)
        .gte('started_at', desde)
        .lte('started_at', `${hasta}T23:59:59`),
      this.db
        .from('ch_fichajes')
        .select('minutos_trabajados')
        .eq('user_id', userId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .in('estado', ['completo', 'aprobado']),
      this.db
        .from('users')
        .select('id, name, email')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    if (worklogsRes.error) throw worklogsRes.error;
    if (fichajesRes.error) throw fichajesRes.error;
    if (userRes.error) throw userRes.error;

    if (!userRes.data) return null;

    const worklogs = worklogsRes.data ?? [];
    const fichajes = fichajesRes.data ?? [];
    const user = userRes.data;

    let totalSeconds = 0;
    const projectMap = new Map<string, number>();
    for (const wl of worklogs) {
      totalSeconds += wl.seconds ?? 0;
      projectMap.set(wl.project_key, (projectMap.get(wl.project_key) ?? 0) + (wl.seconds ?? 0));
    }

    const minutosJira = Math.round(totalSeconds / 60);
    const minutosFichaje = fichajes.reduce((acc: number, f: any) => acc + (f.minutos_trabajados ?? 0), 0);

    const proyectos = [...projectMap.entries()].map(([key, seconds]) => ({
      key,
      name: key,
      minutos: Math.round(seconds / 60),
    }));

    return {
      userId,
      nombre: user.name ?? user.email ?? 'Desconocido',
      email: user.email ?? '',
      minutosJira,
      minutosFichaje,
      diferencia: minutosFichaje - minutosJira,
      proyectos,
    };
  }
}
