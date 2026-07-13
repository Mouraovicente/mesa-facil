import { describe, expect, it } from 'vitest';
import { FakeLlm } from '../../src/infrastructure/fake-llm.js';

const TODAY = '2026-07-13';

describe('FakeLlm (modo heurístico, sem roteiro)', () => {
  it('extrai intenção de criação, data, horário, pessoas e nome de uma frase em pt-BR', async () => {
    const llm = new FakeLlm();

    const raw = await llm.extractIntent({
      message: 'quero reservar mesa pra 2026-08-01 as 20:00, 4 pessoas, nome Ana',
      session: {},
      today: TODAY,
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

    const cancel = JSON.parse(
      await llm.extractIntent({ message: 'quero cancelar minha reserva', session: {}, today: TODAY })
    );
    expect(cancel.intent).toBe('cancel');

    const check = JSON.parse(
      await llm.extractIntent({ message: 'quais horários estão disponíveis?', session: {}, today: TODAY })
    );
    expect(check.intent).toBe('check');
  });

  it('mensagens sem palavras-chave reconhecidas caem em "other"', async () => {
    const llm = new FakeLlm();
    const data = JSON.parse(await llm.extractIntent({ message: 'oi, tudo bem?', session: {}, today: TODAY }));
    expect(data.intent).toBe('other');
  });

  it('resolve "hoje" e "amanhã" usando a data atual informada', async () => {
    const llm = new FakeLlm();

    const today = JSON.parse(
      await llm.extractIntent({ message: 'quero reservar pra hoje as 19:00, 2 pessoas', session: {}, today: TODAY })
    );
    expect(today.date).toBe('2026-07-13');

    const tomorrow = JSON.parse(
      await llm.extractIntent({ message: 'quero reservar pra amanhã as 19:00, 2 pessoas', session: {}, today: TODAY })
    );
    expect(tomorrow.date).toBe('2026-07-14');
  });

  it('quando a sessão aguarda confirmação, interpreta sim/não', async () => {
    const llm = new FakeLlm();

    const yes = JSON.parse(
      await llm.extractIntent({
        message: 'sim, confirmo',
        session: { awaitingConfirmation: true },
        today: TODAY,
      })
    );
    expect(yes.confirmed).toBe(true);

    const no = JSON.parse(
      await llm.extractIntent({
        message: 'não, cancela',
        session: { awaitingConfirmation: true },
        today: TODAY,
      })
    );
    expect(no.confirmed).toBe(false);
  });

  it('renderReply nunca lança e devolve texto não vazio para qualquer outcome', async () => {
    const llm = new FakeLlm();
    const reply = await llm.renderReply({ message: 'oi', outcome: { type: 'other' } });
    expect(reply.length).toBeGreaterThan(0);
  });
});
