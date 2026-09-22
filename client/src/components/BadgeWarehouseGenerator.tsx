/**
 * BadgeWarehouseGenerator Component
 * Crachá "Almoxarifado" — QR code em destaque (mesmo formato do crachá
 * padrão, FUNC:<matrícula>), usado pra escanear na câmera do Almoxarifado
 * na hora de retirar ferramenta/material. Abaixo do QR: nome, matrícula e
 * função. Verso: só a logo grande da Support Mining.
 *
 * DIMENSÕES: 55mm x 85mm por face — mesmo tamanho padrão dos outros crachás.
 *
 * Layout de impressão (ideia do Gilvando, 18/09): 3 colaboradores por folha
 * A4 PAISAGEM, cada um com a frente em cima e o verso embaixo (empilhados) —
 * poupa papel num lote grande, já que o formato antigo (1 por folha A4
 * retrato, frente e verso lado a lado) gastava uma folha inteira por
 * pessoa. Por isso a frente e o verso são desenhados um embaixo do outro
 * no sistema de coordenadas deste gerador (não mais lado a lado) — é o que
 * createBadgeDocTripleLandscape espera.
 */

import { createBadgeDocTripleLandscape, unwrapBadgeDoc } from './badgeLayout';
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
    // 3 por folha A4 paisagem — frente (y:0-85) e verso (y:95-180)
    // empilhados, com 10mm de espaço entre as duas faces. A largura do
    // desenho é só 55mm (uma face), já que frente e verso não ficam mais
    // lado a lado.
    const FACE_GAP = 10;
    const doc = createBadgeDocTripleLandscape(55, 85 * 2 + FACE_GAP, sharedDoc);

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
        // QR grande e centralizado, ocupando a maior parte da frente —
        // com folga suficiente pra caber nome/matrícula/função abaixo dele
        // sem passar da borda inferior do cartão (y=84), mesmo quando o
        // nome ou a função ocuparem duas linhas.
        doc.addImage(qrCodeDataUrl, 'PNG', 9.5, 12, 36, 36);
      }
    } catch (error) {
      console.error('Error adding QR Code to PDF:', error);
    }

    doc.setDrawColor(grayBorder);
    doc.line(6, 51, 49, 51);

    let y = 55;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(black);
    doc.text('Nome', 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const splitName = doc.splitTextToSize(employee.name, 43);
    doc.text(splitName, 6, y + 3.2);
    y += 3.2 + splitName.length * 3 + 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text('Matrícula', 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(employee.registration || 'N/A', 6, y + 3.2);
    y += 3.2 + 3 + 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text('Função', 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const splitRole = doc.splitTextToSize(employee.role, 43);
    doc.text(splitRole, 6, y + 3.2);

    // =====================================================================
    // VERSO — só a logo grande da Support Mining, empilhado ABAIXO da
    // frente (by desloca em Y, não em X — antes ficava ao lado, offset bx)
    // =====================================================================
    const by = 85 + FACE_GAP;
    doc.setFillColor(white);
    doc.rect(0, by, 55, 85, 'F');
    doc.setDrawColor(grayBorder);
    doc.rect(1, by + 1, 53, 83, 'S');

    try {
      const logoBase64 = await loadImage(logoMining);
      // Logo grande, centralizada na face inteira
      doc.addImage(logoBase64, 'PNG', 9.5, by + 30, 36, 27.5, undefined, 'FAST');
    } catch (error) {
      doc.setTextColor(black);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('SUPPORT+MINING', 27.5, by + 42, { align: 'center' });
      doc.setFontSize(6);
      doc.text('ENGENHARIA', 27.5, by + 47, { align: 'center' });
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
