export interface Equipo {
  id: string;
  nombre: string;
  descripcion: string | null;
  managerId: string | null;
  allowedBookingZones: string | null;
  miembros: { userId: string; nombre: string; email: string }[];
}
