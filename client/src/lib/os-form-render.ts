/**
 * Layout da Ordem de Serviço (NR-01) — reproduz visualmente o modelo em
 * planilha enviado pelo administrador: barras de título em azul marinho
 * (RGB 0,32,96) com texto branco em negrito, campos em caixas com borda
 * dispostos em grade (como uma planilha), e uma tabela de Agentes
 * Ambientais com cabeçalho.
 *
 * O conteúdo por função (tarefas, agentes, medidas, EPIs) tem tamanho
 * livre — o admin escreve o quanto quiser — por isso a altura de cada
 * caixa se ajusta ao texto e o desenho flui para uma nova página sozinho
 * quando necessário, em vez de forçar tudo em uma página só.
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';

const MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - 14;

// Azul marinho exato do modelo em planilha (fill FF002060).
const NAVY: [number, number, number] = [0, 32, 96];
const BORDER_GRAY: [number, number, number] = [120, 120, 120];
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];

export interface OsRoleData {
  area: string | null;
  setorTrabalho: string | null;
  maquinasEquipamentos: string | null;
  tarefas: string | null;
  agentesFisicos: string | null;
  agentesQuimicos: string | null;
  agentesBiologicos: string | null;
  agentesErgonomicos: string | null;
  agentesAcidentes: string | null;
  medidasAdministrativas: string | null;
  medidasEngenharia: string | null;
  episMinimos: string | null;
}

export type OsPageData = {
  employee: Employee;
  contractName: string;
  companyName: string;
  role: OsRoleData | null;
};

const OBRIGACOES_EMPREGADO = [
  'Cumprir todas as normas expedidas pelo Empregador, inclusive esta ordem de serviço;',
  'Comunicar todas as condições inseguras presentes no ambiente ao supervisor imediato;',
  'Usar obrigatoriamente os Equipamentos de Proteção Individual indicado para a função;',
  'Manter a ordem, disciplina, higiene e segurança no trabalho;',
  'Participar de treinamentos relacionados à segurança e saúde ocupacional;',
  'Executar as tarefas que lhe forem delegadas após treinamento específico para execução da mesma;',
  'Acompanhar as atividades realizadas em seu ambiente de trabalho e orientar os empregados que estiverem em situação de risco;',
  'Colaborar com a empresa na aplicação das Normas Regulamentadoras – NR’s.',
];

function formatDateBR(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

interface CellSpec {
  text: string;
  width: number;
  bold?: boolean;
  fontSize?: number;
  color?: [number, number, number];
  fill?: [number, number, number];
  align?: 'left' | 'center';
}

/** Estado de "cursor" do desenho — a posição Y atual na página. */
class Cursor {
  y = MARGIN;
  constructor(private doc: jsPDF) {}

  ensureSpace(height: number) {
    if (this.y + height > BOTTOM_LIMIT) {
      this.doc.addPage('a4', 'portrait');
      this.y = MARGIN;
    }
  }

  gap(mm: number) {
    this.y += mm;
  }

  /**
   * Uma barra de título em azul marinho com texto branco em negrito —
   * mesmo visual das seções do modelo (fill FF002060).
   */
  sectionHeader(text: string, opts?: { fontSize?: number }) {
    const height = 6.5;
    this.ensureSpace(height);
    const { doc } = this;
    doc.setFillColor(...NAVY);
    doc.setDrawColor(...NAVY);
    doc.rect(MARGIN, this.y, CONTENT_WIDTH, height, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(opts?.fontSize ?? 9.5);
    doc.setTextColor(...WHITE);
    doc.text(text, MARGIN + 2, this.y + height / 2 + 1.4);
    doc.setTextColor(...BLACK);
    this.y += height;
  }

  /** Mede quantas linhas um texto ocupa numa largura útil (descontando o padding). */
  private measureLines(text: string, usableWidth: number, fontSize: number): string[] {
    this.doc.setFontSize(fontSize);
    return this.doc.splitTextToSize(text, usableWidth) as string[];
  }

  /**
   * Uma linha de caixas com borda lado a lado (label em negrito + valor),
   * repetida quantas vezes precisar — mesma ideia da grade da planilha.
   * Todas as caixas da linha compartilham a mesma altura (a maior delas).
   */
  cellRow(cells: CellSpec[], opts?: { minHeight?: number; padding?: number }) {
    const padding = opts?.padding ?? 1.6;
    const fontSize = 8.3;
    const lineHeight = 3.6;

    const lineSets = cells.map((cell) => this.measureLines(cell.text, cell.width - padding * 2, cell.fontSize ?? fontSize));
    const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
    const height = Math.max(opts?.minHeight ?? 0, maxLines * lineHeight + padding * 2);

    this.ensureSpace(height);
    const { doc } = this;
    let x = MARGIN;
    cells.forEach((cell, i) => {
      if (cell.fill) {
        doc.setFillColor(...cell.fill);
        doc.rect(x, this.y, cell.width, height, 'F');
      }
      doc.setDrawColor(...BORDER_GRAY);
      doc.rect(x, this.y, cell.width, height, 'S');

      doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
      doc.setFontSize(cell.fontSize ?? fontSize);
      doc.setTextColor(...(cell.color ?? BLACK));
      const lines = lineSets[i];
      const textX = cell.align === 'center' ? x + cell.width / 2 : x + padding;
      lines.forEach((line, li) => {
        doc.text(line, textX, this.y + padding + lineHeight * (li + 1) - 1, {
          align: cell.align === 'center' ? 'center' : 'left',
        });
      });
      x += cell.width;
    });
    doc.setTextColor(...BLACK);
    this.y += height;
  }

  /** Uma caixa larga (label acima, texto corrido abaixo) — pra blocos longos. */
  textBlock(label: string, value: string, opts?: { minHeight?: number }) {
    const padding = 2;
    const fontSize = 8.3;
    const lineHeight = 3.7;
    const lines = this.measureLines(value, CONTENT_WIDTH - padding * 2, fontSize);
    const labelHeight = label ? 4.2 : 0;
    const height = Math.max(opts?.minHeight ?? 0, labelHeight + lines.length * lineHeight + padding * 2);

    this.ensureSpace(height);
    const { doc } = this;
    doc.setDrawColor(...BORDER_GRAY);
    doc.rect(MARGIN, this.y, CONTENT_WIDTH, height, 'S');

    let textY = this.y + padding;
    if (label) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      doc.text(label, MARGIN + padding, textY + 3);
      textY += labelHeight;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    lines.forEach((line, li) => {
      doc.text(line, MARGIN + padding, textY + lineHeight * (li + 1) - 1);
    });
    this.y += height;
  }
}

export async function renderOsFormPage(doc: jsPDF, data: OsPageData): Promise<void> {
  const { employee, contractName, companyName, role } = data;
  const cursor = new Cursor(doc);
  const today = formatDateBR(new Date());

  // ── Cabeçalho: barra azul marinho com título + Nº/Data à direita ──
  const HEADER_HEIGHT = 13;
  cursor.ensureSpace(HEADER_HEIGHT);
  doc.setFillColor(...NAVY);
  doc.rect(MARGIN, cursor.y, CONTENT_WIDTH, HEADER_HEIGHT, 'F');
  doc.setDrawColor(...BORDER_GRAY);
  doc.rect(MARGIN, cursor.y, CONTENT_WIDTH, HEADER_HEIGHT, 'S');
  const numDataX = MARGIN + CONTENT_WIDTH - 45;
  doc.line(numDataX, cursor.y, numDataX, cursor.y + HEADER_HEIGHT);

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ORDEM DE SERVIÇO CONFORME NR 01 - DISPOSIÇÕES GERAIS', MARGIN + (CONTENT_WIDTH - 45) / 2, cursor.y + 6, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Conforme item 1.4 - Direitos e Deveres do Empregador e do Empregado', MARGIN + (CONTENT_WIDTH - 45) / 2, cursor.y + 10.5, {
    align: 'center',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Nº:', numDataX + 2, cursor.y + 5.5);
  doc.text(`Data: ${today}`, numDataX + 2, cursor.y + 10.5);
  doc.setTextColor(...BLACK);
  cursor.gap(HEADER_HEIGHT);

  // ── Dados do colaborador / contrato, em caixas pareadas ──
  cursor.cellRow([
    { text: 'Empresa:', width: 30, bold: true },
    { text: companyName || '—', width: 90 },
    { text: 'Área:', width: 22, bold: true },
    { text: role?.area || '—', width: CONTENT_WIDTH - 30 - 90 - 22 },
  ]);
  cursor.cellRow([
    { text: 'Empregado:', width: 30, bold: true },
    { text: employee.name, width: 90 },
    { text: 'CPF:', width: 22, bold: true },
    { text: employee.cpf || '—', width: CONTENT_WIDTH - 30 - 90 - 22 },
  ]);
  cursor.cellRow([
    { text: 'Cargo:', width: 30, bold: true },
    { text: employee.role, width: 90 },
    { text: 'Setor de Trabalho:', width: 34, bold: true },
    { text: role?.setorTrabalho || '—', width: CONTENT_WIDTH - 30 - 90 - 34 },
  ]);
  cursor.cellRow([
    { text: 'Gerência:', width: 30, bold: true },
    { text: employee.gerencia || '—', width: 90 },
    { text: 'Contrato:', width: 22, bold: true },
    { text: contractName || '—', width: CONTENT_WIDTH - 30 - 90 - 22 },
  ]);
  cursor.cellRow([
    { text: 'Observações:', width: 30, bold: true },
    { text: '', width: CONTENT_WIDTH - 30 },
  ]);
  cursor.gap(2);

  cursor.sectionHeader('Conceito Legal da Norma Regulamentadora NR 1 - Disposições Gerais');
  cursor.textBlock(
    '',
    'Conforme estabelecido pelo item 1.4 da NR 01 - Disposições Gerais cabe ao Empregador elaborar Ordem de Serviço e informar aos trabalhadores os riscos ocupacionais existentes nos locais de trabalho, as medidas de controle adotadas pela empresa para reduzir ou eliminar tais riscos, os resultados dos exames médicos e de exames complementares de diagnóstico aos quais os próprios trabalhadores forem submetidos e os resultados das avaliações ambientais realizadas nos locais de trabalho.'
  );
  cursor.gap(2);

  cursor.sectionHeader('Objetivos');
  cursor.textBlock(
    '',
    'Informar os Trabalhadores sobre os agentes ambientais de risco Físico, Químico, Biológico, Ergonômico e Acidentes bem como dar ciência aos trabalhadores sobre as doenças ocupacionais relativas ao ambiente de trabalho exposto. Instruí-los quanto a forma de eliminar, neutralizar ou minimizar os efeitos pelo contato com os riscos através da conscientização, medidas administrativas, medidas de controle coletivo e o fornecimento, manutenção e controle da periodicidade de troca dos Equipamentos de Proteção Individual.'
  );
  cursor.gap(2);

  cursor.sectionHeader('Obrigações do Empregado');
  {
    const padding = 1.8;
    const fontSize = 8;
    const lineHeight = 3.6;
    const numbered = OBRIGACOES_EMPREGADO.map((text, i) => `${String(i + 1).padStart(2, '0')} - ${text}`);
    doc.setFontSize(fontSize);
    const allLines = numbered.map((t) => doc.splitTextToSize(t, CONTENT_WIDTH - padding * 2) as string[]);
    const totalLines = allLines.reduce((sum, l) => sum + l.length, 0);
    const boxHeight = totalLines * lineHeight + padding * 2;
    cursor.ensureSpace(boxHeight);
    doc.setDrawColor(...BORDER_GRAY);
    doc.rect(MARGIN, cursor.y, CONTENT_WIDTH, boxHeight, 'S');
    doc.setFont('helvetica', 'normal');
    let ty = cursor.y + padding;
    allLines.forEach((lines) => {
      lines.forEach((line) => {
        doc.text(line, MARGIN + padding, ty + lineHeight - 1);
        ty += lineHeight;
      });
    });
    cursor.gap(boxHeight);
  }
  cursor.gap(2);

  cursor.sectionHeader('Descrição das atividades do Setor / Frente de Serviço');
  cursor.textBlock('Tarefa:', role?.tarefas || '—');
  cursor.gap(2);

  cursor.sectionHeader('Relação de Insumos do Setor de Trabalho');
  cursor.textBlock('Máquinas, Equipamentos e Ferramentas:', role?.maquinasEquipamentos || '—');
  cursor.gap(2);

  cursor.sectionHeader('Agentes Ambientais');
  cursor.cellRow(
    [
      { text: 'Tipo de Agente', width: 40, bold: true },
      { text: 'Descrição do Agente', width: CONTENT_WIDTH - 40, bold: true },
    ],
    { minHeight: 5.5 }
  );
  const agentRows: [string, string][] = [
    ['Físicos:', role?.agentesFisicos || '—'],
    ['Químicos:', role?.agentesQuimicos || '—'],
    ['Biológicos:', role?.agentesBiologicos || 'NA.'],
    ['Ergonômico:', role?.agentesErgonomicos || '—'],
    ['Acidentes:', role?.agentesAcidentes || '—'],
  ];
  for (const [label, value] of agentRows) {
    cursor.cellRow([
      { text: label, width: 40 },
      { text: value, width: CONTENT_WIDTH - 40 },
    ]);
  }
  cursor.gap(2);

  cursor.sectionHeader('Medidas de Controle Existentes');
  cursor.textBlock('Medidas Administrativas:', role?.medidasAdministrativas || '—');
  cursor.textBlock('Medidas de Engenharia:', role?.medidasEngenharia || '—');
  cursor.gap(2);

  cursor.sectionHeader("EPI's Mínimos");
  cursor.textBlock('', role?.episMinimos || '—');
  cursor.gap(2);

  // ── Assinaturas ──
  cursor.sectionHeader('Assinatura do Empregado');
  cursor.cellRow([
    { text: 'Nome:', width: 30, bold: true },
    { text: employee.name, width: CONTENT_WIDTH - 30 - 55 },
    { text: 'Data:', width: 20, bold: true },
    { text: today, width: 35 },
  ]);
  cursor.cellRow([
    { text: 'Cargo / Função:', width: 30, bold: true },
    { text: employee.role, width: CONTENT_WIDTH - 30 },
  ]);
  cursor.sectionHeader('Responsável Setor de Segurança');
  cursor.cellRow([{ text: '', width: CONTENT_WIDTH }], { minHeight: 10 });

  cursor.textBlock(
    '',
    'Confirmo ter recebido e entendido todas as informações expostas na estrutura deste documento através de minha assinatura acima.'
  );
}
