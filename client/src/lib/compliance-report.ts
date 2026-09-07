import jsPDF from 'jspdf';
import type { Employee } from './types';
import { getTrainingStatus } from './training-utils';

/**
 * Mesmo selo circular usado no restante dos PDFs (pdf-export.ts) — repetido
 * aqui pra este arquivo não depender de uma função não-exportada de outro
 * módulo. Mesma linguagem visual do "carimbo" da tela (ComplianceStamp.tsx).
 */
function drawStamp(
  pdf: jsPDF,
  centerX: number,
  centerY: number,
  status: 'expired' | 'expiring' | 'valid' | 'unknown',
  radiusMm: number = 3.5
) {
  const colorByStatus: Record<string, [number, number, number]> = {
    expired: [220, 53, 69],
    expiring: [232, 160, 32],
    valid: [45, 159, 127],
    unknown: [150, 150, 150],
  };
  const [r, g, b] = colorByStatus[status] ?? colorByStatus.unknown;
  pdf.setFillColor(r, g, b);
  pdf.circle(centerX, centerY, radiusMm, 'F');
}

interface EmployeeIssue {
  employee: Employee;
  trainingName: string;
  status: 'expired' | 'expiring';
  label: string;
}

/**
 * Relatório de conformidade — pensado pra ser entregue direto numa
 * fiscalização, sem precisar montar nada na hora. Abre com o que mais
 * importa pra quem está fiscalizando (quem está em não-conformidade agora),
 * e só depois traz a matriz completa de referência.
 *
 * Não existe, hoje, um cadastro de "quais treinamentos cada função exige"
 * no sistema — então este relatório mostra o status do que JÁ está
 * registrado (vencido/vencendo/válido), não o que estaria "faltando"
 * cadastrar. Isso ainda cobre a necessidade central: mostrar rápido quem
 * está com pendência.
 */
export async function generateComplianceReport(
  employees: Employee[],
  contractName: string | null,
  companyName: string | null
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  const now = new Date();
  const activeEmployees = employees.filter((e) => !e.dismissed);

  // Levanta não-conformidades (vencido) e alertas (vencendo) uma vez só,
  // reaproveitados nas duas seções abaixo.
  const expired: EmployeeIssue[] = [];
  const expiring: EmployeeIssue[] = [];
  for (const emp of activeEmployees) {
    for (const training of emp.trainings ?? []) {
      const result = getTrainingStatus(training.expirationDate || '');
      if (result.status === 'expired') {
        expired.push({ employee: emp, trainingName: training.name, status: 'expired', label: result.label });
      } else if (result.status === 'expiring') {
        expiring.push({ employee: emp, trainingName: training.name, status: 'expiring', label: result.label });
      }
    }
  }
  expired.sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  expiring.sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  const employeesWithExpired = new Set(expired.map((i) => i.employee.id)).size;

  function ensureSpace(needed: number) {
    if (yPosition + needed > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin;
    }
  }

  // Cabeçalho
  pdf.setFillColor(26, 35, 50);
  pdf.rect(margin, yPosition, contentWidth, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Relatório de Conformidade — SSMA', margin + 5, yPosition + 10);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const subtitleParts = [companyName, contractName].filter(Boolean);
  if (subtitleParts.length > 0) {
    pdf.text(subtitleParts.join(' — '), margin + 5, yPosition + 17);
  }
  pdf.text(
    `Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`,
    margin + 5,
    yPosition + 23
  );
  pdf.setTextColor(0, 0, 0);
  yPosition += 34;

  // Resumo executivo
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('Resumo executivo', margin, yPosition);
  yPosition += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const summaryLines = [
    `Colaboradores ativos avaliados: ${activeEmployees.length}`,
    `Colaboradores com ao menos um treinamento vencido: ${employeesWithExpired}`,
    `Treinamentos vencidos: ${expired.length}`,
    `Treinamentos vencendo em até 30 dias: ${expiring.length}`,
  ];
  for (const line of summaryLines) {
    pdf.text(line, margin, yPosition);
    yPosition += 5.5;
  }
  yPosition += 4;

  // Seção de não-conformidades
  ensureSpace(20);
  pdf.setFillColor(220, 53, 69);
  pdf.rect(margin, yPosition, contentWidth, 8, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(`Não conformidades — treinamento vencido (${expired.length})`, margin + 3, yPosition + 5.5);
  pdf.setTextColor(0, 0, 0);
  yPosition += 12;

  if (expired.length === 0) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.text('Nenhuma pendência encontrada.', margin, yPosition);
    pdf.setFont('helvetica', 'normal');
    yPosition += 8;
  } else {
    pdf.setFontSize(9);
    for (const issue of expired) {
      ensureSpace(7);
      drawStamp(pdf, margin + 2, yPosition - 1.3, 'expired');
      pdf.setFont('helvetica', 'bold');
      pdf.text(issue.employee.name, margin + 6, yPosition);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${issue.trainingName} — ${issue.label}`, margin + 6, yPosition + 4);
      yPosition += 9;
    }
  }
  yPosition += 3;

  // Seção de vencendo em breve
  ensureSpace(20);
  pdf.setFillColor(232, 160, 32);
  pdf.rect(margin, yPosition, contentWidth, 8, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(`Atenção — vencendo em até 30 dias (${expiring.length})`, margin + 3, yPosition + 5.5);
  pdf.setTextColor(0, 0, 0);
  yPosition += 12;

  if (expiring.length === 0) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.text('Nada vencendo no período.', margin, yPosition);
    pdf.setFont('helvetica', 'normal');
    yPosition += 8;
  } else {
    pdf.setFontSize(9);
    for (const issue of expiring) {
      ensureSpace(7);
      drawStamp(pdf, margin + 2, yPosition - 1.3, 'expiring');
      pdf.setFont('helvetica', 'bold');
      pdf.text(issue.employee.name, margin + 6, yPosition);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${issue.trainingName} — ${issue.label}`, margin + 6, yPosition + 4);
      yPosition += 9;
    }
  }
  yPosition += 3;

  // Matriz completa, pra referência
  pdf.addPage();
  yPosition = margin;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('Matriz completa — todos os colaboradores e treinamentos', margin, yPosition);
  yPosition += 8;

  const sortedEmployees = [...activeEmployees].sort((a, b) => a.name.localeCompare(b.name));
  for (const emp of sortedEmployees) {
    ensureSpace(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(emp.name, margin, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(emp.role || '', margin + contentWidth - 40, yPosition, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
    yPosition += 5;

    const trainings = emp.trainings ?? [];
    if (trainings.length === 0) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8);
      pdf.text('Nenhum treinamento cadastrado.', margin + 4, yPosition);
      pdf.setFont('helvetica', 'normal');
      yPosition += 6;
    } else {
      for (const training of trainings) {
        ensureSpace(6);
        const result = getTrainingStatus(training.expirationDate || '');
        drawStamp(pdf, margin + 3, yPosition - 1.3, result.status, 2.2);
        pdf.setFontSize(8.5);
        pdf.text(`${training.name} — ${result.label}`, margin + 7, yPosition);
        yPosition += 5;
      }
    }
    yPosition += 3;
  }

  // Rodapé com paginação em todas as páginas
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  }

  const fileName = `relatorio-conformidade-${now.toISOString().slice(0, 10)}.pdf`;
  pdf.save(fileName);
}
