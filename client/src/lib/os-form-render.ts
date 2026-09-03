/**
 * Layout da Ordem de Serviço (NR-01) — reproduz visualmente o modelo em
 * planilha enviado pelo administrador: barras de título em azul marinho
 * (RGB 0,32,96) com texto branco em negrito, campos em caixas com borda
 * dispostos em grade (como uma planilha), e uma tabela de Agentes
 * Ambientais com cabeçalho. Fonte Caladea (compatível com Cambria).
 *
 * SEMPRE UMA PÁGINA SÓ: como o conteúdo por função/contrato tem tamanho
 * livre (o admin escreve o quanto quiser), o desenho roda em duas
 * passadas — a primeira só mede a altura total que o conteúdo ocuparia
 * em tamanho normal, a segunda desenha de verdade já aplicando a escala
 * necessária pra caber tudo numa folha A4 (mesma ideia do "ajustar à
 * página" do Excel, que a planilha original já usava, a 64%).
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
import { registerCaladeaFont, FONT_NAME } from '@/lib/fonts/caladea-font';

const MARGIN = 8; // margem pequena — usa quase toda a folha A4
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN;
// Nunca deixa o texto menor que isso, mesmo que o conteúdo seja extenso
// demais pra uma página — nesse caso extremo, deixa a 2ª página como
// último recurso em vez de gerar algo ilegível.
const MIN_SCALE = 0.6;

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
}

export type OsPageData = {
  employee: Employee;
  contractName: string;
  companyName: string;
  role: OsRoleData | null;
  /**
   * "Medidas de Controle Existentes" — fixo dentro do contrato (mesmo
   * texto pra todas as funções), configurado uma vez em Documentação →
   * OS por Função → "padrão do contrato".
   */
  osDefaults: {
    medidasAdministrativas: string | null;
    medidasEngenharia: string | null;
    episMinimos: string | null;
  };
};

// Texto fixo — nunca editável pelo admin nem tocado pela IA (ver
// OsRoleConfigModal e pgr-extraction.ts, que não incluem estes campos).
const OBRIGACOES_EMPREGADO = [
  'Cumprir as disposições legais e regulamentares sobre segurança e saúde no trabalho, inclusive as ordens de serviço expedidas pelo empregador;',
  'Submeter-se aos exames médicos previstos nas NR;',
  'Colaborar com a organização na aplicação das NR;',
  'Usar o equipamento de proteção individual fornecido pelo empregador;',
  'Constitui ato faltoso a recusa injustificada do empregado ao cumprimento do disposto nas alíneas do subitem anterior;',
  'O trabalhador poderá interromper suas atividades quando constatar uma situação de trabalho onde, a seu ver, envolva um risco grave e iminente para a sua vida e saúde, informando imediatamente ao seu superior hierárquico;',
  'Comprovada pelo empregador a situação de grave e iminente risco, não poderá ser exigida a volta dos trabalhadores à atividade, enquanto não sejam tomadas as medidas corretivas;',
  'Comunicar todas as condições inseguras presentes no ambiente de trabalho;',
  'Elaborar a Análise Preliminar de Riscos antes do início das atividades, salvo quando houver procedimento específico para estas; o empregado deve estudar previamente os riscos associados à tarefa e, se as tarefas ou as circunstâncias nas quais estiver trabalhando mudarem, deverá parar o que estiver fazendo para reavaliar os riscos;',
  'Usar obrigatoriamente os equipamentos de proteção individual conforme indicados para a função;',
  'Manter a ordem, disciplina, higiene e segurança no seu ambiente de trabalho;',
  'Participar de treinamentos de integração, específicos para função e relacionados aos padrões operacionais, saúde, segurança e higiene ocupacional;',
  'Executar as tarefas que lhe forem delegadas após treinamento específico para execução da mesma;',
  'Acompanhar as atividades realizadas em seu ambiente de trabalho e orientar os companheiros de trabalho que se exporem a situações de risco;',
  'Colaborar com a Empresa na aplicação das normas regulamentadoras expedidas pela Secretaria do Trabalho do Ministério da Economia;',
  'Qualquer dúvida ou anormalidade antes da execução das atividades no ambiente de trabalho, paralisar a atividade e solicitar orientações ao seu superior hierárquico e/ou líder imediato;',
  'Em caso de contato/exposição a situação de risco grave e iminente, exercer o direito de recusa, envolver a liderança imediata e buscar interdisciplinarmente uma alternativa segura para a execução das atividades.',
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
  align?: 'left' | 'center';
}

/**
 * Cursor de desenho. Em modo `dryRun`, nunca desenha nem quebra página —
 * só soma a altura em `y` pra sabermos o quanto o conteúdo ocuparia. Em
 * modo real, desenha de verdade com todos os tamanhos multiplicados por
 * `scale` (calculado depois da primeira passada).
 */
class Cursor {
  y = MARGIN;
  constructor(private doc: jsPDF, private scale: number, private dryRun: boolean) {}

  private s(mm: number): number {
    return mm * this.scale;
  }

  ensureSpace(height: number) {
    if (this.dryRun) return; // a passada de medição nunca quebra página
    if (this.y + height > BOTTOM_LIMIT) {
      this.doc.addPage('a4', 'portrait');
      this.y = MARGIN;
    }
  }

  gap(mm: number) {
    this.y += this.s(mm);
  }

  private measureLines(text: string, usableWidth: number, fontSize: number): string[] {
    this.doc.setFontSize(fontSize);
    return this.doc.splitTextToSize(text, usableWidth) as string[];
  }

  /** Cabeçalho principal: barra azul marinho com título + Nº/Data à direita. */
  mainHeader(dateLabel: string) {
    const height = this.s(11);
    this.ensureSpace(height);
    if (!this.dryRun) {
      const { doc } = this;
      doc.setFillColor(...NAVY);
      doc.rect(MARGIN, this.y, CONTENT_WIDTH, height, 'F');
      doc.setDrawColor(...BORDER_GRAY);
      doc.rect(MARGIN, this.y, CONTENT_WIDTH, height, 'S');
      const numDataX = MARGIN + CONTENT_WIDTH - this.s(40);
      doc.line(numDataX, this.y, numDataX, this.y + height);

      doc.setTextColor(...WHITE);
      doc.setFont(FONT_NAME, 'bold');
      doc.setFontSize(this.s(10.5));
      doc.text(
        'ORDEM DE SERVIÇO CONFORME NR 01 - DISPOSIÇÕES GERAIS',
        MARGIN + (CONTENT_WIDTH - this.s(40)) / 2,
        this.y + this.s(5),
        { align: 'center' }
      );
      doc.setFont(FONT_NAME, 'normal');
      doc.setFontSize(this.s(6.3));
      doc.text(
        'Conforme item 1.4 - Direitos e Deveres do Empregador e do Empregado',
        MARGIN + (CONTENT_WIDTH - this.s(40)) / 2,
        this.y + this.s(8.7),
        { align: 'center' }
      );

      doc.setFont(FONT_NAME, 'bold');
      doc.setFontSize(this.s(7.8));
      doc.text('Nº:', numDataX + this.s(2), this.y + this.s(4.7));
      doc.text(dateLabel, numDataX + this.s(2), this.y + this.s(8.7));
      doc.setTextColor(...BLACK);
    }
    this.y += height;
  }

  /**
   * Uma barra de título em azul marinho com texto branco em negrito —
   * mesmo visual das seções do modelo (fill FF002060).
   */
  sectionHeader(text: string) {
    const height = this.s(5.6);
    this.ensureSpace(height);
    if (!this.dryRun) {
      const { doc } = this;
      doc.setFillColor(...NAVY);
      doc.setDrawColor(...NAVY);
      doc.rect(MARGIN, this.y, CONTENT_WIDTH, height, 'FD');
      doc.setFont(FONT_NAME, 'bold');
      doc.setFontSize(this.s(8.3));
      doc.setTextColor(...WHITE);
      doc.text(text, MARGIN + this.s(2), this.y + height / 2 + this.s(1.2));
      doc.setTextColor(...BLACK);
    }
    this.y += height;
  }

  /**
   * Uma linha de caixas com borda lado a lado (label em negrito + valor).
   * Todas as caixas da linha compartilham a mesma altura (a maior delas).
   */
  cellRow(cells: CellSpec[], opts?: { minHeight?: number }) {
    const padding = this.s(1.4);
    const fontSize = this.s(7.2);
    const lineHeight = this.s(3.05);

    const lineSets = cells.map((cell) => this.measureLines(cell.text, cell.width - padding * 2, fontSize));
    const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
    const height = Math.max(this.s(opts?.minHeight ?? 0), maxLines * lineHeight + padding * 2);

    this.ensureSpace(height);
    if (!this.dryRun) {
      const { doc } = this;
      let x = MARGIN;
      cells.forEach((cell, i) => {
        doc.setDrawColor(...BORDER_GRAY);
        doc.rect(x, this.y, cell.width, height, 'S');
        doc.setFont(FONT_NAME, cell.bold ? 'bold' : 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(...BLACK);
        const lines = lineSets[i];
        const textX = cell.align === 'center' ? x + cell.width / 2 : x + padding;
        lines.forEach((line, li) => {
          doc.text(line, textX, this.y + padding + lineHeight * (li + 1) - this.s(0.8), {
            align: cell.align === 'center' ? 'center' : 'left',
          });
        });
        x += cell.width;
      });
    }
    this.y += height;
  }

  /** Uma caixa larga (label acima, texto corrido abaixo) — pra blocos longos. */
  textBlock(label: string, value: string, opts?: { minHeight?: number }) {
    const padding = this.s(1.7);
    const fontSize = this.s(7.2);
    const lineHeight = this.s(3.15);
    const lines = this.measureLines(value, CONTENT_WIDTH - padding * 2, fontSize);
    const labelHeight = label ? this.s(3.6) : 0;
    const height = Math.max(this.s(opts?.minHeight ?? 0), labelHeight + lines.length * lineHeight + padding * 2);

    this.ensureSpace(height);
    if (!this.dryRun) {
      const { doc } = this;
      doc.setDrawColor(...BORDER_GRAY);
      doc.rect(MARGIN, this.y, CONTENT_WIDTH, height, 'S');

      let textY = this.y + padding;
      if (label) {
        doc.setFont(FONT_NAME, 'bold');
        doc.setFontSize(fontSize);
        doc.text(label, MARGIN + padding, textY + this.s(2.5));
        textY += labelHeight;
      }
      doc.setFont(FONT_NAME, 'normal');
      doc.setFontSize(fontSize);
      lines.forEach((line, li) => {
        doc.text(line, MARGIN + padding, textY + lineHeight * (li + 1) - this.s(0.8));
      });
    }
    this.y += height;
  }

  /** Caixa com borda contendo uma lista numerada (Obrigações do Empregado). */
  numberedBox(items: string[]) {
    const padding = this.s(1.5);
    const fontSize = this.s(7);
    const lineHeight = this.s(3.05);
    const numbered = items.map((text, i) => `${String(i + 1).padStart(2, '0')} - ${text}`);
    this.doc.setFontSize(fontSize);
    const allLines = numbered.map((t) => this.doc.splitTextToSize(t, CONTENT_WIDTH - padding * 2) as string[]);
    const totalLines = allLines.reduce((sum, l) => sum + l.length, 0);
    const height = totalLines * lineHeight + padding * 2;

    this.ensureSpace(height);
    if (!this.dryRun) {
      const { doc } = this;
      doc.setDrawColor(...BORDER_GRAY);
      doc.rect(MARGIN, this.y, CONTENT_WIDTH, height, 'S');
      doc.setFont(FONT_NAME, 'normal');
      doc.setFontSize(fontSize);
      let ty = this.y + padding;
      allLines.forEach((lines) => {
        lines.forEach((line) => {
          doc.text(line, MARGIN + padding, ty + lineHeight - this.s(0.7));
          ty += lineHeight;
        });
      });
    }
    this.y += height;
  }
}

/** Todo o conteúdo da Ordem de Serviço, desenhado através do cursor dado. */
function layoutDocument(cursor: Cursor, data: OsPageData, today: string) {
  const { employee, contractName, companyName, role, osDefaults } = data;

  cursor.mainHeader(`Data: ${today}`);

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
  cursor.gap(1);

  cursor.sectionHeader('Conceito Legal da Norma Regulamentadora NR 1 - Disposições Gerais');
  cursor.textBlock(
    '',
    'Conforme estabelecido pelo item 1.4 da NR 01 - Disposições Gerais cabe ao Empregador elaborar Ordem de Serviço e informar aos trabalhadores os riscos ocupacionais existentes nos locais de trabalho, as medidas de controle adotadas pela empresa para reduzir ou eliminar tais riscos, os resultados dos exames médicos e de exames complementares de diagnóstico aos quais os próprios trabalhadores forem submetidos e os resultados das avaliações ambientais realizadas nos locais de trabalho.'
  );
  cursor.gap(1);

  cursor.sectionHeader('Objetivos');
  cursor.textBlock(
    '',
    'Informar os Trabalhadores sobre os agentes ambientais de risco Físico, Químico, Biológico, Ergonômico e Acidentes bem como dar ciência aos trabalhadores sobre as doenças ocupacionais relativas ao ambiente de trabalho exposto. Instruí-los quanto a forma de eliminar, neutralizar ou minimizar os efeitos pelo contato com os riscos através da conscientização, medidas administrativas, medidas de controle coletivo e o fornecimento, manutenção e controle da periodicidade de troca dos Equipamentos de Proteção Individual.'
  );
  cursor.gap(1);

  cursor.sectionHeader('Obrigações do Empregado');
  cursor.numberedBox(OBRIGACOES_EMPREGADO);
  cursor.gap(1);

  cursor.sectionHeader('Descrição das atividades do Setor / Frente de Serviço');
  cursor.textBlock('Tarefa:', role?.tarefas || '—');
  cursor.gap(1);

  cursor.sectionHeader('Relação de Insumos do Setor de Trabalho');
  cursor.textBlock('Máquinas, Equipamentos e Ferramentas:', role?.maquinasEquipamentos || '—');
  cursor.gap(1);

  cursor.sectionHeader('Agentes Ambientais');
  cursor.cellRow([
    { text: 'Tipo de Agente', width: 40, bold: true },
    { text: 'Descrição do Agente', width: CONTENT_WIDTH - 40, bold: true },
  ]);
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
  cursor.gap(1);

  // Fixo por contrato (não por função) — configurado uma vez em
  // Documentação → OS por Função → "padrão do contrato". EPI's Mínimos
  // fica dentro desta mesma seção, sem cabeçalho próprio.
  cursor.sectionHeader('Medidas de Controle Existentes');
  cursor.textBlock('Medidas Administrativas:', osDefaults.medidasAdministrativas || '—');
  cursor.textBlock('Medidas de Engenharia:', osDefaults.medidasEngenharia || '—');
  cursor.textBlock("EPI's Mínimos:", osDefaults.episMinimos || '—');
  cursor.gap(1);

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
  cursor.cellRow([{ text: '', width: CONTENT_WIDTH }], { minHeight: 8 });

  cursor.textBlock(
    '',
    'Confirmo ter recebido e entendido todas as informações expostas na estrutura deste documento através de minha assinatura acima.'
  );
}

export async function renderOsFormPage(doc: jsPDF, data: OsPageData): Promise<void> {
  registerCaladeaFont(doc);
  const today = formatDateBR(new Date());

  // Passada 1: mede quanto o conteúdo ocuparia em tamanho normal (escala 1),
  // sem desenhar nada e sem nunca quebrar página.
  const measureCursor = new Cursor(doc, 1, true);
  layoutDocument(measureCursor, data, today);
  const contentHeight = measureCursor.y - MARGIN;
  const availableHeight = PAGE_HEIGHT - MARGIN * 2;

  // Passada 2: desenha de verdade, encolhendo o quanto for preciso pra
  // caber numa página só (nunca frente e verso) — só ultrapassa o limite
  // mínimo de escala em casos extremos de conteúdo excepcionalmente longo.
  const scale = Math.max(MIN_SCALE, Math.min(1, availableHeight / contentHeight));
  const cursor = new Cursor(doc, scale, false);
  layoutDocument(cursor, data, today);
}
