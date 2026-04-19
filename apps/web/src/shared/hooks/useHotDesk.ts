import { useCallback, useEffect, useState } from 'react';
import { SeatStatusEnum as SeatStatus } from '../../modules/hotdesk/domain/entities/constants';
import { ReservationService } from '../../modules/hotdesk/domain/services/ReservationService';
import { ConflictError } from '../domain/errors/ConflictError';
import { TODAY } from '../lib/constants';
import { seatRepo } from './useWorkSuiteData';
import { configRepo, reservationRepo } from '../../modules/hotdesk/container';
import type { HotDeskConfig } from '../../modules/hotdesk/domain/entities/HotDeskConfig';

interface UseHotDeskParams {
  hd: { fixed: Record<string, string>; reservations: any[]; blockedSeats?: Record<string, string> };
  setHd: (fn: (h: any) => any) => void;
  currentUser: { id: string; name: string };
  notify: (msg: string) => void;
  t: (key: string) => string;
}

export function useHotDesk({ hd, setHd, currentUser, notify, t }: UseHotDeskParams) {
  const [config, setConfig] = useState<HotDeskConfig | null>(null);

  useEffect(() => {
    configRepo.getConfig().then(setConfig).catch(() => {});
  }, []);

  const confirmationEnabled = config?.confirmationEnabled ?? false;

  const handleSeatClick = useCallback((seatId: string, date: string = TODAY) => {
    const blockedSeats = hd.blockedSeats || {};
    const st = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations, blockedSeats);
    if (st === SeatStatus.BLOCKED) { notify(t('hotdesk.blockedSeat')); return null; }
    if (st === SeatStatus.FIXED) {
      // Allow if it's the user's own fixed seat (for delegation)
      const fixedOwner = hd.fixed[seatId];
      if (fixedOwner !== currentUser.name) {
        notify(t('hotdesk.noReserve'));
        return null;
      }
    }
    const res = ReservationService.resOf(seatId, date, hd.reservations);
    if ((st === SeatStatus.OCCUPIED || st === SeatStatus.PENDING || st === SeatStatus.DELEGATED) && res?.userId !== currentUser.id) {
      notify(t('hotdesk.alreadyOccupied'));
      return null;
    }
    return { seatId, date };
  }, [hd, currentUser.id, currentUser.name, notify, t]);

  const refreshReservations = useCallback(async () => {
    try {
      const reservations = await seatRepo.findAllReservations();
      setHd((h: any) => ({
        ...h,
        reservations: reservations.map((r: any) => ({
          seatId: r.seat_id, date: r.date, userId: r.user_id,
          userName: r.user_name, status: r.status,
          confirmedAt: r.confirmed_at, delegatedBy: r.delegated_by,
        })),
      }));
    } catch (err) { console.error('Refresh failed:', err); }
  }, [setHd]);

  const handleConfirm = useCallback(async (seatId: string, dates: string[]) => {
    if (!dates.length) return;
    const initialStatus: 'pending' | 'confirmed' = confirmationEnabled ? 'pending' : 'confirmed';
    // Optimistic update
    setHd((h: any) => ({
      ...h,
      reservations: [
        ...h.reservations.filter((r: any) => !dates.includes(r.date) || r.seatId !== seatId),
        ...dates.map(d => ({ seatId, date: d, userId: currentUser.id, userName: currentUser.name, status: initialStatus })),
      ],
    }));
    const msgKey = confirmationEnabled ? 'hotdesk.pendingConfirmation' : 'hotdesk.reservedOk';
    notify(`${t(msgKey)} — ${seatId}`);
    try {
      const rows = dates.map(d => ({
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        seat_id: seatId, user_id: currentUser.id, user_name: currentUser.name, date: d,
        status: initialStatus,
      }));
      await seatRepo.insertReservations(rows);
    } catch (err) {
      if (err instanceof ConflictError) {
        // Rollback optimistic update and refresh from DB
        notify(t('hotdesk.seatConflict'));
        await refreshReservations();
        return;
      }
      console.error('Reserve failed:', err);
    }
  }, [currentUser.id, currentUser.name, setHd, notify, t, confirmationEnabled, refreshReservations]);

  const handleRelease = useCallback(async (seatId: string, date: string) => {
    setHd((h: any) => ({ ...h, reservations: h.reservations.filter((r: any) => !(r.seatId === seatId && r.date === date)) }));
    notify(t('hotdesk.releasedOk'));
    try {
      await seatRepo.removeReservation(seatId, date, currentUser.id);
    } catch (err) { console.error('Release failed:', err); }
  }, [currentUser.id, setHd, notify, t]);

  const handleConfirmPresence = useCallback(async (seatId: string, date: string) => {
    setHd((h: any) => ({
      ...h,
      reservations: h.reservations.map((r: any) =>
        r.seatId === seatId && r.date === date && r.userId === currentUser.id
          ? { ...r, status: 'confirmed', confirmedAt: new Date().toISOString() }
          : r
      ),
    }));
    notify(t('hotdesk.confirmedOk'));
    try {
      await reservationRepo.confirmReservation(seatId, date, currentUser.id);
    } catch (err) { console.error('Confirm failed:', err); }
  }, [currentUser.id, setHd, notify, t]);

  const handleDelegate = useCallback(async (seatId: string, dates: string[], targetUserId: string) => {
    setHd((h: any) => ({
      ...h,
      reservations: [
        ...h.reservations,
        ...dates.map(d => ({
          seatId, date: d, userId: targetUserId, userName: '',
          status: 'pending', delegatedBy: currentUser.id,
        })),
      ],
    }));
    notify(t('hotdesk.delegatedOk'));
    try {
      await reservationRepo.delegateSeat(seatId, dates, currentUser.id, targetUserId);
    } catch (err) { console.error('Delegate failed:', err); }
  }, [currentUser.id, setHd, notify, t]);

  return { handleSeatClick, handleConfirm, handleRelease, handleConfirmPresence, handleDelegate };
}
