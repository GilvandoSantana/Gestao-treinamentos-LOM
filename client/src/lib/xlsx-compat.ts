/**
 * Substitui a biblioteca `xlsx` (SheetJS) — o mantenedor parou de publicar
 * correções de segurança no npm (as versões corrigidas só existem no CDN
 * próprio deles, fora do fluxo normal de dependências), então trocamos
 * pela `exceljs`, que é ativamente mantida e publicada normalmente.
 *
 * Esse arquivo reproduz só as poucas operações que o sistema realmente usa
 * (planilha a partir de lista de objetos, planilha a partir de matriz
 * bruta, gerar o arquivo pra baixar, e ler um arquivo enviado como lista
 * de objetos) — não é um substituto genérico da API da xlsx.
 */

import ExcelJS from 'exceljs';

export interface ColumnWidth {
  wch: number;
}

// Achado de auditoria de segurança (18/09): célula de texto que começa com
// =, +, -, @ (ou tab/CR) é interpretada como fórmula por padrão pelo Excel
// ao abrir o arquivo — um nome de colaborador ou fornecedor digitado como
// "=HYPERLINK(...)" ou "=cmd|..." executaria ao abrir a planilha exportada
// (ataque conhecido como "CSV/formula injection"). Só afeta texto (string);
// número, data e boolean passam direto. Prefixar com apóstrofo é a
// mitigação padrão (OWASP) — faz o Excel tratar como texto puro, sem
// mudar o que a pessoa vê na célula.
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function sanitizeCellValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const first = value.charAt(0);
  if (FORMULA_TRIGGER_CHARS.has(first)) {
    return `'${value}`;
  }
  return value;
}

/** Uma planilha em construção — várias abas, depois baixa tudo de uma vez. */
export class SimpleWorkbook {
  private wb = new ExcelJS.Workbook();

  /** Uma aba a partir de uma lista de objetos — os cabeçalhos são as
   * chaves do PRIMEIRO objeto, na ordem em que aparecem (igual ao
   * comportamento do `XLSX.utils.json_to_sheet` que ele substitui). */
  addJsonSheet(sheetName: string, rows: Record<string, unknown>[], colWidths?: ColumnWidth[]): void {
    const ws = this.wb.addWorksheet(sheetName);
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      ws.addRow(headers);
      for (const row of rows) {
        ws.addRow(headers.map((h) => sanitizeCellValue(row[h] ?? '')));
      }
    }
    if (colWidths) {
      colWidths.forEach((cw, i) => {
        ws.getColumn(i + 1).width = cw.wch;
      });
    }
  }

  /** Uma aba a partir de uma matriz bruta (linha = array de células) —
   * usada pra abas de instrução/texto livre, sem cabeçalho de dados. */
  addAoaSheet(sheetName: string, rows: (string | number)[][]): void {
    const ws = this.wb.addWorksheet(sheetName);
    for (const row of rows) ws.addRow(row.map((cell) => sanitizeCellValue(cell)));
  }

  /** Gera o arquivo .xlsx e dispara o download no navegador. */
  async download(filename: string): Promise<void> {
    const buffer = await this.wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Lê a primeira aba de um arquivo .xlsx (recebido como ArrayBuffer) e
 * devolve como lista de objetos — primeira linha vira cabeçalho, o resto
 * vira os valores. Linhas totalmente vazias são ignoradas. Célula de data
 * formatada como data volta como objeto `Date`, igual ao que a `xlsx`
 * (com `cellDates: true`) já devolvia — quem usa isso (`parseDate` em
 * excel-parser.ts) já sabe interpretar esse formato.
 */
export async function readSheetAsJson(fileData: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileData);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  let headers: string[] = [];
  const rows: Record<string, unknown>[] = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = extractRowValues(row);
    if (rowNumber === 1) {
      headers = values.map((v) => String(v ?? '').trim());
      return;
    }
    const obj: Record<string, unknown> = {};
    let hasContent = false;
    headers.forEach((header, i) => {
      if (!header) return;
      const value = values[i];
      obj[header] = value;
      if (value !== undefined && value !== null && value !== '') hasContent = true;
    });
    if (hasContent) rows.push(obj);
  });

  return rows;
}

/** `row.values` do exceljs é indexado a partir de 1 (posição 0 é sempre
 * vazia) — realinha pra indexar a partir de 0, e desembrulha células de
 * fórmula/texto rico pro valor simples equivalente. */
function extractRowValues(row: ExcelJS.Row): unknown[] {
  const raw = row.values as unknown[];
  return raw.slice(1).map((cell) => {
    if (cell instanceof Date) return cell;
    if (cell && typeof cell === 'object') {
      const obj = cell as Record<string, unknown>;
      if ('result' in obj) return obj.result; // celula de formula
      if ('richText' in obj && Array.isArray(obj.richText)) {
        return (obj.richText as { text: string }[]).map((r) => r.text).join('');
      }
      if ('text' in obj) return obj.text; // hyperlink com texto
    }
    return cell;
  });
}
