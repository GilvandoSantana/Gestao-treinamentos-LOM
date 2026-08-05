import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock database
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./db-employees", () => ({
  upsertEmployee: vi.fn(),
  upsertTraining: vi.fn(),
  getAllEmployees: vi.fn(() => Promise.resolve([])),
  getTrainingsByEmployeeId: vi.fn(() => Promise.resolve([])),
}));

function createMockContext(): TrpcContext {
  return {
    user: null,
    isSiteAdmin: true,
    siteAdminUsername: null,
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
    });
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
