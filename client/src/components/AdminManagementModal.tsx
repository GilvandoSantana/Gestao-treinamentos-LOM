/**
 * AdminManagementModal
 * Só o administrador principal acessa. Permite cadastrar contas (admin ou
 * usuário comum), definir o que cada usuário pode ver e fazer, e remover
 * contas.
 */

import { useState } from 'react';
import { X, UserPlus, Trash2, ShieldCheck, Loader, User as UserIcon, Settings2, Mail, Send } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  DEFAULT_USER_PERMISSIONS,
  type PermissionKey,
  type Permissions,
} from '@shared/permissions';

interface AdminManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername?: string | null;
}

export default function AdminManagementModal({
  isOpen,
  onClose,
  currentUsername,
}: AdminManagementModalProps) {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPermissions, setNewPermissions] = useState<Permissions>({ ...DEFAULT_USER_PERMISSIONS });
  const [newContract, setNewContract] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Permissions | null>(null);

  const utils = trpc.useUtils();
  const listQuery = trpc.auth.admins.list.useQuery(undefined, { enabled: isOpen });
  // Só contratos ativos entram nas opções de cadastro; um excluído continua
  // existindo nas contas antigas, mas não pode receber gente nova.
  const contractsQuery = trpc.contracts.list.useQuery(undefined, { enabled: isOpen });
  const contractNameBySlug = new Map((contractsQuery.data ?? []).map((c) => [c.slug, c.name]));
  const createMutation = trpc.auth.admins.create.useMutation();
  const deleteMutation = trpc.auth.admins.delete.useMutation();
  const setPermissionsMutation = trpc.auth.admins.setPermissions.useMutation();
  const testEmailMutation = trpc.auth.testEmail.useMutation();

  const handleTestEmail = async () => {
    try {
      const result = await testEmailMutation.mutateAsync();
      if (result.success) toast.success(result.message);
      else toast.error(result.message, { duration: 8000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao testar o envio.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        username: newUsername,
        password: newPassword,
        contract: newContract,
        permissions: newPermissions,
      });
      toast.success('Usuário cadastrado!');
      setNewUsername('');
      setNewContract('');
      setNewPassword('');
      setNewPermissions({ ...DEFAULT_USER_PERMISSIONS });
      await utils.auth.admins.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao cadastrar');
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!window.confirm(`Remover o acesso de "${username}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success('Conta removida.');
      await utils.auth.admins.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover');
    }
  };

  const handleSavePermissions = async (id: string) => {
    if (!draftPermissions) return;
    try {
      await setPermissionsMutation.mutateAsync({ id, permissions: draftPermissions });
      toast.success('Permissões atualizadas.');
      setEditingId(null);
      setDraftPermissions(null);
      await utils.auth.admins.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar permissões');
    }
  };

  const PermissionChecklist = ({
    value,
    onChange,
    disabled,
  }: {
    value: Permissions;
    onChange: (next: Permissions) => void;
    disabled?: boolean;
  }) => (
    <div className="space-y-1.5">
      {PERMISSION_KEYS.map((key: PermissionKey) => (
        <label
          key={key}
          className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
        >
          <input
            type="checkbox"
            checked={value[key]}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            className="mt-0.5 w-4 h-4 accent-orange shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              {PERMISSION_LABELS[key].label}
            </span>
            <span className="block text-xs text-muted-foreground">
              {PERMISSION_LABELS[key].description}
            </span>
          </span>
        </label>
      ))}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5 sticky top-0 bg-card pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-orange" size={22} />
            <h2 className="font-display text-xl font-bold text-foreground">Usuários e permissões</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={24} />
          </button>
        </div>

        {/* Contas existentes */}
        <div className="mb-6 space-y-2">
          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader size={14} className="animate-spin" /> Carregando...
            </p>
          )}
          {listQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
          )}
          {listQuery.data?.map((account) => {
            const isEditing = editingId === account.id;
            return (
              <div key={account.id} className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-muted/40">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserIcon size={17} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {account.username}
                        {account.username === currentUsername && (
                          <span className="ml-2 text-xs text-orange font-normal">(você)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Usuário · {contractNameBySlug.get(account.contract) ?? account.contract}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(
                      <button
                        onClick={() => {
                          setEditingId(isEditing ? null : account.id);
                          setDraftPermissions(isEditing ? null : { ...account.permissions });
                        }}
                        className="p-2 text-muted-foreground hover:text-orange transition-colors"
                        title="Definir permissões"
                      >
                        <Settings2 size={17} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(account.id, account.username)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-danger hover:opacity-70 disabled:opacity-40"
                      title="Remover"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>

                {isEditing && draftPermissions && (
                  <div className="p-3 border-t border-border">
                    <PermissionChecklist value={draftPermissions} onChange={setDraftPermissions} />
                    <button
                      onClick={() => handleSavePermissions(account.id)}
                      disabled={setPermissionsMutation.isPending}
                      className="w-full mt-3 bg-orange text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {setPermissionsMutation.isPending ? 'Salvando...' : 'Salvar permissões'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Diagnóstico do envio de e-mail — só o administrador principal chega
            até aqui, e é ele quem configura o SMTP no Railway. */}
        <div className="mb-5 p-3 rounded-xl border border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Mail size={15} /> Alertas por e-mail
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-2.5">
            Envia uma mensagem de teste para o endereço configurado, para conferir se os alertas de
            treinamentos vencendo vão chegar.
          </p>
          <button
            onClick={handleTestEmail}
            disabled={testEmailMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {testEmailMutation.isPending ? (
              <>
                <Loader size={14} className="animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <Send size={14} /> Enviar e-mail de teste
              </>
            )}
          </button>
        </div>

        {/* Nova conta */}
        <form onSubmit={handleCreate} className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <UserPlus size={16} /> Cadastrar novo usuário
          </p>

          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Usuário (ex: maria)"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
            disabled={createMutation.isPending}
          />
          <div>
            <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Contrato
            </label>
            <select
              value={newContract}
              onChange={(e) => setNewContract(e.target.value)}
              disabled={createMutation.isPending}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
            >
              <option value="" disabled>
                {contractsQuery.isLoading ? 'Carregando...' : 'Selecione um contrato'}
              </option>
              {contractsQuery.data?.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            {contractsQuery.data?.length === 0 && (
              <p className="text-xs text-danger mt-1">
                Nenhum contrato cadastrado ainda — crie um em "Contratos" antes de cadastrar usuários.
              </p>
            )}
          </div>

          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Senha (mín. 8 caracteres)"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
            disabled={createMutation.isPending}
          />

          <div className="border border-border rounded-xl p-2">
            <p className="text-xs font-semibold text-muted-foreground px-2 pt-1 pb-1.5 uppercase tracking-wide font-technical">
              O que esta pessoa pode fazer
            </p>
            <PermissionChecklist value={newPermissions} onChange={setNewPermissions} />
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending || !newUsername || !newPassword || !newContract}
            className="w-full px-4 py-2.5 bg-orange text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold transition"
          >
            {createMutation.isPending ? 'Cadastrando...' : 'Cadastrar usuário'}
          </button>
        </form>

      </div>
    </div>
  );
}
