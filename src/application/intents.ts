/**
 * Esquema de saída estruturada que o LLM deve produzir ao interpretar a
 * mensagem do usuário. O LLM só classifica intenção e extrai entidades —
 * a validação aqui é o único portão de confiança entre o texto livre do
 * modelo e o resto da aplicação.
 */

import { z } from 'zod';

const KNOWN_INTENTS = ['create', 'cancel', 'check', 'other'] as const;

export type IntentName = (typeof KNOWN_INTENTS)[number];

const RawIntentSchema = z.object({
  intent: z.string(),
  date: z.string().optional(),
  time: z.string().optional(),
  partySize: z.number().int().positive().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  /** Usado apenas quando a sessão está aguardando confirmação de reserva. */
  confirmed: z.boolean().optional(),
});

export interface Intent {
  readonly intent: IntentName;
  readonly date?: string;
  readonly time?: string;
  readonly partySize?: number;
  readonly name?: string;
  readonly phone?: string;
  readonly confirmed?: boolean;
}

export type ParseIntentResult =
  | { readonly success: true; readonly data: Intent }
  | { readonly success: false; readonly error: string };

/**
 * Valida a saída bruta do LLM. Uma intenção fora do conjunto conhecido cai
 * em "other" (o modelo pode "inventar" um rótulo novo sem quebrar o
 * contrato); qualquer outro desvio de formato é reportado como falha para
 * que o chamador decida entre tentar de novo ou usar o fallback.
 */
export function parseIntent(payload: unknown): ParseIntentResult {
  const parsed = RawIntentSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const intent: IntentName = (KNOWN_INTENTS as readonly string[]).includes(parsed.data.intent)
    ? (parsed.data.intent as IntentName)
    : 'other';

  return { success: true, data: { ...parsed.data, intent } };
}
