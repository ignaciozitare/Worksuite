import type { Fichaje, GeoData, ResumenMes } from '../entities/Fichaje';

export interface IFichajeRepository {
  getFichajeHoy(userId: string): Promise<Fichaje | null>;
  getFichajesMes(userId: string, mes: string): Promise<Fichaje[]>;
  getResumenMes(userId: string, mes: string): Promise<ResumenMes>;
  getFichajesIncompletos(userId: string): Promise<Fichaje[]>;
  ficharEntrada(userId: string, geo?: GeoData): Promise<Fichaje>;
  ficharSalida(fichajeId: string, geo?: GeoData): Promise<Fichaje>;
  iniciarComida(fichajeId: string): Promise<Fichaje>;
  finalizarComida(fichajeId: string): Promise<Fichaje>;
  completarFichaje(
    fichajeId: string,
    campos: Partial<
      Pick<Fichaje, 'entradaAt' | 'comidaIniAt' | 'comidaFinAt' | 'salidaAt'>
    >,
    justificacion: string,
  ): Promise<Fichaje>;
}
