/**
 * BadgeWarehouseGenerator Component
 * Crachá "Almoxarifado" — QR code em destaque (mesmo formato do crachá
 * padrão, FUNC:<matrícula>), usado pra escanear na câmera do Almoxarifado
 * na hora de retirar ferramenta/material. Abaixo do QR: nome, matrícula e
 * função. Verso: só a logo grande da Support Mining.
 *
 * DIMENSÕES: 55mm x 85mm por face — mesmo tamanho padrão dos outros crachás.
 *
 * Layout de impressão (ideia do Gilvando, 18/09, ajustado no mesmo dia):
 * 4 colaboradores por folha A4 PAISAGEM, cada um com a frente em cima e o
 * verso COLADO embaixo (sem espaço entre as duas — pensado pra DOBRAR o
 * papel ali no meio, não cortar frente e verso separados). Como o verso
 * fica de cabeça para baixo em relação à frente até a hora de dobrar, a
 * logo (e o texto de reserva, se a logo não carregar) são desenhados
 * virados 180° — assim, depois de dobrado, o verso aparece na orientação
 * certa.
 */

import { createBadgeDocGridLandscape, unwrapBadgeDoc } from './badgeLayout';
import type { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Employee } from '@/lib/types';
import { toast } from 'sonner';
import logoMining from '@/assets/logo-support-mining.png';

// 4 colaboradores por folha (ideia do Gilvando, 18/09 — "percebi que tem espaço").
const COLUMNS_PER_PAGE = 4;

/** Carrega a imagem e devolve como data URL — opcionalmente virada 180°
 * (usada no verso do crachá, que fica de cabeça para baixo até a pessoa
 * dobrar o papel ao meio). */
const loadImage = (url: string, rotate180 = false): Promise<string> => {
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
        if (rotate180) {
          ctx.translate(canvas.width, canvas.height);
          ctx.rotate(Math.PI);
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
    // Frente (y:0-85) e verso (y:85-170) empilhados e COLADOS — sem
    // espaço entre as duas, já que a ideia é dobrar o papel bem no meio.
    // A largura do desenho é só 55mm (uma face), já que frente e verso
    // não ficam mais lado a lado.
    const doc = createBadgeDocGridLandscape(55, 85 * 2, COLUMNS_PER_PAGE, sharedDoc);

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
    // VERSO — só a logo grande da Support Mining, colada ABAIXO da frente
    // (by desloca em Y, não em X — antes ficava ao lado, offset bx) e
    // virada 180°: depois de dobrar o papel ao meio, aparece do jeito
    // certo (achado do Gilvando, 18/09).
    // =====================================================================
    const by = 85;
    doc.setFillColor(white);
    doc.rect(0, by, 55, 85, 'F');
    doc.setDrawColor(grayBorder);
    doc.rect(1, by + 1, 53, 83, 'S');

    try {
      const logoBase64 = await loadImage(logoMining, true);
      // Logo grande, centralizada na face inteira
      doc.addImage(logoBase64, 'PNG', 9.5, by + 30, 36, 27.5, undefined, 'FAST');
    } catch (error) {
      // Texto de reserva também virado 180° (angle), pelo mesmo motivo da
      // logo. NÃO uso align:'center' junto com angle — é uma combinação
      // com bug conhecido no jsPDF (a centralização soma o deslocamento
      // do jeito errado quando o texto está rotacionado 180°, jogando o
      // texto pra fora do cartão). Calculo a centralização manualmente
      // via getTextWidth: texto rotacionado 180° "cresce" da âncora pra
      // ESQUERDA (o oposto do texto normal), então a âncora precisa ficar
      // deslocada pra DIREITA em metade da largura do texto.
      doc.setTextColor(black);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const titleWidth = doc.getTextWidth('SUPPORT+MINING');
      doc.text('SUPPORT+MINING', 27.5 + titleWidth / 2, by + 43, { angle: 180 });
      doc.setFontSize(6);
      const subtitleWidth = doc.getTextWidth('ENGENHARIA');
      doc.text('ENGENHARIA', 27.5 + subtitleWidth / 2, by + 38, { angle: 180 });
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
