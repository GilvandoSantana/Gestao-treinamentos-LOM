import { describe, it, expect } from "vitest";
import { planTableRows, type EpiTableItem } from "./epi-form-render";

function makeItems(count: number): EpiTableItem[] {
  return Array.from({ length: count }, (_, i) => ({
    quantity: 1,
    specification: `EPI ${i + 1}`,
    ca: String(1000 + i),
    responsibleName: "Teste",
  }));
}

describe("epi-form-render: planTableRows", () => {
  it("sem nenhum item configurado, sai tudo em branco (tamanho padrão)", () => {
    const plan = planTableRows([]);
    expect(plan.frontItems).toHaveLength(0);
    expect(plan.backItems).toHaveLength(0);
    expect(plan.frontRows).toBeGreaterThan(0);
    expect(plan.backRows).toBeGreaterThan(0);
  });

  it("poucos itens cabem todos na frente, com colchão de linhas em branco", () => {
    const items = makeItems(3);
    const plan = planTableRows(items);

    expect(plan.frontItems).toHaveLength(3);
    expect(plan.backItems).toHaveLength(0);
    // Sobra espaço em branco na frente além dos 3 itens (o "colchão").
    expect(plan.frontRows).toBeGreaterThan(3);
  });

  it("no limite exato que cabe numa página, tudo fica na frente", () => {
    // 15 é o FRONT_MAX_ROWS calibrado visualmente (ver epi-form-render.ts).
    const items = makeItems(15);
    const plan = planTableRows(items);

    expect(plan.frontItems).toHaveLength(15);
    expect(plan.backItems).toHaveLength(0);
  });

  it("mais itens do que cabe na frente transborda pro verso", () => {
    const items = makeItems(17);
    const plan = planTableRows(items);

    // Os 15 primeiros ficam na frente, o restante (2) vai pro verso.
    expect(plan.frontItems).toHaveLength(15);
    expect(plan.backItems).toHaveLength(2);
    expect(plan.backItems[0].specification).toBe("EPI 16");
    expect(plan.backItems[1].specification).toBe("EPI 17");
  });

  it("uma lista bem grande (30 itens) ainda cabe toda entre frente e verso", () => {
    const items = makeItems(30);
    const plan = planTableRows(items);

    const totalPlaced = plan.frontItems.length + plan.backItems.length;
    expect(totalPlaced).toBe(30);
    // Nada pode ficar de fora — cada item configurado tem que aparecer.
    expect(plan.backRows).toBeGreaterThanOrEqual(plan.backItems.length);
  });

  it("nunca perde nenhum item, para qualquer quantidade razoável", () => {
    for (const count of [1, 5, 10, 14, 15, 16, 20, 25, 40]) {
      const items = makeItems(count);
      const plan = planTableRows(items);
      const totalPlaced = plan.frontItems.length + plan.backItems.length;
      expect(totalPlaced, `falhou com ${count} itens`).toBe(count);
    }
  });
});
