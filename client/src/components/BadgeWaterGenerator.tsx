/**
 * BadgeWaterGenerator Component
 * Generates a PDF water bottle badge (front) for an employee based on the provided template.
 * Dimensions: 55mm x 85mm (Portrait)
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
import { toast } from 'sonner';
import logoMining from '@/assets/logo-support-mining.png';

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
        // Retornamos como PNG para preservar a transparência
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    const separator = url.includes('?') ? '&' : '?';
    img.src = `${url}${separator}t=${new Date().getTime()}`;
  });
};

export const generateBadgeWaterPDF = async (employee: Employee) => {
  const toastId = toast.loading(`Gerando crachá de água para ${employee.name}...`);
  
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [55, 85]
    });

    const black = '#000000';
    const white = '#ffffff';
    const yellow = '#f1b40f';

    // --- FRONT SIDE ---
    doc.setFillColor(white);
    doc.rect(0, 0, 55, 85, 'F');
    
    // Border
    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(1, 1, 53, 83, 'S');

    // Slot for lanyard
    doc.ellipse(27.5, 5, 6, 2, 'S');

    // Logo Area - PNG format with transparency
    try {
      const logoBase64 = await loadImage(logoMining);
      // Especificamos 'PNG' e 'FAST' para manter transparência no jsPDF
      doc.addImage(logoBase64, 'PNG', 5, 7, 20, 10, undefined, 'FAST');
    } catch (error) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text('SUPPORT+MINING', 5, 10);
      doc.setFontSize(4);
      doc.text('ENGENHARIA', 5, 12);
    }

    // Yellow Header Section
    doc.setFillColor(yellow);
    doc.rect(1, 20, 53, 15, 'F');
    
    doc.setTextColor(black);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('GARRAFA DE USO INDIVIDUAL', 27.5, 28, { align: 'center' });

    // ESTA GARRAFA PERTENCE A:
    doc.setTextColor(black);
    doc.setFontSize(8);
    doc.text('ESTA GARRAFA', 5, 42);
    doc.text('PERTENCE A:', 5, 46);

    // Photo Area
    const photoX = 35;
    const photoY = 38;
    const photoW = 15;
    const photoH = 18;

    if (employee.photoUrl) {
      try {
        const photoBase64 = await loadImage(employee.photoUrl);
        doc.addImage(photoBase64, 'JPEG', photoX, photoY, photoW, photoH);
      } catch (error) {
        doc.rect(photoX, photoY, photoW, photoH, 'S');
        doc.setFontSize(4);
        doc.text('SEM FOTO', photoX + photoW/2, photoY + photoH/2, { align: 'center' });
      }
    } else {
      doc.rect(photoX, photoY, photoW, photoH, 'S');
      doc.setFontSize(4);
      doc.text('FOTO', photoX + photoW/2, photoY + photoH/2, { align: 'center' });
    }

    // Bottom Info Grid
    doc.setLineWidth(0.2);
    doc.line(1, 60, 54, 60);
    doc.line(1, 68, 54, 68);
    doc.line(1, 76, 54, 76);
    doc.line(27.5, 68, 27.5, 84);

    doc.setFontSize(6);
    // Row 1: Nome
    doc.setFont('helvetica', 'bold');
    doc.text('Nome:', 3, 64);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.name.toUpperCase(), 10, 64);

    // Row 2: Matricula | Gerencia
    doc.setFont('helvetica', 'bold');
    doc.text('Matricula:', 3, 72);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.registration || '', 13, 72);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Gerência:', 29.5, 72);
    doc.setFont('helvetica', 'normal');
    doc.text('MANUTENÇÃO', 39.5, 72);

    // Row 3: Empresa | Fone
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa:', 3, 80);
    doc.setFont('helvetica', 'normal');
    doc.text('Support Mining', 13, 80);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Fone:', 29.5, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.phone || '', 35.5, 80);

    doc.save(`cracha-agua-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    toast.success('Crachá de água gerado com sucesso!', { id: toastId });
  } catch (error) {
    console.error('Error generating water badge PDF:', error);
    toast.error('Erro ao gerar crachá de água.', { id: toastId });
  }
};
