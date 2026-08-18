/**
 * Papéis e permissões do site.
 *
 * - "admin": administrador principal. Sempre tem todas as permissões e é o
 *   único que pode gerenciar contas e permissões de outras pessoas.
 * - "user": usuário comum. Só pode o que o administrador liberar.
 */

export type SiteRole = 'admin' | 'user';

export const PERMISSION_KEYS = [
  'viewEmployees',
  'viewCertificates',
  'editEmployees',
  'deleteEmployees',
  'manageCertificates',
  'importExport',
  'viewAudit',
  'viewCloud',
  'manageCloud',
  'viewInvoices',
  'manageInvoices',
  'viewWarehouse',
  'manageWarehouse',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type Permissions = Record<PermissionKey, boolean>;

/** Rótulos em português para a tela de gerenciamento. */
export const PERMISSION_LABELS: Record<PermissionKey, { label: string; description: string }> = {
  viewEmployees: {
    label: 'Ver colaboradores',
    description: 'Acessar a lista de colaboradores e seus treinamentos',
  },
  viewCertificates: {
    label: 'Ver certificados',
    description: 'Abrir e baixar os certificados anexados',
  },
  editEmployees: {
    label: 'Cadastrar e editar',
    description: 'Criar novos colaboradores e alterar dados existentes',
  },
  deleteEmployees: {
    label: 'Excluir colaboradores',
    description: 'Remover colaboradores e seus treinamentos',
  },
  manageCertificates: {
    label: 'Gerenciar certificados',
    description: 'Anexar e excluir arquivos de certificado',
  },
  importExport: {
    label: 'Importar e exportar',
    description: 'Importar planilhas e gerar relatórios em PDF/Excel',
  },
  viewAudit: {
    label: 'Ver histórico',
    description: 'Consultar o histórico de alterações e de e-mails enviados',
  },
  viewCloud: {
    label: 'Ver nuvem de arquivos',
    description: 'Acessar pastas e baixar arquivos guardados na nuvem do contrato',
  },
  manageCloud: {
    label: 'Gerenciar nuvem de arquivos',
    description: 'Criar pastas, enviar e excluir arquivos na nuvem do contrato',
  },
  viewInvoices: {
    label: 'Ver notas fiscais',
    description: 'Consultar as notas fiscais e recibos do contrato',
  },
  manageInvoices: {
    label: 'Gerenciar notas fiscais',
    description: 'Cadastrar, editar e excluir notas fiscais e recibos',
  },
  viewWarehouse: {
    label: 'Ver almoxarifado',
    description: 'Consultar itens em estoque e movimentações do contrato',
  },
  manageWarehouse: {
    label: 'Gerenciar almoxarifado',
    description: 'Cadastrar, editar itens e registrar entradas/saídas de estoque',
  },
};

/** Permissões de um usuário recém-criado: só leitura. */
export const DEFAULT_USER_PERMISSIONS: Permissions = {
  viewEmployees: true,
  viewCertificates: true,
  editEmployees: false,
  deleteEmployees: false,
  manageCertificates: false,
  importExport: false,
  viewAudit: false,
  viewCloud: false,
  manageCloud: false,
  viewInvoices: false,
  manageInvoices: false,
  viewWarehouse: false,
  manageWarehouse: false,
};

/** O administrador principal sempre tem tudo liberado. */
export const ALL_PERMISSIONS: Permissions = PERMISSION_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: true }),
  {} as Permissions
);

/**
 * Normaliza o que veio do banco (JSON possivelmente antigo/incompleto) para um
 * objeto de permissões completo, sem chaves faltando.
 */
export function normalizePermissions(raw: unknown, role: SiteRole): Permissions {
  if (role === 'admin') return { ...ALL_PERMISSIONS };

  const parsed =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        })()
      : raw ?? {};

  const source = (parsed ?? {}) as Partial<Record<PermissionKey, unknown>>;
  return PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = source[key] === true;
    return acc;
  }, {} as Permissions);
}
