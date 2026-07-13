/**
 * Portas que a camada de aplicação depende de fora (LLM e persistência).
 * Implementações concretas vivem em src/infrastructure.
 */

import type { Reservation } from '../domain/reservations.js';
import type { ConciergeOutcome } from './outcomes.js';
import type { SessionState } from './session-store.js';

export interface ExtractIntentParams {
  readonly message: string;
  readonly session: SessionState;
  /** Data/hora atual (YYYY-MM-DD), para o LLM resolver referências relativas como "amanhã" ou "sexta". */
  readonly today: string;
  /** Preenchido apenas na tentativa de retry, com o erro da tentativa anterior. */
  readonly previousError?: string;
}

export interface RenderReplyParams {
  readonly message: string;
  readonly outcome: ConciergeOutcome;
}

export interface LlmPort {
  /** Deve devolver uma string JSON (ainda não validada) com o formato de Intent. */
  extractIntent(params: ExtractIntentParams): Promise<string>;
  /** Deve devolver o texto final, em tom simpático, apresentado ao usuário. */
  renderReply(params: RenderReplyParams): Promise<string>;
}

export interface ReservationRepository {
  list(): Promise<Reservation[]>;
  add(reservation: Reservation): Promise<void>;
  remove(id: string): Promise<void>;
}
