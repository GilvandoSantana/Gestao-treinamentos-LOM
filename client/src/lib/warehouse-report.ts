/**
 * Utilitários de Excel e PDF do Almoxarifado — exportar/importar itens,
 * baixar modelo, e gerar o relatório mensal em PDF. Réplica do que o
 * sistema original (Vercel) fazia.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WarehouseItemInfo, WarehouseMovementInfo } from '@shared/warehouse';

const COLS = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];

export function exportItemsToExcel(items: WarehouseItemInfo[]): void {
  const data = items.map((item) => ({
    Código: item.code,
    Nome: item.name,
    Tipo: item.type,
    Unidade: item.unit,
    Quantidade: item.quantity,
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = COLS;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Itens');
  XLSX.writeFile(workbook, 'almoxarifado_itens.xlsx');
}

export function downloadItemsTemplate(): void {
  const templateData = [
    { Código: 'EX001', Nome: 'Exemplo de Item', Tipo: 'material', Unidade: 'un', Quantidade: 10 },
    { Código: 'EX002', Nome: 'Outro Item', Tipo: 'ferramenta', Unidade: 'pç', Quantidade: 5 },
  ];
  const worksheet = XLSX.utils.json_to_sheet(templateData);
  worksheet['!cols'] = COLS;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Itens');

  const instructionData = [
    ['INSTRUÇÕES PARA IMPORTAÇÃO'],
    [''],
    ['1. Preencha os dados na aba "Itens"'],
    ['2. Código: identificador único do item (obrigatório)'],
    ['3. Nome: nome descritivo do item (obrigatório)'],
    ['4. Tipo: epi, ferramenta, equipamento, material_consumo, material_limpeza, gas ou material'],
    ['5. Unidade: un, kg, l, pç, etc.'],
    ['6. Quantidade: número inteiro'],
    [''],
    ['Não altere os nomes das colunas!'],
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructionData);
  XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instruções');

  XLSX.writeFile(workbook, 'modelo_almoxarifado.xlsx');
}

export interface ParsedImportItem {
  code: string;
  name: string;
  type: string;
  unit: string;
  quantity: number;
}

const VALID_TYPES = ['epi', 'ferramenta', 'equipamento', 'material_consumo', 'material_limpeza', 'gas', 'material'];

export function parseItemsExcelFile(file: File): Promise<ParsedImportItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Arquivo vazio'));
          return;
        }
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!worksheet) {
          reject(new Error('Nenhuma planilha encontrada'));
          return;
        }
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet);

        const items: ParsedImportItem[] = rows.map((row, index) => {
          const code = String(row['Código'] ?? row['Code'] ?? '').trim();
          const name = String(row['Nome'] ?? row['Name'] ?? '').trim();
          const rawType = String(row['Tipo'] ?? row['Type'] ?? 'material').trim().toLowerCase();
          const unit = String(row['Unidade'] ?? row['Unit'] ?? 'un').trim() || 'un';
          const quantity = parseInt(String(row['Quantidade'] ?? row['Quantity'] ?? '0'), 10);

          if (!code || !name) {
            throw new Error(`Linha ${index + 2}: Código e Nome são obrigatórios`);
          }

          return {
            code,
            name,
            type: VALID_TYPES.includes(rawType) ? rawType : 'material',
            unit,
            quantity: Number.isNaN(quantity) ? 0 : quantity,
          };
        });

        resolve(items);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Erro ao processar arquivo'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

export function generateMonthlyReportPDF(
  items: WarehouseItemInfo[],
  movements: WarehouseMovementInfo[],
  responsibleName: string
): void {
  const doc = new jsPDF();

  const firstDay = new Date();
  firstDay.setDate(1);
  firstDay.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  // Preço de referência por item — usado quando a própria movimentação não
  // tem valor unitário registrado (comum em saída, que hoje não pede isso).
  const priceByItemId = new Map(items.map((i) => [i.id, i.precoUnitario]));
  const valueOf = (m: WarehouseMovementInfo) =>
    (m.unitPrice ?? (m.itemId ? priceByItemId.get(m.itemId) : undefined) ?? 0) * m.quantity;

  const monthMovements = movements.filter((m) => new Date(m.date) >= firstDay);
  const entradas = monthMovements.filter((m) => m.movementType === 'entrada');
  const saidas = monthMovements.filter((m) => m.movementType === 'saida');
  const totalEntradas = entradas.reduce((sum, m) => sum + m.quantity, 0);
  const totalSaidas = saidas.reduce((sum, m) => sum + m.quantity, 0);
  const valorTotalEntradas = entradas.reduce((sum, m) => sum + valueOf(m), 0);
  const valorTotalSaidas = saidas.reduce((sum, m) => sum + valueOf(m), 0);
  const totalItens = items.length;
  const itensEmEstoque = items.filter((i) => i.quantity > 0).length;
  const itensCriticos = items.filter((i) => i.quantity > 0 && i.quantity <= 5);

  const formatBRL = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  // Ranking dos materiais mais retirados nos últimos 30 dias — considera
  // todo o histórico de movimentações (não só o mês do relatório), pra
  // valer mesmo no início do mês.
  const last30DaysSaidas = movements.filter(
    (m) => m.movementType === 'saida' && new Date(m.date) >= thirtyDaysAgo
  );
  const saidasByItem = new Map<string, { code: string; name: string; quantity: number }>();
  for (const m of last30DaysSaidas) {
    const key = m.itemId ?? m.itemName;
    const item = m.itemId ? items.find((i) => i.id === m.itemId) : undefined;
    const current = saidasByItem.get(key) ?? { code: item?.code ?? '—', name: m.itemName, quantity: 0 };
    current.quantity += m.quantity;
    saidasByItem.set(key, current);
  }
  const saidaRanking = Array.from(saidasByItem.values()).sort((a, b) => b.quantity - a.quantity);

  // Entradas e saídas por item, dentro do mês.
  const movementsByItem = new Map<
    string,
    { code: string; name: string; entradas: number; saidas: number }
  >();
  for (const m of monthMovements) {
    const key = m.itemId ?? m.itemName;
    const item = m.itemId ? items.find((i) => i.id === m.itemId) : undefined;
    const current = movementsByItem.get(key) ?? {
      code: item?.code ?? '—',
      name: m.itemName,
      entradas: 0,
      saidas: 0,
    };
    if (m.movementType === 'entrada') current.entradas += m.quantity;
    else current.saidas += m.quantity;
    movementsByItem.set(key, current);
  }
  const itemMovementRows = Array.from(movementsByItem.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Cabeçalho
  doc.setFillColor(26, 58, 107);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('RELATÓRIO MENSAL DE ESTOQUE', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text(
    `Período: ${firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
    105,
    30,
    { align: 'center' }
  );

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 15, 48);
  doc.text('Sistema: Gestão de Treinamentos — Almoxarifado', 15, 53);
  doc.text(`Responsável: ${responsibleName || 'N/A'}`, 15, 58);

  // 1. Resumo Executivo
  doc.setFontSize(14);
  doc.setTextColor(26, 58, 107);
  doc.text('1. RESUMO EXECUTIVO', 15, 70);

  const resumoData = [
    ['Total de Itens Cadastrados', String(totalItens)],
    ['Itens em Estoque', String(itensEmEstoque)],
    ['Itens em Nível Crítico', String(itensCriticos.length)],
    ['Total de Entradas (unidades)', String(totalEntradas)],
    ['Total de Saídas (unidades)', String(totalSaidas)],
    ['Saldo do Mês (Entradas − Saídas, unidades)', String(totalEntradas - totalSaidas)],
    ['Valor Total Entrado no Almoxarifado', formatBRL(valorTotalEntradas)],
    ['Valor Total Saído do Almoxarifado', formatBRL(valorTotalSaidas)],
  ];

  autoTable(doc, {
    startY: 75,
    head: [['Indicador', 'Valor']],
    body: resumoData,
    theme: 'striped',
    headStyles: { fillColor: [26, 58, 107], textColor: 255 },
    styles: { fontSize: 9 },
  });
  // Valores em R$ são estimados pelo preço unitário atual do item quando a
  // própria movimentação de saída não registrou um valor (caso comum).
  let finalY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFontSize(7.5);
  doc.setTextColor(128, 128, 128);
  doc.text(
    'Valores em R$ usam o preço unitário registrado na movimentação, ou o preço atual do item quando não informado.',
    15,
    finalY
  );
  finalY += 10;

  // 2. Ranking dos materiais mais retirados (últimos 30 dias)
  doc.setFontSize(14);
  doc.setTextColor(26, 58, 107);
  doc.text('2. RANKING DOS MATERIAIS MAIS RETIRADOS (ÚLTIMOS 30 DIAS)', 15, finalY);

  if (saidaRanking.length > 0) {
    autoTable(doc, {
      startY: finalY + 5,
      head: [['#', 'Código', 'Item', 'Quantidade Retirada']],
      body: saidaRanking.map((r, index) => [String(index + 1), r.code, r.name, String(r.quantity)]),
      theme: 'striped',
      headStyles: { fillColor: [230, 126, 34], textColor: 255 },
      styles: { fontSize: 8.5 },
    });
    finalY = (doc as any).lastAutoTable.finalY + 15;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128);
    doc.text('Nenhuma saída registrada nos últimos 30 dias.', 15, finalY + 10);
    finalY += 20;
  }

  // 3. Entradas e Saídas por Item (mês)
  doc.setFontSize(14);
  doc.setTextColor(26, 58, 107);
  doc.text('3. ENTRADAS E SAÍDAS POR ITEM (MÊS)', 15, finalY);

  if (itemMovementRows.length > 0) {
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Código', 'Item', 'Entradas', 'Saídas', 'Saldo']],
      body: itemMovementRows.map((r) => [
        r.code,
        r.name,
        String(r.entradas),
        String(r.saidas),
        String(r.entradas - r.saidas),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [26, 58, 107], textColor: 255 },
      styles: { fontSize: 8 },
    });
    finalY = (doc as any).lastAutoTable.finalY + 15;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128);
    doc.text('Nenhuma movimentação registrada neste mês.', 15, finalY + 10);
    finalY += 20;
  }

  // 4. Todos os Itens em Estoque
  doc.setFontSize(14);
  doc.setTextColor(26, 58, 107);
  doc.text('4. TODOS OS ITENS EM ESTOQUE', 15, finalY);

  if (items.length > 0) {
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Código', 'Nome', 'Tipo', 'Quantidade', 'Preço Unit.']],
      body: [...items]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => [i.code, i.name, i.type, `${i.quantity} ${i.unit}`, formatBRL(i.precoUnitario)]),
      theme: 'striped',
      headStyles: { fillColor: [26, 58, 107], textColor: 255 },
      styles: { fontSize: 7.5 },
    });
    finalY = (doc as any).lastAutoTable.finalY + 15;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128);
    doc.text('Nenhum item cadastrado.', 15, finalY + 10);
    finalY += 20;
  }

  // 5. Itens em Nível Crítico
  doc.setFontSize(14);
  doc.setTextColor(26, 58, 107);
  doc.text('5. ITENS EM NÍVEL CRÍTICO', 15, finalY);

  if (itensCriticos.length > 0) {
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Código', 'Nome', 'Quantidade Atual']],
      body: itensCriticos.map((i) => [i.code, i.name, String(i.quantity)]),
      theme: 'striped',
      headStyles: { fillColor: [211, 47, 47], textColor: 255 },
      styles: { fontSize: 9 },
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(39, 174, 96);
    doc.text('Nenhum item em nível crítico. Estoque saudável!', 15, finalY + 10);
  }

  // Rodapé
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Página ${i} de ${pageCount} | Gestão de Treinamentos — Relatório Mensal`, 105, 285, {
      align: 'center',
    });
  }

  const mesAno = firstDay
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(' de ', '_');
  doc.save(`relatorio_mensal_${mesAno}.pdf`);
}
