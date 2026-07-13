import { describe, expect, it } from 'vitest';
import {
  TABLES,
  TIME_SLOTS,
  isValidTimeSlot,
  tablesForPartySize,
  MAX_TABLE_CAPACITY,
  RESTAURANT_NAME,
  RESTAURANT_PHONE,
} from '../../src/domain/restaurant.js';

describe('restaurant domain config', () => {
  it('tem 20 mesas: 8 de 2 lugares, 8 de 4 lugares e 4 de 6 lugares', () => {
    expect(TABLES).toHaveLength(20);
    expect(TABLES.filter((t) => t.capacity === 2)).toHaveLength(8);
    expect(TABLES.filter((t) => t.capacity === 4)).toHaveLength(8);
    expect(TABLES.filter((t) => t.capacity === 6)).toHaveLength(4);
  });

  it('todas as mesas têm id único', () => {
    const ids = TABLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tem 5 horários de 1h entre 18:00 e 22:00 (fecha 23:00)', () => {
    expect(TIME_SLOTS).toEqual(['18:00', '19:00', '20:00', '21:00', '22:00']);
  });

  it('MAX_TABLE_CAPACITY é 6', () => {
    expect(MAX_TABLE_CAPACITY).toBe(6);
  });

  it('isValidTimeSlot reconhece horários válidos e inválidos', () => {
    expect(isValidTimeSlot('19:00')).toBe(true);
    expect(isValidTimeSlot('17:00')).toBe(false);
    expect(isValidTimeSlot('23:00')).toBe(false);
    expect(isValidTimeSlot('qualquer coisa')).toBe(false);
  });

  it('tablesForPartySize retorna apenas mesas que comportam o grupo, da menor para a maior', () => {
    const forThree = tablesForPartySize(3);
    expect(forThree.every((t) => t.capacity >= 3)).toBe(true);
    expect(forThree[0]?.capacity).toBe(4);

    const capacities = forThree.map((t) => t.capacity);
    const sorted = [...capacities].sort((a, b) => a - b);
    expect(capacities).toEqual(sorted);
  });

  it('expõe nome e telefone do restaurante para orientar grupos grandes', () => {
    expect(RESTAURANT_NAME.length).toBeGreaterThan(0);
    expect(RESTAURANT_PHONE.length).toBeGreaterThan(0);
  });
});
