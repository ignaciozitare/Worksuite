export type TipoAlarma = 'entrada' | 'comida_ini' | 'comida_fin' | 'salida' | 'recordatorio';
export interface Alarma {
  id: string; userId: string; label: string; hora: string; dias: string[];
  activa: boolean; tipo: TipoAlarma; sonido: string;
  canales: { push: boolean; email: boolean; slack: boolean; };
}
