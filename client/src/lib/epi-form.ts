/**
 * Ficha de Controle de Entrega e Devolução de EPI.
 *
 * Reproduz o modelo em planilha (frente + verso) enviado pelo administrador,
 * preenchendo automaticamente Nome, Data de Admissão, Contrato e Função do
 * colaborador — igual ao crachá. Os EPIs padrão (comuns a todos) já saem
 * prontos na tabela da frente; o resto (CA, itens extras, datas, rubricas)
 * continua sendo preenchido à mão, em papel, depois de impresso.
 *
 * O layout de verdade (desenho) fica em epi-form-render.ts, sem nenhum
 * import de asset — aqui só carrega as imagens e busca o nome do contrato.
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
import logoMining from '@/assets/logo-support-mining.png';
import epiIllustration from '@/assets/epi-illustration.png';
import { trpcClient } from '@/lib/trpc';
import { renderEpiFormPages, type PageData } from '@/lib/epi-form-render';

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
    img.src = url;
  });
};

/**
 * Gera a Ficha de EPI (frente + verso) de um colaborador. Se `sharedDoc` for
 * passado, as duas páginas são adicionadas a ele (uso em lote, um PDF só
 * com várias fichas); caso contrário cria um documento novo e já baixa.
 */
export const generateEpiFormPDF = async (employee: Employee, sharedDoc?: jsPDF): Promise<jsPDF> => {
  const doc = sharedDoc ?? new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  if (sharedDoc) {
    doc.addPage('a4', 'landscape');
  }

  const [logoBase64, illustrationBase64, contractInfo] = await Promise.all([
    loadImage(logoMining),
    loadImage(epiIllustration),
    employee.contract
      ? trpcClient.contracts.getManagerName.query({ slug: employee.contract }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const contractName = contractInfo?.contractName ?? employee.contract ?? '';
  const pageData: PageData = { employee, contractName, logoBase64, illustrationBase64 };

  await renderEpiFormPages(doc, pageData);

  if (!sharedDoc) {
    doc.save(`ficha-epi-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
  }

  return doc;
};
