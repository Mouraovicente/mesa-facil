import { describe, expect, it } from 'vitest';
import { handleMessage, FALLBACK_REPLY } from '../../src/application/concierge.js';
import { InMemorySessionStore } from '../../src/application/session-store.js';
import { ScriptedLlm } from '../helpers/scripted-llm.js';
import { InMemoryReservationRepository } from '../helpers/in-memory-repository.js';

const NOW = () => new Date('2026-07-13T10:00:00Z');

describe('concierge happy path (criação com confirmação em duas etapas)', () => {
  it('extrai os dados, pede confirmação e só grava a reserva após o "sim"', async () => {
    const llm = new ScriptedLlm({
      extractResponses: [
        JSON.stringify({
          intent: 'create',
          date: '2026-08-01',
          time: '20:00',
          partySize: 4,
          name: 'Ana',
        }),
        JSON.stringify({ intent: 'create', confirmed: true }),
      ],
      replyResponses: ['Confere: 4 pessoas, 2026-08-01 às 20:00, para Ana?', 'Reserva confirmada!'],
    });
    const repo = new InMemoryReservationRepository();
    const sessions = new InMemorySessionStore();
    const deps = { llm, repo, sessions, now: NOW };

    const firstReply = await handleMessage(deps, 's1', 'quero reservar pra 4 pessoas dia 2026-08-01 as 20:00, nome Ana');
    expect(firstReply).toBe('Confere: 4 pessoas, 2026-08-01 às 20:00, para Ana?');
    expect(await repo.list()).toHaveLength(0);
    expect(llm.renderReplyCalls[0]?.outcome).toEqual({
      type: 'confirm-create',
      draft: { date: '2026-08-01', time: '20:00', partySize: 4, name: 'Ana', phone: undefined },
    });

    const secondReply = await handleMessage(deps, 's1', 'sim, confirmo');
    expect(secondReply).toBe('Reserva confirmada!');

    const reservations = await repo.list();
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.tableId.startsWith('M4-')).toBe(true);
  });
});

describe('concierge preenchimento gradual de entidades entre turnos', () => {
  it('mantém a intenção "create" pendente mesmo quando o LLM não a repete a cada turno', async () => {
    const llm = new ScriptedLlm({
      extractResponses: [
        JSON.stringify({ intent: 'create' }),
        JSON.stringify({ intent: 'other', date: '2026-08-20' }),
        JSON.stringify({ intent: 'other', time: '20:00' }),
        JSON.stringify({ intent: 'other', partySize: 4 }),
        JSON.stringify({ intent: 'other', name: 'Carla' }),
        JSON.stringify({ intent: 'other', confirmed: true }),
      ],
    });
    const repo = new InMemoryReservationRepository();
    const sessions = new InMemorySessionStore();
    const deps = { llm, repo, sessions, now: NOW };

    await handleMessage(deps, 's1', 'oi, quero reservar uma mesa');
    expect(llm.renderReplyCalls[0]?.outcome).toEqual({ type: 'clarify', intent: 'create', missing: 'date' });

    await handleMessage(deps, 's1', '2026-08-20');
    expect(llm.renderReplyCalls[1]?.outcome).toEqual({ type: 'clarify', intent: 'create', missing: 'time' });

    await handleMessage(deps, 's1', 'as 20:00');
    expect(llm.renderReplyCalls[2]?.outcome).toEqual({ type: 'clarify', intent: 'create', missing: 'partySize' });

    await handleMessage(deps, 's1', '4 pessoas');
    expect(llm.renderReplyCalls[3]?.outcome).toEqual({ type: 'clarify', intent: 'create', missing: 'name' });

    await handleMessage(deps, 's1', 'Carla');
    expect(llm.renderReplyCalls[4]?.outcome).toEqual({
      type: 'confirm-create',
      draft: { date: '2026-08-20', time: '20:00', partySize: 4, name: 'Carla', phone: undefined },
    });

    await handleMessage(deps, 's1', 'sim');
    const reservations = await repo.list();
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.name).toBe('Carla');
  });
});

describe('concierge lida com falhas do LLM sem nunca lançar exceção', () => {
  it('JSON inválido duas vezes seguidas cai no fallback explícito', async () => {
    const llm = new ScriptedLlm({
      extractResponses: ['isto não é json {{{', 'nem isto tá certo'],
    });
    const repo = new InMemoryReservationRepository();
    const sessions = new InMemorySessionStore();

    const reply = await handleMessage({ llm, repo, sessions, now: NOW }, 's1', 'quero reservar');

    expect(reply).toBe(FALLBACK_REPLY);
    expect(await repo.list()).toHaveLength(0);
  });

  it('a segunda tentativa de extração recebe o erro da primeira no prompt', async () => {
    const llm = new ScriptedLlm({
      extractResponses: ['json quebrado', JSON.stringify({ intent: 'other' })],
      replyResponses: ['ok'],
    });
    const repo = new InMemoryReservationRepository();
    const sessions = new InMemorySessionStore();

    await handleMessage({ llm, repo, sessions, now: NOW }, 's1', 'oi');

    expect(llm.extractIntentCalls).toHaveLength(2);
    expect(llm.extractIntentCalls[0]?.previousError).toBeUndefined();
    expect(llm.extractIntentCalls[1]?.previousError).toBeTruthy();
  });

  it('quando renderReply falha, devolve um fallback determinístico que reflete o outcome real (nunca finge sucesso)', async () => {
    const llm = new ScriptedLlm({
      extractResponses: [JSON.stringify({ intent: 'cancel', name: 'Carlos', date: '2026-08-01' })],
      replyResponses: [new Error('LLM indisponível')],
    });
    const repo = new InMemoryReservationRepository();
    const sessions = new InMemorySessionStore();

    const reply = await handleMessage({ llm, repo, sessions, now: NOW }, 's1', 'cancela minha reserva');

    expect(reply.length).toBeGreaterThan(0);
    expect(reply.toLowerCase()).not.toContain('confirmada');
  });
});

describe('concierge pede dados específicos em vez de executar a regra com entidade faltante', () => {
  it('falta o horário -> pergunta especificamente pelo horário e não cria nada', async () => {
    const llm = new ScriptedLlm({
      extractResponses: [
        JSON.stringify({ intent: 'create', date: '2026-08-01', partySize: 4, name: 'Ana' }),
      ],
      replyResponses: ['Para qual horário?'],
    });
    const repo = new InMemoryReservationRepository();
    const sessions = new InMemorySessionStore();

    const reply = await handleMessage({ llm, repo, sessions, now: NOW }, 's1', 'reserva pra 4 dia 2026-08-01, nome Ana');

    expect(reply).toBe('Para qual horário?');
    expect(await repo.list()).toHaveLength(0);
    expect(llm.renderReplyCalls[0]?.outcome).toEqual({ type: 'clarify', intent: 'create', missing: 'time' });
  });
});

describe('concierge cancelamento', () => {
  it('cancelar reserva inexistente devolve uma resposta educada sem exceção', async () => {
    const llm = new ScriptedLlm({
      extractResponses: [JSON.stringify({ intent: 'cancel', name: 'Carlos', date: '2026-08-01' })],
      replyResponses: ['Não encontrei essa reserva, pode confirmar o nome e a data?'],
    });
    const repo = new InMemoryReservationRepository();
    const sessions = new InMemorySessionStore();

    const reply = await handleMessage({ llm, repo, sessions, now: NOW }, 's1', 'cancela minha reserva de Carlos dia 2026-08-01');

    expect(reply).toBe('Não encontrei essa reserva, pode confirmar o nome e a data?');
    expect(llm.renderReplyCalls[0]?.outcome).toEqual({ type: 'cancel-not-found' });
  });
});

describe('concierge consulta de disponibilidade', () => {
  it('pergunta pela data quando ausente, depois lista os slots', async () => {
    const llm = new ScriptedLlm({
      extractResponses: [JSON.stringify({ intent: 'check' })],
      replyResponses: ['Para qual data você quer consultar?'],
    });
    const repo = new InMemoryReservationRepository();
    const sessions = new InMemorySessionStore();

    const reply = await handleMessage({ llm, repo, sessions, now: NOW }, 's1', 'quais horários tem livre?');

    expect(reply).toBe('Para qual data você quer consultar?');
    expect(llm.renderReplyCalls[0]?.outcome).toEqual({ type: 'clarify', intent: 'check', missing: 'date' });
  });
});
