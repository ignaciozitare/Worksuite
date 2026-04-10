// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IFichaEmpleadoRepository } from '../../domain/ports/IFichaEmpleadoRepository';
import type { FichaEmpleado } from '../../domain/entities/FichaEmpleado';
import { encrypt, decrypt } from '@/shared/lib/crypto';

const ENCRYPTED_FIELDS = [
  'clienteAsignado',
  'valorHora',
  'contactoTelefono',
  'contactoEmailPersonal',
  'seniority',
  'notas',
  'razonBaja',
  'nss',
] as const;

const FIELD_MAP: Record<string, string> = {
  clienteAsignado: 'cliente_asignado',
  valorHora: 'valor_hora',
  contactoTelefono: 'contacto_telefono',
  contactoEmailPersonal: 'contacto_email_personal',
  seniority: 'seniority',
  notas: 'notas',
  razonBaja: 'razon_baja',
  nss: 'nss',
  fechaIncorporacion: 'fecha_incorporacion',
  fechaBaja: 'fecha_baja',
};

async function decryptRow(row: any): Promise<FichaEmpleado> {
  return {
    id: row.id,
    userId: row.user_id,
    clienteAsignado: row.cliente_asignado ? await decrypt(row.cliente_asignado) : null,
    valorHora: row.valor_hora ? await decrypt(row.valor_hora) : null,
    contactoTelefono: row.contacto_telefono ? await decrypt(row.contacto_telefono) : null,
    contactoEmailPersonal: row.contacto_email_personal ? await decrypt(row.contacto_email_personal) : null,
    seniority: row.seniority ? await decrypt(row.seniority) : null,
    notas: row.notas ? await decrypt(row.notas) : null,
    fechaIncorporacion: row.fecha_incorporacion ?? null,
    fechaBaja: row.fecha_baja ?? null,
    razonBaja: row.razon_baja ? await decrypt(row.razon_baja) : null,
    nss: row.nss ? await decrypt(row.nss) : null,
  };
}

export class FichaEmpleadoSupabaseRepository implements IFichaEmpleadoRepository {
  constructor(private db: SupabaseClient) {}

  async getByUserId(userId: string): Promise<FichaEmpleado | null> {
    const { data, error } = await this.db
      .from('ch_ficha_empleado')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? decryptRow(data) : null;
  }

  async upsert(
    userId: string,
    data: Partial<Omit<FichaEmpleado, 'id' | 'userId'>>,
  ): Promise<FichaEmpleado> {
    const payload: Record<string, any> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    for (const [key, value] of Object.entries(data)) {
      const col = FIELD_MAP[key];
      if (!col) continue;

      if (value == null || value === '') {
        payload[col] = null;
      } else if ((ENCRYPTED_FIELDS as readonly string[]).includes(key)) {
        payload[col] = await encrypt(String(value));
      } else {
        payload[col] = value;
      }
    }

    const { data: row, error } = await this.db
      .from('ch_ficha_empleado')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return decryptRow(row);
  }
}
