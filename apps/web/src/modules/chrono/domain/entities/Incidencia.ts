export type CategoriaIncidencia = 'medico' | 'comida' | 'gestion' | 'formacion' | 'teletrabajo' | 'viaje';
export interface Incidencia {
  id: string; fichajeId: string; userId: string; categoria: CategoriaIncidencia;
  inicioAt: string; finAt: string | null; descripcion: string | null; adjuntoUrl: string | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado'; aprobadoPor: string | null; aprobadoAt: string | null;
}
