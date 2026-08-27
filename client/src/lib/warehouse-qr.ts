/**
 * Formatos de etiqueta de item que podem aparecer num QR code escaneado:
 *  - `MAT:código` — etiqueta comum, qualquer tipo de item.
 *  - `PAT:patrimônio` — etiqueta antiga só de patrimônio (mantida por
 *    compatibilidade com etiquetas de ferramenta já impressas antes).
 *  - `MAT:código|PAT:patrimônio` — etiqueta combinada de ferramenta (nome +
 *    código + patrimônio no mesmo QR) — ver WarehouseLabelsPanel.
 */
export function findWarehouseItemByQrCode<T extends { code: string; patrimonio?: string | null }>(
  items: T[],
  scannedValue: string
): T | undefined {
  const parts: Record<string, string> = {};
  for (const segment of scannedValue.split('|')) {
    const sep = segment.indexOf(':');
    if (sep === -1) continue;
    parts[segment.slice(0, sep)] = segment.slice(sep + 1);
  }

  // Patrimônio identifica uma ferramenta específica de forma mais precisa
  // que o código (que é do modelo, compartilhado por várias unidades em
  // outros contextos) — prioriza ele quando os dois vêm juntos.
  if (parts.PAT) {
    const byPatrimonio = items.find((i) => i.patrimonio === parts.PAT);
    if (byPatrimonio) return byPatrimonio;
  }
  if (parts.MAT) {
    return items.find((i) => i.code === parts.MAT);
  }
  return undefined;
}
