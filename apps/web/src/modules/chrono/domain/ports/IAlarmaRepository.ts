import type { Alarma } from '../entities/Alarma';

export interface IAlarmaRepository {
  getAlarmas(userId: string): Promise<Alarma[]>;
  crear(data: Omit<Alarma, 'id'>): Promise<Alarma>;
  actualizar(
    id: string,
    data: Partial<Omit<Alarma, 'id' | 'userId'>>,
  ): Promise<Alarma>;
  eliminar(id: string): Promise<void>;
  toggle(id: string, activa: boolean): Promise<Alarma>;
}
