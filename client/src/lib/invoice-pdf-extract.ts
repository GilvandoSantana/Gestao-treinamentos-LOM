/*
 * Sugestão de itens a partir do PDF da nota fiscal (ou do pedido de
 * compras/ordem de serviço anexado junto).
 *
 * Assim como a sugestão de data de validade de certificado, isto lê o
 * TEXTO já embutido no PDF (documento gerado digitalmente, não OCR de
 * imagem) — funciona bem em Nota Fiscal Eletrônica brasileira no formato
 * padrão (DANFE), porque a tabela de produtos tem um layout bem
 * consistente entre emissores. Já pedido de compras/ordem de serviço não
 * tem formato padronizado nenhum — a extração aí é bem mais "melhor
 * esforço", por isso separamos os itens encontrados por nível de
 * confiança.
 *
 * Importante: isto é sempre uma SUGESTÃO. Os itens aparecem editáveis
 * numa lista de revisão — nunca são salvos sozinhos sem o usuário
 * confirmar, porque leitura automática de documento nunca é 100% confiável.
 */

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite resolve isso para uma URL do worker no build.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export interface ExtractedInvoiceItem {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  /** 'alta' = bateu o padrão de tabela de NF-e (código+NCM+CFOP+valores). 'baixa' = heurística genérica, revise com mais atenção. */
  confidence: 'alta' | 'baixa';
}

/** "1.234,56" -> 1234.56 (formato de número brasileiro). */
function parseBrNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Extrai o texto do PDF, uma linha por item de texto (usa o hasEOL do pdfjs pra reconstruir quebras de linha reais). */
async function extractLines(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const lines: string[] = [];
  let current = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      if (!('str' in item)) continue;
      current += (current && !current.endsWith(' ') ? ' ' : '') + item.str;
      if (item.hasEOL) {
        if (current.trim()) lines.push(current.trim());
        current = '';
      }
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

// Linha de item de tabela de NF-e/DANFE padrão: ...descrição... NCM(8 díg) CST(1-3 díg) CFOP(4 díg) UNIDADE QUANTIDADE VALOR_UNIT VALOR_TOTAL ...
const DANFE_ITEM_REGEX =
  /^(.{3,120}?)\s+(\d{8})\s+\d{1,3}\s+(\d{4})\s+(\S{1,6})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/;

function tryParseDanfeLine(line: string): ExtractedInvoiceItem | null {
  const match = line.match(DANFE_ITEM_REGEX);
  if (!match) return null;
  const [, description, , cfop, , qtyRaw, unitPriceRaw, totalRaw] = match;
  // CFOP começando em 5/6/7 é saída/devolução, não compra — não é bem um
  // "item que eu recebi", então não entra na sugestão.
  if (!/^[123]/.test(cfop)) return null;

  const qty = parseBrNumber(qtyRaw);
  const unit_price = parseBrNumber(unitPriceRaw);
  const total = parseBrNumber(totalRaw);
  if (qty === null || unit_price === null || total === null || qty <= 0) return null;

  // Confere se os números batem entre si (com folga de 5%) — reduz falso
  // positivo de linha que só parece uma linha de item por coincidência.
  const expectedTotal = qty * unit_price;
  if (expectedTotal > 0 && Math.abs(expectedTotal - total) / expectedTotal > 0.05) return null;

  const name = description.replace(/^\d+\s+/, '').trim();
  if (!name) return null;

  return { name, qty, unit_price, total, confidence: 'alta' };
}

// Heurística bem mais solta pra documentos sem formato padrão (pedido de
// compras, ordem de serviço): "descrição ... quantidade ... valor".
const LOOSE_ITEM_REGEX = /^(.{3,80}?)\s+(\d+(?:[.,]\d+)?)\s*(?:un|unid|pç|pc|cx|kg)?\s+R?\$?\s*([\d.,]+)\s*$/i;

function tryParseLooseLine(line: string): ExtractedInvoiceItem | null {
  const match = line.match(LOOSE_ITEM_REGEX);
  if (!match) return null;
  const [, description, qtyRaw, valueRaw] = match;
  const qty = parseBrNumber(qtyRaw);
  const value = parseBrNumber(valueRaw);
  if (qty === null || value === null || qty <= 0 || value <= 0) return null;

  const name = description.trim();
  if (name.length < 3 || /^\d+$/.test(name)) return null;

  return { name, qty, unit_price: value, total: qty * value, confidence: 'baixa' };
}

/**
 * Lê um PDF e devolve os itens que conseguiu identificar. Nunca lança —
 * em caso de erro (PDF sem texto, arquivo corrompido, etc.) devolve lista
 * vazia, e quem chamou decide o que mostrar.
 */
export async function suggestItemsFromInvoicePdf(file: File): Promise<ExtractedInvoiceItem[]> {
  if (file.type !== 'application/pdf') return [];

  try {
    const lines = await extractLines(file);
    const items: ExtractedInvoiceItem[] = [];

    for (const line of lines) {
      const danfeMatch = tryParseDanfeLine(line);
      if (danfeMatch) {
        items.push(danfeMatch);
        continue;
      }
    }

    // Só tenta a heurística solta se a leitura no formato de NF-e não achou
    // nada — se já achou pela tabela padrão, não vale a pena arriscar
    // ruído de falso positivo por cima.
    if (items.length === 0) {
      for (const line of lines) {
        const looseMatch = tryParseLooseLine(line);
        if (looseMatch) items.push(looseMatch);
      }
    }

    return items.slice(0, 60);
  } catch (error) {
    console.error('[suggestItemsFromInvoicePdf] Falha ao ler o PDF:', error);
    return [];
  }
}
