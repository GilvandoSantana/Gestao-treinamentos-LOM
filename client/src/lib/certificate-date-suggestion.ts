/*
 * Sugestão de data de vencimento a partir do certificado anexado.
 *
 * Funciona lendo o TEXTO já embutido no PDF (a maioria dos certificados é
 * gerada digitalmente, não escaneada) — não é OCR de imagem, então é rápido
 * e não baixa nenhum modelo pesado. Certificados escaneados/fotografados
 * (sem texto selecionável) não são cobertos por esta versão.
 *
 * Importante: isto é sempre uma SUGESTÃO. O usuário decide se usa a data
 * encontrada — nunca preenche o formulário sozinho sem confirmação, porque
 * leitura automática de documento nunca é 100% confiável.
 */

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite resolve isso para uma URL do worker no build.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export interface DateSuggestion {
  /** Data no formato usado pelo <input type="date"> (AAAA-MM-DD). */
  isoDate: string;
  /** Como apareceu no documento, para mostrar ao usuário. */
  rawText: string;
  /** Confiança maior quando a data está perto de uma palavra como "vencimento". */
  isLikelyExpiration: boolean;
}

const KEYWORDS_NEARBY = /vencimento|validade|válid[oa]|expira|expiration|valid until/i;

/** dd/mm/aaaa, dd-mm-aaaa ou dd.mm.aaaa — os formatos mais comuns em certificados brasileiros. */
const DATE_REGEX = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g;

function toIsoDate(day: string, month: string, year: string): string | null {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Extrai o texto de um PDF e procura datas. Devolve null se o arquivo não
 * for PDF, não tiver texto (provavelmente é um documento escaneado), ou não
 * encontrar nenhuma data reconhecível.
 */
export async function suggestExpirationDateFromFile(file: File): Promise<DateSuggestion[]> {
  if (file.type !== 'application/pdf') return [];

  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    let fullText = '';
    // Só as 2 primeiras páginas — a data de validade sempre aparece logo no
    // corpo do certificado, não vale a pena ler o documento inteiro.
    const pagesToRead = Math.min(pdf.numPages, 2);
    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n';
    }

    const suggestions: DateSuggestion[] = [];
    let match: RegExpExecArray | null;
    DATE_REGEX.lastIndex = 0;
    while ((match = DATE_REGEX.exec(fullText)) !== null) {
      const [raw, day, month, year] = match;
      const iso = toIsoDate(day, month, year);
      if (!iso) continue;

      const contextStart = Math.max(0, match.index - 40);
      const context = fullText.slice(contextStart, match.index);

      suggestions.push({
        isoDate: iso,
        rawText: raw,
        isLikelyExpiration: KEYWORDS_NEARBY.test(context),
      });
    }

    // Datas perto de "vencimento"/"validade" primeiro; sem duplicar a mesma data.
    const seen = new Set<string>();
    return suggestions
      .sort((a, b) => Number(b.isLikelyExpiration) - Number(a.isLikelyExpiration))
      .filter((s) => {
        if (seen.has(s.isoDate)) return false;
        seen.add(s.isoDate);
        return true;
      })
      .slice(0, 3);
  } catch (error) {
    console.error('[suggestExpirationDateFromFile] Falha ao ler o PDF:', error);
    return [];
  }
}
