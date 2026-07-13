/**
 * Persistência de reservas em um arquivo JSON no disco. Implementação
 * simples e adequada a um projeto de portfólio: lê o arquivo inteiro,
 * altera em memória e regrava — sem lock de concorrência.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Reservation } from '../domain/reservations.js';
import type { ReservationRepository } from '../application/ports.js';

export class JsonReservationRepository implements ReservationRepository {
  constructor(private readonly filePath: string) {}

  async list(): Promise<Reservation[]> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as Reservation[];
    } catch (err) {
      if (isFileNotFoundError(err)) return [];
      throw err;
    }
  }

  async add(reservation: Reservation): Promise<void> {
    const reservations = await this.list();
    reservations.push(reservation);
    await this.persist(reservations);
  }

  async remove(id: string): Promise<void> {
    const reservations = await this.list();
    await this.persist(reservations.filter((r) => r.id !== id));
  }

  private async persist(reservations: Reservation[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(reservations, null, 2), 'utf-8');
  }
}

function isFileNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
