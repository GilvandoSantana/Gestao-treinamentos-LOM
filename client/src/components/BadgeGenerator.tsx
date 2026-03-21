/**
 * BadgeGenerator Component
 * Generates a PDF badge (front and back) for an employee based on the Mosaic template.
 * Supports employee photo.
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';

// Helper to load image from URL and convert to base64
const loadImage = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = reject;
    img.src = url;
  });
};

const drawQRCodePlaceholder = (doc: jsPDF, x: number, y: number, size: number) => {
  doc.setFillColor(0, 0, 0);
  doc.rect(x, y, size, size, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 2, y + 2, size - 4, size - 4, 'F');
  
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (Math.random() > 0.5) {
        doc.rect(x + 3 + (i * (size - 6) / 5), y + 3 + (j * (size - 6) / 5), (size - 6) / 5, (size - 6) / 5, 'F');
      }
    }
  }
  
  const markerSize = size * 0.2;
  doc.rect(x + 2, y + 2, markerSize, markerSize, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 3, y + 3, markerSize - 2, markerSize - 2, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(x + 4, y + 4, markerSize - 4, markerSize - 4, 'F');
  
  doc.rect(x + size - markerSize - 2, y + 2, markerSize, markerSize, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + size - markerSize - 1, y + 3, markerSize - 2, markerSize - 2, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(x + size - markerSize, y + 4, markerSize - 4, markerSize - 4, 'F');
  
  doc.rect(x + 2, y + size - markerSize - 2, markerSize, markerSize, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 3, y + size - markerSize - 1, markerSize - 2, markerSize - 2, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(x + 4, y + size - markerSize, markerSize - 4, markerSize - 4, 'F');
};

export const generateBadgePDF = async (employee: Employee) => {
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
  doc.setFillColor(white);
  doc.rect(0, 0, 100, 150, 'F');
  
  doc.setDrawColor(black);
  doc.setLineWidth(0.5);
  doc.rect(2, 2, 96, 146, 'S');

  // Stratos Logo
  const stratosLogoBase64 = "iVBORw0KGgoAAAANSUhEUgAAAlgAAAGQCAYAAACO09lbAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAA...[CONTEÚDO_BASE64_TRUNCADO]...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KoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKoiiKQjzv/wey9pBDelRAYgAAAABJRU5ErkJggg==";
  doc.addImage(stratosLogoBase64, 'PNG', 10, 5, 40, 25);

  // Photo Area
  if (employee.photoUrl) {
    try {
      const photoBase64 = await loadImage(employee.photoUrl);
      doc.addImage(photoBase64, 'JPEG', 10, 30, 35, 45);
    } catch (error) {
      console.error('Error loading employee photo:', error);
      doc.setFillColor(grayBg);
      doc.rect(10, 30, 35, 45, 'F');
      doc.setDrawColor(grayBorder);
      doc.rect(10, 30, 35, 45, 'S');
    }
  } else {
    doc.setFillColor(grayBg);
    doc.rect(10, 30, 35, 45, 'F');
    doc.setDrawColor(grayBorder);
    doc.rect(10, 30, 35, 45, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#999999');
    doc.text('FOTO', 27.5, 52, { align: 'center' });
  }

  // Real QRCode - pointing to employee info
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=Employee:${employee.id}|Name:${employee.name}|Reg:${employee.registration || 'N/A'}`;
  doc.addImage(qrCodeUrl, 'PNG', 10, 80, 35, 35);

  let yInfo = 35;
  doc.setTextColor(black);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Matrícula', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.text(employee.registration || 'N/A', 50, yInfo + 5);
  
  yInfo += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Nome', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  const splitName = doc.splitTextToSize(employee.name, 45);
  doc.text(splitName, 50, yInfo + 5);
  
  yInfo += 15 + (splitName.length - 1) * 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Empresa', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.text('Support Mining', 50, yInfo + 5);
  
  yInfo += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Gerência/Coord.', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.text('Ger. Engenharia', 50, yInfo + 5);
  
  yInfo += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Área', 50, yInfo);
  doc.setFont('helvetica', 'normal');
  doc.text('Gerência de Engenharia de', 50, yInfo + 5);
  doc.text('Manutenção', 50, yInfo + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Cargo/Função', 10, 122);
  doc.setFont('helvetica', 'normal');
  doc.text(employee.role, 10, 127);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Funções transitórias', 10, 135);

  doc.setFont('helvetica', 'bold');
  doc.text('Superior/Gestor do contrato', 10, 143);
  doc.setFont('helvetica', 'normal');
  doc.text('AGILDO SENA DA SILVA JUNIOR', 10, 147);


  // --- BACK SIDE (Right Half) ---
  doc.setFillColor(white);
  doc.rect(100, 0, 100, 150, 'F');
  
  doc.setDrawColor(black);
  doc.setLineWidth(0.5);
  doc.rect(102, 2, 96, 146, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#666666');
  
  doc.saveGraphicsState();
  // @ts-ignore - jspdf types might not include these internal methods
  doc.setCurrentTransformationMatrix(1, 0, 0, 1, 105, 140);
  // @ts-ignore
  doc.setCurrentTransformationMatrix(0, -1, 1, 0, 0, 0);
  doc.text(employee.name, 0, 0);
  doc.text(employee.name, 60, 0);
  doc.restoreGraphicsState();

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

  let currentY = tableY + rowHeight;
  doc.setFontSize(9);

  if (employee.trainings && employee.trainings.length > 0) {
    const sortedTrainings = [...employee.trainings].sort((a, b) => {
      const statusA = getTrainingStatus(a.expirationDate).status;
      const statusB = getTrainingStatus(b.expirationDate).status;
      if (statusA === 'expired' && statusB !== 'expired') return -1;
      if (statusA !== 'expired' && statusB === 'expired') return 1;
      return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
    });

    sortedTrainings.forEach((training) => {
      if (currentY > 140) return;

      const status = getTrainingStatus(training.expirationDate);
      const isExpired = status.status === 'expired';
      
      const splitName = doc.splitTextToSize(training.name, col1Width - 4);
      const actualRowHeight = Math.max(rowHeight, splitName.length * 5 + 4);

      if (isExpired) {
        doc.setFillColor(red);
        doc.rect(tableX, currentY, col1Width + col2Width, actualRowHeight, 'F');
        doc.setTextColor(white);
      } else {
        doc.setFillColor(white);
        doc.rect(tableX, currentY, col1Width + col2Width, actualRowHeight, 'F');
        doc.setTextColor(black);
      }

      doc.setDrawColor(grayBorder);
      doc.rect(tableX, currentY, col1Width, actualRowHeight, 'S');
      doc.rect(tableX + col1Width, currentY, col2Width, actualRowHeight, 'S');

      doc.text(splitName, tableX + (col1Width / 2), currentY + (actualRowHeight / 2) + (splitName.length === 1 ? 1 : -1), { align: 'center', baseline: 'middle' });
      
      const expirationDate = new Date(training.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR');
      doc.text(expirationDate, tableX + col1Width + (col2Width / 2), currentY + (actualRowHeight / 2) + 1, { align: 'center', baseline: 'middle' });

      currentY += actualRowHeight;
    });
  } else {
    doc.rect(tableX, currentY, col1Width, rowHeight, 'S');
    doc.rect(tableX + col1Width, currentY, col2Width, rowHeight, 'S');
    doc.text('Nenhum treinamento', tableX + (col1Width / 2), currentY + 6, { align: 'center' });
    doc.text('-', tableX + col1Width + (col2Width / 2), currentY + 6, { align: 'center' });
  }

  doc.save(`cracha-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
};
