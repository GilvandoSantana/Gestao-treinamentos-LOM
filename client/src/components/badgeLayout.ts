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
  doubleSided: boolean
): BadgeLayout {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const targetWidth = doubleSided ? BADGE_MM.doubleWidth : BADGE_MM.singleWidth;
  const targetHeight = BADGE_MM.height;

  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;

  // Cartão centralizado horizontalmente na folha.
  const offsetX = (A4_WIDTH_MM - targetWidth) / 2;
  const offsetY = Math.min(TOP_MARGIN_MM, (A4_HEIGHT_MM - targetHeight) / 2);

  // A fonte acompanha a menor das escalas para não distorcer o texto.
  const fontScale = Math.min(scaleX, scaleY);

  return {
    doc,
    x: (value: number) => offsetX + value * scaleX,
    y: (value: number) => offsetY + value * scaleY,
    w: (value: number) => value * scaleX,
    h: (value: number) => value * scaleY,
    f: (value: number) => value * fontScale,
  };
}

/**
 * Desenha uma marca de corte discreta em volta do cartão, para facilitar
 * recortar depois de imprimir.
 */
export function drawCutMarks(layout: BadgeLayout, sourceWidth: number, sourceHeight: number) {
  const { doc } = layout;
  const left = layout.x(0);
  const top = layout.y(0);
  const right = layout.x(sourceWidth);
  const bottom = layout.y(sourceHeight);

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
  doubleSided: boolean
): jsPDF {
  const layout = createBadgeSheet(sourceWidth, sourceHeight, doubleSided);
  const { doc } = layout;

  drawCutMarks(layout, sourceWidth, sourceHeight);

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
