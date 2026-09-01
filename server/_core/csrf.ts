import type { Request, Response, NextFunction } from "express";

/**
 * Proteção CSRF explícita para as rotas de mutação da API tRPC.
 *
 * O cookie de sessão usa `sameSite: "none"` (necessário para o app
 * funcionar embedado/entre origens em alguns contextos), o que por si só
 * NÃO impede um site malicioso de disparar uma requisição que carrega o
 * cookie automaticamente. A defesa que já existia (ausência de CORS
 * liberado, fazendo o navegador bloquear a leitura da resposta em
 * requisições `fetch` de outra origem) é um efeito colateral da
 * arquitetura, não uma decisão deliberada — se um dia alguém liberar CORS
 * pra outro domínio, essa proteção acidental desaparece sem aviso.
 *
 * Este middleware confere, em toda mutação (POST/PUT/PATCH/DELETE), que o
 * cabeçalho `Origin` (ou `Referer`, como reserva) bate com o host de
 * verdade da requisição — do jeito que um navegador de verdade preenche
 * sozinho e não dá pra falsificar via JavaScript de outra página. GET/HEAD
 * não são checados: no tRPC eles só servem pra consultas (query), que não
 * alteram nada.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  const expectedHost = req.hostname;
  if (!expectedHost) {
    // Sem host pra comparar (não deveria acontecer atrás do Railway) —
    // deixa passar em vez de derrubar a aplicação inteira por engano.
    next();
    return;
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const sourceHost = extractHost(origin) ?? extractHost(referer);

  if (sourceHost === null) {
    // Nem Origin nem Referer vieram — a maioria dos navegadores manda pelo
    // menos um em requisições de mutação (POST) feitas via fetch/XHR.
    // Sem nenhum dos dois, não dá pra confirmar a origem — recusa.
    res.status(403).json({ error: "Requisição recusada: origem não identificada." });
    return;
  }

  if (sourceHost !== expectedHost) {
    res.status(403).json({ error: "Requisição recusada: origem não confere." });
    return;
  }

  next();
}

function extractHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
