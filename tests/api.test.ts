import { describe, expect, it } from 'vitest';
import { buildApi } from '../src/api.js';
import { FakeLlm } from '../src/infrastructure/fake-llm.js';
import { InMemoryReservationRepository } from './helpers/in-memory-repository.js';

// Data sempre no futuro (o app rejeita datas passadas); evita bomba-relógio.
const futureDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

describe('POST /chat', () => {
  it('devolve uma resposta em texto para uma mensagem válida', async () => {
    const app = buildApi({ llm: new FakeLlm(), repo: new InMemoryReservationRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { sessionId: 'abc', message: 'oi' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.reply).toBe('string');
    expect(body.reply.length).toBeGreaterThan(0);

    await app.close();
  });

  it('rejeita payload sem sessionId ou message com 400', async () => {
    const app = buildApi({ llm: new FakeLlm(), repo: new InMemoryReservationRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { message: 'oi' },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('mantém o contexto da conversa entre duas chamadas com o mesmo sessionId', async () => {
    const app = buildApi({ llm: new FakeLlm(), repo: new InMemoryReservationRepository() });

    await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { sessionId: 'sticky', message: `quero reservar mesa pra ${futureDate} as 20:00, 2 pessoas, nome Bia` },
    });

    const second = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: { sessionId: 'sticky', message: 'sim, confirmo' },
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().reply.toLowerCase()).toContain('confirmada');

    await app.close();
  });
});

describe('GET /', () => {
  it('serve a página de chat em HTML', async () => {
    const app = buildApi({ llm: new FakeLlm(), repo: new InMemoryReservationRepository() });

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<html');

    await app.close();
  });
});
