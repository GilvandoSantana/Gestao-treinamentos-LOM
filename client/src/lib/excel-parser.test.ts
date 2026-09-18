import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseExcelFile } from './excel-parser';

/** Monta um arquivo .xlsx de verdade (linha de cabeçalho + linhas de dado)
 * e devolve como File — o mesmo formato que um upload real produziria. */
async function buildXlsxFile(headers: string[], rows: (string | number)[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Colaboradores');
  ws.addRow(headers);
  for (const row of rows) ws.addRow(row);
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer as ArrayBuffer], 'teste.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('parseExcelFile — coluna Área (achado real, Gilvando 18/09)', () => {
  it('lê a coluna Área corretamente — o caso central deste achado (antes, só Líder era lido)', async () => {
    const file = await buildXlsxFile(
      ['Nome', 'Função', 'Líder', 'Área'],
      [['Ana Silva', 'PINTOR', 'JOSE DANIEL', 'PINTURA']]
    );
    const employees = await parseExcelFile(file);
    expect(employees).toHaveLength(1);
    expect(employees[0].leader).toBe('JOSE DANIEL');
    expect(employees[0].area).toBe('PINTURA');
  });

  it('Área continua opcional — planilha sem essa coluna não quebra nem gera erro', async () => {
    const file = await buildXlsxFile(['Nome', 'Função'], [['Bruno Costa', 'SOLDADOR']]);
    const employees = await parseExcelFile(file);
    expect(employees).toHaveLength(1);
    expect(employees[0].area).toBeUndefined();
  });

  it('linha com Área em branco não define o campo (fica undefined, não string vazia)', async () => {
    const file = await buildXlsxFile(['Nome', 'Função', 'Área'], [['Carla Dias', 'AJUDANTE', '']]);
    const employees = await parseExcelFile(file);
    expect(employees[0].area).toBeUndefined();
  });
});
