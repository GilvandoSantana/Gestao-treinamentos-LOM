/**
 * AdminManagementModal Component
 * Permite que administradores autenticados cadastrem e removam outras
 * contas de admin nomeadas (substitui gradualmente a senha única).
 */

import { useState } from 'react';
import { X, UserPlus, Trash2, ShieldCheck, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

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

  const utils = trpc.useUtils();
  const listQuery = trpc.auth.admins.list.useQuery(undefined, { enabled: isOpen });
  const createMutation = trpc.auth.admins.create.useMutation();
  const deleteMutation = trpc.auth.admins.delete.useMutation();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({ username: newUsername, password: newPassword });
      toast.success('Admin cadastrado com sucesso!');
      setNewUsername('');
      setNewPassword('');
      await utils.auth.admins.list.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao cadastrar admin';
      toast.error(message);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!window.confirm(`Remover o acesso de "${username}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success('Admin removido.');
      await utils.auth.admins.list.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao remover admin';
      toast.error(message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-orange-600" size={22} />
            <h2 className="text-xl font-bold text-gray-900">Gerenciar Admins</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        {/* Lista de admins existentes */}
        <div className="mb-6 max-h-56 overflow-y-auto space-y-2">
          {listQuery.isLoading && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader size={14} className="animate-spin" /> Carregando...
            </p>
          )}
          {listQuery.data?.length === 0 && (
            <p className="text-sm text-gray-500">Nenhum admin nomeado cadastrado ainda.</p>
          )}
          {listQuery.data?.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {admin.username}
                  {admin.username === currentUsername && (
                    <span className="ml-2 text-xs text-orange-600 font-normal">(você)</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleDelete(admin.id, admin.username)}
                disabled={deleteMutation.isPending}
                className="text-red-500 hover:text-red-700 disabled:opacity-50"
                title="Remover"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        {/* Formulário de novo admin */}
        <form onSubmit={handleCreate} className="space-y-3 border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <UserPlus size={16} /> Cadastrar novo admin
          </p>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Usuário (ex: maria)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={createMutation.isPending}
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Senha (mín. 8 caracteres)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={createMutation.isPending}
          />
          <button
            type="submit"
            disabled={createMutation.isPending || !newUsername || !newPassword}
            className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 font-medium transition-colors"
          >
            {createMutation.isPending ? 'Cadastrando...' : 'Cadastrar admin'}
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-4">
          A senha mestra continua funcionando como acesso de recuperação (login sem usuário).
        </p>
      </div>
    </div>
  );
}
