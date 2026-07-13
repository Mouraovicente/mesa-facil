/**
 * Pipeline do concierge: extractIntent (porta do LLM) -> valida com Zod ->
 * se inválido, 1 retry com o erro no prompt -> se inválido de novo, cai em
 * um fallback fixo (nunca lança exceção) -> entidade faltante gera uma
 * pergunta específica sem executar nenhuma regra -> senão executa a regra
 * determinística de domínio e pede ao LLM (renderReply) para redigir a
 * resposta final em tom simpático.
 */

import { availability, cancelReservation, createReservation } from '../domain/reservations.js';
import { parseIntent, type Intent } from './intents.js';
import type { ConciergeOutcome } from './outcomes.js';
import type { LlmPort, ReservationRepository } from './ports.js';
import type { ReservationDraft, SessionState, SessionStore } from './session-store.js';

export const FALLBACK_REPLY = 'Desculpe, não entendi. Pode reformular o seu pedido?';

const MAX_EXTRACT_ATTEMPTS = 2;

export interface Logger {
  error(message: string, meta?: unknown): void;
}

export interface ConciergeDeps {
  readonly llm: LlmPort;
  readonly repo: ReservationRepository;
  readonly sessions: SessionStore;
  readonly now?: () => Date;
  readonly logger?: Logger;
}

export async function handleMessage(deps: ConciergeDeps, sessionId: string, message: string): Promise<string> {
  const logger = deps.logger ?? console;
  const session = deps.sessions.get(sessionId);
  const today = (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);

  const extraction = await extractValidIntent(deps.llm, message, session, today, logger);
  if (!extraction.ok) {
    // Duas tentativas falharam: nunca lançamos exceção nem fingimos sucesso.
    // O fallback é um texto fixo, fora do alcance de um LLM que já mostrou
    // não estar respondendo de forma confiável nesta rodada.
    return FALLBACK_REPLY;
  }

  const merged = mergeSession(session, extraction.data);
  const { outcome, session: nextSession } = await resolveOutcome(deps, merged, extraction.data);
  deps.sessions.set(sessionId, nextSession);

  try {
    return await deps.llm.renderReply({ message, outcome });
  } catch (err) {
    logger.error('renderReply falhou; usando resposta determinística de reserva', err);
    return deterministicReply(outcome);
  }
}

async function extractValidIntent(
  llm: LlmPort,
  message: string,
  session: SessionState,
  today: string,
  logger: Logger
): Promise<{ ok: true; data: Intent } | { ok: false }> {
  let previousError: string | undefined;

  for (let attempt = 0; attempt < MAX_EXTRACT_ATTEMPTS; attempt += 1) {
    let raw: string;
    try {
      raw = await llm.extractIntent({ message, session, today, previousError });
    } catch (err) {
      previousError = err instanceof Error ? err.message : String(err);
      logger.error('extractIntent lançou um erro', err);
      continue;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      previousError = `resposta não é um JSON válido: ${String(err)}`;
      logger.error('extractIntent devolveu um JSON inválido', raw);
      continue;
    }

    const parsed = parseIntent(payload);
    if (parsed.success) {
      return { ok: true, data: parsed.data };
    }
    previousError = parsed.error;
    logger.error('extractIntent devolveu um payload que falhou na validação', parsed.error);
  }

  return { ok: false };
}

function mergeSession(session: SessionState, intent: Intent): SessionState {
  return {
    ...session,
    date: intent.date ?? session.date,
    time: intent.time ?? session.time,
    partySize: intent.partySize ?? session.partySize,
    name: intent.name ?? session.name,
    phone: intent.phone ?? session.phone,
  };
}

function firstMissingCreateField(session: SessionState): 'date' | 'time' | 'partySize' | 'name' | undefined {
  if (!session.date) return 'date';
  if (!session.time) return 'time';
  if (session.partySize === undefined) return 'partySize';
  if (!session.name) return 'name';
  return undefined;
}

function resetTransactionFields(session: SessionState): SessionState {
  return {
    ...session,
    date: undefined,
    time: undefined,
    partySize: undefined,
    name: undefined,
    phone: undefined,
    draft: undefined,
    awaitingConfirmation: false,
    pendingIntent: undefined,
  };
}

async function resolveOutcome(
  deps: ConciergeDeps,
  session: SessionState,
  intent: Intent
): Promise<{ outcome: ConciergeOutcome; session: SessionState }> {
  const now = (deps.now ?? (() => new Date()))();

  if (session.awaitingConfirmation && session.draft) {
    return resolveConfirmation(deps, session, session.draft, intent, now);
  }

  // Se o LLM não repetir a intenção neste turno (ex.: o usuário só respondeu
  // "4 pessoas" à pergunta anterior), continuamos a intenção pendente da
  // sessão em vez de tratar a mensagem como "other".
  const effectiveIntent = intent.intent !== 'other' ? intent.intent : session.pendingIntent;

  switch (effectiveIntent) {
    case 'create':
      return resolveCreate({ ...session, pendingIntent: 'create' });
    case 'cancel':
      return resolveCancel(deps, { ...session, pendingIntent: 'cancel' });
    case 'check':
      return resolveCheck(deps, { ...session, pendingIntent: 'check' });
    default:
      return { outcome: { type: 'other' }, session };
  }
}

async function resolveConfirmation(
  deps: ConciergeDeps,
  session: SessionState,
  draft: ReservationDraft,
  intent: Intent,
  now: Date
): Promise<{ outcome: ConciergeOutcome; session: SessionState }> {
  if (intent.confirmed === true) {
    const reservations = await deps.repo.list();
    const result = createReservation(reservations, draft, { now });
    const cleared = resetTransactionFields(session);

    if (result.ok) {
      await deps.repo.add(result.reservation);
      return { outcome: { type: 'create-success', reservation: result.reservation }, session: cleared };
    }

    return { outcome: rejectionOutcome(result), session: cleared };
  }

  if (intent.confirmed === false) {
    return { outcome: { type: 'create-cancelled-by-user' }, session: resetTransactionFields(session) };
  }

  // Resposta ambígua: pergunta de novo em vez de assumir qualquer coisa.
  return { outcome: { type: 'confirm-create', draft }, session };
}

function resolveCreate(session: SessionState): { outcome: ConciergeOutcome; session: SessionState } {
  const missing = firstMissingCreateField(session);
  if (missing) {
    return { outcome: { type: 'clarify', intent: 'create', missing }, session };
  }

  const draft: ReservationDraft = {
    date: session.date!,
    time: session.time!,
    partySize: session.partySize!,
    name: session.name!,
    phone: session.phone,
  };

  return {
    outcome: { type: 'confirm-create', draft },
    session: { ...session, awaitingConfirmation: true, draft },
  };
}

async function resolveCancel(
  deps: ConciergeDeps,
  session: SessionState
): Promise<{ outcome: ConciergeOutcome; session: SessionState }> {
  if (!session.name) {
    return { outcome: { type: 'clarify', intent: 'cancel', missing: 'name' }, session };
  }
  if (!session.date) {
    return { outcome: { type: 'clarify', intent: 'cancel', missing: 'date' }, session };
  }

  const reservations = await deps.repo.list();
  const result = cancelReservation(reservations, { name: session.name, date: session.date, time: session.time });

  if (!result.ok) {
    return { outcome: { type: 'cancel-not-found' }, session };
  }

  await deps.repo.remove(result.reservation.id);
  return { outcome: { type: 'cancel-success', reservation: result.reservation }, session: resetTransactionFields(session) };
}

async function resolveCheck(
  deps: ConciergeDeps,
  session: SessionState
): Promise<{ outcome: ConciergeOutcome; session: SessionState }> {
  if (!session.date) {
    return { outcome: { type: 'clarify', intent: 'check', missing: 'date' }, session };
  }

  const reservations = await deps.repo.list();
  const slots = availability(reservations, session.date);
  return { outcome: { type: 'availability', date: session.date, slots }, session };
}

function rejectionOutcome(
  result: Extract<ReturnType<typeof createReservation>, { ok: false }>
): ConciergeOutcome {
  switch (result.reason) {
    case 'past-date':
      return { type: 'create-rejected-past-date' };
    case 'invalid-time':
      return { type: 'create-rejected-invalid-time' };
    case 'party-too-large':
      return { type: 'create-rejected-party-too-large', phone: result.phone };
    case 'fully-booked':
      return { type: 'create-rejected-fully-booked', suggestions: result.suggestions };
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

/**
 * Usado só quando o próprio renderReply (o LLM) falha. É determinístico e
 * reflete fielmente o outcome real — nunca finge que algo deu certo quando
 * não deu.
 */
function deterministicReply(outcome: ConciergeOutcome): string {
  switch (outcome.type) {
    case 'create-success':
      return `Reserva confirmada para ${outcome.reservation.name} em ${outcome.reservation.date} às ${outcome.reservation.time} (mesa ${outcome.reservation.tableId}).`;
    case 'cancel-success':
      return `A reserva de ${outcome.reservation.name} em ${outcome.reservation.date} foi cancelada.`;
    case 'cancel-not-found':
      return 'Não encontramos essa reserva para cancelar. Pode confirmar nome e data?';
    case 'create-rejected-fully-booked':
      return 'Esse horário está lotado.';
    case 'create-rejected-past-date':
      return 'Não é possível reservar em uma data que já passou.';
    case 'create-rejected-invalid-time':
      return 'Esse horário não está disponível. Atendemos das 18:00 às 23:00.';
    case 'create-rejected-party-too-large':
      return `Para grupos grandes, por favor ligue para ${outcome.phone}.`;
    case 'confirm-create':
      return 'Pode confirmar os dados da reserva?';
    case 'create-cancelled-by-user':
      return 'Tudo bem, a reserva não foi realizada.';
    case 'availability':
      return 'Aqui estão os horários disponíveis.';
    case 'clarify':
      return 'Pode me dar mais um detalhe, por favor?';
    case 'other':
    default:
      return 'Posso ajudar a reservar, cancelar ou consultar horários. O que você precisa?';
  }
}
