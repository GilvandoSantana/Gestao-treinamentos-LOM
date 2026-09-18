import { describe, it, expect, vi, beforeEach } from "vitest";

// Linhas "cruas" que o join do banco devolveria, cada uma já marcada com o
// contrato do colaborador (é isso que o .where() deveria filtrar).
const ALL_ROWS = [
  { id: "1", employeeId: "emp-a", trainingId: "t-a", lastSentAt: new Date("2026-01-01"), createdAt: new Date("2026-01-01"), trainingName: "NR-35", employeeName: "Colaborador A", expirationDate: "2026-06-01", __contract: "contrato-a" },
  { id: "2", employeeId: "emp-b", trainingId: "t-b", lastSentAt: new Date("2026-01-02"), createdAt: new Date("2026-01-02"), trainingName: "NR-10", employeeName: "Colaborador B", expirationDate: "2026-07-01", __contract: "contrato-b" },
];

const mockGetDb = vi.fn();
vi.mock("../db", () => ({ getDb: () => mockGetDb() }));
vi.mock("./db", () => ({ getDb: () => mockGetDb() }));

/**
 * Simula o comportamento real do Drizzle: quando .where() recebe uma
 * condição (objeto produzido por eq(employees.contract, valor)), filtra as
 * linhas por esse valor; quando recebe undefined (ctx.siteContract null —
 * administrador da plataforma), devolve tudo, sem filtro.
 */
function makeFakeDb() {
  return {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          leftJoin: () => ({
            where: (condition: unknown) => {
              if (condition === undefined) {
                return Promise.resolve(ALL_ROWS.map(stripInternal));
              }
              const value = (condition as { queryChunks?: unknown[] } & Record<string, any>)?.value
                ?? extractEqValue(condition);
              return Promise.resolve(
                ALL_ROWS.filter(r => r.__contract === value).map(stripInternal)
              );
            },
          }),
        }),
      }),
    }),
  };
}

function stripInternal(row: (typeof ALL_ROWS)[number]) {
  const { __contract, ...rest } = row;
  return rest;
}

// drizzle-orm's eq() builds a SQL fragment; para o teste, o mais simples e
// robusto é espiar a própria função eq usada pelo router e capturar o valor
// passado, em vez de tentar decodificar a AST do SQL gerado.
let lastEqValue: string | undefined;
vi.mock("drizzle-orm", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (column: unknown, value: string) => {
      lastEqValue = value;
      return { __isEqMock: true, value };
    },
  };
});

function extractEqValue(condition: unknown): string | undefined {
  return (condition as { value?: string })?.value;
}

function createMockContext(siteContract: string | null) {
  return {
    user: null,
    isSiteAdmin: true,
    siteAdminUsername: "teste-admin",
    siteRole: "admin" as const,
    sitePermissions: null,
    siteContract,
    siteOrganizationId: siteContract ? "org-1" : null,
    siteHasTwoFactorEnabled: false,
    isImpersonating: false,
    req: { protocol: "https", headers: {} } as any,
    res: {} as any,
  };
}

describe("emailHistory.list — isolamento por contrato (correção de auditoria 18/09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastEqValue = undefined;
    mockGetDb.mockResolvedValue(makeFakeDb());
  });

  it("um admin de um contrato específico só vê o histórico do PRÓPRIO contrato", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMockContext("contrato-a") as any);

    const result = await caller.emailHistory.list();

    expect(result).toHaveLength(1);
    expect(result[0].employeeName).toBe("Colaborador A");
    // Garante que nada do contrato-b vazou para quem só deveria ver o A.
    expect(result.some(r => r.employeeName === "Colaborador B")).toBe(false);
  });

  it("não deixa ver o histórico de OUTRO contrato", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMockContext("contrato-b") as any);

    const result = await caller.emailHistory.list();

    expect(result).toHaveLength(1);
    expect(result[0].employeeName).toBe("Colaborador B");
  });

  it("administrador da plataforma (siteContract null) continua vendo tudo, de propósito", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMockContext(null) as any);

    const result = await caller.emailHistory.list();

    expect(result).toHaveLength(2);
  });
});
