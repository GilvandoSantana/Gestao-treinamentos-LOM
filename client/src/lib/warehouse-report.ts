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

  const monthMovements = movements.filter((m) => new Date(m.date) >= firstDay);
  const entradas = monthMovements.filter((m) => m.movementType === 'entrada');
  const saidas = monthMovements.filter((m) => m.movementType === 'saida');
  const totalEntradas = entradas.reduce((sum, m) => sum + m.quantity, 0);
  const totalSaidas = saidas.reduce((sum, m) => sum + m.quantity, 0);
  const totalItens = items.length;
  const itensEmEstoque = items.filter((i) => i.quantity > 0).length;
  const itensCriticos = items.filter((i) => i.quantity > 0 && i.quantity <= 5);

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
    ['Número de Movimentações de Entrada', String(entradas.length)],
    ['Número de Movimentações de Saída', String(saidas.length)],
    ['Saldo do Mês (Entradas − Saídas)', String(totalEntradas - totalSaidas)],
  ];

  autoTable(doc, {
    startY: 75,
    head: [['Indicador', 'Valor']],
    body: resumoData,
    theme: 'striped',
    headStyles: { fillColor: [26, 58, 107], textColor: 255 },
    styles: { fontSize: 9 },
  });

  // 2. Movimentações do Mês
  let finalY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.setTextColor(26, 58, 107);
  doc.text('2. MOVIMENTAÇÕES DO MÊS', 15, finalY);

  if (monthMovements.length > 0) {
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Data', 'Tipo', 'Item', 'Qtd', 'Detalhe']],
      body: monthMovements.slice(0, 50).map((m) => [
        new Date(m.date).toLocaleDateString('pt-BR'),
        m.movementType === 'entrada' ? 'ENTRADA' : 'SAÍDA',
        m.itemName,
        String(m.quantity),
        m.destination || m.responsible || m.supplier || 'N/A',
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

  // 3. Itens em Nível Crítico
  doc.setFontSize(14);
  doc.setTextColor(26, 58, 107);
  doc.text('3. ITENS EM NÍVEL CRÍTICO', 15, finalY);

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
