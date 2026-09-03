/**
 * "Comando Rápido" — reconhece pedidos comuns escritos em português
 * (tipo "crachá do João Silva") e já aponta a ação e a pessoa certa.
 *
 * IMPORTANTE: isto NÃO é inteligência artificial. É busca de texto e
 * palavras-chave, comum e determinístico — sem nenhuma chamada de rede,
 * sem custo nenhum. Só entende os comandos específicos listados aqui
 * embaixo; qualquer outra coisa cai no aviso de "não entendi".
 */

export type QuickCommandAction = 'badge' | 'view' | 'edit' | 'certificates';

export interface ParsedCommand {
  action: QuickCommandAction;
  actionLabel: string;
  query: string;
}

interface ActionDefinition {
  keywords: string[];
  action: QuickCommandAction;
  label: string;
}

const ACTIONS: ActionDefinition[] = [
  {
    keywords: ['imprimir cracha', 'gerar cracha', 'cracha', 'crachas'],
    action: 'badge',
    label: 'Gerar crachá',
  },
  {
    keywords: ['abrir ficha', 'ver ficha', 'ficha', 'abrir', 'ver'],
    action: 'view',
    label: 'Abrir ficha',
  },
  {
    keywords: ['editar cadastro', 'editar', 'edite'],
    action: 'edit',
    label: 'Editar cadastro',
  },
  {
    keywords: ['certificados de', 'certificado de', 'certificados', 'certificado'],
    action: 'certificates',
    label: 'Ver certificados',
  },
];

/** Remove acento e caixa, pra "João" bater com "joao". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Tenta reconhecer uma ação + a quem ela se refere a partir do texto
 * digitado. Aceita tanto "crachá do João" quanto "João crachá" (a
 * palavra-chave pode vir antes ou depois do nome).
 */
export function parseCommand(input: string): ParsedCommand | null {
  const normalized = normalize(input);
  if (!normalized) return null;

  // Palavras-chave mais longas primeiro, pra "imprimir cracha" bater
  // antes de só "cracha" quando as duas aparecerem na mesma frase.
  const allKeywords = ACTIONS.flatMap((entry) =>
    entry.keywords.map((kw) => ({ kw: normalize(kw), action: entry.action, label: entry.label }))
  ).sort((a, b) => b.kw.length - a.kw.length);

  for (const { kw, action, label } of allKeywords) {
    if (normalized === kw) {
      return { action, actionLabel: label, query: '' };
    }
    if (normalized.startsWith(`${kw} `)) {
      return { action, actionLabel: label, query: stripConnectors(normalized.slice(kw.length).trim()) };
    }
    if (normalized.endsWith(` ${kw}`)) {
      return { action, actionLabel: label, query: stripConnectors(normalized.slice(0, normalized.length - kw.length).trim()) };
    }
  }

  return null;
}

/** Tira "do", "da", "de" soltos no início do nome (ex: "cracha do joao" → "joao"). */
function stripConnectors(text: string): string {
  return text.replace(/^(do|da|de)\s+/, '').trim();
}

/**
 * Busca colaboradores cujo nome combina com a consulta — por nome
 * completo, começo do nome, ou palavras dentro do nome (pra "joao silva"
 * encontrar "João Carlos Silva"). Devolve do mais provável pro menos.
 */
export function findMatchingEmployees<T extends { name: string }>(
  employees: T[],
  query: string,
  limit = 5
): T[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const queryWords = normalizedQuery.split(' ').filter(Boolean);

  const scored = employees
    .map((employee) => {
      const normalizedName = normalize(employee.name);
      let score = 0;

      if (normalizedName === normalizedQuery) {
        score = 100;
      } else if (normalizedName.startsWith(normalizedQuery)) {
        score = 80;
      } else if (normalizedName.includes(normalizedQuery)) {
        score = 60;
      } else {
        const nameWords = normalizedName.split(' ');
        const matchedWords = queryWords.filter((qw) => nameWords.some((nw) => nw.startsWith(qw)));
        if (matchedWords.length === queryWords.length) {
          score = 40;
        }
      }

      return { employee, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.employee);
}

/** Texto de ajuda mostrado quando nada é reconhecido. */
export const QUICK_COMMAND_HELP = [
  'crachá do [nome]',
  'ficha do [nome]',
  'editar [nome]',
  'certificados de [nome]',
];
