import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Employee, FilterType } from './types';
import { getTrainingStatus } from './training-utils';

/**
 * Desenha um selo circular de conformidade no PDF — a mesma linguagem visual
 * do "carimbo" usado na tela (ComplianceStamp.tsx), em vez de um texto colorido
 * solto. Usa apenas os recursos nativos do jsPDF (sem fontes web customizadas).
 */
function drawComplianceStamp(
  pdf: jsPDF,
  centerX: number,
  centerY: number,
  status: 'expired' | 'expiring' | 'valid' | 'unknown',
  radiusMm: number = 4
) {
  const colorByStatus: Record<string, [number, number, number]> = {
    expired: [220, 53, 69],
    expiring: [232, 160, 32],
    valid: [45, 159, 127],
    unknown: [150, 150, 150],
  };
  const labelByStatus: Record<string, string> = {
    expired: 'VENCIDO',
    expiring: 'ATENÇÃO',
    valid: 'VÁLIDO',
    unknown: 'S/ DATA',
  };
  const [r, g, b] = colorByStatus[status] ?? colorByStatus.unknown;
  const label = labelByStatus[status] ?? labelByStatus.unknown;

  pdf.setDrawColor(r, g, b);
  pdf.setLineWidth(0.35);
  pdf.circle(centerX, centerY, radiusMm, 'S');

  pdf.setTextColor(r, g, b);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(5);
  pdf.text(label, centerX, centerY + 0.8, { align: 'center', angle: -8 });
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
}

/**
 * Generate a PDF report for a single employee with their trainings
 */
export async function generateEmployeePDF(employee: Employee): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Header
  pdf.setFillColor(26, 35, 50); // Navy color
  pdf.rect(margin, yPosition, contentWidth, 30, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(20);
  pdf.text('Relatório de Treinamentos', margin + 5, yPosition + 12);
  pdf.setFontSize(10);
  pdf.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, margin + 5, yPosition + 22);

  yPosition += 35;

  // Employee Info
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Colaborador: ${employee.name || ''}`, margin, yPosition);

  yPosition += 8;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Função: ${employee.role || 'Não definida'}`, margin, yPosition);

  yPosition += 12;

  // Trainings Section
  if (!employee.trainings || employee.trainings.length === 0) {
    pdf.setFontSize(11);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Nenhum treinamento cadastrado', margin, yPosition);
  } else {
    // Table header
    pdf.setFillColor(232, 119, 46); // Orange color
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');

    const colWidths = [60, 35, 35, 35];
    const headers = ['Treinamento', 'Realizado', 'Vencimento', 'Status'];

    let xPos = margin;
    for (let i = 0; i < headers.length; i++) {
      pdf.rect(xPos, yPosition, colWidths[i], 8, 'F');
      pdf.text(headers[i], xPos + 2, yPosition + 6);
      xPos += colWidths[i];
    }

    yPosition += 10;

    // Table rows
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);

    for (const training of employee.trainings) {
      const status = getTrainingStatus(training.expirationDate);

      // Alternate row colors
      if (employee.trainings.indexOf(training) % 2 === 0) {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margin, yPosition - 5, contentWidth, 8, 'F');
      }

      xPos = margin;

      // Training name
      pdf.text(training.name || '', xPos + 2, yPosition);
      xPos += colWidths[0];

      // Completion date
      pdf.text(training.completionDate || '', xPos + 2, yPosition);
      xPos += colWidths[1];

      // Expiration date
      pdf.text(training.expirationDate || '', xPos + 2, yPosition);
      xPos += colWidths[2];

      // Status como selo de conformidade (mesma linguagem visual da tela)
      drawComplianceStamp(pdf, xPos + colWidths[3] / 2, yPosition - 2, status.status, 3.2);

      yPosition += 8;

      // Check if we need a new page
      if (yPosition > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
    }
  }

  // Footer
  yPosition = pageHeight - margin;
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Gestão de Treinamentos - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, margin, yPosition);

  // Download
  const fileName = `relatorio_${employee.name.replace(/\s+/g, '_')}.pdf`;
  pdf.save(fileName);
}

/**
 * Generate a comprehensive PDF report for all employees
 */
export async function generateComprehensivePDF(employees: Employee[]): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Header
  pdf.setFillColor(26, 35, 50); // Navy color
  pdf.rect(margin, yPosition, contentWidth, 25, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text('Relatório Geral de Treinamentos', margin + 5, yPosition + 10);
  pdf.setFontSize(10);
  pdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin + 5, yPosition + 18);

  yPosition += 30;

  // Summary statistics
  let totalTrainings = 0;
  let validTrainings = 0;
  let expiringTrainings = 0;
  let expiredTrainings = 0;

  for (const emp of employees) {
    if (emp.trainings) {
      for (const training of emp.trainings) {
        totalTrainings++;
        const status = getTrainingStatus(training.expirationDate || '').status;
        if (status === 'valid') validTrainings++;
        else if (status === 'expiring') expiringTrainings++;
        else if (status === 'expired') expiredTrainings++;
      }
    }
  }

  // Summary boxes
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);

  const summaryItems = [
    { label: 'Total de Treinamentos', value: totalTrainings, color: [26, 35, 50] },
    { label: 'Válidos', value: validTrainings, color: [45, 159, 127] },
    { label: 'Próximos a Vencer', value: expiringTrainings, color: [255, 193, 7] },
    { label: 'Vencidos', value: expiredTrainings, color: [220, 53, 69] },
  ];

  let xPos = margin;
  const boxWidth = contentWidth / 4 - 2;
  for (const item of summaryItems) {
    pdf.setFillColor(item.color[0], item.color[1], item.color[2]);
    pdf.rect(xPos, yPosition, boxWidth, 15, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.text(item.label, xPos + 2, yPosition + 5);
    pdf.setFontSize(14);
    pdf.text(item.value.toString(), xPos + 2, yPosition + 12);
    xPos += boxWidth + 2;
  }

  yPosition += 20;

  // Employee list
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(26, 35, 50);
  pdf.text('Detalhes por Colaborador', margin, yPosition);

  yPosition += 8;

  for (const employee of employees) {
    if (yPosition > pageHeight - 40) {
      pdf.addPage();
      yPosition = margin;
    }

    // Employee name
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(26, 35, 50);
    pdf.text(`${employee.name} (${employee.role || 'Sem função'})`, margin, yPosition);
    yPosition += 6;

    if (!employee.trainings || employee.trainings.length === 0) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(150, 150, 150);
      pdf.text('Nenhum treinamento cadastrado', margin + 5, yPosition);
      yPosition += 6;
    } else {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');

      for (const training of employee.trainings) {
        const status = getTrainingStatus(training.expirationDate || '');
        const statusColor = status.status === 'expired' ? [220, 53, 69] : status.status === 'expiring' ? [255, 193, 7] : [45, 159, 127];

        pdf.setTextColor(0, 0, 0);
        pdf.text(`• ${training.name} (Vence: ${training.expirationDate})`, margin + 5, yPosition);
        yPosition += 4;

        if (yPosition > pageHeight - 20) {
          pdf.addPage();
          yPosition = margin;
        }
      }
    }

    yPosition += 3;
  }

  // Footer
  yPosition = pageHeight - margin;
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Gestão de Treinamentos - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, margin, yPosition);

  // Download
  const fileName = `relatorio_geral_${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(fileName);
}

/**
 * Generate a filtered PDF report based on training status with improved layout
 */
export async function generateFilteredPDF(employees: Employee[], filter: FilterType): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Determine filter label and color
  const filterConfig: Record<FilterType, { label: string; color: number[] }> = {
    all: { label: 'Todos os Treinamentos', color: [26, 35, 50] },
    valid: { label: 'Treinamentos Válidos', color: [45, 159, 127] },
    expiring: { label: 'Treinamentos Próximos a Vencer', color: [255, 193, 7] },
    expired: { label: 'Treinamentos Vencidos', color: [220, 53, 69] },
  };

  const config = filterConfig[filter];

  // Header
  pdf.setFillColor(config.color[0], config.color[1], config.color[2]);
  pdf.rect(margin, yPosition, contentWidth, 25, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text(`Relatório - ${config.label}`, margin + 5, yPosition + 10);
  pdf.setFontSize(9);
  pdf.text(`Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin + 5, yPosition + 18);

  yPosition += 32;

  // Filter employees and trainings based on status
  let filteredCount = 0;
  const employeeData: Array<{ employee: Employee; trainings: Employee['trainings'] }> = [];

  for (const employee of employees) {
    if (!employee.trainings || employee.trainings.length === 0) continue;

    const filteredTrainings = employee.trainings.filter((training) => {
      const status = getTrainingStatus(training.expirationDate || '').status;
      if (filter === 'all') return true;
      return status === filter;
    });

    if (filteredTrainings.length > 0) {
      employeeData.push({ employee, trainings: filteredTrainings });
      filteredCount += filteredTrainings.length;
    }
  }

  // Sort employees alphabetically by name (first name priority)
  employeeData.sort((a, b) => {
    const nameA = (a.employee.name || '').trim().toLowerCase();
    const nameB = (b.employee.name || '').trim().toLowerCase();
    // Extract first name for primary sorting
    const firstNameA = nameA.split(' ')[0];
    const firstNameB = nameB.split(' ')[0];
    const firstNameCompare = firstNameA.localeCompare(firstNameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    // If first names are equal, compare full names
    if (firstNameCompare === 0) {
      return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    }
    return firstNameCompare;
  });

  // Summary
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Total de Treinamentos: ${filteredCount}`, margin, yPosition);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Colaboradores: ${employeeData.length}`, margin + 80, yPosition);

  yPosition += 12;

  // Table header with better spacing
  pdf.setFillColor(config.color[0], config.color[1], config.color[2]);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');

  const colWidths = [50, 50, 40, 35, 35];
  const headers = ['Colaborador', 'Treinamento', 'Função', 'Vencimento', 'Status'];
  const headerHeight = 7;

  let xPos = margin;
  for (let i = 0; i < headers.length; i++) {
    pdf.rect(xPos, yPosition, colWidths[i], headerHeight, 'F');
    pdf.text(headers[i], xPos + 2, yPosition + 5);
    xPos += colWidths[i];
  }

  yPosition += headerHeight + 1;

  // Table rows with proper spacing
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);

  const rowHeight = 6;
  let rowCount = 0;

  for (const { employee, trainings } of employeeData) {
    for (const training of trainings) {
      // Check if we need a new page
      if (yPosition > pageHeight - 15) {
        pdf.addPage();
        yPosition = margin;

        // Repeat header on new page
        pdf.setFillColor(config.color[0], config.color[1], config.color[2]);
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');

        xPos = margin;
        for (let i = 0; i < headers.length; i++) {
          pdf.rect(xPos, yPosition, colWidths[i], headerHeight, 'F');
          pdf.text(headers[i], xPos + 2, yPosition + 5);
          xPos += colWidths[i];
        }

        yPosition += headerHeight + 1;
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
      }

      // Alternate row colors for better readability
      if (rowCount % 2 === 0) {
        pdf.setFillColor(240, 240, 240);
        pdf.rect(margin, yPosition - 1, contentWidth, rowHeight, 'F');
      }

      const status = getTrainingStatus(training.expirationDate || '');

      xPos = margin;

      // Employee name
      pdf.setTextColor(0, 0, 0);
      pdf.text((employee.name || '').substring(0, 30), xPos + 2, yPosition + 4);
      xPos += colWidths[0];

      // Training name
      pdf.text((training.name || '').substring(0, 25), xPos + 2, yPosition + 4);
      xPos += colWidths[1];

      // Function/Role
      pdf.text((employee.role || '').substring(0, 20), xPos + 2, yPosition + 4);
      xPos += colWidths[2];

      // Expiration date
      pdf.text(training.expirationDate || '', xPos + 2, yPosition + 4);
      xPos += colWidths[3];

      // Status como selo de conformidade (mesma linguagem visual da tela)
      drawComplianceStamp(pdf, xPos + colWidths[4] / 2, yPosition + 2.5, status.status, 2.6);

      yPosition += rowHeight;
      rowCount++;
    }
  }

  // Footer
  yPosition = pageHeight - margin;
  pdf.setFontSize(7);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Gestão de Treinamentos - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, margin, yPosition);

  // Download
  const filterName = filter === 'all' ? 'todos' : filter === 'valid' ? 'validos' : filter === 'expiring' ? 'proximos' : 'vencidos';
  const fileName = `relatorio_${filterName}_${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(fileName);
}
