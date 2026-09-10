import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock database
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./db-employees", () => ({
  getEmployeeById: vi.fn(async () => undefined),
  getTrainingById: vi.fn(async () => undefined),
  withEmployeeTransaction: vi.fn(async (_id, _contract, write) => write({})),
  upsertEmployee: vi.fn(),
  upsertTraining: vi.fn(),
  getAllEmployees: vi.fn(() => Promise.resolve([])),
  getTrainingsByEmployeeId: vi.fn(() => Promise.resolve([])),
  // Adicionada depois que este teste foi escrito (rota employees.list
  // passou a juntar os treinamentos de todo mundo numa consulta só).
  getTrainingsGroupedByEmployee: vi.fn(() => Promise.resolve(new Map())),
  // Idem — sync passou a limpar treinamentos removidos da planilha.
  deleteTrainingsExcept: vi.fn(() => Promise.resolve()),
}));

// getAllPhotoUrls só entraria em jogo se o Supabase estivesse configurado
// de verdade — sem mockar, o teste tentaria uma chamada de rede real.
vi.mock("./supabase-storage", () => ({
  getAllPhotoUrls: vi.fn(() => Promise.resolve(new Map())),
}));

function createMockContext(): TrpcContext {
  return {
    user: null,
    isSiteAdmin: true,
    siteAdminUsername: null,
    // A rota exige um contrato escolhido no cabeçalho quando quem chama é
    // admin — sem isso, cai no "Escolha um contrato..." antes da lógica
    // que o teste quer verificar.
    siteContract: "contrato-teste",
    siteRole: 'admin',
    sitePermissions: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("employees.sync", () => {
  it("should sync employees and trainings to the server", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const testEmployees = [
      {
        id: "emp-1",
        name: "João Silva",
        role: "Motorista",
        trainings: [
          {
            id: "train-1",
            name: "Direção Defensiva",
            completionDate: "2025-06-15",
            expirationDate: "2026-06-15",
          },
        ],
      },
    ];

    const result = await caller.employees.sync({ employees: testEmployees });

    expect(result).toEqual({
      success: true,
      count: 1,
      updated: 1,
      failed: [],
    });
  });

  it("should handle multiple employees with multiple trainings", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const testEmployees = [
      {
        id: "emp-1",
        name: "João Silva",
        role: "Motorista",
        trainings: [
          {
            id: "train-1",
            name: "Direção Defensiva",
            completionDate: "2025-06-15",
            expirationDate: "2026-06-15",
          },
          {
            id: "train-2",
            name: "Trabalho em Altura",
            completionDate: "2025-07-20",
            expirationDate: "2026-07-20",
          },
        ],
      },
      {
        id: "emp-2",
        name: "Maria Santos",
        role: "Soldador industrial",
        trainings: [
          {
            id: "train-3",
            name: "Proteção de Máquinas",
            completionDate: "2025-05-10",
            expirationDate: "2026-05-10",
          },
        ],
      },
    ];

    const result = await caller.employees.sync({ employees: testEmployees });

    expect(result).toEqual({
      success: true,
      count: 2,
      updated: 2,
      failed: [],
    });
  });

  it("should handle empty trainings array", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const testEmployees = [
      {
        id: "emp-1",
        name: "João Silva",
        role: "Motorista",
        trainings: [],
      },
    ];

    const result = await caller.employees.sync({ employees: testEmployees });

    expect(result).toEqual({
      success: true,
      count: 1,
      updated: 1,
      failed: [],
    });
  });

  it("marca o colaborador como falho quando a planilha tem o mesmo treinamento duplicado, sem travar o restante do lote", async () => {
    // Achado real reportado pelo Gilvando: dava pra cadastrar o mesmo
    // treinamento duas vezes pro mesmo colaborador. Aqui testa a barreira
    // do caminho de importação por planilha — o caminho de edição manual
    // (upsertOne) tem seu próprio teste equivalente.
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const testEmployees = [
      {
        id: "emp-1",
        name: "Colaborador Com Duplicata",
        role: "Motorista",
        trainings: [
          { id: "train-1", name: "NR-35", completionDate: "2025-06-15", expirationDate: "2026-06-15" },
          { id: "train-2", name: "nr-35", completionDate: "2025-07-01", expirationDate: "2026-07-01" },
        ],
      },
      {
        id: "emp-2",
        name: "Colaborador Sem Problema",
        role: "Soldador industrial",
        trainings: [
          { id: "train-3", name: "Proteção de Máquinas", completionDate: "2025-05-10", expirationDate: "2026-05-10" },
        ],
      },
    ];

    const result = await caller.employees.sync({ employees: testEmployees });

    expect(result.updated).toBe(1); // só o segundo colaborador foi salvo
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe("Colaborador Com Duplicata");
    expect(result.failed[0].error).toContain("duplicado");
  });
});

describe("employees.list", () => {
  it("should return list of employees with trainings", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employees.list();

    expect(Array.isArray(result)).toBe(true);
  });
});
