/**
 * BadgeSupportGenerator Component
 * Gera o crachá "Support" (frente e verso), no modelo enviado pela empresa.
 * Únicos campos variáveis: foto, matrícula, nome e função — todo o resto
 * (logo, empresa, registro/CNPJ, textos do verso, contato) é fixo.
 * Dimensões: 55mm x 85mm por face (mesmo tamanho dos demais crachás).
 */

import { createBadgeDoc, unwrapBadgeDoc } from './badgeLayout';
import type { jsPDF } from 'jspdf';
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

// Dados fixos da empresa — sempre os mesmos, em todos os crachás deste modelo.
const EMPRESA = 'SUPPORT MINING';
const REGISTRO_CNPJ = '41.548.978/0001-70';
const TELEFONE = '(79) 99918-9191';
const SITE = 'www.supportmining.com.br';
const EMAIL = 'contato@supportmining.com.br';

export const generateBadgeSupportPDF = async (employee: Employee, sharedDoc?: jsPDF): Promise<jsPDF> => {
  const toastId = toast.loading(`Gerando crachá para ${employee.name}...`);

  try {
    // Folha A4 retrato com o cartão em 109 x 86 mm (frente + verso) — mesmo
    // tamanho físico dos demais crachás do sistema.
    const doc = createBadgeDoc(110, 85, true, sharedDoc);

    const navy = '#1a3a6b';
    const gray = '#9a9a9a';
    const white = '#ffffff';
    const lightGray = '#e8e8e8';

    // =====================================================================
    // FRENTE
    // =====================================================================
    doc.setFillColor(white);
    doc.rect(0, 0, 55, 85, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.rect(0.5, 0.5, 54, 84, 'S');

    // Fenda do cordão
    doc.setDrawColor(180, 180, 180);
    doc.setFillColor(230, 230, 230);
    doc.roundedRect(22, 2.5, 11, 3, 1.5, 1.5, 'F');

    // Barras decorativas
    doc.setDrawColor(navy);
    doc.setLineWidth(1);
    doc.line(3, 10.5, 12, 10.5);
    doc.line(43, 10.5, 52, 10.5);

    // Foto do colaborador
    const photoX = 13;
    const photoY = 13;
    const photoW = 29;
    const photoH = 32;
    doc.setFillColor(lightGray);
    doc.rect(photoX, photoY, photoW, photoH, 'F');
    if (employee.photoUrl) {
      try {
        const photoBase64 = await loadImage(employee.photoUrl);
        doc.addImage(photoBase64, 'JPEG', photoX, photoY, photoW, photoH);
      } catch {
        doc.setTextColor(gray);
        doc.setFontSize(5);
        doc.text('SEM FOTO', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
      }
    } else {
      doc.setTextColor(gray);
      doc.setFontSize(5);
      doc.text('SEM FOTO', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
    }

    // Nome (até 2 linhas)
    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const nameLines = doc.splitTextToSize(employee.name.toUpperCase(), 48);
    doc.text(nameLines.slice(0, 2), 27.5, 49, { align: 'center' });

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.15);
    doc.line(3, 54.5, 52, 54.5);

    // Função
    doc.setTextColor(gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.text('FUNÇÃO', 27.5, 58, { align: 'center' });
    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    const roleLines = doc.splitTextToSize((employee.role || '').toUpperCase(), 48);
    doc.text(roleLines.slice(0, 1), 27.5, 62, { align: 'center' });

    doc.setDrawColor(210, 210, 210);
    doc.line(3, 65, 52, 65);

    // Empresa
    doc.setTextColor(gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.text('EMPRESA', 27.5, 68.5, { align: 'center' });
    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(EMPRESA, 27.5, 72.5, { align: 'center' });

    doc.setDrawColor(210, 210, 210);
    doc.line(3, 75.5, 52, 75.5);

    // Matrícula | Registro
    doc.setTextColor(gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.8);
    doc.text('MATRÍCULA', 4, 79.5);
    doc.text('REGISTRO', 29, 79.5);

    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text(employee.registration || '—', 4, 83);
    doc.setFontSize(5);
    doc.text(REGISTRO_CNPJ, 29, 83);

    doc.setDrawColor(210, 210, 210);
    doc.line(27.5, 76, 27.5, 84);

    // =====================================================================
    // VERSO
    // =====================================================================
    const bx = 55; // offset da face de trás
    doc.setFillColor(white);
    doc.rect(bx, 0, 55, 85, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(bx + 0.5, 0.5, 54, 84, 'S');

    doc.setDrawColor(180, 180, 180);
    doc.setFillColor(230, 230, 230);
    doc.roundedRect(bx + 22, 2.5, 11, 3, 1.5, 1.5, 'F');

    // Logo (mesmo arquivo usado nos demais crachás)
    try {
      const logoBase64 = await loadImage(logoMining);
      doc.addImage(logoBase64, 'PNG', bx + 12.5, 8, 30, 24, undefined, 'FAST');
    } catch {
      doc.setTextColor(navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('SUPPORT+MINING', bx + 27.5, 18, { align: 'center' });
      doc.setFontSize(5);
      doc.text('ENGENHARIA', bx + 27.5, 22, { align: 'center' });
    }

    doc.setDrawColor(210, 210, 210);
    doc.line(bx + 4, 35, bx + 51, 35);
    doc.setFillColor(navy);
    doc.rect(bx + 25, 34.3, 5, 1.4, 'F');

    // Três avisos, com marcador circular no lugar do ícone
    const notices: [string, string][] = [
      ['ESTE CRACHÁ É DE USO', 'PESSOAL E INTRANSFERÍVEL.'],
      ['DEVERÁ SER APRESENTADO', 'SEMPRE QUE SOLICITADO.'],
      ['EM CASO DE PERDA,', 'FAVOR ENTRAR EM CONTATO.'],
    ];
    let noticeY = 41;
    for (const [line1, line2] of notices) {
      doc.setFillColor(navy);
      doc.circle(bx + 7, noticeY - 1, 2.2, 'F');
      doc.setTextColor(navy);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.8);
      doc.text(line1, bx + 12, noticeY - 1.8);
      doc.text(line2, bx + 12, noticeY + 1);
      noticeY += 9;
    }

    // Contato
    let contactY = noticeY + 2;
    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text(TELEFONE, bx + 12, contactY);
    contactY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.text(SITE, bx + 12, contactY);
    contactY += 5;
    doc.text(EMAIL, bx + 12, contactY);

    // Faixa inferior
    doc.setFillColor(navy);
    doc.rect(bx, 79, 55, 6, 'F');

    const rawDoc = unwrapBadgeDoc(doc);
    if (!sharedDoc) {
      rawDoc.save(`cracha-support-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
      toast.success('Crachá gerado com sucesso!', { id: toastId });
    } else {
      toast.dismiss(toastId);
    }
    return rawDoc;
  } catch (error) {
    console.error('Error generating support badge PDF:', error);
    toast.error('Erro ao gerar crachá.', { id: toastId });
    throw error;
  }
};
