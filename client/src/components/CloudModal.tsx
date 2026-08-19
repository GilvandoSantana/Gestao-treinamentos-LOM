/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudModal: central da Nuvem — meus arquivos, compartilhados, recentes,
 * favoritos e lixeira. Armazenamento real no Cloudflare R2.
 *
 * Tela quase em tela cheia (mesmo padrão do Almoxarifado) — é um programa
 * completo, não cabe numa caixinha pequena.
 */

import { useState } from 'react';
import {
  X,
  Cloud,
  Home,
  Users,
  Share2,
  Clock,
  Star,
  Trash2,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatBytes } from '@shared/cloud';
import CloudBrowser from '@/components/CloudBrowser';
import CloudFlatList from '@/components/CloudFlatList';
import CloudGroupsPanel from '@/components/CloudGroupsPanel';

interface CloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
  isMasterAdmin?: boolean;
}

type Tab = 'files' | 'sharedWithMe' | 'sharedByMe' | 'recent' | 'favorites' | 'trash' | 'groups';

const TABS: { key: Tab; label: string; Icon: typeof Home }[] = [
  { key: 'files', label: 'Meus arquivos', Icon: Home },
  { key: 'sharedWithMe', label: 'Compartilhados comigo', Icon: Users },
  { key: 'sharedByMe', label: 'Compartilhados por mim', Icon: Share2 },
  { key: 'recent', label: 'Recentes', Icon: Clock },
  { key: 'favorites', label: 'Favoritos', Icon: Star },
  { key: 'trash', label: 'Lixeira', Icon: Trash2 },
];

const ADMIN_TABS: { key: Tab; label: string; Icon: typeof Home }[] = [
  { key: 'groups', label: 'Grupos', Icon: Building2 },
];

export default function CloudModal({ isOpen, onClose, canManage, isMasterAdmin }: CloudModalProps) {
  const [tab, setTab] = useState<Tab>('files');
  const visibleTabs = isMasterAdmin ? [...TABS, ...ADMIN_TABS] : TABS;
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const storageQuery = trpc.cloud.storageInfo.useQuery(undefined, { enabled: isOpen });
  const sharedWithMeQuery = trpc.cloud.listSharedWithMe.useQuery(undefined, { enabled: isOpen && tab === 'sharedWithMe' });
  const sharedByMeQuery = trpc.cloud.listSharedByMe.useQuery(undefined, { enabled: isOpen && tab === 'sharedByMe' });
  const recentQuery = trpc.cloud.listRecent.useQuery(undefined, { enabled: isOpen && tab === 'recent' });
  const favoritesQuery = trpc.cloud.listFavorites.useQuery(undefined, { enabled: isOpen && tab === 'favorites' });
  const trashQuery = trpc.cloud.listTrash.useQuery(undefined, { enabled: isOpen && tab === 'trash' });

  const getDownloadUrlMutation = trpc.cloud.getDownloadUrl.useMutation();
  const revokeShareMutation = trpc.cloud.revokeShare.useMutation();
  const restoreFileMutation = trpc.cloud.restoreFile.useMutation();
  const restoreFolderMutation = trpc.cloud.restoreFolder.useMutation();
  const permanentDeleteFileMutation = trpc.cloud.permanentlyDeleteFile.useMutation();
  const permanentDeleteFolderMutation = trpc.cloud.permanentlyDeleteFolder.useMutation();

  const handleDownload = async (id: string) => {
    try {
      const { url } = await getDownloadUrlMutation.mutateAsync({ id });
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar o download.');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Remover este compartilhamento?')) return;
    try {
      await revokeShareMutation.mutateAsync({ id });
      toast.success('Compartilhamento removido.');
      await utils.cloud.listSharedByMe.invalidate();
    } catch {
      toast.error('Erro ao remover compartilhamento.');
    }
  };

  const refreshTrash = () =>
    Promise.all([
      utils.cloud.listTrash.invalidate(),
      utils.cloud.list.invalidate(),
      utils.cloud.storageInfo.invalidate(),
    ]);

  const handleRestoreFile = async (id: string) => {
    try {
      await restoreFileMutation.mutateAsync({ id });
      toast.success('Arquivo restaurado.');
      await refreshTrash();
    } catch {
      toast.error('Erro ao restaurar.');
    }
  };

  const handleRestoreFolder = async (id: string) => {
    try {
      await restoreFolderMutation.mutateAsync({ id });
      toast.success('Pasta restaurada.');
      await refreshTrash();
    } catch {
      toast.error('Erro ao restaurar.');
    }
  };

  const handlePermanentDeleteFile = async (id: string) => {
    if (!window.confirm('Excluir definitivamente? Não é possível desfazer.')) return;
    try {
      await permanentDeleteFileMutation.mutateAsync({ id });
      toast.success('Excluído definitivamente.');
      await refreshTrash();
    } catch {
      toast.error('Erro ao excluir.');
    }
  };

  const handlePermanentDeleteFolder = async (id: string) => {
    if (!window.confirm('Excluir a pasta e tudo dentro dela definitivamente? Não é possível desfazer.')) return;
    try {
      await permanentDeleteFolderMutation.mutateAsync({ id });
      toast.success('Excluído definitivamente.');
      await refreshTrash();
    } catch {
      toast.error('Erro ao excluir.');
    }
  };

  if (!isOpen) return null;

  const storage = storageQuery.data;
  const storagePct = storage && storage.limitBytes > 0 ? Math.min(100, (storage.usedBytes / storage.limitBytes) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full h-full sm:h-[94vh] max-w-6xl flex flex-col sm:flex-row overflow-hidden">
        {/* Cabeçalho — só no celular */}
        <div className="sm:hidden flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="text-orange shrink-0" size={19} />
            <h2 className="font-display text-base font-bold text-foreground truncate">Nuvem</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={22} />
          </button>
        </div>

        {/* Barra lateral */}
        <div className="flex flex-col sm:w-60 shrink-0 bg-navy sm:bg-navy/95 text-white">
          <div className="hidden sm:flex items-center gap-2.5 p-5 border-b border-white/10">
            <Cloud className="text-orange shrink-0" size={22} />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold leading-tight">Nuvem</h2>
              <p className="text-[11px] text-white/60">Arquivos do contrato</p>
            </div>
          </div>

          <div className="flex sm:flex-col flex-1 p-2 gap-1 overflow-x-auto">
            {visibleTabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                  tab === key ? 'bg-orange text-white' : 'text-white/70 hover:bg-white/10'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          {/* Espaço usado */}
          {storage && (
            <div className="p-4 border-t border-white/10 hidden sm:block">
              <p className="text-[11px] text-white/60 mb-1.5">
                {formatBytes(storage.usedBytes)} de {formatBytes(storage.limitBytes)}
              </p>
              <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className={`h-full transition-all ${storagePct > 90 ? 'bg-danger' : 'bg-orange'}`}
                  style={{ width: `${storagePct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="hidden sm:flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h3 className="font-display text-lg font-bold text-foreground">
              {visibleTabs.find((t) => t.key === tab)?.label}
            </h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={23} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {tab === 'files' && (
              <CloudBrowser canManage={canManage} currentFolderId={currentFolderId} onNavigate={setCurrentFolderId} isMasterAdmin={isMasterAdmin} />
            )}

            {tab === 'sharedWithMe' && (
              <CloudFlatList
                isLoading={sharedWithMeQuery.isLoading}
                emptyMessage="Ninguém compartilhou nada com você ainda."
                items={(sharedWithMeQuery.data ?? [])
                  .filter((s) => s.fileId)
                  .map((s) => ({ id: s.fileId!, name: s.itemName, subtitle: `de ${s.sharedBy}` }))}
                onDownload={handleDownload}
              />
            )}

            {tab === 'sharedByMe' && (
              <CloudFlatList
                isLoading={sharedByMeQuery.isLoading}
                emptyMessage="Você ainda não compartilhou nada."
                items={(sharedByMeQuery.data ?? []).map((s) => ({
                  id: s.id,
                  name: s.itemName,
                  subtitle: `com ${s.sharedWith}`,
                }))}
                onRevoke={handleRevoke}
              />
            )}

            {tab === 'recent' && (
              <CloudFlatList
                isLoading={recentQuery.isLoading}
                emptyMessage="Nenhum arquivo recente."
                items={(recentQuery.data ?? []).map((f) => ({ id: f.id, name: f.name, size: f.fileSize }))}
                onDownload={handleDownload}
              />
            )}

            {tab === 'favorites' && (
              <CloudFlatList
                isLoading={favoritesQuery.isLoading}
                emptyMessage="Nenhum favorito ainda."
                items={(favoritesQuery.data ?? []).map((f) => ({
                  id: f.fileId ?? f.folderId!,
                  name: f.name,
                  isFolder: f.isFolder,
                  size: f.size,
                }))}
                onDownload={handleDownload}
              />
            )}

            {tab === 'trash' && (
              <CloudFlatList
                isLoading={trashQuery.isLoading}
                emptyMessage="A lixeira está vazia."
                items={[
                  ...(trashQuery.data?.folders ?? []).map((f) => ({ id: f.id, name: f.name, isFolder: true })),
                  ...(trashQuery.data?.files ?? []).map((f) => ({ id: f.id, name: f.name, size: f.fileSize })),
                ]}
                onRestore={(id) => {
                  const isFolder = trashQuery.data?.folders.some((f) => f.id === id);
                  return isFolder ? handleRestoreFolder(id) : handleRestoreFile(id);
                }}
                onPermanentDelete={(id) => {
                  const isFolder = trashQuery.data?.folders.some((f) => f.id === id);
                  return isFolder ? handlePermanentDeleteFolder(id) : handlePermanentDeleteFile(id);
                }}
              />
            )}

            {tab === 'groups' && <CloudGroupsPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
