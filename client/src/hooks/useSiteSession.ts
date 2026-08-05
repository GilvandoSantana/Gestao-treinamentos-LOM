import { trpc } from '@/lib/trpc';
import { ALL_PERMISSIONS, type PermissionKey, type Permissions } from '@shared/permissions';

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
  const query = trpc.auth.siteSession.useQuery();

  const isLoggedIn = query.data?.isSiteAdmin ?? false;
  const role = query.data?.role ?? null;
  const permissions: Permissions = (query.data?.permissions as Permissions) ?? NO_PERMISSIONS;

  const can = (permission: PermissionKey): boolean => {
    if (!isLoggedIn) return false;
    if (role === 'admin') return true;
    return permissions[permission] === true;
  };

  return {
    isLoading: query.isLoading,
    isLoggedIn,
    role,
    username: query.data?.username ?? null,
    isMasterAdmin: role === 'admin',
    can,
    refetch: query.refetch,
  };
}
