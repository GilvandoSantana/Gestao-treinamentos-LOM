import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkExtractionRateLimit, registerExtractionAttempt } from "./pgr-extraction";

/**
 * A extração automática do PGR chama a API paga da Anthropic mandando o
 * documento inteiro (até 32MB) a cada clique — sem limite, um uso
 * repetido vira custo real sem controle. Estes testes cobrem só o
 * limitador em si (rápido, sem rede), não a extração completa (que
 * exigiria mockar a API da Anthropic e um PDF de verdade).
 */
describe("checkExtractionRateLimit / registerExtractionAttempt", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("libera as primeiras tentativas dentro do limite", () => {
    const contract = `contrato-teste-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      expect(checkExtractionRateLimit(contract)).toBeNull();
      registerExtractionAttempt(contract);
    }
  });

  it("bloqueia a partir da 21ª tentativa na mesma hora", () => {
    const contract = `contrato-teste-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      registerExtractionAttempt(contract);
    }
    const remaining = checkExtractionRateLimit(contract);
    expect(remaining).not.toBeNull();
    expect(remaining).toBeGreaterThan(0);
  });

  it("cada contrato tem seu próprio limite, um não afeta o outro", () => {
    const contractA = `contrato-a-${Math.random()}`;
    const contractB = `contrato-b-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      registerExtractionAttempt(contractA);
    }
    expect(checkExtractionRateLimit(contractA)).not.toBeNull();
    expect(checkExtractionRateLimit(contractB)).toBeNull();
  });
});
