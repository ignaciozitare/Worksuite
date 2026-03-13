import { describe, it, expect } from 'vitest';
import { ReservationService, SeatReservation, FixedAssignment } from '../HotDesk.js';

const fixedA1 = new FixedAssignment('A1', 'u1', 'Elena');
const res = SeatReservation.reconstitute({
  id: 'r1', seatId: 'B2', userId: 'u2', userName: 'Carlos',
  date: '2026-03-11', createdAt: new Date().toISOString(),
});

describe('ReservationService', () => {
  describe('isWeekend()', () => {
    it('returns true for Saturday', () => {
      expect(ReservationService.isWeekend('2026-03-14')).toBe(true);
    });
    it('returns true for Sunday', () => {
      expect(ReservationService.isWeekend('2026-03-15')).toBe(true);
    });
    it('returns false for Monday', () => {
      expect(ReservationService.isWeekend('2026-03-09')).toBe(false);
    });
  });

  describe('canReserve()', () => {
    it('allows reservation on a free weekday seat', () => {
      const result = ReservationService.canReserve('B3', '2026-03-11', 'u3', [], []);
      expect(result.allowed).toBe(true);
    });

    it('blocks reservation on weekend', () => {
      const result = ReservationService.canReserve('B3', '2026-03-14', 'u3', [], []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/weekend/i);
    });

    it('blocks reservation on fixed seat', () => {
      const result = ReservationService.canReserve('A1', '2026-03-11', 'u3', [fixedA1], []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/permanently assigned/i);
    });

    it('blocks reservation on seat occupied by another user', () => {
      const result = ReservationService.canReserve('B2', '2026-03-11', 'u3', [], [res]);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/another user/i);
    });

    it('allows re-reservation of own seat (idempotent)', () => {
      const result = ReservationService.canReserve('B2', '2026-03-11', 'u2', [], [res]);
      expect(result.allowed).toBe(true);
    });
  });

  describe('canRelease()', () => {
    it('allows owner to release their reservation', () => {
      const result = ReservationService.canRelease('B2', '2026-03-11', 'u2', [res]);
      expect(result.allowed).toBe(true);
    });

    it('blocks non-owner from releasing', () => {
      const result = ReservationService.canRelease('B2', '2026-03-11', 'u3', [res]);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/own reservation/i);
    });

    it('blocks release when no reservation exists', () => {
      const result = ReservationService.canRelease('C1', '2026-03-11', 'u2', []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/No reservation/i);
    });
  });

  describe('SeatReservation.create()', () => {
    it('creates with valid data', () => {
      const r = SeatReservation.create('A2', 'u1', 'Elena', '2026-03-11');
      expect(r.seatId).toBe('A2');
      expect(r.id).toMatch(/^res-/);
    });

    it('throws for invalid date', () => {
      expect(() => SeatReservation.create('A2', 'u1', 'Elena', '11-03-2026')).toThrow('Invalid date format');
    });
  });
});
