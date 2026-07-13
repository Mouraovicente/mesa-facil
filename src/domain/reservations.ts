/**
 * Regras de negócio de reservas. Módulo puro: recebe o estado atual das
 * reservas como parâmetro e devolve um resultado — nunca lê nem grava em
 * disco, rede ou qualquer store externo.
 */

import { randomUUID } from 'node:crypto';
import {
  MAX_TABLE_CAPACITY,
  RESTAURANT_PHONE,
  TABLES,
  TIME_SLOTS,
  isValidTimeSlot,
  tablesForPartySize,
  type TimeSlot,
} from './restaurant.js';

export interface Reservation {
  readonly id: string;
  readonly name: string;
  readonly phone?: string;
  readonly date: string;
  readonly time: TimeSlot;
  readonly partySize: number;
  readonly tableId: string;
}

export interface CreateReservationInput {
  readonly name: string;
  readonly phone?: string;
  readonly date: string;
  readonly time: string;
  readonly partySize: number;
}

export interface SlotSuggestion {
  readonly date: string;
  readonly time: TimeSlot;
}

export type CreateReservationResult =
  | { readonly ok: true; readonly reservation: Reservation }
  | { readonly ok: false; readonly reason: 'past-date' }
  | { readonly ok: false; readonly reason: 'invalid-time' }
  | { readonly ok: false; readonly reason: 'party-too-large'; readonly phone: string }
  | { readonly ok: false; readonly reason: 'fully-booked'; readonly suggestions: SlotSuggestion[] };

export interface CancelReservationInput {
  readonly name: string;
  readonly date: string;
  readonly time?: string;
}

export type CancelReservationResult =
  | { readonly ok: true; readonly reservation: Reservation }
  | { readonly ok: false; readonly reason: 'not-found' };

export interface SlotAvailability {
  readonly time: TimeSlot;
  readonly freeTables: number;
  readonly maxPartySize: number;
}

export interface CreateReservationOptions {
  readonly now?: Date;
  readonly idGenerator?: () => string;
}

/** Compara strings no formato YYYY-MM-DD; funciona por ordenação lexicográfica. */
export function isPastDate(date: string, now: Date = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  return date < today;
}

function occupiedTableIds(
  reservations: readonly Reservation[],
  date: string,
  time: string
): ReadonlySet<string> {
  return new Set(
    reservations.filter((r) => r.date === date && r.time === time).map((r) => r.tableId)
  );
}

function findFreeTable(
  reservations: readonly Reservation[],
  date: string,
  time: string,
  partySize: number
) {
  const occupied = occupiedTableIds(reservations, date, time);
  return tablesForPartySize(partySize).find((t) => !occupied.has(t.id));
}

function nearestFreeSlots(
  reservations: readonly Reservation[],
  date: string,
  time: string,
  partySize: number,
  limit = 2
): SlotSuggestion[] {
  const requestedIndex = TIME_SLOTS.indexOf(time as TimeSlot);

  const candidates = TIME_SLOTS.map((slot, index) => ({
    slot,
    distance: Math.abs(index - requestedIndex),
  }))
    .filter((c) => c.slot !== time)
    .sort((a, b) => a.distance - b.distance);

  const suggestions: SlotSuggestion[] = [];
  for (const candidate of candidates) {
    if (findFreeTable(reservations, date, candidate.slot, partySize)) {
      suggestions.push({ date, time: candidate.slot });
    }
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

export function createReservation(
  reservations: readonly Reservation[],
  input: CreateReservationInput,
  options: CreateReservationOptions = {}
): CreateReservationResult {
  const now = options.now ?? new Date();
  const idGenerator = options.idGenerator ?? randomUUID;

  if (input.partySize > MAX_TABLE_CAPACITY) {
    return { ok: false, reason: 'party-too-large', phone: RESTAURANT_PHONE };
  }

  if (isPastDate(input.date, now)) {
    return { ok: false, reason: 'past-date' };
  }

  if (!isValidTimeSlot(input.time)) {
    return { ok: false, reason: 'invalid-time' };
  }

  const table = findFreeTable(reservations, input.date, input.time, input.partySize);
  if (!table) {
    return {
      ok: false,
      reason: 'fully-booked',
      suggestions: nearestFreeSlots(reservations, input.date, input.time, input.partySize),
    };
  }

  const reservation: Reservation = {
    id: idGenerator(),
    name: input.name,
    phone: input.phone,
    date: input.date,
    time: input.time,
    partySize: input.partySize,
    tableId: table.id,
  };

  return { ok: true, reservation };
}

export function cancelReservation(
  reservations: readonly Reservation[],
  input: CancelReservationInput
): CancelReservationResult {
  const normalizedName = input.name.trim().toLowerCase();

  const match = reservations.find(
    (r) =>
      r.name.trim().toLowerCase() === normalizedName &&
      r.date === input.date &&
      (input.time === undefined || r.time === input.time)
  );

  if (!match) {
    return { ok: false, reason: 'not-found' };
  }

  return { ok: true, reservation: match };
}

export function availability(reservations: readonly Reservation[], date: string): SlotAvailability[] {
  return TIME_SLOTS.map((time) => {
    const occupied = occupiedTableIds(reservations, date, time);
    const freeTables = TABLES.filter((t) => !occupied.has(t.id));
    const maxPartySize = freeTables.length > 0 ? Math.max(...freeTables.map((t) => t.capacity)) : 0;
    return { time, freeTables: freeTables.length, maxPartySize };
  });
}
