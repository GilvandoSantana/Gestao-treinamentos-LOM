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
    // Contrato da conta (objeto completo, com nome e preposição). Para o
    // administrador principal (que não pertence a nenhum), reflete o que ele
    // escolheu no seletor do cabeçalho; null = "todos os contratos".
    contract: (query.data?.contract as ContractInfo | null) ?? null,
    can,
    refetch: query.refetch,
  };
}
