export type EstadoFichaje = 'abierto' | 'completo' | 'incompleto' | 'pendiente_aprobacion' | 'aprobado' | 'rechazado';
export type TipoFichaje = 'normal' | 'teletrabajo' | 'medico' | 'formacion' | 'viaje' | 'asunto_propio';
export interface GeoData { lat: number; lng: number; ip: string; device: string; }
export interface Fichaje {
  id: string; userId: string; fecha: string; entradaAt: string | null; comidaIniAt: string | null;
  comidaFinAt: string | null; salidaAt: string | null; minutosTrabajados: number | null;
  tipo: TipoFichaje; estado: EstadoFichaje; justificacion: string | null;
  geoEntrada: GeoData | null; geoSalida: GeoData | null;
  aprobadoPor: string | null; aprobadoAt: string | null; rechazadoRazon: string | null;
}
export interface ResumenMes {
  diasTrabajados: number; minutosTotales: number; minutosExtra: number; incidencias: number; incompletos: number;
}
