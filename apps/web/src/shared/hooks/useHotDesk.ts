import { useCallback } from 'react';
import { SeatStatusEnum as SeatStatus } from '../../modules/hotdesk/domain/entities/constants';
import { ReservationService } from '../../modules/hotdesk/domain/services/ReservationService';
import { TODAY } from '../lib/constants';
import { seatRepo } from './useWorkSuiteData';

interface UseHotDeskParams {
  hd: { fixed: Record<string, string>; reservations: any[] };
  setHd: (fn: (h: any) => any) => void;
  currentUser: { id: string; name: string };
  notify: (msg: string) => void;
  t: (key: string) => string;
}

export function useHotDesk({ hd, setHd, currentUser, notify, t }: UseHotDeskParams) {
  const handleSeatClick = useCallback((seatId: string, date: string = TODAY) => {
    const st = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations);
    if (st === SeatStatus.FIXED) { notify(t('hotdesk.noReserve')); return null; }
    const res = ReservationService.resOf(seatId, date, hd.reservations);
    if (st === SeatStatus.OCCUPIED && res?.userId !== currentUser.id) { notify(t('hotdesk.alreadyOccupied')); return null; }
    return { seatId, date };
  }, [hd, currentUser.id, notify, t]);

  const handleConfirm = useCallback(async (seatId: string, dates: string[]) => {
    if (!dates.length) return;
    setHd((h: any) => ({
      ...h,
      reservations: [
        ...h.reservations.filter((r: any) => !dates.includes(r.date) || r.seatId !== seatId),
        ...dates.map(d => ({ seatId, date: d, userId: currentUser.id, userName: currentUser.name })),
      ],
    }));
    notify(`✓ ${t('hotdesk.reservedOk')} — ${seatId}`);
    try {
      const rows = dates.map(d => ({
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        seat_id: seatId, user_id: currentUser.id, user_name: currentUser.name, date: d,
      }));
      await seatRepo.upsertReservations(rows);
    } catch (err) { console.error('Reserve failed:', err); }
  }, [currentUser.id, currentUser.name, setHd, notify, t]);

  const handleRelease = useCallback(async (seatId: string, date: string) => {
    setHd((h: any) => ({ ...h, reservations: h.reservations.filter((r: any) => !(r.seatId === seatId && r.date === date)) }));
    notify(t('hotdesk.releasedOk'));
    try {
      await seatRepo.removeReservation(seatId, date, currentUser.id);
    } catch (err) { console.error('Release failed:', err); }
  }, [currentUser.id, setHd, notify, t]);

  return { handleSeatClick, handleConfirm, handleRelease };
}
