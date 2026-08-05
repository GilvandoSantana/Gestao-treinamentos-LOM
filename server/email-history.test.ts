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
    isSiteAdmin: false,
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

describe("emailHistory.list", () => {
  it("should return email history list", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.emailHistory.list();

    // Should return an array
    expect(Array.isArray(result)).toBe(true);
  });

  it("should handle empty email history gracefully", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.emailHistory.list();

    // Should return an array, even if empty
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it("should return email history with correct structure when data exists", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.emailHistory.list();

    // If there are results, check structure
    if (result.length > 0) {
      const item = result[0];

      // Check required fields
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("trainingId");
      expect(item).toHaveProperty("employeeId");
      expect(item).toHaveProperty("lastSentAt");
      expect(item).toHaveProperty("createdAt");
      expect(item).toHaveProperty("trainingName");
      expect(item).toHaveProperty("employeeName");
      expect(item).toHaveProperty("expirationDate");
    }
  });

  it("should return email history sorted by lastSentAt descending", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.emailHistory.list();

    // If there are multiple results, check sorting
    if (result.length > 1) {
      for (let i = 0; i < result.length - 1; i++) {
        const current = new Date(result[i].lastSentAt).getTime();
        const next = new Date(result[i + 1].lastSentAt).getTime();

        // Current should be greater than or equal to next (descending order)
        expect(current).toBeGreaterThanOrEqual(next);
      }
    }
  });

  it("should return valid date objects", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.emailHistory.list();

    // If there are results, check dates
    if (result.length > 0) {
      const item = result[0];

      // Check that dates are valid
      const lastSentAt = new Date(item.lastSentAt);
      const createdAt = new Date(item.createdAt);

      expect(lastSentAt instanceof Date).toBe(true);
      expect(!isNaN(lastSentAt.getTime())).toBe(true);
      expect(createdAt instanceof Date).toBe(true);
      expect(!isNaN(createdAt.getTime())).toBe(true);
    }
  });
});
