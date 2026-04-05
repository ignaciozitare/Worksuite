import type { ReservationStatusData } from '../entities/ReservationStatus';

export interface IReservationStatusRepo {
  findAll(): Promise<ReservationStatusData[]>;
  create(data: Omit<ReservationStatusData, 'id'>): Promise<ReservationStatusData>;
  update(id: string, patch: Partial<ReservationStatusData>): Promise<void>;
  delete(id: string): Promise<void>;
  reorder(items: { id: string; ord: number }[]): Promise<void>;
}
