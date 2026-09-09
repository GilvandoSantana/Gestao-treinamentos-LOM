import { expect, it } from 'vitest';
import { daysUntilDate } from './calendar-date';
it('keeps the Brazilian civil day even after UTC midnight', () => {
  expect(daysUntilDate('2026-09-08', new Date('2026-09-09T01:00:00Z'), 'America/Sao_Paulo')).toBe(0);
});
it('rejects invalid days including non-leap February 29', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-00-10', 'invalid']) expect(daysUntilDate(date)).toBeNull();
});
it('counts calendar days across a daylight saving transition', () => {
  expect(daysUntilDate('2026-03-09', new Date('2026-03-08T05:00:00Z'), 'America/New_York')).toBe(1);
});
