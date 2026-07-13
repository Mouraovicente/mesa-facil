/**
 * Estado da conversa guardado em memória entre turnos, por sessão. O
 * usuário costuma completar as entidades aos poucos ("quero reservar" ->
 * "pra quando?" -> "sexta 20h, 4 pessoas"), então cada turno mescla o que
 * o LLM extraiu por cima do que já se sabia.
 */

export interface ReservationDraft {
  readonly date: string;
  readonly time: string;
  readonly partySize: number;
  readonly name: string;
  readonly phone?: string;
}

export interface SessionState {
  readonly date?: string;
  readonly time?: string;
  readonly partySize?: number;
  readonly name?: string;
  readonly phone?: string;
  /** true quando o concierge já perguntou "posso confirmar?" e aguarda sim/não. */
  readonly awaitingConfirmation?: boolean;
  readonly draft?: ReservationDraft;
}

export interface SessionStore {
  get(sessionId: string): SessionState;
  set(sessionId: string, state: SessionState): void;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  get(sessionId: string): SessionState {
    return this.sessions.get(sessionId) ?? {};
  }

  set(sessionId: string, state: SessionState): void {
    this.sessions.set(sessionId, state);
  }
}
