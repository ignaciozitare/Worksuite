import { describe, it, expect } from 'vitest';
import { ReservationService, SeatReservation, FixedAssignment } from '../HotDesk.js';

const fixedA1 = new FixedAssignment('A1', 'u1', 'Elena');
const res = SeatReservation.reconstitute({ id: 'r1', seatId: 'B2', userId: 'u2', userName: 'Carlos', date: '2026-03-11', createdAt: new Date().toISOString() });

describe('ReservationService', () => {
  describe('isWeekend()', () => {
    it('returns true for Saturday', () => { expect(ReservationService.isWeekend('2026-03-14')).toBe(true); });
    it('returns false for Monday', () => { expect(ReservationService.isWeekend('2026-03-09')).toBe(false); });
  });
  describe('canReserve()', () => {
    it('allows free weekday seat', () => { expect(ReservationService.canReserve('B3', '2026-03-11', 'u3', [], []).allowed).toBe(true); });
    it('blocks weekend', () => { expect(ReservationService.canReserve('B3', '2026-03-14', 'u3', [], []).allowed).toBe(false); });
    it('blocks fixed seat', () => { expect(ReservationService.canReserve('A1', '2026-03-11', 'u3', [fixedA1], []).allowed).toBe(false); });
    it('blocks seat taken by another', () => { expect(ReservationService.canReserve('B2', '2026-03-11', 'u3', [], [res]).allowed).toBe(false); });
    it('allows re-reservation of own seat', () => { expect(ReservationService.canReserve('B2', '2026-03-11', 'u2', [], [res]).allowed).toBe(true); });
  });
  describe('canRelease()', () => {
    it('allows owner to release', () => { expect(ReservationService.canRelease('B2', '2026-03-11', 'u2', [res]).allowed).toBe(true); });
    it('blocks non-owner', () => { expect(ReservationService.canRelease('B2', '2026-03-11', 'u3', [res]).allowed).toBe(false); });
  });
});
