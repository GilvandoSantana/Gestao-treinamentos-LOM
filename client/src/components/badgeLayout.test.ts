import { describe, it, expect } from 'vitest';
import { createBadgeSheetTripleLandscape } from './badgeLayout';

describe('createBadgeSheetTripleLandscape (ideia do Gilvando, 18/09: 3 crachás por folha A4 paisagem)', () => {
  it('cria a folha em paisagem (largura > altura, tamanho A4)', () => {
    const layout = createBadgeSheetTripleLandscape(55, 180);
    const width = layout.doc.internal.pageSize.getWidth();
    const height = layout.doc.internal.pageSize.getHeight();
    expect(width).toBeCloseTo(297, 0);
    expect(height).toBeCloseTo(210, 0);
    expect(width).toBeGreaterThan(height);
  });

  it('as 3 primeiras chamadas do lote ficam na MESMA página (uma por coluna)', () => {
    const first = createBadgeSheetTripleLandscape(55, 180);
    const second = createBadgeSheetTripleLandscape(55, 180, first.doc);
    const third = createBadgeSheetTripleLandscape(55, 180, second.doc);
    expect(third.doc.getNumberOfPages()).toBe(1);

    // As 3 colunas ficam em posições X crescentes, sem sobrepor.
    expect(second.card.x).toBeGreaterThan(first.card.x + first.card.width);
    expect(third.card.x).toBeGreaterThan(second.card.x + second.card.width);
  });

  it('a 4ª chamada do lote (volta pro slot 0) começa página nova — o caso central deste achado', () => {
    let doc = createBadgeSheetTripleLandscape(55, 180).doc;
    doc = createBadgeSheetTripleLandscape(55, 180, doc).doc;
    doc = createBadgeSheetTripleLandscape(55, 180, doc).doc;
    expect(doc.getNumberOfPages()).toBe(1); // ainda a mesma folha (3 colunas ocupadas)

    const fourth = createBadgeSheetTripleLandscape(55, 180, doc);
    expect(fourth.doc.getNumberOfPages()).toBe(2); // agora sim, folha nova

    // E volta pra coluna da esquerda (mesma posição X da primeira chamada).
    const first = createBadgeSheetTripleLandscape(55, 180);
    expect(fourth.card.x).toBeCloseTo(first.card.x, 1);
  });

  it('as 3 colunas cabem dentro da largura da folha, sem passar da borda', () => {
    const first = createBadgeSheetTripleLandscape(55, 180);
    let doc = first.doc;
    const second = createBadgeSheetTripleLandscape(55, 180, doc);
    doc = second.doc;
    const third = createBadgeSheetTripleLandscape(55, 180, doc);

    const pageWidth = third.doc.internal.pageSize.getWidth();
    expect(first.card.x).toBeGreaterThanOrEqual(0);
    expect(third.card.x + third.card.width).toBeLessThanOrEqual(pageWidth);
  });
});
