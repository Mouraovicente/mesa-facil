/**
 * Configuração estática do restaurante. Módulo puro: nenhuma função aqui
 * depende de I/O, relógio ou estado externo.
 */

export interface Table {
  readonly id: string;
  readonly capacity: number;
}

function buildTables(): Table[] {
  const tables: Table[] = [];
  for (let i = 1; i <= 8; i += 1) tables.push({ id: `M2-${i}`, capacity: 2 });
  for (let i = 1; i <= 8; i += 1) tables.push({ id: `M4-${i}`, capacity: 4 });
  for (let i = 1; i <= 4; i += 1) tables.push({ id: `M6-${i}`, capacity: 6 });
  return tables;
}

/** 20 mesas no total: 8 de 2 lugares, 8 de 4 lugares e 4 de 6 lugares. */
export const TABLES: readonly Table[] = buildTables();

/** Horários de início de cada slot de 1h. O restaurante fecha às 23:00. */
export const TIME_SLOTS = ['18:00', '19:00', '20:00', '21:00', '22:00'] as const;

export type TimeSlot = (typeof TIME_SLOTS)[number];

export const OPENING_TIME = '18:00';
export const CLOSING_TIME = '23:00';

export const MAX_TABLE_CAPACITY = Math.max(...TABLES.map((t) => t.capacity));

export const RESTAURANT_NAME = 'Mesa Fácil';
export const RESTAURANT_PHONE = '(11) 4000-0000';

export function isValidTimeSlot(time: string): time is TimeSlot {
  return (TIME_SLOTS as readonly string[]).includes(time);
}

/** Mesas capazes de acomodar o grupo, da menor para a maior capacidade. */
export function tablesForPartySize(partySize: number): Table[] {
  return TABLES.filter((t) => t.capacity >= partySize).sort((a, b) => a.capacity - b.capacity);
}
