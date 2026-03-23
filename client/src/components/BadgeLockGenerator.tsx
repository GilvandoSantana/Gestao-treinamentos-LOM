/**
 * BadgeLockGenerator Component
 * Generates a PDF lock badge (front and back) for an employee based on the provided template.
 * Dimensions: 55mm x 85mm (Portrait)
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
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

export const generateBadgeLockPDF = async (employee: Employee) => {
  const toastId = toast.loading(`Gerando crachá de bloqueio para ${employee.name}...`);
  
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [55, 85]
    });

    const black = '#000000';
    const white = '#ffffff';
    const red = '#ff0000';

    // --- FRONT SIDE ---
    doc.setFillColor(white);
    doc.rect(0, 0, 55, 85, 'F');
    
    // Border
    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(1, 1, 53, 83, 'S');

    // Slot for lanyard
    doc.ellipse(27.5, 5, 6, 2, 'S');

    // Logo Area
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('SUPPORT+MINING', 5, 10);
    doc.setFontSize(4);
    doc.text('ENGENHARIA', 5, 12);

    // PERIGO Section
    doc.setFillColor(black);
    doc.roundedRect(5.5, 15, 44, 15, 2, 2, 'F');
    
    doc.setFillColor(red);
    doc.ellipse(27.5, 22.5, 18, 5, 'F');
    
    doc.setTextColor(white);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PERIGO', 27.5, 24, { align: 'center' });

    // IDENTIFICAÇÃO DE BLOQUEIO
    doc.setTextColor(black);
    doc.setFontSize(8);
    doc.text('IDENTIFICAÇÃO DE BLOQUEIO', 27.5, 35, { align: 'center' });

    // ESTA ETIQUETA PERTENCE A:
    doc.setFontSize(8);
    doc.text('ESTA ETIQUETA', 5, 42);
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


    // --- BACK SIDE ---
    doc.addPage([55, 85], 'portrait');
    doc.setFillColor(white);
    doc.rect(0, 0, 55, 85, 'F');
    doc.setDrawColor(black);
    doc.rect(1, 1, 53, 83, 'S');

    // Red Warning Box
    doc.setFillColor(red);
    doc.rect(1, 25, 53, 30, 'F');
    
    doc.setTextColor(white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const warningText = 'SOMENTE A PESSOA QUE COLOCOU ESTA ETIQUETA PODERÁ FAZER A RETIRADA.';
    const splitWarning = doc.splitTextToSize(warningText, 45);
    doc.text(splitWarning, 27.5, 35, { align: 'center' });

    // Emergency Info
    doc.setTextColor(red);
    doc.setFontSize(8);
    doc.text('Ramal de Emergência', 27.5, 65, { align: 'center' });
    doc.setFontSize(18);
    doc.text('193', 27.5, 75, { align: 'center' });

    doc.save(`cracha-bloqueio-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    toast.success('Crachá de bloqueio gerado com sucesso!', { id: toastId });
  } catch (error) {
    console.error('Error generating lock badge PDF:', error);
    toast.error('Erro ao gerar crachá de bloqueio.', { id: toastId });
  }
};
