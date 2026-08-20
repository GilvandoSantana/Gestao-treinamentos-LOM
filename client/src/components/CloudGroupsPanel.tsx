/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudGroupsPanel: gerenciar grupos (setor/cargo/equipe) — só o
 * administrador principal cria/apaga grupo e mexe nos membros.
 *
 * Um grupo pode ter um "setor automático": todo mundo cujo setor (definido
 * na conta do usuário) bater com esse valor entra sozinho, sem precisar
 * adicionar um por um. Ainda dá pra adicionar gente manualmente também,
 * combinando os dois — útil pra incluir alguém de fora do setor.
 */

import { useState } from 'react';
import { Users, Plus, Trash2, ChevronDown, ChevronUp, UserPlus, X, Zap, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export default function CloudGroupsPanel() {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAutoSetor, setNewGroupAutoSetor] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [editingSetorId, setEditingSetorId] = useState<string | null>(null);
  const [setorDraft, setSetorDraft] = useState('');

  const utils = trpc.useUtils();
  const groupsQuery = trpc.cloud.listGroups.useQuery();
  const setoresQuery = trpc.cloud.listSetores.useQuery();
  const membersQuery = trpc.cloud.listGroupMembers.useQuery(
    { groupId: expandedGroupId ?? '' },
    { enabled: !!expandedGroupId }
  );

  const createGroupMutation = trpc.cloud.createGroup.useMutation();
  const deleteGroupMutation = trpc.cloud.deleteGroup.useMutation();
  const updateAutoSetorMutation = trpc.cloud.updateGroupAutoSetor.useMutation();
  const addMemberMutation = trpc.cloud.addGroupMember.useMutation();
  const removeMemberMutation = trpc.cloud.removeGroupMember.useMutation();

  const refreshGroup = (groupId: string) =>
    Promise.all([utils.cloud.listGroupMembers.invalidate({ groupId }), utils.cloud.listGroups.invalidate()]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroupMutation.mutateAsync({
        name: newGroupName.trim(),
        autoSetor: newGroupAutoSetor.trim() || null,
      });
      setNewGroupName('');
      setNewGroupAutoSetor('');
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

  const startEditSetor = (groupId: string, currentValue: string | null) => {
    setEditingSetorId(groupId);
    setSetorDraft(currentValue ?? '');
  };

  const handleSaveSetor = async (groupId: string) => {
    try {
      await updateAutoSetorMutation.mutateAsync({ id: groupId, autoSetor: setorDraft.trim() || null });
      setEditingSetorId(null);
      await refreshGroup(groupId);
      toast.success('Setor automático atualizado.');
    } catch (error) {
      toast.error('Erro ao salvar.');
    }
  };

  const handleAddMember = async (groupId: string) => {
    if (!newMemberUsername.trim()) return;
    try {
      await addMemberMutation.mutateAsync({ groupId, username: newMemberUsername.trim() });
      setNewMemberUsername('');
      await refreshGroup(groupId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar.');
    }
  };

  const handleRemoveMember = async (groupId: string, username: string) => {
    try {
      await removeMemberMutation.mutateAsync({ groupId, username });
      await refreshGroup(groupId);
    } catch (error) {
      toast.error('Erro ao remover.');
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="p-3 rounded-xl border border-border bg-muted/20 mb-4 space-y-2">
        <div className="flex gap-2">
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
            Criar
          </button>
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
            <Zap size={12} />
            Setor automático (opcional) — todo mundo desse setor entra sozinho
          </label>
          <input
            value={newGroupAutoSetor}
            onChange={(e) => setNewGroupAutoSetor(e.target.value)}
            placeholder="Ex: RH, Segurança, Manutenção..."
            list="setores-existentes"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
          />
          <datalist id="setores-existentes">
            {setoresQuery.data?.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
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
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{group.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({group.memberCount} {group.memberCount === 1 ? 'membro' : 'membros'})
                    </span>
                  </div>
                  {group.autoSetor && (
                    <span className="flex items-center gap-1 text-[11px] text-teal">
                      <Zap size={10} />
                      Automático: {group.autoSetor}
                    </span>
                  )}
                </div>
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
              <div className="border-t border-border p-3 bg-muted/20 space-y-3">
                {/* Setor automático */}
                <div>
                  {editingSetorId === group.id ? (
                    <div className="flex gap-1.5">
                      <input
                        value={setorDraft}
                        onChange={(e) => setSetorDraft(e.target.value)}
                        placeholder="Ex: RH, Segurança..."
                        list="setores-existentes"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveSetor(group.id)}
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                      />
                      <button
                        onClick={() => handleSaveSetor(group.id)}
                        className="text-xs font-semibold text-orange px-2"
                      >
                        Salvar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditSetor(group.id, group.autoSetor)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-orange transition-colors"
                    >
                      <Building2 size={12} />
                      {group.autoSetor ? `Setor automático: ${group.autoSetor} (editar)` : 'Definir setor automático'}
                    </button>
                  )}
                </div>

                {/* Adicionar membro manual */}
                <div className="flex gap-2">
                  <input
                    value={newMemberUsername}
                    onChange={(e) => setNewMemberUsername(e.target.value)}
                    placeholder="Adicionar pessoa por nome de usuário"
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
                  <p className="text-xs text-muted-foreground text-center py-3">Nenhum membro ainda.</p>
                )}

                <div className="space-y-1">
                  {membersQuery.data?.map((member) => (
                    <div
                      key={member.username}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-card text-sm"
                    >
                      <span className="flex items-center gap-1.5 text-foreground">
                        {member.username}
                        {member.source === 'auto' && (
                          <span
                            title="Entrou automaticamente pelo setor"
                            className="flex items-center gap-0.5 text-[10px] text-teal bg-teal/10 px-1.5 py-0.5 rounded-full"
                          >
                            <Zap size={9} />
                            auto
                          </span>
                        )}
                      </span>
                      {member.source === 'manual' && (
                        <button
                          onClick={() => handleRemoveMember(group.id, member.username)}
                          className="text-muted-foreground hover:text-danger"
                        >
                          <X size={14} />
                        </button>
                      )}
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
