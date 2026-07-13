/**
 * Resultado estruturado de um turno do concierge. O pipeline nunca decide
 * o texto final aqui — apenas descreve, em dados, o que de fato aconteceu
 * (regra executada, dado faltante, erro etc.) para que a camada de
 * apresentação (o LLM, via renderReply) redija a resposta em tom simpático.
 */

import type { Reservation, SlotAvailability, SlotSuggestion } from '../domain/reservations.js';
import type { ReservationDraft } from './session-store.js';

export type ConciergeOutcome =
  | { readonly type: 'clarify'; readonly intent: 'create' | 'cancel' | 'check'; readonly missing: 'date' | 'time' | 'partySize' | 'name' }
  | { readonly type: 'confirm-create'; readonly draft: ReservationDraft }
  | { readonly type: 'create-success'; readonly reservation: Reservation }
  | { readonly type: 'create-rejected-past-date' }
  | { readonly type: 'create-rejected-invalid-time' }
  | { readonly type: 'create-rejected-party-too-large'; readonly phone: string }
  | { readonly type: 'create-rejected-fully-booked'; readonly suggestions: SlotSuggestion[] }
  | { readonly type: 'create-cancelled-by-user' }
  | { readonly type: 'cancel-success'; readonly reservation: Reservation }
  | { readonly type: 'cancel-not-found' }
  | { readonly type: 'availability'; readonly date: string; readonly slots: SlotAvailability[] }
  | { readonly type: 'other' };
