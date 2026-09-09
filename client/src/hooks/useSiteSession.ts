import { trpc } from '@/lib/trpc';
import { ALL_PERMISSIONS, type PermissionKey, type Permissions } from '@shared/permissions';
import type { ContractInfo } from '@shared/contracts';

const NO_PERMISSIONS = Object.keys(ALL_PERMISSIONS).reduce(
  (acc, key) => ({ ...acc, [key]: false }),
  {} as Permissions
);

/**
 * Estado da sessão do site: quem está logado, com qual papel e o que pode fazer.
 * As permissões vêm do servidor a cada carregamento, então mudanças feitas pelo
 * administrador valem imediatamente.
 */
export function useSiteSession() {
  const query = trpc.auth.siteSession.useQuery(undefined, {
    // Poucas tentativas: se a verificação falhar, é melhor cair na tela de
    // login do que deixar a pessoa presa num "Carregando..." indefinido.
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const isLoggedIn = query.data?.isSiteAdmin ?? false;
  const role = query.data?.role ?? null;
  const permissions: Permissions = (query.data?.permissions as Permissions) ?? NO_PERMISSIONS;

  const can = (permission: PermissionKey): boolean => {
    if (!isLoggedIn) return false;
    if (role === 'admin') return true;
    return permissions[permission] === true;
  };

  return {
    // Em caso de erro, não fica carregando para sempre — trata como deslogado.
    isLoading: query.isPending && !query.isError,
    isLoggedIn,
    role,
    username: query.data?.username ?? null,
    isMasterAdmin: role === 'admin',
    isGlobalAdmin: query.data?.isGlobalAdmin ?? false,
    // Contrato da conta (objeto completo, com nome e preposição). Para o
    // administrador principal (que não pertence a nenhum), reflete o que ele
    // escolheu no seletor do cabeçalho; null = "todos os contratos".
    contract: (query.data?.contract as ContractInfo | null) ?? null,
    // Organização (empresa dona da conta) — usada pra mostrar o nome
    // certo no cabeçalho, em vez do nome do produto fixo pra todo mundo.
    // Só os campos de marca (nunca os de cobrança, que o servidor também
    // manda mas o cliente não precisa enxergar).
    organization: (query.data?.organization as { id: string; slug: string; name: string } | null) ?? null,
    // Um administrador está "vendo como" este usuário — a sessão real (a
    // salva para voltar) ainda existe, guardada em cookie no servidor.
    isImpersonating: query.data?.isImpersonating ?? false,
    // A conta logada tem 2FA ativa? Usado pra decidir o que mostrar na
    // tela de segurança (botão "ativar" ou "desativar").
    hasTwoFactorEnabled: query.data?.hasTwoFactorEnabled ?? false,
    can,
    refetch: query.refetch,
  };
}

