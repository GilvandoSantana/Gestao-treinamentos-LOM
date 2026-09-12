/**
 * AdminManagementModal
 * Só o administrador principal acessa. Permite cadastrar contas (admin ou
 * usuário comum), definir o que cada usuário pode ver e fazer, e remover
 * contas.
 */

import { useState } from 'react';
import { useSiteSession } from '@/hooks/useSiteSession';
import { X, UserPlus, Trash2, ShieldCheck, Loader, User as UserIcon, Settings2, Mail, Send, Eye, MessageCircle, Monitor, FolderTree, HardDrive } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { setSessionMarker } from '@/lib/session-marker';
import { formatBytes } from '@shared/cloud';
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
  const { isGlobalAdmin } = useSiteSession();
  const [newUsername, setNewUsername] = useState('');
  const [newSetor, setNewSetor] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPermissions, setNewPermissions] = useState<Permissions>({ ...DEFAULT_USER_PERMISSIONS });
  const [newContract, setNewContract] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Permissions | null>(null);
  const [draftSetor, setDraftSetor] = useState('');

  const utils = trpc.useUtils();
  const listQuery = trpc.auth.admins.list.useQuery(undefined, { enabled: isOpen });
  // Só contratos ativos entram nas opções de cadastro; um excluído continua
  // existindo nas contas antigas, mas não pode receber gente nova.
  const contractsQuery = trpc.contracts.list.useQuery(undefined, { enabled: isOpen });
  const setoresQuery = trpc.cloud.listSetores.useQuery(undefined, { enabled: isOpen });
  const contractNameBySlug = new Map((contractsQuery.data ?? []).map((c) => [c.slug, c.name]));
  const createMutation = trpc.auth.admins.create.useMutation();
  const deleteMutation = trpc.auth.admins.delete.useMutation();
  const setPermissionsMutation = trpc.auth.admins.setPermissions.useMutation();
  const setSetorMutation = trpc.auth.admins.setSetor.useMutation();
  const impersonateMutation = trpc.auth.admins.impersonate.useMutation();
  const testEmailMutation = trpc.auth.testEmail.useMutation();
  const testWhatsAppMutation = trpc.auth.testWhatsApp.useMutation();
  const [testPhone, setTestPhone] = useState('');
  const backupsQuery = trpc.backup.list.useQuery(undefined, { enabled: isOpen && isGlobalAdmin });
  const runBackupMutation = trpc.backup.runNow.useMutation();
  const desktopSessionsQuery = trpc.auth.desktopSessions.list.useQuery(undefined, { enabled: isOpen && isGlobalAdmin });
  const revokeDesktopSessionMutation = trpc.auth.desktopSessions.revoke.useMutation();
  const duplicateFoldersQuery = trpc.cloud.findDuplicateFolders.useQuery(undefined, { enabled: false });
  const storageByFolderQuery = trpc.cloud.storageByFolder.useQuery(undefined, { enabled: false });
  const mergeDuplicatesMutation = trpc.cloud.mergeDuplicateFolders.useMutation();

  const handleMergeDuplicates = async (keepId: string, duplicateIds: string[], name: string) => {
    if (
      !window.confirm(
        `Mesclar ${duplicateIds.length} pasta(s) duplicada(s) de "${name}" na mais antiga? O conteúdo delas será movido pra dentro da que ficar, e as duplicadas vão pra lixeira (recuperável se algo der errado).`
      )
    )
      return;
    try {
      const result = await mergeDuplicatesMutation.mutateAsync({ keepId, duplicateIds });
      toast.success(`Mesclado: ${result.filesMoved} arquivo(s) e ${result.foldersMoved} subpasta(s) movidos.`);
      duplicateFoldersQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao mesclar pastas.');
    }
  };

  const handleRevokeDesktopSession = async (id: string, deviceName: string | null) => {
    if (!window.confirm(`Revogar o acesso de "${deviceName || 'este dispositivo'}"? Ele vai precisar entrar de novo.`)) return;
    try {
      await revokeDesktopSessionMutation.mutateAsync({ id });
      toast.success('Acesso revogado.');
      desktopSessionsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao revogar acesso.');
    }
  };

  const handleRunBackup = async () => {
    try {
      const result = await runBackupMutation.mutateAsync();
      if (result.success) {
        toast.success('Backup gerado com sucesso.');
        backupsQuery.refetch();
      } else {
        toast.error(result.error ?? 'Falha ao gerar o backup.', { duration: 8000 });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao gerar o backup.');
    }
  };

  const handleTestEmail = async () => {
    try {
      const result = await testEmailMutation.mutateAsync();
      if (result.success) toast.success(result.message);
      else toast.error(result.message, { duration: 8000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao testar o envio.');
    }
  };

  const handleTestWhatsApp = async () => {
    if (!testPhone.trim()) {
      toast.error('Informe um telefone para testar.');
      return;
    }
    try {
      const result = await testWhatsAppMutation.mutateAsync({ phone: testPhone });
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
        setor: newSetor.trim() || null,
        permissions: newPermissions,
      });
      toast.success('Usuário cadastrado!');
      setNewUsername('');
      setNewSetor('');
      setNewContract('');
      setNewPassword('');
      setNewPermissions({ ...DEFAULT_USER_PERMISSIONS });
      await utils.auth.admins.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao cadastrar');
    }
  };

  const handleImpersonate = async (id: string, username: string) => {
    if (!window.confirm(`Entrar como "${username}"? Você vai ver o site exatamente como essa pessoa vê, até clicar em "Voltar para admin".`)) return;
    try {
      const result = await impersonateMutation.mutateAsync({ id });
      setSessionMarker(result.sessionMarker);
      await utils.invalidate();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao entrar como este usuário.');
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

  const handleSaveSetor = async (id: string) => {
    try {
      await setSetorMutation.mutateAsync({ id, setor: draftSetor.trim() || null });
      toast.success('Setor atualizado.');
      await Promise.all([utils.auth.admins.list.invalidate(), utils.cloud.listSetores.invalidate()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar setor');
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
                    <button
                      onClick={() => handleImpersonate(account.id, account.username)}
                      disabled={impersonateMutation.isPending}
                      className="p-2 text-muted-foreground hover:text-teal transition-colors disabled:opacity-40"
                      title="Ver como este usuário"
                    >
                      <Eye size={17} />
                    </button>
                    {(
                      <button
                        onClick={() => {
                          setEditingId(isEditing ? null : account.id);
                          setDraftPermissions(isEditing ? null : { ...account.permissions });
                          setDraftSetor(isEditing ? '' : account.setor ?? '');
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
                    <div className="mb-3">
                      <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        Setor
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={draftSetor}
                          onChange={(e) => setDraftSetor(e.target.value)}
                          placeholder="Ex: RH, Segurança..."
                          list="setores-usuarios"
                          className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground"
                        />
                        <button
                          onClick={() => handleSaveSetor(account.id)}
                          disabled={setSetorMutation.isPending}
                          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-navy text-white hover:opacity-90 disabled:opacity-50"
                        >
                          Salvar setor
                        </button>
                      </div>
                    </div>
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

        {isGlobalAdmin && <>
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

        {/* Backup do banco de dados — o plano do Railway usado aqui não
            inclui backup nativo, então isso roda por conta própria (ver
            server/db-backup.ts). Um agendador externo dispara isso uma vez
            por dia; este botão é só pra rodar na hora e conferir. */}
        <div className="mb-5 p-3 rounded-xl border border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck size={15} /> Backup do banco de dados
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-2.5">
            Guarda uma cópia completa do banco no armazenamento em nuvem. Roda automaticamente uma
            vez por dia; use o botão abaixo pra rodar na hora e conferir se está funcionando.
          </p>
          <button
            onClick={handleRunBackup}
            disabled={runBackupMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {runBackupMutation.isPending ? (
              <>
                <Loader size={14} className="animate-spin" /> Gerando...
              </>
            ) : (
              <>
                <ShieldCheck size={14} /> Rodar backup agora
              </>
            )}
          </button>
          {backupsQuery.data && backupsQuery.data.length > 0 && (
            <div className="mt-2.5 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Últimos backups:</p>
              {backupsQuery.data.slice(0, 5).map((b) => (
                <div key={b.key} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{b.key.replace('system-backups/', '')}</span>
                  <span className="shrink-0 ml-2">{(b.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              ))}
            </div>
          )}
          {backupsQuery.data && backupsQuery.data.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">Nenhum backup gerado ainda.</p>
          )}
        </div>

        {/* Dispositivos com o programa de sincronização conectado — antes
            não dava pra revogar só um (só trocando o segredo inteiro,
            derrubando todo mundo). Achado de auditoria de segurança,
            07/09. */}
        <div className="mb-5 p-3 rounded-xl border border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Monitor size={15} /> Dispositivos conectados
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-2.5">
            Computadores com o programa de sincronização de pastas logado. Revogue o acesso de um
            específico se o computador for perdido ou trocado.
          </p>
          {desktopSessionsQuery.data && desktopSessionsQuery.data.length > 0 ? (
            <div className="space-y-1.5">
              {desktopSessionsQuery.data.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-foreground truncate">{s.deviceName || 'Dispositivo sem nome'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.username} · desde {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevokeDesktopSession(s.id, s.deviceName)}
                    disabled={revokeDesktopSessionMutation.isPending}
                    className="shrink-0 text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                  >
                    Revogar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum dispositivo conectado no momento.</p>
          )}
        </div>

        {/* Limpeza de pastas duplicadas na Nuvem — ferramenta pontual pra
            corrigir duplicata já existente (de antes de createFolder
            virar idempotente). Não roda sozinha ao abrir — a pessoa pede
            pra verificar, já que percorre toda a árvore de pastas do
            contrato. */}
        <div className="mb-5 p-3 rounded-xl border border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderTree size={15} /> Pastas duplicadas na Nuvem
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-2.5">
            Verifica se existe mais de uma pasta com o mesmo nome no mesmo lugar (do contrato
            selecionado no cabeçalho) e permite mesclar — o conteúdo é movido pra pasta mais antiga, e a
            duplicada vai pra lixeira, recuperável se algo der errado.
          </p>
          <button
            onClick={() => duplicateFoldersQuery.refetch()}
            disabled={duplicateFoldersQuery.isFetching}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {duplicateFoldersQuery.isFetching ? (
              <>
                <Loader size={14} className="animate-spin" /> Verificando...
              </>
            ) : (
              <>
                <FolderTree size={14} /> Verificar duplicatas
              </>
            )}
          </button>
          {duplicateFoldersQuery.data && duplicateFoldersQuery.data.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">Nenhuma pasta duplicada encontrada.</p>
          )}
          {duplicateFoldersQuery.data && duplicateFoldersQuery.data.length > 0 && (
            <div className="mt-2.5 space-y-2.5">
              {duplicateFoldersQuery.data.map((group) => (
                <div key={`${group.parentId ?? 'root'}-${group.name}`} className="border border-border rounded-lg p-2.5">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {group.parentPath ? `${group.parentPath} / ` : ''}
                    {group.name}
                  </p>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {group.entries.length} cópias encontradas
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 mb-2">
                    {group.entries.map((entry, i) => (
                      <li key={entry.id}>
                        {i === 0 ? '🟢 Mantida: ' : '🔁 Duplicada: '}
                        {new Date(entry.createdAt).toLocaleDateString('pt-BR')} — {entry.fileCount} arquivo(s),{' '}
                        {entry.subfolderCount} subpasta(s)
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() =>
                      handleMergeDuplicates(
                        group.entries[0].id,
                        group.entries.slice(1).map((e) => e.id),
                        group.name
                      )
                    }
                    disabled={mergeDuplicatesMutation.isPending}
                    className="w-full text-xs font-semibold text-white bg-orange rounded-lg py-1.5 hover:opacity-90 disabled:opacity-50 transition"
                  >
                    Mesclar na mais antiga
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Indicador de espaço por pasta — ideia 6 do Gilvando: ajuda a
            decidir o que arquivar/limpar quando o espaço do contrato
            está ficando apertado, mostrando quem está ocupando mais. */}
        <div className="mb-5 p-3 rounded-xl border border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <HardDrive size={15} /> Espaço por pasta
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-2.5">
            Mostra quais pastas de nível raiz (do contrato selecionado no cabeçalho) estão
            ocupando mais espaço — ajuda a decidir o que arquivar ou limpar.
          </p>
          <button
            onClick={() => storageByFolderQuery.refetch()}
            disabled={storageByFolderQuery.isFetching}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {storageByFolderQuery.isFetching ? (
              <>
                <Loader size={14} className="animate-spin" /> Calculando...
              </>
            ) : (
              <>
                <HardDrive size={14} /> Ver espaço por pasta
              </>
            )}
          </button>
          {storageByFolderQuery.data && storageByFolderQuery.data.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">Nenhum arquivo encontrado.</p>
          )}
          {storageByFolderQuery.data && storageByFolderQuery.data.length > 0 && (
            <div className="mt-2.5 space-y-2">
              {storageByFolderQuery.data.map((folder) => {
                const maxBytes = storageByFolderQuery.data![0].totalBytes || 1;
                const percent = Math.max(2, Math.round((folder.totalBytes / maxBytes) * 100));
                return (
                  <div key={folder.folderId ?? 'root'}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground font-medium truncate">{folder.folderName}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">
                        {formatBytes(folder.totalBytes)} · {folder.fileCount} arquivo(s)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-orange" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Diagnóstico do envio de WhatsApp — o número de teste é digitado
            aqui na hora; o telefone de cada contrato fica na tela de
            Contratos, junto do e-mail de alerta. */}
        <div className="mb-5 p-3 rounded-xl border border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageCircle size={15} /> Alertas por WhatsApp
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-2.5">
            Envia uma mensagem de teste para o número informado, para conferir a configuração da
            Z-API.
          </p>
          <input
            type="tel"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="Ex: 11999999999"
            disabled={testWhatsAppMutation.isPending}
            className="w-full px-3 py-2 mb-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
          />
          <button
            onClick={handleTestWhatsApp}
            disabled={testWhatsAppMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {testWhatsAppMutation.isPending ? (
              <>
                <Loader size={14} className="animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <Send size={14} /> Enviar WhatsApp de teste
              </>
            )}
          </button>
        </div>

        </>}

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
          <input
            type="text"
            value={newSetor}
            onChange={(e) => setNewSetor(e.target.value)}
            placeholder="Setor (opcional, ex: RH, Segurança...)"
            list="setores-usuarios"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
            disabled={createMutation.isPending}
          />
          <datalist id="setores-usuarios">
            {setoresQuery.data?.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
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

