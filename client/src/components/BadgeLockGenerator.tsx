/**
 * BadgeLockGenerator Component
 * Generates a PDF lock badge (front and back) for an employee based on the provided template.
 * Fields: Photo, Name, Registration, and Phone.
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
    // Dimensões baseadas na imagem (proporção aproximada de um crachá padrão)
    // Usaremos 100x70mm para cada face (frente e verso lado a lado ou em páginas separadas)
    // Para manter o padrão do BadgeGenerator.tsx, usaremos 200x150mm total (landscape)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [200, 150]
    });

    const black = '#000000';
    const white = '#ffffff';
    const red = '#ff0000';

    // --- FRONT SIDE (Left Half: 0 to 100mm) ---
    doc.setFillColor(white);
    doc.rect(0, 0, 100, 150, 'F');
    
    // Border
    doc.setDrawColor(black);
    doc.setLineWidth(0.5);
    doc.rect(2, 2, 96, 146, 'S');

    // Top Logo Area (Placeholder for Support Mining Logo)
    // Based on the image, there's a logo at the top left
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SUPPORT+MINING', 10, 10);
    doc.setFontSize(6);
    doc.text('ENGENHARIA', 10, 13);
    
    // Slot for lanyard
    doc.ellipse(50, 10, 8, 3, 'S');

    // PERIGO Section (Black background with red oval and white text)
    doc.setFillColor(black);
    doc.roundedRect(5, 20, 90, 30, 3, 3, 'F');
    
    doc.setFillColor(red);
    doc.ellipse(50, 35, 35, 10, 'F');
    
    doc.setTextColor(white);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('PERIGO', 50, 38, { align: 'center' });

    // IDENTIFICAÇÃO DE BLOQUEIO
    doc.setTextColor(black);
    doc.setFontSize(14);
    doc.text('IDENTIFICAÇÃO DE BLOQUEIO', 50, 60, { align: 'center' });

    // ESTA ETIQUETA PERTENCE A:
    doc.setFontSize(16);
    doc.text('ESTA ETIQUETA', 10, 75);
    doc.text('PERTENCE A:', 10, 85);

    // Photo Area
    const photoX = 65;
    const photoY = 70;
    const photoW = 25;
    const photoH = 30;

    if (employee.photoUrl) {
      try {
        const photoBase64 = await loadImage(employee.photoUrl);
        doc.addImage(photoBase64, 'JPEG', photoX, photoY, photoW, photoH);
      } catch (error) {
        doc.rect(photoX, photoY, photoW, photoH, 'S');
        doc.setFontSize(6);
        doc.text('SEM FOTO', photoX + photoW/2, photoY + photoH/2, { align: 'center' });
      }
    } else {
      doc.rect(photoX, photoY, photoW, photoH, 'S');
      doc.setFontSize(6);
      doc.text('FOTO', photoX + photoW/2, photoY + photoH/2, { align: 'center' });
    }

    // Bottom Info Grid
    doc.setLineWidth(0.3);
    // Horizontal lines
    doc.line(2, 105, 98, 105);
    doc.line(2, 118, 98, 118);
    doc.line(2, 131, 98, 131);
    // Vertical lines
    doc.line(50, 118, 50, 148);

    doc.setFontSize(10);
    // Row 1: Nome
    doc.setFont('helvetica', 'bold');
    doc.text('Nome:', 4, 111);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.name.toUpperCase(), 16, 111);

    // Row 2: Matricula | Gerencia
    doc.setFont('helvetica', 'bold');
    doc.text('Matricula:', 4, 125);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.registration || '', 22, 125);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Gerência:', 52, 125);
    doc.setFont('helvetica', 'normal');
    doc.text('MANUTENÇÃO', 70, 125);

    // Row 3: Empresa | Fone
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa:', 4, 140);
    doc.setFont('helvetica', 'normal');
    doc.text('Support Mining', 22, 140);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Fone:', 52, 140);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.phone || '', 63, 140);


    // --- BACK SIDE (Right Half: 100 to 200mm) ---
    doc.setFillColor(white);
    doc.rect(100, 0, 100, 150, 'F');
    
    // Border
    doc.setDrawColor(black);
    doc.setLineWidth(0.5);
    doc.rect(102, 2, 96, 146, 'S');

    // Top empty area with line
    doc.line(102, 30, 198, 30);

    // Red Warning Box
    doc.setFillColor(red);
    doc.rect(102, 60, 96, 45, 'F');
    
    doc.setTextColor(white);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    const warningText = 'SOMENTE A PESSOA QUE COLOCOU ESTA ETIQUETA PODERÁ FAZER A RETIRADA.';
    const splitWarning = doc.splitTextToSize(warningText, 80);
    doc.text(splitWarning, 150, 75, { align: 'center' });

    // Emergency Info
    doc.setTextColor(red);
    doc.setFontSize(14);
    doc.text('Ramal de Emergência', 150, 120, { align: 'center' });
    doc.setFontSize(28);
    doc.text('193', 150, 135, { align: 'center' });

    doc.save(`cracha-bloqueio-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    toast.success('Crachá de bloqueio gerado com sucesso!', { id: toastId });
  } catch (error) {
    console.error('Error generating lock badge PDF:', error);
    toast.error('Erro ao gerar crachá de bloqueio.', { id: toastId });
  }
};
