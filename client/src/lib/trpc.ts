import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import { getSessionMarker } from "@/lib/session-marker";
import { getActiveContract, ACTIVE_CONTRACT_HEADER } from "@/lib/active-contract";

export const trpc = createTRPCReact<AppRouter>();

/**
 * Mesmo cliente usado pelos hooks (trpc.*.useQuery), mas pronto pra chamar
 * de fora de um componente React — usado em lugares como os geradores de
 * PDF (crachá), que não são componentes e não podem usar hooks.
 */
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const headers: Record<string, string> = {};
        const marker = getSessionMarker();
        if (marker) headers["x-session-marker"] = marker;
        const contract = getActiveContract();
        if (contract) headers[ACTIVE_CONTRACT_HEADER] = contract;
        return headers;
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

