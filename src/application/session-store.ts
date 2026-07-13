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
  /**
   * Intenção em andamento (create/cancel/check) enquanto o usuário ainda
   * está completando os dados aos poucos. Sem isso, uma mensagem de
   * acompanhamento que não repete a intenção (ex.: apenas "4 pessoas" em
   * resposta a "para quantas pessoas?") seria classificada como "other" e
   * perderia o fio da conversa.
   */
  readonly pendingIntent?: 'create' | 'cancel' | 'check';
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
