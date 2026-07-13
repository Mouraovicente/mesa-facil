import { describe, expect, it } from 'vitest';
import { TABLES } from '../../src/domain/restaurant.js';
import {
  createReservation,
  cancelReservation,
  availability,
  type Reservation,
} from '../../src/domain/reservations.js';

const NOW = new Date('2026-07-13T10:00:00Z');
const FUTURE_DATE = '2026-08-01';
const PAST_DATE = '2020-01-01';

function reservationForEveryTable(date: string, time: string): Reservation[] {
  return TABLES.map((table, index) => ({
    id: `seed-${index}`,
    name: `Cliente ${index}`,
    date,
    time: time as Reservation['time'],
    partySize: table.capacity,
    tableId: table.id,
  }));
}

describe('createReservation', () => {
  it('aloca a menor mesa que comporta o grupo (2 pessoas -> mesa de 2, não de 6)', () => {
    const result = createReservation(
      [],
      { name: 'Ana', date: FUTURE_DATE, time: '19:00', partySize: 2 },
      { now: NOW, idGenerator: () => 'r1' }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reservation.tableId.startsWith('M2-')).toBe(true);
    }
  });

  it('rejeita reserva em data passada', () => {
    const result = createReservation(
      [],
      { name: 'Ana', date: PAST_DATE, time: '19:00', partySize: 2 },
      { now: NOW }
    );

    expect(result).toEqual({ ok: false, reason: 'past-date' });
  });

  it('rejeita horário fora dos slots válidos', () => {
    const result = createReservation(
      [],
      { name: 'Ana', date: FUTURE_DATE, time: '17:00', partySize: 2 },
      { now: NOW }
    );

    expect(result).toEqual({ ok: false, reason: 'invalid-time' });
  });

  it('grupos de 7+ pessoas são orientados a ligar por telefone', () => {
    const result = createReservation(
      [],
      { name: 'Ana', date: FUTURE_DATE, time: '19:00', partySize: 7 },
      { now: NOW }
    );

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'party-too-large') {
      expect(result.phone.length).toBeGreaterThan(0);
    } else {
      throw new Error('esperava reason "party-too-large"');
    }
  });

  it('slot lotado rejeita e sugere os 2 horários livres mais próximos na mesma data', () => {
    const existing = reservationForEveryTable(FUTURE_DATE, '19:00');

    const result = createReservation(
      existing,
      { name: 'Ana', date: FUTURE_DATE, time: '19:00', partySize: 2 },
      { now: NOW }
    );

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'fully-booked') {
      expect(result.suggestions).toEqual([
        { date: FUTURE_DATE, time: '18:00' },
        { date: FUTURE_DATE, time: '20:00' },
      ]);
    } else {
      throw new Error('esperava reason "fully-booked"');
    }
  });
});

describe('cancelReservation', () => {
  it('cancela uma reserva existente por nome e data', () => {
    const existing: Reservation[] = [
      { id: 'r1', name: 'Ana', date: FUTURE_DATE, time: '19:00', partySize: 2, tableId: 'M2-1' },
    ];

    const result = cancelReservation(existing, { name: 'Ana', date: FUTURE_DATE });

    expect(result).toEqual({ ok: true, reservation: existing[0] });
  });

  it('retorna not-found ao tentar cancelar reserva inexistente', () => {
    const result = cancelReservation([], { name: 'Bob', date: FUTURE_DATE });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('availability', () => {
  it('lista os slots corretos com todas as mesas livres quando não há reservas', () => {
    const slots = availability([], FUTURE_DATE);

    expect(slots).toEqual([
      { time: '18:00', freeTables: 20, maxPartySize: 6 },
      { time: '19:00', freeTables: 20, maxPartySize: 6 },
      { time: '20:00', freeTables: 20, maxPartySize: 6 },
      { time: '21:00', freeTables: 20, maxPartySize: 6 },
      { time: '22:00', freeTables: 20, maxPartySize: 6 },
    ]);
  });

  it('reduz apenas o slot ocupado quando existem reservas', () => {
    const existing: Reservation[] = [
      { id: 'r1', name: 'Ana', date: FUTURE_DATE, time: '19:00', partySize: 2, tableId: 'M2-1' },
    ];

    const slots = availability(existing, FUTURE_DATE);
    const slot19 = slots.find((s) => s.time === '19:00');
    const slot18 = slots.find((s) => s.time === '18:00');

    expect(slot19?.freeTables).toBe(19);
    expect(slot18?.freeTables).toBe(20);
  });
});
