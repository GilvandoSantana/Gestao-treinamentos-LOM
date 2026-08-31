/**
 * Layout puro da Ordem de Serviço (NR-01).
 *
 * Reproduz o modelo em planilha enviado pelo administrador: uma página A4
 * retrato por colaborador, com o texto legal fixo da NR-01 e os dados da
 * função (área, tarefas, agentes ambientais, medidas de controle, EPIs
 * mínimos) vindos da configuração por função de cada contrato.
 *
 * Diferente da Ficha de EPI (grade fixa calibrada para caber em 1 página),
 * aqui o conteúdo por função tem tamanho livre (o admin escreve o quanto
 * quiser) — por isso o desenho flui verticalmente e quebra de página
 * sozinho quando necessário, em vez de forçar tudo em uma página só.
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';

const MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - 16;

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

  /** Um título de seção (fundo cinza, texto em negrito). */
  sectionTitle(text: string) {
    this.ensureSpace(7);
    this.doc.setFillColor(230, 230, 230);
    this.doc.rect(MARGIN, this.y, CONTENT_WIDTH, 6, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(0, 0, 0);
    this.doc.text(text, MARGIN + 2, this.y + 4.3);
    this.y += 6 + 2;
  }

  /** Um bloco "Rótulo: texto corrido", com o rótulo em negrito. */
  labelValue(label: string, value: string, opts?: { labelWidth?: number }) {
    const labelWidth = opts?.labelWidth ?? this.doc.getTextWidth(label) + 2;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8.5);
    const lines: string[] = this.doc.splitTextToSize(value || '—', CONTENT_WIDTH - labelWidth);
    this.ensureSpace(lines.length * 4 + 2);
    this.doc.text(label, MARGIN, this.y + 3.2);
    this.doc.setFont('helvetica', 'normal');
    lines.forEach((line, i) => {
      this.doc.text(line, MARGIN + labelWidth, this.y + 3.2 + i * 4);
    });
    this.y += lines.length * 4 + 2;
  }

  /** Parágrafo de texto corrido, justificado à largura do conteúdo. */
  paragraph(text: string, opts?: { fontSize?: number; bold?: boolean }) {
    const fontSize = opts?.fontSize ?? 7.8;
    this.doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    this.doc.setFontSize(fontSize);
    const lines: string[] = this.doc.splitTextToSize(text, CONTENT_WIDTH);
    const lineHeight = fontSize * 0.42;
    for (const line of lines) {
      this.ensureSpace(lineHeight + 0.5);
      this.doc.text(line, MARGIN, this.y + lineHeight);
      this.y += lineHeight;
    }
    this.y += 1.5;
  }

  /** Lista numerada, uma linha (ou mais, se precisar quebrar) por item. */
  numberedList(items: string[]) {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7.8);
    items.forEach((item, index) => {
      const prefix = `${index + 1}. `;
      const lines: string[] = this.doc.splitTextToSize(item, CONTENT_WIDTH - 5);
      lines.forEach((line, i) => {
        this.ensureSpace(3.6);
        this.doc.text(i === 0 ? prefix + line : line, MARGIN + (i === 0 ? 0 : 5), this.y + 3);
        this.y += 3.6;
      });
    });
    this.y += 1.5;
  }
}

export async function renderOsFormPage(doc: jsPDF, data: OsPageData): Promise<void> {
  const { employee, contractName, companyName, role } = data;
  const cursor = new Cursor(doc);
  const today = formatDateBR(new Date());

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('ORDEM DE SERVIÇO CONFORME NR 01 - DISPOSIÇÕES GERAIS', PAGE_WIDTH / 2, cursor.y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Conforme item 1.4 - Direitos e Deveres do Empregador e do Empregado', PAGE_WIDTH / 2, cursor.y + 9, {
    align: 'center',
  });
  doc.setFontSize(8);
  doc.text(`Data: ${today}`, PAGE_WIDTH - MARGIN, cursor.y + 4, { align: 'right' });
  cursor.gap(15);

  cursor.labelValue('Empresa: ', companyName || '—');
  cursor.labelValue('Área: ', role?.area || '—');
  cursor.gap(1);
  cursor.labelValue('Empregado: ', employee.name);
  cursor.labelValue('CPF: ', employee.cpf || '—');
  cursor.gap(1);
  cursor.labelValue('Cargo: ', employee.role);
  cursor.labelValue('Setor de Trabalho: ', role?.setorTrabalho || '—');
  cursor.gap(1);
  cursor.labelValue('Gerência: ', employee.gerencia || '—');
  cursor.gap(1);
  cursor.labelValue('Contrato: ', contractName);
  cursor.gap(3);

  cursor.sectionTitle('Conceito Legal da Norma Regulamentadora NR 1 - Disposições Gerais');
  cursor.paragraph(
    'Conforme estabelecido pelo item 1.4 da NR 01 - Disposições Gerais cabe ao Empregador elaborar Ordem de Serviço e informar aos trabalhadores os riscos ocupacionais existentes nos locais de trabalho, as medidas de controle adotadas pela empresa para reduzir ou eliminar tais riscos, os resultados dos exames médicos e de exames complementares de diagnóstico aos quais os próprios trabalhadores forem submetidos e os resultados das avaliações ambientais realizadas nos locais de trabalho.'
  );

  cursor.sectionTitle('Objetivos');
  cursor.paragraph(
    'Informar os Trabalhadores sobre os agentes ambientais de risco Físico, Químico, Biológico, Ergonômico e Acidentes bem como dar ciência aos trabalhadores sobre as doenças ocupacionais relativas ao ambiente de trabalho exposto. Instruí-los quanto a forma de eliminar, neutralizar ou minimizar os efeitos pelo contato com os riscos através da conscientização, medidas administrativas, medidas de controle coletivo e o fornecimento, manutenção e controle da periodicidade de troca dos Equipamentos de Proteção Individual.'
  );

  cursor.sectionTitle('Obrigações do Empregado');
  cursor.numberedList(OBRIGACOES_EMPREGADO);

  cursor.sectionTitle('Descrição das atividades do Setor / Frente de Serviço');
  cursor.labelValue('Tarefa: ', role?.tarefas || '—', { labelWidth: 14 });

  cursor.sectionTitle('Relação de Insumos do Setor de Trabalho');
  cursor.labelValue('Máquinas, Equipamentos e Ferramentas: ', role?.maquinasEquipamentos || '—');

  cursor.sectionTitle('Agentes Ambientais');
  cursor.labelValue('Físicos: ', role?.agentesFisicos || '—');
  cursor.labelValue('Químicos: ', role?.agentesQuimicos || '—');
  cursor.labelValue('Biológicos: ', role?.agentesBiologicos || 'NA.');
  cursor.labelValue('Ergonômico: ', role?.agentesErgonomicos || '—');
  cursor.labelValue('Acidentes: ', role?.agentesAcidentes || '—');

  cursor.sectionTitle('Medidas de Controle Existentes');
  cursor.labelValue('Medidas Administrativas: ', role?.medidasAdministrativas || '—');
  cursor.labelValue('Medidas de Engenharia: ', role?.medidasEngenharia || '—');

  cursor.sectionTitle("EPI's Mínimos");
  cursor.paragraph(role?.episMinimos || '—');

  // Assinaturas
  cursor.ensureSpace(30);
  cursor.gap(4);
  doc.setDrawColor(0, 0, 0);
  doc.line(MARGIN, cursor.y, MARGIN + 85, cursor.y);
  doc.line(MARGIN + 95, cursor.y, MARGIN + CONTENT_WIDTH, cursor.y);
  cursor.gap(3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Assinatura do Empregado', MARGIN, cursor.y);
  doc.text('Responsável Setor de Segurança', MARGIN + 95, cursor.y);
  cursor.gap(5);
  doc.text(`Nome: ${employee.name}`, MARGIN, cursor.y);
  cursor.gap(4);
  doc.text(`Cargo / Função: ${employee.role}`, MARGIN, cursor.y);
  doc.text(`Data: ${today}`, MARGIN + 95, cursor.y);
  cursor.gap(6);
  cursor.paragraph(
    'Confirmo ter recebido e entendido todas as informações expostas na estrutura deste documento através de minha assinatura acima.',
    { fontSize: 7 }
  );
}
