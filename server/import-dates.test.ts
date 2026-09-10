import { describe, expect, it, vi } from 'vitest';
const data = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock('../client/src/lib/xlsx-compat', () => ({ readSheetAsJson: async () => data.rows, SimpleWorkbook: class {} }));
import { parseExcelFile } from '../client/src/lib/excel-parser';
const file = { arrayBuffer: async () => new ArrayBuffer(0) } as File;
describe('imported civil dates', () => {
  it('keeps missing dates unknown', async () => {
    data.rows = [{ Nome: 'Synthetic', Treinamento: 'Test' }];
    const [employee] = await parseExcelFile(file);
    expect(employee.trainings[0].completionDate).toBe('');
    expect(employee.trainings[0].expirationDate).toBe('');
  });
  it('rejects impossible calendar dates before importing', async () => {
    data.rows = [{ Nome: 'Synthetic', Treinamento: 'Test', 'Data de Realização': '30/02/2026' }];
    await expect(parseExcelFile(file)).rejects.toThrow('Data inválida');
  });
  it('preserves valid leap dates', async () => {
    data.rows = [{ Nome: 'Synthetic', Treinamento: 'Test', 'Data de Realização': '29/02/2024', 'Data de Vencimento': '01/03/2026' }];
    const [employee] = await parseExcelFile(file);
    expect(employee.trainings[0].completionDate).toBe('2024-02-29');
    expect(employee.trainings[0].expirationDate).toBe('2026-03-01');
  });
});
