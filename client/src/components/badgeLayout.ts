/**
 * Layout padrão dos crachás.
 *
 * Todo crachá é gerado em uma folha A4 na orientação RETRATO, com o cartão
 * desenhado no tamanho físico exato:
 *   - só frente:        54 x 86 mm
 *   - frente e verso:  109 x 86 mm (as duas faces lado a lado)
 *
 * Os geradores continuam desenhando no sistema de coordenadas antigo deles;
 * este módulo devolve o fator de escala e o deslocamento necessários para
 * encaixar aquele desenho no tamanho final, dentro da folha A4.
 */

import { jsPDF } from 'jspdf';

/** Marca interna usada para recuperar o jsPDF "de verdade" por trás do Proxy
 * de conversão de coordenadas — necessário para juntar vários crachás num
 * único PDF sem aninhar Proxies (o que dobraria as transformações). */
const RAW_DOC = Symbol('rawBadgeDoc');

export function unwrapBadgeDoc(doc: jsPDF): jsPDF {
  return (doc as any)[RAW_DOC] ?? doc;
}

/** Medidas finais do cartão, em milímetros. */
export const BADGE_MM = {
  singleWidth: 54,
  doubleWidth: 109,
  height: 86,
} as const;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Distância do topo da folha até o cartão. */
const TOP_MARGIN_MM = 20;

export type BadgeLayout = {
  doc: jsPDF;
  /** Converte uma coordenada X do desenho original para a folha A4. */
  x: (value: number) => number;
  /** Converte uma coordenada Y do desenho original para a folha A4. */
  y: (value: number) => number;
  /** Converte uma largura do desenho original. */
  w: (value: number) => number;
  /** Converte uma altura do desenho original. */
  h: (value: number) => number;
  /** Converte um tamanho de fonte (pt) proporcionalmente. */
  f: (value: number) => number;
  /** Área física do cartão na folha, em mm. */
  card: { x: number; y: number; width: number; height: number };
};

/**
 * Cria a folha A4 retrato e devolve os conversores de coordenada.
 *
 * @param sourceWidth  largura do sistema de coordenadas usado pelo gerador
 * @param sourceHeight altura do sistema de coordenadas usado pelo gerador
 * @param doubleSided  true quando o crachá tem frente e verso
 */
export function createBadgeSheet(
  sourceWidth: number,
  sourceHeight: number,
  doubleSided: boolean,
  /** Documento já existente — usado para juntar vários crachás num só PDF. */
  existingDoc?: jsPDF
): BadgeLayout {
  // Sempre trabalha com o jsPDF "cru": se existingDoc vier do Proxy devolvido
  // por uma chamada anterior, precisa desembrulhar antes — senão as
  // transformações de coordenada se acumulariam a cada crachá do lote.
  const doc = existingDoc
    ? unwrapBadgeDoc(existingDoc)
    : new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
  (doc as any)[RAW_DOC] = doc;

  // Ao reutilizar o documento (lote), cada crachá novo vira uma página nova.
  if (existingDoc) {
    doc.addPage('a4', 'portrait');
  }

  const targetWidth = doubleSided ? BADGE_MM.doubleWidth : BADGE_MM.singleWidth;
  const targetHeight = BADGE_MM.height;

  // Escala ÚNICA para os dois eixos. Usar escalas diferentes em X e Y
  // esticava/achatava fotos, logos e textos — era o que deixava o crachá
  // desorganizado. Aqui o desenho mantém a proporção original e apenas é
  // ampliado ou reduzido até caber no cartão.
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);

  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;

  // Cartão (área de corte) centralizado na folha…
  const cardX = (A4_WIDTH_MM - targetWidth) / 2;
  const cardY = Math.min(TOP_MARGIN_MM, (A4_HEIGHT_MM - targetHeight) / 2);

  // …e o desenho centralizado dentro do cartão, caso sobre espaço por causa
  // da diferença de proporção.
  const offsetX = cardX + (targetWidth - drawnWidth) / 2;
  const offsetY = cardY + (targetHeight - drawnHeight) / 2;

  const scaleX = scale;
  const scaleY = scale;
  const fontScale = scale;

  return {
    doc,
    x: (value: number) => offsetX + value * scaleX,
    y: (value: number) => offsetY + value * scaleY,
    w: (value: number) => value * scaleX,
    h: (value: number) => value * scaleY,
    f: (value: number) => value * fontScale,
    card: { x: cardX, y: cardY, width: targetWidth, height: targetHeight },
  };
}

/**
 * Desenha uma marca de corte discreta em volta do cartão, para facilitar
 * recortar depois de imprimir.
 */
export function drawCutMarks(layout: BadgeLayout, _sourceWidth: number, _sourceHeight: number) {
  const { doc, card } = layout;
  const left = card.x;
  const top = card.y;
  const right = card.x + card.width;
  const bottom = card.y + card.height;

  doc.setDrawColor(170, 170, 170);
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(left, top, right - left, bottom - top, 'S');
  doc.setLineDashPattern([], 0);
}

/**
 * Devolve um jsPDF "adaptado": os geradores continuam desenhando nas
 * coordenadas antigas deles, e este adaptador converte cada chamada para a
 * posição e o tamanho corretos dentro da folha A4.
 *
 * Isso evita reescrever centenas de coordenadas em cada gerador — e garante
 * que os três fiquem exatamente no mesmo tamanho físico.
 */
export function createBadgeDoc(
  sourceWidth: number,
  sourceHeight: number,
  doubleSided: boolean,
  existingDoc?: jsPDF
): jsPDF {
  const layout = createBadgeSheet(sourceWidth, sourceHeight, doubleSided, existingDoc);
  drawCutMarks(layout, sourceWidth, sourceHeight);
  return wrapDocWithLayout(layout);
}

/** Símbolo pra guardar, no próprio documento, qual das colunas da folha já
 * foi ocupada — usado só pelo layout "N por folha" abaixo, pra saber
 * quando começar página nova e em qual coluna desenhar o próximo crachá
 * do lote. */
const GRID_SLOT_INDEX = Symbol('gridSlotIndex');

const A4_LANDSCAPE_WIDTH_MM = 297;
const A4_LANDSCAPE_HEIGHT_MM = 210;

/** Espaço entre as colunas, e entre a coluna mais à esquerda/direita e a
 * borda da folha (calculado pra centralizar as colunas juntas). */
const GRID_COLUMN_GAP_MM = 12;

/**
 * Ideia do Gilvando (18/09, ajustado no mesmo dia): crachá do Almoxarifado
 * impresso em várias colunas numa folha A4 PAISAGEM, cada colaborador com
 * frente (QR code) em cima e verso (logo) colado embaixo — poupa papel num
 * lote grande, já que o formato de 1 por folha (createBadgeSheet) gastava
 * uma folha inteira por pessoa.
 *
 * O gerador precisa desenhar frente e verso EMPILHADOS e COLADOS no sistema
 * de coordenadas dele (frente ocupando y:[0,sourceHeight], verso ocupando
 * y:[sourceHeight,sourceHeight*2] — sem espaço entre as duas, já que a
 * ideia é dobrar o papel bem no meio pra virar frente/verso de verdade),
 * passando sourceHeight*2 como altura total pra este layout escalar certo.
 *
 * @param sourceWidth  largura do sistema de coordenadas de UMA face
 * @param sourceTotalHeight altura do sistema de coordenadas do desenho
 *   INTEIRO (frente + verso, empilhados e colados)
 * @param columns número de colunas (colaboradores) por folha
 */
export function createBadgeSheetGridLandscape(
  sourceWidth: number,
  sourceTotalHeight: number,
  columns: number,
  existingDoc?: jsPDF
): BadgeLayout {
  const doc = existingDoc
    ? unwrapBadgeDoc(existingDoc)
    : new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
  (doc as any)[RAW_DOC] = doc;

  const slotIndex: number = existingDoc ? ((doc as any)[GRID_SLOT_INDEX] ?? 0) : 0;

  // Só começa página nova quando todas as colunas da página atual já estão
  // ocupadas (voltando pro slot 0) — as chamadas anteriores de um lote
  // reaproveitam a MESMA página que a primeira já criou.
  if (existingDoc && slotIndex === 0) {
    doc.addPage('a4', 'landscape');
  }
  (doc as any)[GRID_SLOT_INDEX] = (slotIndex + 1) % columns;

  const targetWidth = BADGE_MM.singleWidth; // uma coluna = largura de UMA face (54mm)
  const targetHeight = sourceTotalHeight; // sem redução — a "folha" da coluna já é do tamanho do desenho

  // Mesma lógica de escala única do createBadgeSheet (não estica/achata).
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceTotalHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceTotalHeight * scale;

  const totalColumnsWidth = targetWidth * columns + GRID_COLUMN_GAP_MM * (columns - 1);
  const leftMargin = (A4_LANDSCAPE_WIDTH_MM - totalColumnsWidth) / 2;
  const columnX = leftMargin + slotIndex * (targetWidth + GRID_COLUMN_GAP_MM);
  const columnY = (A4_LANDSCAPE_HEIGHT_MM - targetHeight) / 2;

  const offsetX = columnX + (targetWidth - drawnWidth) / 2;
  const offsetY = columnY + (targetHeight - drawnHeight) / 2;

  return {
    doc,
    x: (value: number) => offsetX + value * scale,
    y: (value: number) => offsetY + value * scale,
    w: (value: number) => value * scale,
    h: (value: number) => value * scale,
    f: (value: number) => value * scale,
    card: { x: columnX, y: columnY, width: targetWidth, height: targetHeight },
  };
}

/** Mesma ideia de createBadgeDoc, mas pro layout "N por folha" acima —
 * devolve o jsPDF adaptado pra o gerador continuar desenhando nas
 * coordenadas antigas dele. */
export function createBadgeDocGridLandscape(
  sourceWidth: number,
  sourceTotalHeight: number,
  columns: number,
  existingDoc?: jsPDF
): jsPDF {
  const layout = createBadgeSheetGridLandscape(sourceWidth, sourceTotalHeight, columns, existingDoc);
  drawCutMarks(layout, sourceWidth, sourceTotalHeight);
  return wrapDocWithLayout(layout);
}

/** Cria o Proxy que converte cada chamada de desenho (rect, addImage, text,
 * etc.) do sistema de coordenadas do gerador pra posição/tamanho reais na
 * folha — compartilhado pelos dois layouts (1 por folha e 3 por folha),
 * já que a lógica de conversão em si é idêntica, só o cálculo de x/y/w/h
 * de cada layout muda. */
function wrapDocWithLayout(layout: BadgeLayout): jsPDF {
  const { doc } = layout;

  const handler: ProxyHandler<jsPDF> = {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, target);
      if (typeof original !== 'function') return original;

      const name = String(prop);

      const wrap = (fn: (...args: any[]) => any[]) =>
        (...args: any[]) => {
          const result = original.apply(target, fn(args));
          // Mantém o encadeamento apontando para o proxy.
          return result === target ? receiver : result;
        };

      switch (name) {
        case 'rect':
        case 'roundedRect': {
          return wrap((a) => {
            const out = [...a];
            out[0] = layout.x(a[0]);
            out[1] = layout.y(a[1]);
            out[2] = layout.w(a[2]);
            out[3] = layout.h(a[3]);
            if (name === 'roundedRect') {
              out[4] = layout.w(a[4]);
              out[5] = layout.h(a[5]);
            }
            return out;
          });
        }
        case 'addImage': {
          return wrap((a) => {
            const out = [...a];
            out[2] = layout.x(a[2]);
            out[3] = layout.y(a[3]);
            out[4] = layout.w(a[4]);
            out[5] = layout.h(a[5]);
            return out;
          });
        }
        case 'text': {
          return wrap((a) => {
            const out = [...a];
            out[1] = layout.x(a[1]);
            out[2] = layout.y(a[2]);
            return out;
          });
        }
        case 'line': {
          return wrap((a) => [
            layout.x(a[0]),
            layout.y(a[1]),
            layout.x(a[2]),
            layout.y(a[3]),
            ...a.slice(4),
          ]);
        }
        case 'circle': {
          return wrap((a) => [layout.x(a[0]), layout.y(a[1]), layout.w(a[2]), ...a.slice(3)]);
        }
        case 'ellipse': {
          return wrap((a) => [
            layout.x(a[0]),
            layout.y(a[1]),
            layout.w(a[2]),
            layout.h(a[3]),
            ...a.slice(4),
          ]);
        }
        case 'setFontSize': {
          return wrap((a) => [layout.f(a[0]), ...a.slice(1)]);
        }
        case 'setLineWidth': {
          return wrap((a) => [layout.w(a[0]), ...a.slice(1)]);
        }
        default:
          return wrap((a) => a);
      }
    },
  };

  return new Proxy(doc, handler);
}
