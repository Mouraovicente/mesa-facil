/**
 * Adaptador real de LlmPort, via API da OpenRouter (https://openrouter.ai).
 * Usado quando LLM=openrouter. Não é exercitado com rede de verdade nos
 * testes: `fetchFn` é injetável para permitir mocks 100% offline.
 */

import type { ConciergeOutcome } from '../application/outcomes.js';
import type { ExtractIntentParams, LlmPort, RenderReplyParams } from '../application/ports.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchFn?: typeof fetch;
}

interface OpenRouterChatResponse {
  readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string } }>;
}

export class OpenRouterLlm implements LlmPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async extractIntent(params: ExtractIntentParams): Promise<string> {
    return this.complete(buildExtractSystemPrompt(params), params.message);
  }

  async renderReply(params: RenderReplyParams): Promise<string> {
    return this.complete(buildReplySystemPrompt(params.outcome), params.message);
  }

  private async complete(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.fetchFn(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter respondeu com status ${response.status}`);
    }

    const data = (await response.json()) as OpenRouterChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta da OpenRouter não trouxe conteúdo');
    }
    return content;
  }
}

function buildExtractSystemPrompt(params: ExtractIntentParams): string {
  const retryHint = params.previousError
    ? `\n\nA tentativa anterior falhou com este erro: "${params.previousError}". Responda de novo, só com um JSON válido no formato pedido.`
    : '';

  return [
    'Você é o classificador de intenção de um concierge de reservas de restaurante.',
    'Devolva SOMENTE um JSON (sem markdown, sem texto ao redor) com os campos:',
    '{ "intent": "create" | "cancel" | "check" | "other",',
    '  "date"?: "YYYY-MM-DD", "time"?: "HH:MM", "partySize"?: number,',
    '  "name"?: string, "phone"?: string, "confirmed"?: boolean }',
    'Extraia só o que a mensagem realmente disser. Não invente valores.',
    `A data de hoje é ${params.today}; use-a para resolver datas relativas ("amanhã", "sexta").`,
    `Contexto já conhecido da sessão: ${JSON.stringify(params.session)}.`,
    'Se a sessão já tem uma intenção em andamento (pendingIntent) e esta',
    'mensagem só completa um dado (ex.: responde "4 pessoas" a uma pergunta',
    'sobre quantidade), repita essa intenção em vez de "other".',
    retryHint,
  ].join('\n');
}

function buildReplySystemPrompt(outcome: ConciergeOutcome): string {
  return [
    'Você é um atendente simpático e objetivo de um restaurante.',
    'Redija, em português do Brasil, uma resposta curta e cordial para o',
    'cliente com base neste resultado (dado já decidido pelo sistema —',
    'você só escreve o texto, não decide regras de negócio):',
    JSON.stringify(outcome),
  ].join('\n');
}
