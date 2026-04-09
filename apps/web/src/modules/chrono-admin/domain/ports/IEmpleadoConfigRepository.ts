import type { EmpleadoConfig } from '../entities/EmpleadoConfig';

export interface IEmpleadoConfigRepository {
  getByUserId(userId: string): Promise<EmpleadoConfig | null>;
  getAll(): Promise<EmpleadoConfig[]>;
  upsert(userId: string, data: Partial<Omit<EmpleadoConfig, 'id' | 'userId'>>): Promise<EmpleadoConfig>;
}
