/**
 * Layout puro da Ficha de EPI (frente + verso).
 *
 * Sem nenhum import de asset/imagem — recebe as imagens já em base64 e só
 * desenha. Separado de epi-form.ts para poder ser testado fora do
 * navegador (sem depender de Image/canvas do DOM), do mesmo jeito que
 * badgeLayout.ts separa o cálculo de layout do carregamento de imagem dos
 * geradores de crachá.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Employee } from '@/lib/types';

const MIN_FRONT_ROWS = 14;
const BLANK_BUFFER = 7;
// Máximo de linhas que cabem em uma página sem estourar (calibrado via
// teste visual — ver comentário em renderEpiFormPages).
const FRONT_MAX_ROWS = 15;
const BACK_DEFAULT_ROWS = 24;
const BACK_MAX_ROWS = 27;

export interface EpiTableItem {
  quantity: number;
  specification: string;
  ca?: string | null;
  responsibleName?: string | null;
}

const TERM_PARAGRAPH_LINES = [
  "Declaro para os devidos fins, que recebi os EPI's abaixo descritos e me comprometo a:",
  '*usá-los apenas para a finalidade a que se destinam;',
  '*responsabilizar-me por sua guarda e conservação;',
  '*comunicar ao empregador qualquer alteração que os tornem impróprios para o uso;',
  '*responsabilizar-me pela danificação do EPI devido ao seu uso inadequado ou fora das atividades a que se destina, bem como seu extravio.',
  'Declaro também estar ciente que o uso é obrigatório, sob pena de ser punido conforme Lei nº 6.514, de 22/12/77, artigo 158, da CLT: "Cabe aos',
  'empregados: I - observar as normas de segurança e medicina do trabalho, inclusive as instruções de que trata o item II do artigo anterior; II -',
  'colaborar com a empresa na aplicação dos dispositivos deste Capitulo. Parágrafo único: Constitui ato faltoso do empregado a recusa injustificada:',
  'a) à observância das instruções expedidas pelo empregador na forma do item II do artigo anterior; b) ao uso dos equipamentos de proteção',
  'individual fornecidos pela empresa.',
  "Declaro, ainda, que recebi o treinamento referente ao uso correto dos EPI's e sobre as Normas e Procedimentos de Segurança do Trabalho a",
  'serem observados e cumpridos.',
];

function formatDateBR(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

const MARGIN = 12;
const PAGE_WIDTH = 297;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLUMNS = [
  { header: 'RESPONSÁVEL PELA ENTREGA', width: 32 },
  { header: 'CA', width: 16 },
  { header: 'QUANTIDADE', width: 18 },
  { header: 'ESPECIFICAÇÃO DO EPI (TIPO)', width: 76 },
  { header: 'RECEBIMENTO', width: 19 },
  { header: 'DEVOLUÇÃO', width: 19 },
  { header: 'TROCA', width: 19 },
  { header: 'RÚBRICA DO FUNCIONÁRIO', width: 51 },
  { header: 'RÚBRICA DO RESP.', width: 23 },
];

export type PageData = {
  employee: Employee;
  contractName: string;
  logoBase64: string;
  illustrationBase64: string;
  /** EPIs configurados para a função do colaborador — vazio se a função
   * ainda não tiver nenhum EPI cadastrado (tabela sai em branco). */
  items: EpiTableItem[];
};

function drawTitle(doc: jsPDF, logoBase64: string) {
  doc.addImage(logoBase64, 'PNG', MARGIN, 6, 20, 17);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(
    'FICHA DE CONTROLE DE ENTREGA E DEVOLUÇÃO DE EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL - EPI',
    PAGE_WIDTH / 2,
    13,
    { align: 'center' }
  );
}

/** Caixa "SUPPORT MINING" | "NOME:" — igual nas duas páginas. */
function drawCompanyNameBox(doc: jsPDF, employee: Employee, y: number): number {
  const height = 11;
  const leftWidth = TABLE_WIDTH * 0.38;
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, TABLE_WIDTH, height);
  doc.line(MARGIN + leftWidth, y, MARGIN + leftWidth, y + height);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('SUPPORT MINING', MARGIN + leftWidth / 2, y + height / 2 + 1.8, { align: 'center' });

  doc.setFontSize(6.5);
  doc.text('NOME:', MARGIN + leftWidth + 3, y + 4);
  doc.setFontSize(11);
  doc.text(employee.name.toUpperCase(), MARGIN + leftWidth + (TABLE_WIDTH - leftWidth) / 2, y + height / 2 + 3, {
    align: 'center',
  });

  return y + height;
}

/** Linha Função / Contrato / Data de Admissão / Data de Demissão. */
function drawInfoRow(doc: jsPDF, employee: Employee, contractName: string, y: number): number {
  const height = 9.5;
  const colWidth = TABLE_WIDTH / 4;
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, TABLE_WIDTH, height);
  for (let i = 1; i < 4; i++) {
    doc.line(MARGIN + colWidth * i, y, MARGIN + colWidth * i, y + height);
  }

  const labels = ['FUNÇÃO:', 'CONTRATO:', 'DATA DE ADMISSÃO:', 'DATA DE DEMISSÃO:'];
  const values = [
    employee.role.toUpperCase(),
    contractName.toUpperCase(),
    formatDateBR(employee.admissionDate),
    employee.dismissed ? formatDateBR(typeof employee.dismissedAt === 'string' ? employee.dismissedAt.slice(0, 10) : undefined) : '',
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  for (let i = 0; i < 4; i++) {
    const x = MARGIN + colWidth * i + 2;
    doc.text(labels[i], x, y + 3.8);
    doc.setFontSize(9);
    doc.text(values[i], x, y + 7.8);
    doc.setFontSize(6.5);
  }

  return y + height;
}

/** Título + parágrafo do termo de responsabilidade + ilustração dos EPIs
 * (só desenhado na frente). */
function drawTerm(doc: jsPDF, illustrationBase64: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TERMO DE RESPONSABILIDADE', PAGE_WIDTH / 2, y + 4, { align: 'center' });

  const illustrationWidth = 20;
  const illustrationHeight = 20;
  const textWidth = TABLE_WIDTH - illustrationWidth - 4;

  doc.addImage(
    illustrationBase64,
    'PNG',
    MARGIN + textWidth + 4,
    y + 6,
    illustrationWidth,
    illustrationHeight
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  let lineY = y + 8.5;
  for (const line of TERM_PARAGRAPH_LINES) {
    doc.text(line, MARGIN, lineY, { maxWidth: textWidth });
    lineY += 2.6;
  }

  return Math.max(lineY, y + 6 + illustrationHeight) + 2;
}

/** "DATA:" + barra "VISTO DA SEGURANÇA DO TRABALHO" | "ASSINATURA DO EMPREGADO". */
function drawDataAndVistoBar(doc: jsPDF, y: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('DATA:', MARGIN, y + 2.8);

  const barY = y + 4.5;
  const barHeight = 4.5;
  const halfWidth = TABLE_WIDTH / 2;
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, barY, TABLE_WIDTH, barHeight);
  doc.line(MARGIN + halfWidth, barY, MARGIN + halfWidth, barY + barHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('VISTO DA SEGURANÇA DO TRABALHO', MARGIN + halfWidth / 2, barY + 3.2, { align: 'center' });
  doc.text('ASSINATURA DO EMPREGADO', MARGIN + halfWidth + halfWidth / 2, barY + 3.2, { align: 'center' });

  return barY + barHeight;
}

/** Tabela de EPIs — recebe a lista de itens já preenchidos (o restante das
 * linhas até totalRows sai em branco, pra completar à mão). */
function drawEpiTable(doc: jsPDF, y: number, totalRows: number, items: EpiTableItem[]) {
  const body: string[][] = [];
  for (let i = 0; i < totalRows; i++) {
    const item = items[i];
    body.push([
      item?.responsibleName ?? '',
      item?.ca ?? '',
      item ? String(item.quantity) : '',
      item ? item.specification : '',
      '',
      '',
      '',
      '',
      '',
    ]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [
      [
        { content: 'RESPONSÁVEL PELA\nENTREGA', rowSpan: 2 },
        { content: 'CA', rowSpan: 2 },
        { content: 'QUANTIDADE', rowSpan: 2 },
        { content: 'ESPECIFICAÇÃO DO EPI\n(TIPO)', rowSpan: 2 },
        { content: 'DATA', colSpan: 3 },
        { content: 'RÚBRICA DO\nFUNCIONÁRIO', rowSpan: 2 },
        { content: 'RÚBRICA\nDO RESP.', rowSpan: 2 },
      ],
      ['RECEBIMENTO', 'DEVOLUÇÃO', 'TROCA'],
    ],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: 1,
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      textColor: [0, 0, 0],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 6.5,
    },
    bodyStyles: {
      minCellHeight: 5.6,
    },
    columnStyles: Object.fromEntries(COLUMNS.map((c, i) => [i, { cellWidth: c.width, halign: i === 3 ? 'left' : 'center' }])),
  });
}

async function drawPage(
  doc: jsPDF,
  data: PageData,
  isBack: boolean,
  tableRows: number,
  tableItems: EpiTableItem[]
) {
  drawTitle(doc, data.logoBase64);
  let y = drawCompanyNameBox(doc, data.employee, 26);

  if (!isBack) {
    y = drawInfoRow(doc, data.employee, data.contractName, y);
    y = drawTerm(doc, data.illustrationBase64, y + 2);
    y = drawDataAndVistoBar(doc, y);
    drawEpiTable(doc, y + 2, tableRows, tableItems);
  } else {
    drawEpiTable(doc, y + 4, tableRows, tableItems);
  }
}

/**
 * Decide quantas linhas cada página leva e quais itens vão em cada uma.
 * Regras:
 * - Sem nenhum item configurado: frente sai com o mínimo de linhas em
 *   branco (mesmo tamanho visual de sempre), verso com a quantidade padrão.
 * - Com itens: todos entram na frente, com um "colchão" de linhas em
 *   branco pra completar à mão — até o limite que cabe numa página.
 * - Se a lista for maior do que cabe na frente, o que sobra vai para o
 *   verso (também preenchido), e só depois disso entram as linhas em
 *   branco do verso.
 */
function planTableRows(items: EpiTableItem[]): {
  frontRows: number;
  frontItems: EpiTableItem[];
  backRows: number;
  backItems: EpiTableItem[];
} {
  if (items.length === 0) {
    return { frontRows: MIN_FRONT_ROWS, frontItems: [], backRows: BACK_DEFAULT_ROWS, backItems: [] };
  }

  if (items.length >= FRONT_MAX_ROWS) {
    const frontItems = items.slice(0, FRONT_MAX_ROWS);
    const overflow = items.slice(FRONT_MAX_ROWS);
    const backRows = Math.min(BACK_MAX_ROWS, Math.max(BACK_DEFAULT_ROWS, overflow.length + BLANK_BUFFER));
    return { frontRows: FRONT_MAX_ROWS, frontItems, backRows, backItems: overflow };
  }

  const frontRows = Math.min(FRONT_MAX_ROWS, Math.max(MIN_FRONT_ROWS, items.length + BLANK_BUFFER));
  return { frontRows, frontItems: items, backRows: BACK_DEFAULT_ROWS, backItems: [] };
}

/**
 * Desenha as duas páginas (frente + verso) num jsPDF já criado, a partir de
 * imagens já carregadas em base64 e da lista de EPIs configurados para a
 * função do colaborador. Separado de generateEpiFormPDF para poder ser
 * testado fora do navegador (sem depender de Image/canvas).
 */
export async function renderEpiFormPages(doc: jsPDF, pageData: PageData) {
  const plan = planTableRows(pageData.items);
  await drawPage(doc, pageData, false, plan.frontRows, plan.frontItems);
  doc.addPage('a4', 'landscape');
  await drawPage(doc, pageData, true, plan.backRows, plan.backItems);
}
