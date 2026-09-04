/**
 * BadgeGenerator Component
 * Gera o crachá "Padrão" (frente e verso) para um colaborador, no modelo de
 * carteirinha "COLABORADOR AUTORIZADO" fornecido pela empresa (Support Mining).
 *
 * Campos variáveis por colaborador — frente: foto, nome, matrícula,
 * gerência, gestor, função, dados de CNH (nº, validade, categoria).
 * Campos variáveis — verso: lista de treinamentos e vencimentos.
 * Tudo o resto (logo, "Empregado Autorizado", "Empresa: Support Mining",
 * estrutura da tabela) é fixo — é o padrão deste crachá.
 *
 * Fonte: Roboto Condensed. A empresa pediu "Aptos Narrow", que é uma fonte
 * proprietária da Microsoft (vem com o Office/Windows) — não é possível
 * baixá-la de uma fonte aberta para embutir no PDF. Roboto Condensed é o
 * substituto mais próximo (licença aberta, condensada, mesmo espírito
 * limpo). Se alguém enviar o arquivo .ttf/.otf do Aptos Narrow (tem em
 * C:\Windows\Fonts no Windows com Office instalado), dá pra trocar depois
 * pela fonte exata.
 *
 * DIMENSIONS: 55mm x 85mm por face (mesmo tamanho dos demais crachás do
 * sistema). PDF: 110x85mm (frente + verso lado a lado).
 */

import { createBadgeDoc, unwrapBadgeDoc } from './badgeLayout';
import type { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';
import { trpcClient } from '@/lib/trpc';
import { toast } from 'sonner';
import logoMining from '@/assets/logo-support-mining.png';
import robotoCondensedRegularUrl from '@/assets/fonts/roboto-condensed-regular.ttf';
import robotoCondensedBoldUrl from '@/assets/fonts/roboto-condensed-bold.ttf';

const FONT = 'RobotoCondensed';

// Helper to load an image from URL, returning both its base64 data and its
// natural pixel size (precisamos do tamanho real pra encaixar a foto sem
// distorcer nem estourar a moldura). format 'png' preserva transparência —
// necessário pra logo, senão o fundo transparente vira preto ao ser
// convertido pra JPEG (que não tem canal alfa).
const loadImage = (
  url: string,
  format: 'jpeg' | 'png' = 'jpeg'
): Promise<{ dataUrl: string; width: number; height: number }> => {
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
        const dataUrl =
          format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.8);
        resolve({ dataUrl, width: img.width, height: img.height });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    const separator = url.includes('?') ? '&' : '?';
    img.src = `${url}${separator}t=${new Date().getTime()}`;
  });
};

// Fonte custom: precisa ser buscada como binário e convertida pra base64
// pra registrar no jsPDF (addFileToVFS espera o conteúdo do arquivo, não uma
// URL). Cada jsPDF novo (cada crachá "solo") precisa registrar de novo.
const fontCache = new Map<string, string>();
async function loadFontBase64(url: string): Promise<string> {
  const cached = fontCache.get(url);
  if (cached) return cached;
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  fontCache.set(url, base64);
  return base64;
}

async function registerBadgeFont(doc: jsPDF): Promise<void> {
  try {
    const [regular, bold] = await Promise.all([
      loadFontBase64(robotoCondensedRegularUrl),
      loadFontBase64(robotoCondensedBoldUrl),
    ]);
    doc.addFileToVFS('RobotoCondensed-Regular.ttf', regular);
    doc.addFont('RobotoCondensed-Regular.ttf', FONT, 'normal');
    doc.addFileToVFS('RobotoCondensed-Bold.ttf', bold);
    doc.addFont('RobotoCondensed-Bold.ttf', FONT, 'bold');
  } catch (e) {
    console.warn('Não foi possível carregar a fonte Roboto Condensed, usando helvetica', e);
  }
}

/** Encaixa uma imagem numa moldura sem distorcer (equivalente a object-fit:
 * contain) — evita que a foto "estoure" a área reservada a ela. */
function fitContain(
  naturalW: number,
  naturalH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): { x: number; y: number; w: number; h: number } {
  const boxRatio = boxW / boxH;
  const imgRatio = naturalW / naturalH;
  let w = boxW;
  let h = boxH;
  if (imgRatio > boxRatio) {
    // imagem mais "larga" que a moldura — a largura manda
    h = boxW / imgRatio;
  } else {
    // imagem mais "alta" — a altura manda
    w = boxH * imgRatio;
  }
  return { x: boxX + (boxW - w) / 2, y: boxY + (boxH - h) / 2, w, h };
}

const EMPRESA = 'Support Mining';
const black = '#000000';
const white = '#ffffff';
const grayBg = '#f2f2f2';
// Linhas internas mais claras e finas que a moldura externa — evita o
// aspecto "quadriculado" pesado que a empresa achou grotesco.
const softLine = black;
const red = '#ff0000';
const salmon = '#f4b183';

/** Uma linha "rótulo em negrito | valor", com borda suave ao redor. */
function drawLabelValueRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  labelWidth: number
): void {
  doc.setDrawColor(softLine);
  doc.setLineWidth(0.1);
  doc.rect(x, y, width, height, 'S');
  doc.line(x + labelWidth, y, x + labelWidth, y + height);

  doc.setTextColor(black);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(4.6);
  doc.text(label, x + 1.2, y + height / 2 + 1, { align: 'left' });

  doc.setFont(FONT, 'normal');
  doc.setFontSize(4.8);
  const valueLines = doc.splitTextToSize(value || '—', width - labelWidth - 2);
  doc.text(valueLines.slice(0, 2), x + labelWidth + 1.2, y + height / 2 + 1, { align: 'left' });
}

export const generateBadgePDF = async (employee: Employee, sharedDoc?: jsPDF): Promise<jsPDF> => {
  const toastId = toast.loading(`Gerando crachá para ${employee.name}...`);

  // Nome do gestor e Gerência deste contrato — cadastrados em Gerenciar
  // Contratos, uma vez só pro contrato inteiro (não por colaborador). Se
  // não conseguir buscar (ou não estiver preenchido), mostra "—" em vez
  // de travar a geração do crachá.
  let managerName: string | null = null;
  let gerencia: string | null = null;
  try {
    if (employee.contract) {
      const result = await trpcClient.contracts.getManagerName.query({ slug: employee.contract });
      managerName = result.managerName;
      gerencia = result.gerencia;
    }
  } catch {
    managerName = null;
    gerencia = null;
  }

  try {
    const doc = createBadgeDoc(110, 85, true, sharedDoc);
    await registerBadgeFont(doc);

    let logoBase64: string | null = null;
    try {
      logoBase64 = (await loadImage(logoMining, 'png')).dataUrl;
    } catch {
      logoBase64 = null;
    }

    // ================================================================
    // FRENTE (x=0..55, y=0..85)
    // ================================================================
    doc.setFillColor(white);
    doc.rect(0, 0, 55, 85, 'F');
    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(1, 1, 53, 83, 'S');

    // Logo (canto superior esquerdo)
    const logoX = 3;
    const logoY = 3;
    const logoW = 21;
    const logoH = 16;
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', logoX, logoY, logoW, logoH, undefined, 'FAST');
    }

    // Foto do colaborador (canto superior direito) — maior, sem moldura ao
    // redor (o próprio corte da foto já delimita o espaço). Sempre encaixada
    // por inteiro, sem esticar/estourar.
    const photoBoxX = 28;
    const photoBoxY = 3;
    const photoBoxW = 24;
    const photoBoxH = 24;
    if (employee.photoUrl) {
      try {
        const photo = await loadImage(employee.photoUrl);
        const fit = fitContain(photo.width, photo.height, photoBoxX, photoBoxY, photoBoxW, photoBoxH);
        doc.addImage(photo.dataUrl, 'JPEG', fit.x, fit.y, fit.w, fit.h);
      } catch {
        doc.setFillColor(grayBg);
        doc.rect(photoBoxX, photoBoxY, photoBoxW, photoBoxH, 'F');
        doc.setFontSize(5);
        doc.setTextColor('#999999');
        doc.text('SEM FOTO', photoBoxX + photoBoxW / 2, photoBoxY + photoBoxH / 2, { align: 'center' });
      }
    } else {
      doc.setFillColor(grayBg);
      doc.rect(photoBoxX, photoBoxY, photoBoxW, photoBoxH, 'F');
      doc.setFont(FONT, 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor('#999999');
      doc.text('FOTO', photoBoxX + photoBoxW / 2, photoBoxY + photoBoxH / 2, { align: 'center' });
    }

    // "COLABORADOR AUTORIZADO"
    let y = 30;
    doc.setTextColor(black);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(7.5);
    doc.text('COLABORADOR AUTORIZADO', 27.5, y, { align: 'center' });

    // Nome — barra destacada em salmão
    y += 2;
    const nameBarHeight = 5.5;
    doc.setFillColor(salmon);
    doc.rect(2, y, 51, nameBarHeight, 'F');
    doc.setDrawColor(black);
    doc.setLineWidth(0.15);
    doc.rect(2, y, 51, nameBarHeight, 'S');
    doc.setTextColor(black);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(6.3);
    const nameLines = doc.splitTextToSize(employee.name.toUpperCase(), 48);
    doc.text(nameLines.slice(0, 1), 27.5, y + nameBarHeight / 2 + 1.1, { align: 'center' });

    // Matrícula / Gerência / Gestor / Função — linhas mais compactas, pra
    // sobrar espaço vertical pra foto maior.
    y += nameBarHeight;
    const rowH = 5.8;
    const labelW = 16;
    drawLabelValueRow(doc, 2, y, 51, rowH, 'Matrícula:', employee.registration || '—', labelW);
    y += rowH;
    drawLabelValueRow(doc, 2, y, 51, rowH, 'Gerência:', gerencia || '—', labelW);
    y += rowH;
    drawLabelValueRow(doc, 2, y, 51, rowH, 'Gestor:', managerName || '—', labelW);
    y += rowH;
    drawLabelValueRow(doc, 2, y, 51, rowH, 'Função:', employee.role || '—', labelW);
    y += rowH;

    // "Dados CNH" — cabeçalho de seção
    const cnhHeaderH = 3.8;
    doc.setDrawColor(softLine);
    doc.setLineWidth(0.1);
    doc.rect(2, y, 51, cnhHeaderH, 'S');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(4.5);
    doc.text('Dados CNH', 27.5, y + cnhHeaderH / 2 + 1, { align: 'center' });
    y += cnhHeaderH;

    // N°
    const cnhRowH = 5.6;
    drawLabelValueRow(doc, 2, y, 51, cnhRowH, 'N°', employee.cnhNumero || '—', 10);
    y += cnhRowH;

    // Val. | Categoria — quatro colunas na mesma linha
    doc.setDrawColor(softLine);
    doc.setLineWidth(0.1);
    doc.rect(2, y, 51, cnhRowH, 'S');
    const valLabelW = 9;
    const valValueW = 15;
    const catLabelW = 15;
    doc.line(2 + valLabelW, y, 2 + valLabelW, y + cnhRowH);
    doc.line(2 + valLabelW + valValueW, y, 2 + valLabelW + valValueW, y + cnhRowH);
    doc.line(2 + valLabelW + valValueW + catLabelW, y, 2 + valLabelW + valValueW + catLabelW, y + cnhRowH);

    let cnhValidadeFormatted = '—';
    if (employee.cnhValidade) {
      try {
        cnhValidadeFormatted = new Date(`${employee.cnhValidade}T00:00:00`).toLocaleDateString('pt-BR');
      } catch {
        cnhValidadeFormatted = employee.cnhValidade;
      }
    }
    doc.setTextColor(black);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(4.6);
    doc.text('Val.', 2 + 1, y + cnhRowH / 2 + 1);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(4.4);
    doc.text(cnhValidadeFormatted, 2 + valLabelW + 1, y + cnhRowH / 2 + 1);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(4.6);
    doc.text('Categoria', 2 + valLabelW + valValueW + 1, y + cnhRowH / 2 + 1);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(4.4);
    doc.text(employee.cnhCategoria || '—', 2 + valLabelW + valValueW + catLabelW + 1, y + cnhRowH / 2 + 1);
    y += cnhRowH;

    // Empresa — fixo, não varia por colaborador/contrato
    doc.setDrawColor(black);
    doc.setLineWidth(0.2);
    const empresaH = 6;
    const empresaY = Math.min(y + 0.5, 84 - empresaH - 0.5);
    doc.rect(2, empresaY, 51, empresaH, 'S');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(6);
    doc.text(`Empresa: ${EMPRESA}`, 27.5, empresaY + empresaH / 2 + 1, { align: 'center' });

    // ================================================================
    // VERSO (x=55..110, y=0..85)
    // ================================================================
    const bx = 55;
    doc.setFillColor(white);
    doc.rect(bx, 0, 55, 85, 'F');
    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(bx + 1, 1, 53, 83, 'S');

    const tableX = bx + 2;
    const tableY = 3;
    const col1Width = 32;
    const col2Width = 19;
    const rowHeight = 5.8;

    doc.setFillColor('#e6e6e6');
    doc.rect(tableX, tableY, col1Width + col2Width, rowHeight, 'F');
    doc.setDrawColor(black);
    doc.setLineWidth(0.2);
    doc.rect(tableX, tableY, col1Width, rowHeight, 'S');
    doc.rect(tableX + col1Width, tableY, col2Width, rowHeight, 'S');

    doc.setTextColor(black);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(5.5);
    doc.text('Treinamento', tableX + col1Width / 2, tableY + 3.9, { align: 'center' });
    doc.text('Vencimento', tableX + col1Width + col2Width / 2, tableY + 3.9, { align: 'center' });

    let currentY = tableY + rowHeight;
    doc.setFontSize(4.6);

    if (employee.trainings && employee.trainings.length > 0) {
      const sortedTrainings = [...employee.trainings].sort((a, b) => {
        const statusA = getTrainingStatus(a.expirationDate).status;
        const statusB = getTrainingStatus(b.expirationDate).status;
        if (statusA === 'expired' && statusB !== 'expired') return -1;
        if (statusA !== 'expired' && statusB === 'expired') return 1;
        if (!a.expirationDate) return 1;
        if (!b.expirationDate) return -1;
        return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
      });

      sortedTrainings.forEach((training) => {
        if (currentY > 80) return;

        const status = getTrainingStatus(training.expirationDate);
        const isExpired = status.status === 'expired';

        const splitName = doc.splitTextToSize(training.name, col1Width - 2);
        const actualRowHeight = Math.max(rowHeight, splitName.length * 2.6 + 2);

        if (isExpired) {
          doc.setFillColor(red);
          doc.rect(tableX, currentY, col1Width + col2Width, actualRowHeight, 'F');
          doc.setTextColor(white);
        } else {
          doc.setFillColor(white);
          doc.rect(tableX, currentY, col1Width + col2Width, actualRowHeight, 'F');
          doc.setTextColor(black);
        }

        doc.setDrawColor(isExpired ? black : softLine);
        doc.setLineWidth(isExpired ? 0.2 : 0.1);
        doc.rect(tableX, currentY, col1Width, actualRowHeight, 'S');
        doc.rect(tableX + col1Width, currentY, col2Width, actualRowHeight, 'S');

        doc.setFont(FONT, 'normal');
        doc.text(splitName, tableX + col1Width / 2, currentY + actualRowHeight / 2 + (splitName.length === 1 ? 0.6 : -0.4), {
          align: 'center',
          baseline: 'middle',
        });

        // Sem data de vencimento cadastrada (ex.: função de vigia sem
        // validade) — mostra "XXX", igual ao modelo original da empresa.
        const expirationLabel = training.expirationDate
          ? new Date(`${training.expirationDate}T00:00:00`).toLocaleDateString('pt-BR')
          : 'XXX';
        doc.text(expirationLabel, tableX + col1Width + col2Width / 2, currentY + actualRowHeight / 2 + 0.6, {
          align: 'center',
          baseline: 'middle',
        });

        currentY += actualRowHeight;
      });
    } else {
      doc.setTextColor(black);
      doc.setDrawColor(softLine);
      doc.setLineWidth(0.1);
      doc.rect(tableX, currentY, col1Width, rowHeight, 'S');
      doc.rect(tableX + col1Width, currentY, col2Width, rowHeight, 'S');
      doc.setFont(FONT, 'normal');
      doc.text('Nenhum treinamento', tableX + col1Width / 2, currentY + 3.6, { align: 'center' });
      doc.text('-', tableX + col1Width + col2Width / 2, currentY + 3.6, { align: 'center' });
    }

    const rawDoc = unwrapBadgeDoc(doc);
    if (!sharedDoc) {
      rawDoc.save(`cracha-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
      toast.success('Crachá gerado com sucesso!', { id: toastId });
    } else {
      toast.dismiss(toastId);
    }
    return rawDoc;
  } catch (error) {
    console.error('Error generating badge PDF:', error);
    toast.error('Erro ao gerar crachá. Verifique o console para mais detalhes.', { id: toastId });
    throw error;
  }
};
