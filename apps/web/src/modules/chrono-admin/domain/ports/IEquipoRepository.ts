import type { Equipo } from '../entities/Equipo';

export interface IEquipoRepository {
  getAll(): Promise<Equipo[]>;
  create(nombre: string, descripcion?: string, managerId?: string): Promise<Equipo>;
  update(id: string, data: Partial<Pick<Equipo, 'nombre' | 'descripcion' | 'managerId'>>): Promise<void>;
  delete(id: string): Promise<void>;
  addMiembro(equipoId: string, userId: string): Promise<void>;
  removeMiembro(equipoId: string, userId: string): Promise<void>;
}
