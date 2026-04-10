import type { FichaEmpleado } from '../entities/FichaEmpleado';

export interface IFichaEmpleadoRepository {
  getByUserId(userId: string): Promise<FichaEmpleado | null>;
  upsert(userId: string, data: Partial<Omit<FichaEmpleado, 'id' | 'userId'>>): Promise<FichaEmpleado>;
}
