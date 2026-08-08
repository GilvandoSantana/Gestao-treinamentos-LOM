/*
 * Exportação de todos os dados de um colaborador — pensado para atender um
 * pedido de acesso aos dados pessoais (LGPD) ou uma fiscalização que peça o
 * histórico completo de uma pessoa específica.
 *
 * Diferente do "Relatório de Treinamentos" (generateEmployeePDF), que é um
 * comprovante enxuto de conformidade, este documento lista todo campo
 * cadastrado, com data de emissão — o formato que uma resposta a titular
 * costuma exigir.
 */

import jsPDF from 'jspdf';
import type { Employee, Certificate } from './types';
import { getTrainingStatus } from './training-utils';

function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

const STATUS_LABEL: Record<string, string> = {
  expired: 'Vencido',
  expiring: 'Vencendo',
  valid: 'Válido',
  unknown: 'Sem data',
};

export function generateEmployeeDataExportPDF(
  employee: Employee,
  certificates: Certificate[] = [],
  contractName: string = '—'
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    pdf.setFillColor(232, 119, 46);
    pdf.rect(margin, y, contentWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, margin + 3, y + 5.5);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    y += 12;
  };

  const field = (label: string, value: string) => {
    ensureSpace(7);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value, margin + 45, y);
    y += 6.5;
  };

  // Cabeçalho
  pdf.setFillColor(26, 35, 50);
  pdf.rect(margin, y, contentWidth, 26, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Exportação de Dados do Colaborador', margin + 5, y + 11);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Emitido em ${formatDateTime(new Date())}`, margin + 5, y + 19);
  pdf.setTextColor(0, 0, 0);
  y += 32;

  // Dados cadastrais
  sectionTitle('Dados cadastrais');
  field('Nome', employee.name || '—');
  field('Matrícula', employee.registration || '—');
  field('Função', employee.role || '—');
  field('Escolaridade', employee.educationLevel || '—');
  field('Data de nascimento', formatDate(employee.birthDate));
  field('Telefone', employee.phone || '—');
  field('Contrato', contractName);
  field('Situação', employee.dismissed ? `Demitido em ${formatDate(employee.dismissedAt)}` : 'Ativo');
  field('Última atualização', formatDateTime(employee.updatedAt));
  if (employee.customFields && Object.keys(employee.customFields).length > 0) {
    for (const [key, value] of Object.entries(employee.customFields)) {
      if (value) field(key, value);
    }
  }
  y += 4;

  // Treinamentos
  sectionTitle(`Treinamentos (${employee.trainings?.length ?? 0})`);
  if (!employee.trainings || employee.trainings.length === 0) {
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Nenhum treinamento cadastrado.', margin, y);
    pdf.setTextColor(0, 0, 0);
    y += 8;
  } else {
    for (const training of employee.trainings) {
      ensureSpace(14);
      const status = getTrainingStatus(training.expirationDate);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`• ${training.name}`, margin, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(
        `Realizado: ${formatDate(training.completionDate)}   Vencimento: ${formatDate(
          training.expirationDate
        )}   Situação: ${STATUS_LABEL[status.status]}`,
        margin + 4,
        y
      );
      y += 7;
    }
  }
  y += 2;

  // Certificados anexados
  sectionTitle(`Certificados anexados (${certificates.length})`);
  if (certificates.length === 0) {
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Nenhum certificado anexado.', margin, y);
    pdf.setTextColor(0, 0, 0);
    y += 8;
  } else {
    for (const cert of certificates) {
      ensureSpace(7);
      pdf.setFontSize(9);
      pdf.text(`• ${cert.fileName} — anexado em ${formatDate(cert.uploadedAt || cert.createdAt)}`, margin, y);
      y += 6;
    }
  }

  // Rodapé em cada página
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `Documento gerado pelo sistema de Gestão de Controle dos Contratos — página ${i} de ${pageCount}`,
      margin,
      pageHeight - 8
    );
  }

  const safeName = (employee.name || 'colaborador').toLowerCase().replace(/\s+/g, '-');
  pdf.save(`dados-${safeName}.pdf`);
}
