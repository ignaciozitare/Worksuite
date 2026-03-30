// @ts-nocheck
import { useCallback } from 'react';
import { supabase } from '../lib/api';
import { SeatStatusEnum as SeatStatus } from '../../modules/hotdesk/domain/entities/constants';
import { ReservationService } from '../../modules/hotdesk/domain/services/ReservationService';
import { TODAY } from '../lib/constants';

export function useHotDesk({ hd, setHd, currentUser, notify, t }) {
  const handleSeatClick = useCallback((seatId, date = TODAY) => {
    const st = ReservationService.statusOf(seatId, date, hd.fixed, hd.reservations);
    if (st === SeatStatus.FIXED) { notify(t('hotdesk.noReserve')); return null; }
    const res = ReservationService.resOf(seatId, date, hd.reservations);
    if (st === SeatStatus.OCCUPIED && res?.userId !== currentUser.id) { notify(t('hotdesk.alreadyOccupied')); return null; }
    return { seatId, date };
  }, [hd, currentUser.id, notify, t]);

  const handleConfirm = useCallback(async (seatId, dates) => {
    if (!dates.length) return;
    setHd(h => ({
      ...h,
      reservations: [
        ...h.reservations.filter(r => !dates.includes(r.date) || r.seatId !== seatId),
        ...dates.map(d => ({ seatId, date: d, userId: currentUser.id, userName: currentUser.name })),
      ],
    }));
    notify(`✓ ${t('hotdesk.reservedOk')} — ${seatId}`);
    try {
      const rows = dates.map(d => ({
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        seat_id: seatId, user_id: currentUser.id, user_name: currentUser.name, date: d,
      }));
      const { error } = await supabase.from('seat_reservations').upsert(rows, { onConflict: 'seat_id,date' });
      if (error) console.error('Reserve error:', error.message);
    } catch (err) { console.error('Reserve failed:', err); }
  }, [currentUser.id, currentUser.name, setHd, notify, t]);

  const handleRelease = useCallback(async (seatId, date) => {
    setHd(h => ({ ...h, reservations: h.reservations.filter(r => !(r.seatId === seatId && r.date === date)) }));
    notify(t('hotdesk.releasedOk'));
    try {
      const { error } = await supabase.from('seat_reservations')
        .delete().eq('seat_id', seatId).eq('date', date).eq('user_id', currentUser.id);
      if (error) console.error('Release error:', error.message);
    } catch (err) { console.error('Release failed:', err); }
  }, [currentUser.id, setHd, notify, t]);

  return { handleSeatClick, handleConfirm, handleRelease };
}
