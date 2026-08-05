import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { PermissionKey } from "@shared/permissions";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Procedure para ações administrativas do site (criar/editar/excluir colaboradores,
 * treinamentos e certificados). Exige uma sessão válida criada via auth.siteLogin,
 * verificada no servidor (cookie assinado com JWT) — substitui a antiga checagem
 * apenas no cliente que permitia bypass direto da API.
 */
export const siteAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.isSiteAdmin) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    return next({ ctx });
  }),
);

/**
 * Exige uma permissão específica. O administrador principal passa sempre;
 * usuários comuns só passam se o administrador tiver liberado aquela ação.
 */
export const requirePermission = (permission: PermissionKey) =>
  t.procedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;

      if (!ctx.isSiteAdmin) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }

      if (ctx.siteRole !== "admin" && !ctx.sitePermissions?.[permission]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Você não tem permissão para esta ação. Fale com o administrador.",
        });
      }

      return next({ ctx });
    }),
  );

/** Somente o administrador principal (gerenciar contas e permissões). */
export const masterAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.isSiteAdmin) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.siteRole !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Apenas o administrador principal pode gerenciar contas.",
      });
    }

    return next({ ctx });
  }),
);
