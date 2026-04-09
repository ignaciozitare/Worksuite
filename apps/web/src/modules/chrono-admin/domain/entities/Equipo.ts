export interface Equipo {
  id: string;
  nombre: string;
  descripcion: string | null;
  managerId: string | null;
  miembros: { userId: string; nombre: string; email: string }[];
}
