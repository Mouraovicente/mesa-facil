import { describe, expect, it, vi } from 'vitest';
import { OpenRouterLlm } from '../../src/infrastructure/openrouter.js';

function fakeFetchReturning(content: string) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
}

describe('OpenRouterLlm', () => {
  it('envia a chave de API e a mensagem, e devolve o conteúdo da resposta', async () => {
    const fetchFn = fakeFetchReturning('{"intent":"other"}');
    const llm = new OpenRouterLlm({ apiKey: 'test-key', fetchFn: fetchFn as unknown as typeof fetch });

    const result = await llm.extractIntent({ message: 'oi', session: {} });

    expect(result).toBe('{"intent":"other"}');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init?.body as string);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'oi' });
  });

  it('lança um erro claro quando a API responde com status de erro', async () => {
    const fetchFn = vi.fn(async () => new Response('erro', { status: 500 }));
    const llm = new OpenRouterLlm({ apiKey: 'test-key', fetchFn: fetchFn as unknown as typeof fetch });

    await expect(llm.extractIntent({ message: 'oi', session: {} })).rejects.toThrow();
  });

  it('renderReply também usa a porta HTTP e devolve o texto da resposta', async () => {
    const fetchFn = fakeFetchReturning('Reserva confirmada!');
    const llm = new OpenRouterLlm({ apiKey: 'test-key', fetchFn: fetchFn as unknown as typeof fetch });

    const result = await llm.renderReply({ message: 'sim', outcome: { type: 'other' } });

    expect(result).toBe('Reserva confirmada!');
  });
});
