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

const navy = '#1a3a6b';
const gray = '#9a9a9a';
const white = '#ffffff';
const lightGray = '#e8e8e8';
const bannerGray = '#d4d4d4';

/**
 * Faixa diagonal do rodapé — presente nas duas faces do crachá original.
 * Um retângulo cinza claro de base, com um triângulo azul-marinho cobrindo
 * a esquerda (criando o corte diagonal), ícone/texto em cima.
 */
function drawBottomBanner(doc: jsPDF, offsetX: number, logoBase64: string | null) {
  const top = 68;
  const bottom = 85;
  const left = offsetX;
  const right = offsetX + 55;

  // Base clara
  doc.setFillColor(bannerGray);
  doc.rect(left, top, 55, bottom - top, 'F');

  // Cunha azul diagonal (esquerda mais alta, direita mais baixa)
  doc.setFillColor(navy);
  doc.triangle(left, top, left + 34, top, left, bottom, 'F');
  doc.triangle(left + 34, top, left, bottom, left + 20, bottom, 'F');

  // Ícone (capacete simplificado) + texto, na parte azul
  doc.setDrawColor(white);
  doc.setLineWidth(0.4);
  doc.circle(left + 5, top + 5.5, 2.2, 'S');
  doc.line(left + 3, top + 5.5, left + 7, top + 5.5);

  doc.setTextColor(white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.3);
  doc.text('SOLUÇÕES VERSÁTIS', left + 9, top + 4.3);
  doc.text('EM ENGENHARIA', left + 9, top + 7.3);

  // Losango com o logo, na parte clara à direita
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', left + 33, top + 1, 19, 15, undefined, 'FAST');
  }
}

export const generateBadgeSupportPDF = async (employee: Employee, sharedDoc?: jsPDF): Promise<jsPDF> => {
  const toastId = toast.loading(`Gerando crachá para ${employee.name}...`);

  try {
    // Folha A4 retrato com o cartão em 109 x 86 mm (frente + verso) — mesmo
    // tamanho físico dos demais crachás do sistema.
    const doc = createBadgeDoc(110, 85, true, sharedDoc);

    let logoBase64: string | null = null;
    try {
      logoBase64 = await loadImage(logoMining);
    } catch {
      logoBase64 = null;
    }

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
    const photoH = 25;
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
    doc.setFontSize(7);
    const nameLines = doc.splitTextToSize(employee.name.toUpperCase(), 48);
    doc.text(nameLines.slice(0, 2), 27.5, 42, { align: 'center' });

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.15);
    doc.line(3, 46.5, 52, 46.5);

    // Função
    doc.setTextColor(gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4);
    doc.text('FUNÇÃO', 27.5, 49.5, { align: 'center' });
    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    const roleLines = doc.splitTextToSize((employee.role || '').toUpperCase(), 48);
    doc.text(roleLines.slice(0, 1), 27.5, 53, { align: 'center' });

    doc.setDrawColor(210, 210, 210);
    doc.line(3, 55.5, 52, 55.5);

    // Empresa
    doc.setTextColor(gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4);
    doc.text('EMPRESA', 27.5, 58.5, { align: 'center' });
    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(EMPRESA, 27.5, 62, { align: 'center' });

    doc.setDrawColor(210, 210, 210);
    doc.line(3, 64.5, 52, 64.5);

    // Matrícula | Registro
    doc.setTextColor(gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.5);
    doc.text('MATRÍCULA', 4, 66.5);
    doc.text('REGISTRO', 29, 66.5);

    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(employee.registration || '—', 4, 67.5 + 2.5);
    doc.setFontSize(4.5);
    doc.text(REGISTRO_CNPJ, 29, 67.5 + 2.5);

    // Rodapé (faixa diagonal)
    drawBottomBanner(doc, 0, logoBase64);

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

    // Logo grande, centralizado
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', bx + 14, 7, 27, 21, undefined, 'FAST');
    } else {
      doc.setTextColor(navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('SUPPORT+MINING', bx + 27.5, 16, { align: 'center' });
      doc.setFontSize(5);
      doc.text('ENGENHARIA', bx + 27.5, 20, { align: 'center' });
    }

    doc.setDrawColor(210, 210, 210);
    doc.line(bx + 4, 31, bx + 51, 31);
    doc.setFillColor(navy);
    doc.rect(bx + 25, 30.3, 5, 1.4, 'F');

    // Três avisos, com marcador circular no lugar do ícone
    const notices: [string, string][] = [
      ['ESTE CRACHÁ É DE USO', 'PESSOAL E INTRANSFERÍVEL.'],
      ['DEVERÁ SER APRESENTADO', 'SEMPRE QUE SOLICITADO.'],
      ['EM CASO DE PERDA,', 'FAVOR ENTRAR EM CONTATO.'],
    ];
    let noticeY = 37;
    for (const [line1, line2] of notices) {
      doc.setFillColor(navy);
      doc.circle(bx + 7, noticeY - 1, 2, 'F');
      doc.setTextColor(navy);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.3);
      doc.text(line1, bx + 12, noticeY - 1.8);
      doc.text(line2, bx + 12, noticeY + 0.8);
      noticeY += 7.5;
    }

    // Contato
    let contactY = noticeY + 1.5;
    doc.setTextColor(navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(TELEFONE, bx + 12, contactY);
    contactY += 4.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.5);
    doc.text(SITE, bx + 12, contactY);
    contactY += 4.2;
    doc.text(EMAIL, bx + 12, contactY);

    // Rodapé (faixa diagonal) — igual ao da frente
    drawBottomBanner(doc, bx, logoBase64);

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
