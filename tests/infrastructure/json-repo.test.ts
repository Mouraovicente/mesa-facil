import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonReservationRepository } from '../../src/infrastructure/json-repo.js';
import type { Reservation } from '../../src/domain/reservations.js';

let dir: string;
let filePath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mesa-facil-'));
  filePath = path.join(dir, 'reservations.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function sampleReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: randomUUID(),
    name: 'Ana',
    date: '2026-08-01',
    time: '19:00',
    partySize: 2,
    tableId: 'M2-1',
    ...overrides,
  };
}

describe('JsonReservationRepository', () => {
  it('devolve lista vazia quando o arquivo ainda não existe', async () => {
    const repo = new JsonReservationRepository(filePath);
    expect(await repo.list()).toEqual([]);
  });

  it('persiste uma reserva adicionada e a devolve em list()', async () => {
    const repo = new JsonReservationRepository(filePath);
    const reservation = sampleReservation();

    await repo.add(reservation);

    expect(await repo.list()).toEqual([reservation]);
  });

  it('reflete os dados no disco: uma nova instância lendo o mesmo arquivo enxerga a reserva', async () => {
    const repo = new JsonReservationRepository(filePath);
    const reservation = sampleReservation();
    await repo.add(reservation);

    const otherInstance = new JsonReservationRepository(filePath);
    expect(await otherInstance.list()).toEqual([reservation]);
  });

  it('remove uma reserva pelo id', async () => {
    const repo = new JsonReservationRepository(filePath);
    const a = sampleReservation({ id: 'a' });
    const b = sampleReservation({ id: 'b' });
    await repo.add(a);
    await repo.add(b);

    await repo.remove('a');

    expect(await repo.list()).toEqual([b]);
  });
});
