import type {
  ExtractIntentParams,
  LlmPort,
  RenderReplyParams,
} from '../../src/application/ports.js';

export type ScriptedResponse = string | Error;

export interface ScriptedLlmOptions {
  readonly extractResponses?: ScriptedResponse[];
  readonly replyResponses?: ScriptedResponse[];
}

/**
 * Dublê de teste para LlmPort: consome respostas pré-roteirizadas de uma
 * fila (string ou Error) e grava os parâmetros de cada chamada, para que
 * os testes possam inspecionar o que o concierge pediu ao "LLM".
 */
export class ScriptedLlm implements LlmPort {
  readonly extractIntentCalls: ExtractIntentParams[] = [];
  readonly renderReplyCalls: RenderReplyParams[] = [];

  private readonly extractQueue: ScriptedResponse[];
  private readonly replyQueue: ScriptedResponse[];

  constructor(options: ScriptedLlmOptions = {}) {
    this.extractQueue = [...(options.extractResponses ?? [])];
    this.replyQueue = [...(options.replyResponses ?? [])];
  }

  async extractIntent(params: ExtractIntentParams): Promise<string> {
    this.extractIntentCalls.push(params);
    const next = this.extractQueue.shift();
    if (next === undefined) {
      throw new Error('ScriptedLlm: sem respostas de extractIntent roteirizadas restantes');
    }
    if (next instanceof Error) throw next;
    return next;
  }

  async renderReply(params: RenderReplyParams): Promise<string> {
    this.renderReplyCalls.push(params);
    const next = this.replyQueue.shift();
    if (next === undefined) {
      return `[${params.outcome.type}]`;
    }
    if (next instanceof Error) throw next;
    return next;
  }
}
