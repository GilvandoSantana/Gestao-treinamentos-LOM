/**
 * BadgeWarehouseGenerator Component
 * Crachá "Almoxarifado" — QR code em destaque (mesmo formato do crachá
 * padrão, FUNC:<matrícula>), usado pra escanear na câmera do Almoxarifado
 * na hora de retirar ferramenta/material. Abaixo do QR: nome, matrícula e
 * função. Verso: só a logo grande da Support Mining.
 *
 * DIMENSÕES: 55mm x 85mm por face — mesmo tamanho padrão dos outros crachás.
 */

import { createBadgeDoc, unwrapBadgeDoc } from './badgeLayout';
import type { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Employee } from '@/lib/types';
import { toast } from 'sonner';
import logoMining from '@/assets/logo-support-mining.png';

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

const generateQRCode = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 300,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.error('Error generating QR Code:', err);
    return '';
  }
};

export const generateBadgeWarehousePDF = async (employee: Employee, sharedDoc?: jsPDF): Promise<jsPDF> => {
  const toastId = toast.loading(`Gerando crachá de Almoxarifado para ${employee.name}...`);

  try {
    // Folha A4 retrato com o cartão em 55 x 85mm por face (frente + verso).
    const doc = createBadgeDoc(55, 85, true, sharedDoc);

    const black = '#000000';
    const white = '#ffffff';
    const grayBorder = '#cccccc';

    // =====================================================================
    // FRENTE — QR code em destaque, e abaixo nome/matrícula/função
    // =====================================================================
    doc.setFillColor(white);
    doc.rect(0, 0, 55, 85, 'F');
    doc.setDrawColor(grayBorder);
    doc.setLineWidth(0.3);
    doc.rect(1, 1, 53, 83, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(black);
    doc.text('ALMOXARIFADO', 27.5, 8, { align: 'center' });

    // Mesmo formato de QR code usado no crachá padrão — mesma matrícula,
    // então o leitor do Almoxarifado identifica o colaborador igual.
    try {
      const qrCode = `FUNC:${employee.registration || employee.name.replace(/\s+/g, '_').toUpperCase()}`;
      const qrCodeDataUrl = await generateQRCode(qrCode);
      if (qrCodeDataUrl) {
        // QR grande e centralizado, ocupando a maior parte da frente
        doc.addImage(qrCodeDataUrl, 'PNG', 7.5, 13, 40, 40);
      }
    } catch (error) {
      console.error('Error adding QR Code to PDF:', error);
    }

    doc.setDrawColor(grayBorder);
    doc.line(6, 58, 49, 58);

    let y = 65;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(black);
    doc.text('Nome', 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const splitName = doc.splitTextToSize(employee.name, 43);
    doc.text(splitName, 6, y + 4);
    y += 4 + splitName.length * 3.6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('Matrícula', 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(employee.registration || 'N/A', 6, y + 4);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('Função', 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const splitRole = doc.splitTextToSize(employee.role, 43);
    doc.text(splitRole, 6, y + 4);

    // =====================================================================
    // VERSO — só a logo grande da Support Mining
    // =====================================================================
    const bx = 55; // offset da face de trás
    doc.setFillColor(white);
    doc.rect(bx, 0, 55, 85, 'F');
    doc.setDrawColor(grayBorder);
    doc.rect(bx + 1, 1, 53, 83, 'S');

    try {
      const logoBase64 = await loadImage(logoMining);
      // Logo grande, centralizada na face inteira
      doc.addImage(logoBase64, 'PNG', bx + 9.5, 30, 36, 27.5, undefined, 'FAST');
    } catch (error) {
      doc.setTextColor(black);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('SUPPORT+MINING', bx + 27.5, 42, { align: 'center' });
      doc.setFontSize(6);
      doc.text('ENGENHARIA', bx + 27.5, 47, { align: 'center' });
    }

    const rawDoc = unwrapBadgeDoc(doc);
    if (!sharedDoc) {
      rawDoc.save(`cracha-almoxarifado-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
      toast.success('Crachá de Almoxarifado gerado com sucesso!', { id: toastId });
    } else {
      toast.dismiss(toastId);
    }
    return rawDoc;
  } catch (error) {
    console.error('Error generating warehouse badge PDF:', error);
    toast.error('Erro ao gerar crachá de Almoxarifado.', { id: toastId });
    throw error;
  }
};
