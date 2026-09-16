/**
 * Tenta casar um item extraído de uma nota fiscal com um item que já
 * existe no cadastro do Almoxarifado, pelo nome. Sempre "melhor esforço"
 * — quem decide se o casamento está certo é a pessoa, na tela de
 * conferência (InvoiceWarehouseReconcilePanel), nunca é automático de
 * verdade sem confirmação.
 */

/** minúsculo, sem acento, sem pontuação, espaços colapsados. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlapScore(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normalize(b).split(' ').filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let common = 0;
  wordsA.forEach((w) => {
    if (wordsB.has(w)) common += 1;
  });
  return common / Math.max(wordsA.size, wordsB.size);
}

export interface WarehouseMatchCandidate {
  id: string;
  name: string;
  code: string;
}

export interface WarehouseMatchResult {
  item: WarehouseMatchCandidate;
  confidence: 'exata' | 'provavel';
}

/**
 * Devolve o melhor candidato encontrado, ou null se nada bateu o
 * suficiente pra valer a pena sugerir (é melhor pedir pra cadastrar de
 * novo do que sugerir um item errado).
 */
export function matchInvoiceItemToWarehouseItem(
  invoiceItemName: string,
  warehouseItems: WarehouseMatchCandidate[]
): WarehouseMatchResult | null {
  const normalizedTarget = normalize(invoiceItemName);
  if (!normalizedTarget) return null;

  const exact = warehouseItems.find((w) => normalize(w.name) === normalizedTarget);
  if (exact) return { item: exact, confidence: 'exata' };

  let best: { item: WarehouseMatchCandidate; score: number } | null = null;
  for (const w of warehouseItems) {
    const score = wordOverlapScore(invoiceItemName, w.name);
    if (score > 0.5 && (!best || score > best.score)) {
      best = { item: w, score };
    }
  }
  return best ? { item: best.item, confidence: 'provavel' } : null;
}
