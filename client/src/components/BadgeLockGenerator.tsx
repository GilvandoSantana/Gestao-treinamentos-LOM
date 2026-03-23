/**
 * BadgeLockGenerator Component
 * Generates a PDF lock badge (front and back) for an employee based on the provided template.
 * Dimensions: 50mm x 100mm (Portrait)
 */

import { jsPDF } from 'jsPDF';
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
      format: [50, 100]
    });

    const black = '#000000';
    const white = '#ffffff';
    const red = '#ff0000';

    // --- FRONT SIDE ---
    doc.setFillColor(white);
    doc.rect(0, 0, 50, 100, 'F');
    
    // Border
    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(1, 1, 48, 98, 'S');

    // Slot for lanyard
    doc.ellipse(25, 5, 6, 2, 'S');

    // Logo Area
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('SUPPORT+MINING', 5, 10);
    doc.setFontSize(4);
    doc.text('ENGENHARIA', 5, 12);

    // PERIGO Section
    doc.setFillColor(black);
    doc.roundedRect(3, 15, 44, 15, 2, 2, 'F');
    
    doc.setFillColor(red);
    doc.ellipse(25, 22.5, 18, 5, 'F');
    
    doc.setTextColor(white);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PERIGO', 25, 24, { align: 'center' });

    // IDENTIFICAÇÃO DE BLOQUEIO
    doc.setTextColor(black);
    doc.setFontSize(8);
    doc.text('IDENTIFICAÇÃO DE BLOQUEIO', 25, 35, { align: 'center' });

    // ESTA ETIQUETA PERTENCE A:
    doc.setFontSize(8);
    doc.text('ESTA ETIQUETA', 5, 42);
    doc.text('PERTENCE A:', 5, 46);

    // Photo Area
    const photoX = 30;
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
    doc.line(1, 60, 49, 60);
    doc.line(1, 70, 49, 70);
    doc.line(1, 80, 49, 80);
    doc.line(25, 70, 25, 90);

    doc.setFontSize(6);
    // Row 1: Nome
    doc.setFont('helvetica', 'bold');
    doc.text('Nome:', 3, 64);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.name.toUpperCase(), 10, 64);

    // Row 2: Matricula | Gerencia
    doc.setFont('helvetica', 'bold');
    doc.text('Matricula:', 3, 74);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.registration || '', 13, 74);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Gerência:', 27, 74);
    doc.setFont('helvetica', 'normal');
    doc.text('MANUTENÇÃO', 37, 74);

    // Row 3: Empresa | Fone
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa:', 3, 84);
    doc.setFont('helvetica', 'normal');
    doc.text('Support Mining', 13, 84);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Fone:', 27, 84);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.phone || '', 33, 84);


    // --- BACK SIDE ---
    doc.addPage([50, 100], 'portrait');
    doc.setFillColor(white);
    doc.rect(0, 0, 50, 100, 'F');
    doc.setDrawColor(black);
    doc.rect(1, 1, 48, 98, 'S');

    // Red Warning Box
    doc.setFillColor(red);
    doc.rect(1, 30, 48, 30, 'F');
    
    doc.setTextColor(white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const warningText = 'SOMENTE A PESSOA QUE COLOCOU ESTA ETIQUETA PODERÁ FAZER A RETIRADA.';
    const splitWarning = doc.splitTextToSize(warningText, 40);
    doc.text(splitWarning, 25, 40, { align: 'center' });

    // Emergency Info
    doc.setTextColor(red);
    doc.setFontSize(8);
    doc.text('Ramal de Emergência', 25, 75, { align: 'center' });
    doc.setFontSize(18);
    doc.text('193', 25, 85, { align: 'center' });

    doc.save(`cracha-bloqueio-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    toast.success('Crachá de bloqueio gerado com sucesso!', { id: toastId });
  } catch (error) {
    console.error('Error generating lock badge PDF:', error);
    toast.error('Erro ao gerar crachá de bloqueio.', { id: toastId });
  }
};
