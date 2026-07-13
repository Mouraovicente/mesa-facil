import type { Reservation } from '../../src/domain/reservations.js';
import type { ReservationRepository } from '../../src/application/ports.js';

export class InMemoryReservationRepository implements ReservationRepository {
  private reservations: Reservation[];

  constructor(initial: Reservation[] = []) {
    this.reservations = [...initial];
  }

  async list(): Promise<Reservation[]> {
    return [...this.reservations];
  }

  async add(reservation: Reservation): Promise<void> {
    this.reservations.push(reservation);
  }

  async remove(id: string): Promise<void> {
    this.reservations = this.reservations.filter((r) => r.id !== id);
  }
}
