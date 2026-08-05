/*
 * Design: Industrial Blueprint — Neo-Industrial
 * FdsModal: cadastro e consulta das Fichas de Dados de Segurança (FDS).
 *
 * Ao anexar um PDF é obrigatório informar o nome da ficha; marcar as funções
 * que a utilizam é opcional, mas é o que faz a ficha aparecer para o
 * colaborador daquela função.
 */

import { useMemo, useState } from 'react';
import { X, FileText, Upload, Trash2, Download, Loader, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import type { Employee } from '@/lib/types';

interface FdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  canManage: boolean;
}

const MAX_MB = 10;

export default function FdsModal({ isOpen, onClose, employees, canManage }: FdsModalProps) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const listQuery = trpc.fds.list.useQuery(undefined, { enabled: isOpen });
  const uploadMutation = trpc.fds.upload.useMutation();
  const deleteMutation = trpc.fds.delete.useMutation();
  const setRolesMutation = trpc.fds.setRoles.useMutation();

  /** Funções existentes no cadastro de colaboradores. */
  const roles = useMemo(
    () =>
      Array.from(new Set(employees.map((e) => e.role?.trim()).filter((r): r is string => !!r))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [employees]
  );

  const toggle = (list: string[], role: string) =>
    list.includes(role) ? list.filter((r) => r !== role) : [...list, role];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      toast.error('A FDS deve ser um arquivo PDF.');
      return;
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      toast.error(`O arquivo excede o limite de ${MAX_MB}MB.`);
      return;
    }
    setFile(selected);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Informe o nome da FDS.');
      return;
    }
    if (!file) {
      toast.error('Selecione o arquivo PDF.');
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
        reader.readAsDataURL(file);
      });

      await uploadMutation.mutateAsync({
        name: name.trim(),
        fileName: file.name,
        fileData: base64,
        roles: selectedRoles,
      });

      toast.success('FDS salva com sucesso!');
      setName('');
      setFile(null);
      setSelectedRoles([]);
      await utils.fds.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar a FDS');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, sheetName: string) => {
    if (!window.confirm(`Excluir a FDS "${sheetName}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success('FDS excluída.');
      await utils.fds.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir');
    }
  };

  const handleSaveRoles = async (id: string) => {
    try {
      await setRolesMutation.mutateAsync({ id, roles: draftRoles });
      toast.success('Funções atualizadas.');
      setEditingId(null);
      await utils.fds.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar funções');
    }
  };

  const RolePicker = ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (next: string[]) => void;
  }) => (
    <div className="max-h-40 overflow-y-auto border border-border rounded-xl p-2 space-y-0.5">
      {roles.length === 0 ? (
        <p className="text-xs text-muted-foreground p-2">
          Nenhuma função cadastrada ainda nos colaboradores.
        </p>
      ) : (
        roles.map((role) => (
          <label
            key={role}
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-muted cursor-pointer"
          >
            <input
              type="checkbox"
              checked={value.includes(role)}
              onChange={() => onChange(toggle(value, role))}
              className="w-4 h-4 accent-orange shrink-0"
            />
            <span className="text-sm text-foreground truncate">{role}</span>
          </label>
        ))
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">
                FDS — Ficha de Segurança
              </h2>
              <p className="text-xs text-muted-foreground">
                {listQuery.data?.length ?? 0} ficha(s) cadastrada(s)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
              <Loader size={14} className="animate-spin" /> Carregando...
            </p>
          )}

          {listQuery.data?.length === 0 && !listQuery.isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma FDS cadastrada ainda.
            </p>
          )}

          {listQuery.data?.map((sheet) => {
            const isEditing = editingId === sheet.id;
            return (
              <div key={sheet.id} className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">{sheet.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {sheet.roles.length === 0
                        ? 'Nenhuma função vinculada'
                        : `${sheet.roles.length} função(ões): ${sheet.roles.join(', ')}`}
                    </p>
                  </div>

                  <a
                    href={sheet.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 p-2 text-muted-foreground hover:text-orange transition-colors"
                    title="Baixar PDF"
                  >
                    <Download size={17} />
                  </a>

                  {canManage && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(isEditing ? null : sheet.id);
                          setDraftRoles([...sheet.roles]);
                        }}
                        className="shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
                        title="Definir funções"
                      >
                        <Users size={17} />
                      </button>
                      <button
                        onClick={() => handleDelete(sheet.id, sheet.name)}
                        disabled={deleteMutation.isPending}
                        className="shrink-0 p-2 text-danger hover:opacity-70 disabled:opacity-40"
                        title="Excluir"
                      >
                        <Trash2 size={17} />
                      </button>
                    </>
                  )}
                </div>

                {isEditing && (
                  <div className="p-3 border-t border-border">
                    <RolePicker value={draftRoles} onChange={setDraftRoles} />
                    <button
                      onClick={() => handleSaveRoles(sheet.id)}
                      disabled={setRolesMutation.isPending}
                      className="w-full mt-2 bg-orange text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {setRolesMutation.isPending ? 'Salvando...' : 'Salvar funções'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {canManage && (
          <form onSubmit={handleUpload} className="border-t border-border p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Upload size={16} /> Nova FDS
            </p>

            <div>
              <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Nome da FDS <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Óleo lubrificante ISO 68"
                disabled={isUploading}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
              />
            </div>

            <div>
              <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Funções que utilizam <span className="normal-case tracking-normal">(opcional)</span>
              </label>
              <RolePicker value={selectedRoles} onChange={setSelectedRoles} />
            </div>

            <div>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-border"
              />
              {file && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isUploading || !name.trim() || !file}
              className="w-full bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
            >
              {isUploading ? 'Enviando...' : 'Salvar FDS'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
