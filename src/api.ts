/**
 * Camada mais externa (Clean Architecture): expõe o concierge via HTTP com
 * Fastify e serve a página de chat estática. Quando executado diretamente
 * (`node dist/api.js` ou `tsx src/api.ts`), também é a composition root que
 * decide, a partir de variáveis de ambiente, quais adaptadores usar.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { z } from 'zod';
import { handleMessage } from './application/concierge.js';
import { InMemorySessionStore } from './application/session-store.js';
import type { LlmPort, ReservationRepository } from './application/ports.js';
import { FakeLlm } from './infrastructure/fake-llm.js';
import { OpenRouterLlm } from './infrastructure/openrouter.js';
import { JsonReservationRepository } from './infrastructure/json-repo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ChatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

export interface BuildApiOptions {
  readonly llm: LlmPort;
  readonly repo: ReservationRepository;
}

export function buildApi(options: BuildApiOptions) {
  const app = Fastify({ logger: false });
  const sessions = new InMemorySessionStore();

  app.get('/', async (_request, reply) => {
    const html = await readFile(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/chat', async (request, reply) => {
    const parseResult = ChatRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Payload inválido. Envie { sessionId, message }.' };
    }

    const { sessionId, message } = parseResult.data;
    const text = await handleMessage({ llm: options.llm, repo: options.repo, sessions }, sessionId, message);
    return { reply: text };
  });

  return app;
}

function createLlmFromEnv(): LlmPort {
  const provider = process.env.LLM ?? 'fake';

  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY precisa estar definida quando LLM=openrouter');
    }
    return new OpenRouterLlm({ apiKey, model: process.env.OPENROUTER_MODEL });
  }

  return new FakeLlm();
}

function createRepoFromEnv(): ReservationRepository {
  const filePath = process.env.DATA_FILE ?? path.join(__dirname, '..', 'data', 'reservations.json');
  return new JsonReservationRepository(filePath);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const app = buildApi({ llm: createLlmFromEnv(), repo: createRepoFromEnv() });
  const port = Number(process.env.PORT ?? 3000);

  app
    .listen({ port, host: '0.0.0.0' })
    .then(() => {
      // eslint-disable-next-line no-console
      console.log(`mesa-facil rodando em http://localhost:${port} (LLM=${process.env.LLM ?? 'fake'})`);
    })
    .catch((err) => {
      console.error('Falha ao iniciar o servidor', err);
      process.exit(1);
    });
}
