/**
 * BadgeWaterGenerator Component
 * Generates a PDF water bottle badge (front) for an employee based on the provided template.
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

export const generateBadgeWaterPDF = async (employee: Employee) => {
  const toastId = toast.loading(`Gerando crachá de água para ${employee.name}...`);
  
  try {
    // Dimensões padrão de crachá (usando o mesmo formato do BadgeLockGenerator)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [100, 120] // Ajustado para um formato mais vertical conforme a imagem
    });

    const black = '#000000';
    const white = '#ffffff';
    const yellow = '#f1b40f'; // Amarelo vibrante conforme a imagem

    // --- FRONT SIDE ---
    doc.setFillColor(white);
    doc.rect(0, 0, 100, 120, 'F');
    
    // Border
    doc.setDrawColor(black);
    doc.setLineWidth(0.5);
    doc.rect(2, 2, 96, 116, 'S');

    // Top Logo Area (Support Mining Logo)
    // Usando texto estilizado para representar a logo conforme a imagem
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SUPPORT+MINING', 10, 10);
    doc.setFontSize(6);
    doc.text('ENGENHARIA', 10, 13);
    
    // Slot for lanyard
    doc.ellipse(50, 10, 8, 3, 'S');

    // Yellow Header Section
    doc.setFillColor(yellow);
    doc.rect(2, 20, 96, 25, 'F');
    
    doc.setTextColor(black);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('GARRAFA DE USO INDIVIDUAL', 50, 35, { align: 'center' });

    // ESTA GARRAFA PERTENCE A:
    doc.setTextColor(black);
    doc.setFontSize(16);
    doc.text('ESTA GARRAFA', 10, 65);
    doc.text('PERTENCE A:', 10, 75);

    // Photo Area
    const photoX = 58;
    const photoY = 50;
    const photoW = 35;
    const photoH = 40;

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
    doc.line(2, 95, 98, 95);
    doc.line(2, 103, 98, 103);
    doc.line(2, 111, 98, 111);
    // Vertical lines
    doc.line(50, 103, 50, 118);

    doc.setFontSize(10);
    // Row 1: Nome
    doc.setFont('helvetica', 'bold');
    doc.text('Nome:', 4, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.name, 16, 100);

    // Row 2: Matricula | Gerencia
    doc.setFont('helvetica', 'bold');
    doc.text('Matricula:', 4, 108);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.registration || '', 22, 108);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Gerência:', 52, 108);
    doc.setFont('helvetica', 'normal');
    doc.text('MANUTENÇÃO', 70, 108);

    // Row 3: Empresa | Fone
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa:', 4, 116);
    doc.setFont('helvetica', 'normal');
    doc.text('Support Mining', 22, 116);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Fone:', 52, 116);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.phone || '', 63, 116);

    doc.save(`cracha-agua-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    toast.success('Crachá de água gerado com sucesso!', { id: toastId });
  } catch (error) {
    console.error('Error generating water badge PDF:', error);
    toast.error('Erro ao gerar crachá de água.', { id: toastId });
  }
};
