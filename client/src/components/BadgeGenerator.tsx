/**
 * BadgeGenerator Component
 * Generates a PDF badge (front and back) for an employee based on the Mosaic template.
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';

// Helper function to generate a simple QR code placeholder
// In a real app, you'd use a library like qrcode to generate a base64 image
const drawQRCodePlaceholder = (doc: jsPDF, x: number, y: number, size: number) => {
  doc.setFillColor(0, 0, 0);
  doc.rect(x, y, size, size, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 2, y + 2, size - 4, size - 4, 'F');
  
  // Draw some random blocks to look like a QR code
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (Math.random() > 0.5) {
        doc.rect(x + 3 + (i * (size - 6) / 5), y + 3 + (j * (size - 6) / 5), (size - 6) / 5, (size - 6) / 5, 'F');
      }
    }
  }
  
  // Draw position markers
  const markerSize = size * 0.2;
  // Top left
  doc.rect(x + 2, y + 2, markerSize, markerSize, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 3, y + 3, markerSize - 2, markerSize - 2, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(x + 4, y + 4, markerSize - 4, markerSize - 4, 'F');
  
  // Top right
  doc.rect(x + size - markerSize - 2, y + 2, markerSize, markerSize, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + size - markerSize - 1, y + 3, markerSize - 2, markerSize - 2, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(x + size - markerSize, y + 4, markerSize - 4, markerSize - 4, 'F');
  
  // Bottom left
  doc.rect(x + 2, y + size - markerSize - 2, markerSize, markerSize, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 3, y + size - markerSize - 1, markerSize - 2, markerSize - 2, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(x + 4, y + size - markerSize, markerSize - 4, markerSize - 4, 'F');
};

export const generateBadgePDF = (employee: Employee) => {
  // Landscape orientation, A4 size roughly divided in half for front/back
  // The model shows a wide format, likely a folded badge or two separate cards printed side-by-side
  // We'll use a custom size that fits the aspect ratio of the provided image (approx 200x150mm)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [200, 150]
  });

  const black = '#000000';
  const white = '#ffffff';
  const grayBg = '#f2f2f2';
  const grayBorder = '#cccccc';
  const red = '#ff0000';

  // --- FRONT SIDE (Left Half) ---
  // Background
  doc.setFillColor(white);
  doc.rect(0, 0, 100, 150, 'F');
  
  // Border around the front side
  doc.setDrawColor(black);
  doc.setLineWidth(0.5);
  doc.rect(2, 2, 96, 146, 'S');

  // Logo Placeholder (Mosaic text with colored shapes)
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(24);
  doc.setTextColor(black);
  doc.text('Mosaic', 10, 15);
  
  // Draw the little colored shapes under the logo
  doc.setFillColor('#006633'); // Green
  doc.triangle(15, 18, 30, 18, 25, 22, 'F');
  doc.setFillColor('#ff9900'); // Orange
  doc.triangle(31, 18, 45, 18, 35, 22, 'F');
  doc.setFillColor('#99cc00'); // Yellow-green
  doc.triangle(26, 23, 34, 23, 30, 27, 'F');

  // Photo Placeholder
  doc.setFillColor(grayBg);
  doc.rect(10, 30, 35, 45, 'F');
  doc.setDrawColor(grayBorder);
  doc.rect(10, 30, 35, 45, 'S');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#999999');
  doc.text('FOTO', 27.5, 52, { align: 'center' });

  // QR Code Placeholder
  drawQRCodePlaceholder(doc, 10, 80, 35);

  // Employee Info (Right of photo)
  let yInfo = 35;
  doc.setTextColor(black);
  
  // Matrícula
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Matrícula', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.text(employee.registration || 'N/A', 50, yInfo + 5);
  
  // Nome
  yInfo += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Nome', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  // Split name if too long
  const splitName = doc.splitTextToSize(employee.name, 45);
  doc.text(splitName, 50, yInfo + 5);
  
  // Empresa (Fixed)
  yInfo += 15 + (splitName.length - 1) * 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Empresa', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.text('Support Mining', 50, yInfo + 5);
  
  // Gerência/Coord. (Fixed)
  yInfo += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Gerência/Coord.', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.text('Ger. Engenharia', 50, yInfo + 5);
  
  // Área (Fixed)
  yInfo += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Área', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.text('Gerência de Engenharia de', 50, yInfo + 5);
  doc.text('Manutenção', 50, yInfo + 10);

  // Cargo/Função (Variable)
  doc.setFont('helvetica', 'bold');
  doc.text('Cargo/Função', 10, 122);
  doc.setFont('helvetica', 'normal');
  doc.text(employee.role, 10, 127);

  // Funções transitórias (Fixed)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Funções transitórias', 10, 135);

  // Superior/Gestor do contrato (Fixed)
  doc.setFont('helvetica', 'bold');
  doc.text('Superior/Gestor do contrato', 10, 143);
  doc.setFont('helvetica', 'normal');
  doc.text('AGILDO SENA DA SILVA JUNIOR', 10, 147);


  // --- BACK SIDE (Right Half) ---
  // Background
  doc.setFillColor(white);
  doc.rect(100, 0, 100, 150, 'F');
  
  // Border around the back side
  doc.setDrawColor(black);
  doc.setLineWidth(0.5);
  doc.rect(102, 2, 96, 146, 'S');

  // Vertical Name on the left edge of the back side
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#666666');
  
  // Save graphics state, translate, rotate, draw text, restore
  doc.saveGraphicsState();
  // Move origin to the bottom left of the back side text area
  doc.advancedAPI(doc => {
    doc.setCurrentTransformationMatrix(1, 0, 0, 1, 105, 140);
    doc.setCurrentTransformationMatrix(0, -1, 1, 0, 0, 0); // Rotate -90 degrees
  });
  doc.text(employee.name, 0, 0);
  doc.text(employee.name, 60, 0); // Repeat name as in the model
  doc.restoreGraphicsState();

  // Table Header
  const tableX = 110;
  const tableY = 5;
  const col1Width = 55;
  const col2Width = 35;
  const rowHeight = 10;

  doc.setFillColor('#e6e6e6');
  doc.rect(tableX, tableY, col1Width + col2Width, rowHeight, 'F');
  doc.setDrawColor(grayBorder);
  doc.rect(tableX, tableY, col1Width, rowHeight, 'S');
  doc.rect(tableX + col1Width, tableY, col2Width, rowHeight, 'S');

  doc.setTextColor(black);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Qualificação', tableX + (col1Width / 2), tableY + 7, { align: 'center' });
  doc.text('Vencimento', tableX + col1Width + (col2Width / 2), tableY + 7, { align: 'center' });

  // Table Rows (Trainings)
  let currentY = tableY + rowHeight;
  doc.setFontSize(9);

  if (employee.trainings && employee.trainings.length > 0) {
    // Sort trainings: expired first, then by expiration date
    const sortedTrainings = [...employee.trainings].sort((a, b) => {
      const statusA = getTrainingStatus(a.expirationDate).status;
      const statusB = getTrainingStatus(b.expirationDate).status;
      if (statusA === 'expired' && statusB !== 'expired') return -1;
      if (statusA !== 'expired' && statusB === 'expired') return 1;
      return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
    });

    sortedTrainings.forEach((training) => {
      if (currentY > 140) return; // Stop if we run out of space

      const status = getTrainingStatus(training.expirationDate);
      const isExpired = status.status === 'expired';
      
      // Determine row height based on text length
      const splitName = doc.splitTextToSize(training.name, col1Width - 4);
      const actualRowHeight = Math.max(rowHeight, splitName.length * 5 + 4);

      // Draw cell backgrounds
      if (isExpired) {
        doc.setFillColor(red);
        doc.rect(tableX, currentY, col1Width + col2Width, actualRowHeight, 'F');
        doc.setTextColor(white);
      } else {
        doc.setFillColor(white);
        doc.rect(tableX, currentY, col1Width + col2Width, actualRowHeight, 'F');
        doc.setTextColor(black);
      }

      // Draw cell borders
      doc.setDrawColor(grayBorder);
      doc.rect(tableX, currentY, col1Width, actualRowHeight, 'S');
      doc.rect(tableX + col1Width, currentY, col2Width, actualRowHeight, 'S');

      // Draw text
      doc.text(splitName, tableX + (col1Width / 2), currentY + (actualRowHeight / 2) + (splitName.length === 1 ? 1 : -1), { align: 'center', baseline: 'middle' });
      
      const expirationDate = new Date(training.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR');
      doc.text(expirationDate, tableX + col1Width + (col2Width / 2), currentY + (actualRowHeight / 2) + 1, { align: 'center', baseline: 'middle' });

      currentY += actualRowHeight;
    });
  } else {
    // Empty state
    doc.rect(tableX, currentY, col1Width, rowHeight, 'S');
    doc.rect(tableX + col1Width, currentY, col2Width, rowHeight, 'S');
    doc.text('Nenhum treinamento', tableX + (col1Width / 2), currentY + 6, { align: 'center' });
    doc.text('-', tableX + col1Width + (col2Width / 2), currentY + 6, { align: 'center' });
  }

  // Save the PDF
  doc.save(`cracha-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
};
