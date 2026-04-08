import type { SupabaseClient } from '@supabase/supabase-js';
import type { IConfigRepository } from '../../domain/ports/IConfigRepository';
import type { ConfigEmpresa } from '../../domain/entities/ConfigEmpresa';

function toConfigEmpresa(row: any): ConfigEmpresa {
  return {
    id: row.id,
    horasJornadaMinutos: row.horas_jornada_minutos,
    pausaComidaMinMinutos: row.pausa_comida_min_minutos,
    pausaComidaMaxMinutos: row.pausa_comida_max_minutos,
    toleranciaEntradaMinutos: row.tolerancia_entrada_minutos,
    diasVacacionesBase: row.dias_vacaciones_base,
    requiereGeo: row.requiere_geo,
    geoWhitelist: row.geo_whitelist ?? [],
    ipWhitelist: row.ip_whitelist ?? [],
    requiereAprobacionFichaje: row.requiere_aprobacion_fichaje,
    slackWebhookUrl: row.slack_webhook_url,
  };
}

function toSnakeCase(data: Partial<Omit<ConfigEmpresa, 'id'>>): Record<string, unknown> {
  const map: Record<string, string> = {
    horasJornadaMinutos: 'horas_jornada_minutos',
    pausaComidaMinMinutos: 'pausa_comida_min_minutos',
    pausaComidaMaxMinutos: 'pausa_comida_max_minutos',
    toleranciaEntradaMinutos: 'tolerancia_entrada_minutos',
    diasVacacionesBase: 'dias_vacaciones_base',
    requiereGeo: 'requiere_geo',
    geoWhitelist: 'geo_whitelist',
    ipWhitelist: 'ip_whitelist',
    requiereAprobacionFichaje: 'requiere_aprobacion_fichaje',
    slackWebhookUrl: 'slack_webhook_url',
  };

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = map[key];
    if (snakeKey) result[snakeKey] = value;
  }
  return result;
}

export class ConfigSupabaseRepository implements IConfigRepository {
  constructor(private db: SupabaseClient) {}

  async getConfig(): Promise<ConfigEmpresa> {
    const { data, error } = await this.db.from('ch_config_empresa')
      .select('*').limit(1).single();
    if (error) throw error;
    return toConfigEmpresa(data);
  }

  async update(
    data: Partial<Omit<ConfigEmpresa, 'id'>>,
    updatedBy: string,
  ): Promise<ConfigEmpresa> {
    const config = await this.getConfig();

    const updates = {
      ...toSnakeCase(data),
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    const { data: updated, error } = await this.db.from('ch_config_empresa')
      .update(updates).eq('id', config.id).select().single();
    if (error) throw error;
    return toConfigEmpresa(updated);
  }
}
