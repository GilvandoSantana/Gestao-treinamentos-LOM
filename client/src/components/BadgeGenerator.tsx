/**
 * BadgeGenerator Component
 * Generates a PDF badge (front and back) for an employee based on the Mosaic template.
 * Supports employee photo and a real QR Code pointing to the site.
 * 
 * DIMENSIONS: 8.5cm height x 5.5cm width (85mm x 55mm) per face
 * PDF format: landscape 170mm x 85mm (frente + verso lado a lado)
 * 
 * Scale from original (100x150mm per face):
 *   X scale: 55/100 = 0.55
 *   Y scale: 85/150 = 0.5667
 * 
 * BACK face offset: +55mm (was +100mm)
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
    // ------------------------------------------------------------------
    // Novo formato: landscape 170x85mm  →  cada face = 55x85mm (5,5x8,5cm)
    // ------------------------------------------------------------------
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [170, 85]   // largura total x altura  (landscape: width > height)
    });

    const black = '#000000';
    const white = '#ffffff';
    const grayBg = '#f2f2f2';
    const grayBorder = '#cccccc';
    const red = '#ff0000';
    const siteUrl = "https://gestao-treinamentos-lom.up.railway.app";

    // ================================================================
    // --- FRENTE (face esquerda: x=0..55, y=0..85) ---
    // ================================================================
    doc.setFillColor(white);
    doc.rect(0, 0, 55, 85, 'F');

    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(1, 1, 53, 83, 'S');

    // Logo Stratos
    try {
      const stratosLogoBase64 = "data:image/png;base64,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";
      if (stratosLogoBase64.length > 100) {
        doc.addImage(stratosLogoBase64, 'PNG', 5.5, 2.8, 22, 14);
      }
    } catch (e) {
      console.warn('Logo base64 invalid or truncated');
    }

    // Área da Foto (escala: x: 10*0.55=5.5, y: 30*0.567=17, w: 35*0.55=19.25, h: 45*0.567=25.5)
    if (employee.photoUrl) {
      try {
        const photoBase64 = await loadImage(employee.photoUrl);
        doc.addImage(photoBase64, 'JPEG', 5.5, 17, 19, 25.5);
      } catch (error) {
        console.error('Error loading employee photo:', error);
        doc.setFillColor(grayBg);
        doc.rect(5.5, 17, 19, 25.5, 'F');
        doc.setDrawColor(grayBorder);
        doc.rect(5.5, 17, 19, 25.5, 'S');
        doc.setFontSize(5);
        doc.setTextColor('#999999');
        doc.text('ERRO FOTO', 15, 29, { align: 'center' });
      }
    } else {
      doc.setFillColor(grayBg);
      doc.rect(5.5, 17, 19, 25.5, 'F');
      doc.setDrawColor(grayBorder);
      doc.rect(5.5, 17, 19, 25.5, 'S');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor('#999999');
      doc.text('FOTO', 15, 30, { align: 'center' });
    }

    // QR Code (escala: x: 10*0.55=5.5, y: 80*0.567=45.3, w: 35*0.55=19.25, h: 35*0.567=19.8)
    try {
      const qrCodeDataUrl = await generateQRCode(siteUrl);
      if (qrCodeDataUrl) {
        doc.addImage(qrCodeDataUrl, 'PNG', 5.5, 45.5, 19, 19);
      }
    } catch (error) {
      console.error('Error adding QR Code to PDF:', error);
    }

    // Informações do colaborador (coluna direita da frente)
    // x original = 50 → 50*0.55 = 27.5
    // yInfo original começa em 35 → 35*0.567 = 19.8
    let yInfo = 19.5;
    doc.setTextColor(black);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text('Matrícula', 27.5, yInfo);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.registration || 'N/A', 27.5, yInfo + 3);

    yInfo += 8.5;
    doc.setFont('helvetica', 'bold');
    doc.text('Nome', 27.5, yInfo);
    doc.setFont('helvetica', 'normal');
    const splitName = doc.splitTextToSize(employee.name, 25);
    doc.text(splitName, 27.5, yInfo + 3);

    yInfo += 8.5 + (splitName.length - 1) * 2.8;
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa', 27.5, yInfo);
    doc.setFont('helvetica', 'normal');
    doc.text('Support Mining', 27.5, yInfo + 3);

    yInfo += 8.5;
    doc.setFont('helvetica', 'bold');
    doc.text('Gerência/Coord.', 27.5, yInfo);
    doc.setFont('helvetica', 'normal');
    doc.text('Ger. Engenharia', 27.5, yInfo + 3);

    yInfo += 8.5;
    doc.setFont('helvetica', 'bold');
    doc.text('Área', 27.5, yInfo);
    doc.setFont('helvetica', 'normal');
    doc.text('Gerência de Engenharia de', 27.5, yInfo + 3);
    doc.text('Manutenção', 27.5, yInfo + 5.5);

    // Rodapé frente
    // y=122 → 122*0.567=69.2 | y=127→72.0 | y=135→76.5 | y=140→79.4
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text('Cargo/Função', 5.5, 69);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.role, 5.5, 72);

    doc.setFont('helvetica', 'bold');
    doc.text('Superior/Gestor do contrato', 5.5, 76.5);
    doc.setFont('helvetica', 'normal');
    doc.text('AGILDO SENA DA SILVA JUNIOR', 5.5, 79.5);

    // ================================================================
    // --- VERSO (face direita: x=55..110, y=0..85) ---
    // ================================================================
    doc.setFillColor(white);
    doc.rect(55, 0, 55, 85, 'F');

    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(56, 1, 53, 83, 'S');

    // Marca d'água com nome (rotacionado)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor('#666666');

    try {
      doc.saveGraphicsState();
      if (typeof (doc as any).setCurrentTransformationMatrix === 'function') {
        (doc as any).setCurrentTransformationMatrix(1, 0, 0, 1, 57.75, 79.4);
        (doc as any).setCurrentTransformationMatrix(0, -1, 1, 0, 0, 0);
        doc.text(employee.name, 0, 0);
        doc.text(employee.name, 33, 0);
      } else {
        doc.text(employee.name, 57.75, 79.4, { angle: 90 });
      }
      doc.restoreGraphicsState();
    } catch (e) {
      console.warn('Matrix transformation failed', e);
    }

    // Tabela de treinamentos
    // Original: tableX=105, tableY=5, col1Width=55, col2Width=35, rowHeight=10
    // Escala X: 0.55 → tableX = 55 + (105-100)*0.55 = 55 + 2.75 = 57.75
    // col1Width = 55*0.55 = 30.25, col2Width = 35*0.55 = 19.25, rowHeight = 10*0.567 = 5.67
    const tableX = 57.75;
    const tableY = 2.8;
    const col1Width = 30;
    const col2Width = 19;
    const rowHeight = 5.7;

    doc.setFillColor('#e6e6e6');
    doc.rect(tableX, tableY, col1Width + col2Width, rowHeight, 'F');
    doc.setDrawColor(grayBorder);
    doc.rect(tableX, tableY, col1Width, rowHeight, 'S');
    doc.rect(tableX + col1Width, tableY, col2Width, rowHeight, 'S');

    doc.setTextColor(black);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.text('Qualificação', tableX + (col1Width / 2), tableY + 3.8, { align: 'center' });
    doc.text('Vencimento', tableX + col1Width + (col2Width / 2), tableY + 3.8, { align: 'center' });

    let currentY = tableY + rowHeight;
    doc.setFontSize(5);

    if (employee.trainings && employee.trainings.length > 0) {
      const sortedTrainings = [...employee.trainings].sort((a, b) => {
        const statusA = getTrainingStatus(a.expirationDate).status;
        const statusB = getTrainingStatus(b.expirationDate).status;
        if (statusA === 'expired' && statusB !== 'expired') return -1;
        if (statusA !== 'expired' && statusB === 'expired') return 1;
        return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
      });

      sortedTrainings.forEach((training) => {
        if (currentY > 79.4) return;  // 140*0.567 = 79.4

        const status = getTrainingStatus(training.expirationDate);
        const isExpired = status.status === 'expired';

        const splitName = doc.splitTextToSize(training.name, col1Width - 2);
        const actualRowHeight = Math.max(rowHeight, splitName.length * 2.8 + 2.2);

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

        doc.text(splitName, tableX + (col1Width / 2), currentY + (actualRowHeight / 2) + (splitName.length === 1 ? 0.6 : -0.6), { align: 'center', baseline: 'middle' });

        const expirationDate = new Date(training.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR');
        doc.text(expirationDate, tableX + col1Width + (col2Width / 2), currentY + (actualRowHeight / 2) + 0.6, { align: 'center', baseline: 'middle' });

        currentY += actualRowHeight;
      });
    } else {
      doc.rect(tableX, currentY, col1Width, rowHeight, 'S');
      doc.rect(tableX + col1Width, currentY, col2Width, rowHeight, 'S');
      doc.text('Nenhum treinamento', tableX + (col1Width / 2), currentY + 3.4, { align: 'center' });
      doc.text('-', tableX + col1Width + (col2Width / 2), currentY + 3.4, { align: 'center' });
    }

    doc.save(`cracha-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    toast.success('Crachá gerado com sucesso!', { id: toastId });
  } catch (error) {
    console.error('Error generating badge PDF:', error);
    toast.error('Erro ao gerar crachá. Verifique o console para mais detalhes.', { id: toastId });
  }
};
