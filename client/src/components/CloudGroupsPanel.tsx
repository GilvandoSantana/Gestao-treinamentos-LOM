/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudGroupsPanel: gerenciar grupos (setor/cargo/equipe) — só o
 * administrador principal cria/apaga grupo e mexe nos membros.
 */

import { useState } from 'react';
import { Users, Plus, Trash2, ChevronDown, ChevronUp, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export default function CloudGroupsPanel() {
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [newMemberUsername, setNewMemberUsername] = useState('');

  const utils = trpc.useUtils();
  const groupsQuery = trpc.cloud.listGroups.useQuery();
  const membersQuery = trpc.cloud.listGroupMembers.useQuery(
    { groupId: expandedGroupId ?? '' },
    { enabled: !!expandedGroupId }
  );

  const createGroupMutation = trpc.cloud.createGroup.useMutation();
  const deleteGroupMutation = trpc.cloud.deleteGroup.useMutation();
  const addMemberMutation = trpc.cloud.addGroupMember.useMutation();
  const removeMemberMutation = trpc.cloud.removeGroupMember.useMutation();

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroupMutation.mutateAsync({ name: newGroupName.trim() });
      setNewGroupName('');
      await utils.cloud.listGroups.invalidate();
      toast.success('Grupo criado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar grupo.');
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!window.confirm(`Excluir o grupo "${name}"? Compartilhamentos feitos com ele deixam de valer.`)) return;
    try {
      await deleteGroupMutation.mutateAsync({ id });
      if (expandedGroupId === id) setExpandedGroupId(null);
      await utils.cloud.listGroups.invalidate();
      toast.success('Grupo excluído.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir grupo.');
    }
  };

  const handleAddMember = async (groupId: string) => {
    if (!newMemberUsername.trim()) return;
    try {
      await addMemberMutation.mutateAsync({ groupId, username: newMemberUsername.trim() });
      setNewMemberUsername('');
      await Promise.all([utils.cloud.listGroupMembers.invalidate({ groupId }), utils.cloud.listGroups.invalidate()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar.');
    }
  };

  const handleRemoveMember = async (groupId: string, username: string) => {
    try {
      await removeMemberMutation.mutateAsync({ groupId, username });
      await Promise.all([utils.cloud.listGroupMembers.invalidate({ groupId }), utils.cloud.listGroups.invalidate()]);
    } catch (error) {
      toast.error('Erro ao remover.');
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-4">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="Nome do grupo (ex: Segurança, RH)"
          onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
        />
        <button
          onClick={handleCreateGroup}
          disabled={createGroupMutation.isPending || !newGroupName.trim()}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={15} />
          Criar grupo
        </button>
      </div>

      {groupsQuery.data?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum grupo criado ainda. Grupos deixam mais rápido compartilhar com um setor ou equipe
          inteira de uma vez.
        </p>
      )}

      <div className="space-y-2">
        {groupsQuery.data?.map((group) => (
          <div key={group.id} className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between p-3">
              <button
                onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
              >
                <Users size={17} className="text-orange shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{group.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ({group.memberCount} {group.memberCount === 1 ? 'membro' : 'membros'})
                </span>
                {expandedGroupId === group.id ? (
                  <ChevronUp size={15} className="text-muted-foreground shrink-0 ml-auto" />
                ) : (
                  <ChevronDown size={15} className="text-muted-foreground shrink-0 ml-auto" />
                )}
              </button>
              <button
                onClick={() => handleDeleteGroup(group.id, group.name)}
                className="p-1.5 text-muted-foreground hover:text-danger transition-colors shrink-0 ml-2"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {expandedGroupId === group.id && (
              <div className="border-t border-border p-3 bg-muted/20">
                <div className="flex gap-2 mb-3">
                  <input
                    value={newMemberUsername}
                    onChange={(e) => setNewMemberUsername(e.target.value)}
                    placeholder="Nome de usuário"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddMember(group.id)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground"
                  />
                  <button
                    onClick={() => handleAddMember(group.id)}
                    disabled={addMemberMutation.isPending || !newMemberUsername.trim()}
                    className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-navy text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <UserPlus size={13} />
                    Adicionar
                  </button>
                </div>

                {membersQuery.data?.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Nenhum membro ainda.
                  </p>
                )}

                <div className="space-y-1">
                  {membersQuery.data?.map((username) => (
                    <div
                      key={username}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-card text-sm"
                    >
                      <span className="text-foreground">{username}</span>
                      <button
                        onClick={() => handleRemoveMember(group.id, username)}
                        className="text-muted-foreground hover:text-danger"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
