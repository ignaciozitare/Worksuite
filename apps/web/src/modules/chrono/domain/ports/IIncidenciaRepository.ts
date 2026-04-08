import type { Incidencia, CategoriaIncidencia } from '../entities/Incidencia';

export interface IIncidenciaRepository {
  getIncidenciasMes(userId: string, mes: string): Promise<Incidencia[]>;
  crear(data: {
    fichajeId: string;
    userId: string;
    categoria: CategoriaIncidencia;
    inicioAt: string;
    finAt?: string;
    descripcion?: string;
  }): Promise<Incidencia>;
  actualizar(
    id: string,
    data: Partial<Pick<Incidencia, 'finAt' | 'descripcion'>>,
  ): Promise<Incidencia>;
  cancelar(id: string): Promise<void>;
}
