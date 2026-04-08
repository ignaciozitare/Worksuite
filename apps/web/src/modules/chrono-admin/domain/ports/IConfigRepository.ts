import type { ConfigEmpresa } from '../entities/ConfigEmpresa';

export interface IConfigRepository {
  getConfig(): Promise<ConfigEmpresa>;
  update(data: Partial<Omit<ConfigEmpresa, 'id'>>, updatedBy: string): Promise<ConfigEmpresa>;
}
