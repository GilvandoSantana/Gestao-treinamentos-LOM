/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudShareDialog: compartilhar um arquivo com uma pessoa ou com um grupo
 * (setor/cargo/equipe) inteiro de uma vez.
 */

import { useState } from 'react';
import { X, Share2, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { CLOUD_SHARE_PERMISSIONS, CLOUD_SHARE_PERMISSION_LABELS, type CloudSharePermission } from '@shared/cloud';

interface CloudShareDialogProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

type ShareMode = 'person' | 'group';

export default function CloudShareDialog({ fileId, fileName, onClose }: CloudShareDialogProps) {
  const [mode, setMode] = useState<ShareMode>('person');
  const [username, setUsername] = useState('');
  const [groupId, setGroupId] = useState('');
  const [permission, setPermission] = useState<CloudSharePermission>('view');

  const utils = trpc.useUtils();
  const groupsQuery = trpc.cloud.listGroups.useQuery(undefined, { enabled: mode === 'group' });
  const shareMutation = trpc.cloud.shareFile.useMutation();

  const handleShare = async () => {
    if (mode === 'person' && !username.trim()) {
      toast.error('Informe o nome de usuário de quem vai receber.');
      return;
    }
    if (mode === 'group' && !groupId) {
      toast.error('Escolha um grupo.');
      return;
    }
    try {
      await shareMutation.mutateAsync({
        fileId,
        sharedWith: mode === 'person' ? username.trim() : undefined,
        groupId: mode === 'group' ? groupId : undefined,
        permission,
      });
      const target = mode === 'person' ? username.trim() : groupsQuery.data?.find((g) => g.id === groupId)?.name;
      toast.success(`Compartilhado com ${target}.`);
      await utils.cloud.listSharedByMe.invalidate();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao compartilhar.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="flex items-center gap-2 font-display text-base font-bold text-foreground">
            <Share2 size={18} className="text-orange" />
            Compartilhar
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-muted-foreground truncate mb-4">{fileName}</p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('person')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition ${
              mode === 'person' ? 'bg-navy text-white border-navy' : 'bg-card text-muted-foreground border-border'
            }`}
          >
            <User size={14} />
            Pessoa
          </button>
          <button
            onClick={() => setMode('group')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition ${
              mode === 'group' ? 'bg-navy text-white border-navy' : 'bg-card text-muted-foreground border-border'
            }`}
          >
            <Users size={14} />
            Grupo
          </button>
        </div>

        {mode === 'person' ? (
          <>
            <label className="block text-xs font-semibold text-foreground mb-1">Nome de usuário</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="usuario.exemplo"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground mb-3 focus:outline-none focus:ring-2 focus:ring-orange"
            />
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold text-foreground mb-1">Grupo</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground mb-3"
            >
              <option value="">Selecione um grupo</option>
              {groupsQuery.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.memberCount} {g.memberCount === 1 ? 'membro' : 'membros'})
                </option>
              ))}
            </select>
            {groupsQuery.data?.length === 0 && (
              <p className="text-xs text-muted-foreground mb-3">
                Nenhum grupo criado ainda — peça ao administrador pra criar um em "Grupos", no menu
                da Nuvem.
              </p>
            )}
          </>
        )}

        <label className="block text-xs font-semibold text-foreground mb-1">Permissão</label>
        <select
          value={permission}
          onChange={(e) => setPermission(e.target.value as CloudSharePermission)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground mb-4"
        >
          {CLOUD_SHARE_PERMISSIONS.map((p) => (
            <option key={p} value={p}>
              {CLOUD_SHARE_PERMISSION_LABELS[p]}
            </option>
          ))}
        </select>

        <button
          onClick={handleShare}
          disabled={shareMutation.isPending}
          className="w-full bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {shareMutation.isPending ? 'Compartilhando...' : 'Compartilhar'}
        </button>
      </div>
    </div>
  );
}
