import { describe, expect, it } from 'vitest';
import { parseIntent } from '../../src/application/intents.js';

describe('parseIntent', () => {
  it('faz o parse de um payload válido de criação de reserva', () => {
    const result = parseIntent({
      intent: 'create',
      date: '2026-08-01',
      time: '20:00',
      partySize: 4,
      name: 'Ana',
    });

    expect(result).toEqual({
      success: true,
      data: {
        intent: 'create',
        date: '2026-08-01',
        time: '20:00',
        partySize: 4,
        name: 'Ana',
      },
    });
  });

  it('uma intenção desconhecida cai em "other" em vez de falhar', () => {
    const result = parseIntent({ intent: 'bater-papo' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe('other');
    }
  });

  it('rejeita payload malformado (tipo errado em partySize)', () => {
    const result = parseIntent({ intent: 'create', partySize: 'quatro' });

    expect(result.success).toBe(false);
  });

  it('rejeita payload que não é um objeto', () => {
    const result = parseIntent('não é json');

    expect(result.success).toBe(false);
  });
});
