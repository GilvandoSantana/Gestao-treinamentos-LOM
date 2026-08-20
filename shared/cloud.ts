/**
 * Nuvem de arquivos — tipos compartilhados entre servidor e cliente.
 */

// Tamanhos comuns, em bytes — usado no seletor de limite de armazenamento.
// Mudar o limite é só escolher outro valor aqui, sem mexer em mais nada.
export const STORAGE_SIZE_PRESETS = [
  { label: '10 GB', bytes: 10 * 1024 * 1024 * 1024 },
  { label: '100 GB', bytes: 100 * 1024 * 1024 * 1024 },
  { label: '500 GB', bytes: 500 * 1024 * 1024 * 1024 },
  { label: '1 TB', bytes: 1024 * 1024 * 1024 * 1024 },
  { label: '2 TB', bytes: 2 * 1024 * 1024 * 1024 * 1024 },
  { label: '5 TB', bytes: 5 * 1024 * 1024 * 1024 * 1024 },
] as const;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export const CLOUD_SHARE_PERMISSIONS = ['view', 'download', 'edit'] as const;
export type CloudSharePermission = (typeof CLOUD_SHARE_PERMISSIONS)[number];
export const CLOUD_SHARE_PERMISSION_LABELS: Record<CloudSharePermission, string> = {
  view: 'Visualizar',
  download: 'Baixar',
  edit: 'Editar',
};

export interface CloudFolderInfo {
  id: string;
  contractSlug: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface CloudFileInfo {
  id: string;
  contractSlug: string;
  folderId: string | null;
  name: string;
  fileUrl: string | null;
  r2Key: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CloudShareInfo {
  id: string;
  contractSlug: string;
  fileId: string | null;
  folderId: string | null;
  itemName: string;
  sharedBy: string;
  sharedWith: string | null;
  sharedWithGroupId: string | null;
  sharedWithGroupName: string | null;
  permission: CloudSharePermission;
  expiresAt: string | null;
  createdAt: string;
}

export interface CloudGroupInfo {
  id: string;
  contractSlug: string;
  name: string;
  autoSetor: string | null;
  memberCount: number;
  createdAt: string;
}

export interface CloudGroupMemberInfo {
  username: string;
  source: 'manual' | 'auto';
}
