/**
 * BadgeGenerator Component
 * Generates a PDF badge (front and back) for an employee.
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';

interface BadgeGeneratorProps {
  employee: Employee;
}

export const generateBadgePDF = (employee: Employee) => {
  // Standard badge size: 54mm x 86mm (CR80)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [54, 86]
  });

  const navy = '#1a2332';
  const orange = '#e8772e';
  const white = '#ffffff';
  const gray = '#f4f1ed';

  // --- FRONT SIDE ---
  // Background
  doc.setFillColor(navy);
  doc.rect(0, 0, 54, 86, 'F');

  // Header bar
  doc.setFillColor(orange);
  doc.rect(0, 0, 54, 15, 'F');

  // Title
  doc.setTextColor(white);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('GESTÃO DE TREINAMENTOS', 27, 8, { align: 'center' });
  doc.setFontSize(8);
  doc.text('LOM', 27, 12, { align: 'center' });

  // Profile Placeholder (Circle)
  doc.setDrawColor(white);
  doc.setLineWidth(0.5);
  doc.circle(27, 35, 12, 'S');
  doc.setFontSize(20);
  doc.text(employee.name.charAt(0).toUpperCase(), 27, 38, { align: 'center' });

  // Employee Name
  doc.setFontSize(12);
  doc.text(employee.name.toUpperCase(), 27, 55, { align: 'center', maxWidth: 48 });

  // Role
  doc.setFontSize(9);
  doc.setTextColor(orange);
  doc.text(employee.role.toUpperCase(), 27, 65, { align: 'center', maxWidth: 48 });

  // Registration
  doc.setTextColor(white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`MATRÍCULA: ${employee.registration || 'N/A'}`, 27, 75, { align: 'center' });

  // Footer
  doc.setFillColor(orange);
  doc.rect(0, 82, 54, 4, 'F');

  // --- BACK SIDE ---
  doc.addPage([54, 86], 'portrait');

  // Background
  doc.setFillColor(gray);
  doc.rect(0, 0, 54, 86, 'F');

  // Header
  doc.setFillColor(navy);
  doc.rect(0, 0, 54, 12, 'F');
  doc.setTextColor(white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TREINAMENTOS', 27, 8, { align: 'center' });

  // Trainings List
  let yPos = 18;
  doc.setTextColor(navy);
  doc.setFontSize(7);

  if (employee.trainings && employee.trainings.length > 0) {
    employee.trainings.forEach((training, index) => {
      if (yPos > 75) return; // Limit to fit on one page

      const status = getTrainingStatus(training.expirationDate);
      
      // Training Name
      doc.setFont('helvetica', 'bold');
      doc.text(training.name.toUpperCase(), 5, yPos, { maxWidth: 44 });
      yPos += 4;

      // Dates
      doc.setFont('helvetica', 'normal');
      const completionDate = new Date(training.completionDate + 'T00:00:00').toLocaleDateString('pt-BR');
      const expirationDate = new Date(training.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR');
      doc.text(`REALIZADO: ${completionDate} | VENC: ${expirationDate}`, 5, yPos);
      
      // Status indicator
      if (status.status === 'expired') {
        doc.setTextColor('#ff0000');
        doc.text('EXPIRADO', 48, yPos, { align: 'right' });
        doc.setTextColor(navy);
      }

      yPos += 6;
      
      // Separator line
      doc.setDrawColor('#cccccc');
      doc.setLineWidth(0.1);
      doc.line(5, yPos - 2, 49, yPos - 2);
    });
  } else {
    doc.text('NENHUM TREINAMENTO REGISTRADO', 27, 40, { align: 'center' });
  }

  // Footer info
  doc.setFontSize(6);
  doc.setTextColor('#666666');
  doc.text('Este documento é para fins de identificação interna.', 27, 82, { align: 'center' });

  // Save the PDF
  doc.save(`cracha-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
};
