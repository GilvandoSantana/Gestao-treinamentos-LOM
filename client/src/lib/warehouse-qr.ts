/**
 * Um item do almoxarifado pode ser escaneado por duas etiquetas diferentes:
 * a etiqueta do item em si (prefixo MAT:, pelo código do catálogo) ou,
 * pra ferramenta, a etiqueta de patrimônio colada na ferramenta física
 * (prefixo PAT:, pelo número de patrimônio) — ver WarehouseLabelsPanel.
 */
export function findWarehouseItemByQrCode<T extends { code: string; patrimonio?: string | null }>(
  items: T[],
  scannedValue: string
): T | undefined {
  if (scannedValue.startsWith('PAT:')) {
    const patrimonio = scannedValue.slice(4);
    return items.find((i) => i.patrimonio === patrimonio);
  }
  const code = scannedValue.replace(/^MAT:/, '');
  return items.find((i) => i.code === code);
}
