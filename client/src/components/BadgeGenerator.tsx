/**
 * BadgeGenerator Component
 * Generates a PDF badge (front and back) for an employee based on the Mosaic template.
 * Dimensions: 50mm x 100mm (Portrait)
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';
import { toast } from 'sonner';

// Helper to load image from URL and convert to base64
const loadImage = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    const separator = url.includes('?') ? '&' : '?';
    img.src = `${url}${separator}t=${new Date().getTime()}`;
  });
};

// Helper to generate QR Code as Data URL
const generateQRCode = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 200,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Error generating QR Code:', err);
    return '';
  }
};

export const generateBadgePDF = async (employee: Employee) => {
  const toastId = toast.loading(`Gerando crachá para ${employee.name}...`);
  
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [50, 100]
    });

    const black = '#000000';
    const white = '#ffffff';
    const grayBg = '#f2f2f2';
    const grayBorder = '#cccccc';
    const red = '#ff0000';
    const siteUrl = "https://gestao-treinamentos-lom.up.railway.app";

    // --- FRONT SIDE ---
    doc.setFillColor(white);
    doc.rect(0, 0, 50, 100, 'F');
    
    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(1, 1, 48, 98, 'S');

    // Slot for lanyard
    doc.ellipse(25, 5, 6, 2, 'S');

    // Logo Area
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('SUPPORT+MINING', 25, 12, { align: 'center' });
    doc.setFontSize(5);
    doc.text('ENGENHARIA', 25, 14, { align: 'center' });

    // Photo Area
    const photoW = 25;
    const photoH = 30;
    const photoX = (50 - photoW) / 2;
    const photoY = 18;

    if (employee.photoUrl) {
      try {
        const photoBase64 = await loadImage(employee.photoUrl);
        doc.addImage(photoBase64, 'JPEG', photoX, photoY, photoW, photoH);
      } catch (error) {
        doc.setFillColor(grayBg);
        doc.rect(photoX, photoY, photoW, photoH, 'F');
        doc.setFontSize(6);
        doc.text('SEM FOTO', 25, photoY + 15, { align: 'center' });
      }
    } else {
      doc.setFillColor(grayBg);
      doc.rect(photoX, photoY, photoW, photoH, 'F');
      doc.setFontSize(6);
      doc.text('FOTO', 25, photoY + 15, { align: 'center' });
    }

    // Info Section
    let yInfo = 52;
    doc.setTextColor(black);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('Matrícula', 5, yInfo);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.registration || 'N/A', 5, yInfo + 3);
    
    yInfo += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Nome', 5, yInfo);
    doc.setFont('helvetica', 'normal');
    const splitName = doc.splitTextToSize(employee.name, 40);
    doc.text(splitName, 5, yInfo + 3);
    
    yInfo += 8 + (splitName.length - 1) * 3;
    doc.setFont('helvetica', 'bold');
    doc.text('Função', 5, yInfo);
    doc.setFont('helvetica', 'normal');
    const splitRole = doc.splitTextToSize(employee.role, 40);
    doc.text(splitRole, 5, yInfo + 3);

    // QR Code
    try {
      const qrCodeDataUrl = await generateQRCode(siteUrl);
      if (qrCodeDataUrl) {
        doc.addImage(qrCodeDataUrl, 'PNG', 32, 82, 15, 15);
      }
    } catch (error) {}

    // --- BACK SIDE ---
    doc.addPage([50, 100], 'portrait');
    doc.setFillColor(white);
    doc.rect(0, 0, 50, 100, 'F');
    doc.setDrawColor(black);
    doc.rect(1, 1, 48, 98, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('QUALIFICAÇÕES', 25, 8, { align: 'center' });

    const tableX = 3;
    let currentY = 12;
    const col1Width = 30;
    const col2Width = 14;
    const rowHeight = 6;

    doc.setFontSize(6);
    doc.setFillColor('#e6e6e6');
    doc.rect(tableX, currentY, col1Width + col2Width, rowHeight, 'F');
    doc.rect(tableX, currentY, col1Width, rowHeight, 'S');
    doc.rect(tableX + col1Width, currentY, col2Width, rowHeight, 'S');
    doc.text('Treinamento', tableX + 2, currentY + 4);
    doc.text('Venc.', tableX + col1Width + 2, currentY + 4);

    currentY += rowHeight;

    if (employee.trainings && employee.trainings.length > 0) {
      const sortedTrainings = [...employee.trainings].sort((a, b) => {
        return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
      });

      sortedTrainings.forEach((training) => {
        if (currentY > 90) return;

        const status = getTrainingStatus(training.expirationDate);
        const isExpired = status.status === 'expired';
        
        const splitTName = doc.splitTextToSize(training.name, col1Width - 2);
        const actualRowHeight = Math.max(rowHeight, splitTName.length * 3 + 2);

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

        doc.text(splitTName, tableX + 1, currentY + 3);
        const expirationDate = new Date(training.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR', { year: '2-digit', month: '2-digit' });
        doc.text(expirationDate, tableX + col1Width + 1, currentY + 3);

        currentY += actualRowHeight;
      });
    }

    doc.save(`cracha-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    toast.success('Crachá gerado com sucesso!', { id: toastId });
  } catch (error) {
    console.error('Error generating badge PDF:', error);
    toast.error('Erro ao gerar crachá.', { id: toastId });
  }
};
