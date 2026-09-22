import { describe, it, expect } from 'vitest';
import { createBadgeSheetGridLandscape } from './badgeLayout';

describe('createBadgeSheetGridLandscape (ideia do Gilvando, 18/09: N crachás por folha A4 paisagem)', () => {
  it('cria a folha em paisagem (largura > altura, tamanho A4)', () => {
    const layout = createBadgeSheetGridLandscape(55, 170, 4);
    const width = layout.doc.internal.pageSize.getWidth();
    const height = layout.doc.internal.pageSize.getHeight();
    expect(width).toBeCloseTo(297, 0);
    expect(height).toBeCloseTo(210, 0);
    expect(width).toBeGreaterThan(height);
  });

  it('as 4 primeiras chamadas do lote ficam na MESMA página (uma por coluna)', () => {
    const first = createBadgeSheetGridLandscape(55, 170, 4);
    const second = createBadgeSheetGridLandscape(55, 170, 4, first.doc);
    const third = createBadgeSheetGridLandscape(55, 170, 4, second.doc);
    const fourth = createBadgeSheetGridLandscape(55, 170, 4, third.doc);
    expect(fourth.doc.getNumberOfPages()).toBe(1);

    // As 4 colunas ficam em posições X crescentes, sem sobrepor.
    expect(second.card.x).toBeGreaterThan(first.card.x + first.card.width);
    expect(third.card.x).toBeGreaterThan(second.card.x + second.card.width);
    expect(fourth.card.x).toBeGreaterThan(third.card.x + third.card.width);
  });

  it('a 5ª chamada do lote (volta pro slot 0) começa página nova — o caso central deste achado', () => {
    let doc = createBadgeSheetGridLandscape(55, 170, 4).doc;
    doc = createBadgeSheetGridLandscape(55, 170, 4, doc).doc;
    doc = createBadgeSheetGridLandscape(55, 170, 4, doc).doc;
    doc = createBadgeSheetGridLandscape(55, 170, 4, doc).doc;
    expect(doc.getNumberOfPages()).toBe(1); // ainda a mesma folha (4 colunas ocupadas)

    const fifth = createBadgeSheetGridLandscape(55, 170, 4, doc);
    expect(fifth.doc.getNumberOfPages()).toBe(2); // agora sim, folha nova

    // E volta pra coluna da esquerda (mesma posição X da primeira chamada).
    const first = createBadgeSheetGridLandscape(55, 170, 4);
    expect(fifth.card.x).toBeCloseTo(first.card.x, 1);
  });

  it('as 4 colunas cabem dentro da largura da folha, sem passar da borda', () => {
    const first = createBadgeSheetGridLandscape(55, 170, 4);
    let doc = first.doc;
    const second = createBadgeSheetGridLandscape(55, 170, 4, doc);
    doc = second.doc;
    const third = createBadgeSheetGridLandscape(55, 170, 4, doc);
    doc = third.doc;
    const fourth = createBadgeSheetGridLandscape(55, 170, 4, doc);

    const pageWidth = fourth.doc.internal.pageSize.getWidth();
    expect(first.card.x).toBeGreaterThanOrEqual(0);
    expect(fourth.card.x + fourth.card.width).toBeLessThanOrEqual(pageWidth);
  });

  it('número de colunas é configurável — funciona igual com 3 (não ficou fixo em 4)', () => {
    const first = createBadgeSheetGridLandscape(55, 170, 3);
    const second = createBadgeSheetGridLandscape(55, 170, 3, first.doc);
    const third = createBadgeSheetGridLandscape(55, 170, 3, second.doc);
    expect(third.doc.getNumberOfPages()).toBe(1);

    const fourth = createBadgeSheetGridLandscape(55, 170, 3, third.doc);
    expect(fourth.doc.getNumberOfPages()).toBe(2); // com 3 colunas, a 4ª já é folha nova
  });
});
