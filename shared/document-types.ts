/**
 * Tipos de documento aceitos na central de Documentos.
 * Ordem alfabética — é a mesma ordem usada nas abas da interface.
 */

export const DOCUMENT_TYPES = ['ara', 'checklist', 'fds', 'ltcat', 'pgr', 'pos'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_LABELS: Record<DocumentType, { label: string; description: string }> = {
  ara: {
    label: 'ARA',
    description: 'Análise de Risco da Atividade por função',
  },
  checklist: {
    label: 'Checklist',
    description: 'Listas de verificação por função',
  },
  fds: {
    label: 'FDS',
    description: 'Fichas de Dados de Segurança por função',
  },
  ltcat: {
    label: 'LTCAT',
    description: 'Laudo Técnico das Condições Ambientais do Trabalho',
  },
  pgr: {
    label: 'PGR',
    description: 'Programa de Gerenciamento de Riscos',
  },
  pos: {
    label: 'POS',
    description: 'Procedimentos Operacionais de Segurança por função',
  },
};

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}
