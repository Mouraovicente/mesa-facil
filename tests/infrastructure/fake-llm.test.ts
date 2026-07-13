import { describe, expect, it } from 'vitest';
import { FakeLlm } from '../../src/infrastructure/fake-llm.js';

describe('FakeLlm (modo heurístico, sem roteiro)', () => {
  it('extrai intenção de criação, data, horário, pessoas e nome de uma frase em pt-BR', async () => {
    const llm = new FakeLlm();

    const raw = await llm.extractIntent({
      message: 'quero reservar mesa pra 2026-08-01 as 20:00, 4 pessoas, nome Ana',
      session: {},
    });

    const data = JSON.parse(raw);
    expect(data.intent).toBe('create');
    expect(data.date).toBe('2026-08-01');
    expect(data.time).toBe('20:00');
    expect(data.partySize).toBe(4);
    expect(data.name).toBe('Ana');
  });

  it('reconhece intenção de cancelamento e de consulta de horários', async () => {
    const llm = new FakeLlm();

    const cancel = JSON.parse(await llm.extractIntent({ message: 'quero cancelar minha reserva', session: {} }));
    expect(cancel.intent).toBe('cancel');

    const check = JSON.parse(await llm.extractIntent({ message: 'quais horários estão disponíveis?', session: {} }));
    expect(check.intent).toBe('check');
  });

  it('mensagens sem palavras-chave reconhecidas caem em "other"', async () => {
    const llm = new FakeLlm();
    const data = JSON.parse(await llm.extractIntent({ message: 'oi, tudo bem?', session: {} }));
    expect(data.intent).toBe('other');
  });

  it('quando a sessão aguarda confirmação, interpreta sim/não', async () => {
    const llm = new FakeLlm();

    const yes = JSON.parse(
      await llm.extractIntent({ message: 'sim, confirmo', session: { awaitingConfirmation: true } })
    );
    expect(yes.confirmed).toBe(true);

    const no = JSON.parse(
      await llm.extractIntent({ message: 'não, cancela', session: { awaitingConfirmation: true } })
    );
    expect(no.confirmed).toBe(false);
  });

  it('renderReply nunca lança e devolve texto não vazio para qualquer outcome', async () => {
    const llm = new FakeLlm();
    const reply = await llm.renderReply({ message: 'oi', outcome: { type: 'other' } });
    expect(reply.length).toBeGreaterThan(0);
  });
});
