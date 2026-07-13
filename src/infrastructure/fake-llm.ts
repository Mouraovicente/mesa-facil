/**
 * Implementação de LlmPort 100% offline, sem nenhuma chamada de rede.
 * Usada quando a variável de ambiente LLM=fake (modo padrão), útil para
 * rodar a aplicação localmente sem uma chave de API.
 *
 * As heurísticas aqui são propositalmente simples (regex e palavras-chave):
 * o objetivo é ter uma demonstração funcional fim a fim, não competir com
 * um LLM de verdade. Para produção, use OpenRouterLlm (LLM=openrouter).
 */

import type { ExtractIntentParams, LlmPort, RenderReplyParams } from '../application/ports.js';
import type { ConciergeOutcome } from '../application/outcomes.js';

export class FakeLlm implements LlmPort {
  async extractIntent(params: ExtractIntentParams): Promise<string> {
    return JSON.stringify(heuristicExtract(params));
  }

  async renderReply(params: RenderReplyParams): Promise<string> {
    return heuristicReply(params.outcome);
  }
}

function heuristicExtract({ message, session }: ExtractIntentParams): Record<string, unknown> {
  const text = message.toLowerCase();

  if (session.awaitingConfirmation) {
    const result: Record<string, unknown> = { intent: 'create' };
    if (/\b(sim|confirmo|confirmar|isso mesmo|pode ser)\b/.test(text)) result.confirmed = true;
    else if (/\b(não|nao|cancela|errado)\b/.test(text)) result.confirmed = false;
    return result;
  }

  const result: Record<string, unknown> = { intent: detectIntent(text) };

  const date = extractDate(text);
  if (date) result.date = date;

  const time = extractTime(text);
  if (time) result.time = time;

  const partySize = extractPartySize(text);
  if (partySize) result.partySize = partySize;

  const name = extractName(message);
  if (name) result.name = name;

  return result;
}

function detectIntent(text: string): 'create' | 'cancel' | 'check' | 'other' {
  if (/cancel/.test(text)) return 'cancel';
  if (/(hor[aá]rio|dispon[ií]vel|livre|vaga)/.test(text)) return 'check';
  if (/reserv/.test(text)) return 'create';
  return 'other';
}

function extractDate(text: string): string | undefined {
  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const brMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;

  return undefined;
}

function extractTime(text: string): string | undefined {
  const match = text.match(/\b(\d{1,2})[:h](\d{2})?\b/);
  if (!match) return undefined;
  const hour = match[1]!.padStart(2, '0');
  const minutes = match[2] ?? '00';
  return `${hour}:${minutes}`;
}

function extractPartySize(text: string): number | undefined {
  const match = text.match(/(\d+)\s*pessoas?/);
  return match ? Number(match[1]) : undefined;
}

function extractName(message: string): string | undefined {
  const match = message.match(/nome[:\s]+([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]*)/i);
  return match ? match[1]!.trim().split(/[,.;]/)[0]?.trim() : undefined;
}

function heuristicReply(outcome: ConciergeOutcome): string {
  switch (outcome.type) {
    case 'confirm-create':
      return `Posso confirmar: ${outcome.draft.partySize} pessoa(s) em ${outcome.draft.date} às ${outcome.draft.time}, em nome de ${outcome.draft.name}? (sim/não)`;
    case 'create-success':
      return `Prontinho! Reserva confirmada para ${outcome.reservation.name}, ${outcome.reservation.date} às ${outcome.reservation.time}. Até lá!`;
    case 'create-cancelled-by-user':
      return 'Sem problemas, não vou fazer a reserva. Posso ajudar em algo mais?';
    case 'create-rejected-past-date':
      return 'Essa data já passou, não é possível reservar. Pode me dizer outra data?';
    case 'create-rejected-invalid-time':
      return 'Esse horário não está disponível — atendemos das 18:00 às 23:00, em slots de 1h.';
    case 'create-rejected-party-too-large':
      return `Para grupos a partir de 7 pessoas, por favor ligue para ${outcome.phone} para combinarmos os detalhes.`;
    case 'create-rejected-fully-booked': {
      const options = outcome.suggestions.map((s) => s.time).join(' ou ');
      return options
        ? `Esse horário está lotado. Temos vaga às ${options} nesse mesmo dia, prefere algum desses?`
        : 'Esse horário está lotado e não encontrei outro horário livre nesse dia, sinto muito.';
    }
    case 'cancel-success':
      return `Cancelei a reserva de ${outcome.reservation.name} em ${outcome.reservation.date}. Qualquer coisa, é só chamar!`;
    case 'cancel-not-found':
      return 'Não encontrei essa reserva. Pode confirmar o nome e a data usados na reserva?';
    case 'availability': {
      const free = outcome.slots.filter((s) => s.freeTables > 0);
      if (free.length === 0) return `Infelizmente não há horários livres em ${outcome.date}.`;
      const list = free.map((s) => `${s.time} (até ${s.maxPartySize} pessoas)`).join(', ');
      return `Horários livres em ${outcome.date}: ${list}.`;
    }
    case 'clarify':
      return clarifyQuestion(outcome.missing);
    case 'other':
    default:
      return 'Posso ajudar a reservar uma mesa, cancelar uma reserva ou consultar horários disponíveis. O que você precisa?';
  }
}

function clarifyQuestion(missing: 'date' | 'time' | 'partySize' | 'name'): string {
  switch (missing) {
    case 'date':
      return 'Para qual data?';
    case 'time':
      return 'Para qual horário (entre 18:00 e 22:00)?';
    case 'partySize':
      return 'Para quantas pessoas?';
    case 'name':
      return 'Em nome de quem fica a reserva?';
    default:
      return 'Pode me dar mais um detalhe?';
  }
}
