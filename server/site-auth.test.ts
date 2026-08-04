import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { SITE_SESSION_COOKIE, verifySiteSessionToken } from "./site-auth";

type CookieCall = { name: string; value?: string; options: Record<string, unknown> };

function createMockContext(overrides: Partial<TrpcContext> = {}) {
  const setCookies: CookieCall[] = [];
  const clearedCookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    isSiteAdmin: false,
    req: {
      protocol: "https",
      headers: {},
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
    ...overrides,
  };

  return { ctx, setCookies, clearedCookies };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.APP_PASSWORD = "senha-correta";
  process.env.SESSION_SECRET = "um-segredo-de-teste-bem-longo-123456";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("auth.siteLogin", () => {
  it("rejeita senha incorreta e não define cookie de sessão", async () => {
    const { ctx, setCookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.siteLogin({ password: "senha-errada" })
    ).rejects.toThrow();

    expect(setCookies).toHaveLength(0);
  });

  it("aceita a senha correta e define um cookie de sessão válido", async () => {
    const { ctx, setCookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.siteLogin({ password: "senha-correta" });

    expect(result).toEqual({ success: true });
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe(SITE_SESSION_COOKIE);

    const isValid = await verifySiteSessionToken(setCookies[0]!.value as string);
    expect(isValid).toBe(true);
  });

  it("bloqueia novas tentativas após exceder o limite de tentativas erradas", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    for (let i = 0; i < 5; i++) {
      await expect(
        caller.auth.siteLogin({ password: "senha-errada" })
      ).rejects.toThrow();
    }

    // A 6ª tentativa deve ser bloqueada pelo rate limit mesmo com a senha certa
    await expect(
      caller.auth.siteLogin({ password: "senha-correta" })
    ).rejects.toThrow(/Muitas tentativas/);
  });

  it("não bloqueia um IP diferente após tentativas erradas de outro", async () => {
    const attacker = createMockContext();
    const attackerCaller = appRouter.createCaller(attacker.ctx);
    for (let i = 0; i < 5; i++) {
      await expect(
        attackerCaller.auth.siteLogin({ password: "senha-errada" })
      ).rejects.toThrow();
    }

    const { ctx: otherCtx, setCookies } = createMockContext({
      req: {
        protocol: "https",
        headers: {},
        ip: "198.51.100.20",
        socket: { remoteAddress: "198.51.100.20" },
      } as unknown as TrpcContext["req"],
    });
    const otherCaller = appRouter.createCaller(otherCtx);

    const result = await otherCaller.auth.siteLogin({ password: "senha-correta" });
    expect(result).toEqual({ success: true });
    expect(setCookies).toHaveLength(1);
  });
});

describe("auth.siteLogout", () => {
  it("limpa o cookie de sessão do site", async () => {
    const { ctx, clearedCookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.siteLogout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(SITE_SESSION_COOKIE);
  });
});

describe("auth.siteSession", () => {
  it("reflete isSiteAdmin do contexto", async () => {
    const { ctx } = createMockContext({ isSiteAdmin: true });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.siteSession();
    expect(result).toEqual({ isSiteAdmin: true });
  });
});

describe("siteAdminProcedure", () => {
  it("rejeita mutações administrativas sem sessão válida", async () => {
    const { ctx } = createMockContext({ isSiteAdmin: false });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.employees.delete({ id: "any-id" })).rejects.toThrow();
  });
});
