/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DocumentPanel: cadastro e consulta de um tipo de documento (FDS, ARA,
 * Checklist, LTCAT, PGR ou POS). Todos compartilham a mesma estrutura:
 * um PDF com nome e, opcionalmente, as funções que o utilizam.
 *
 * Ao anexar um PDF é obrigatório informar o nome da ficha; marcar as funções
 * que a utilizam é opcional, mas é o que faz a ficha aparecer para o
 * colaborador daquela função.
 */

import { useMemo, useState } from 'react';
import { Upload, Trash2, Download, Loader, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import type { Employee } from '@/lib/types';
import { DOCUMENT_LABELS, type DocumentType } from '@shared/document-types';

interface DocumentPanelProps {
  /** Conteúdo de uma aba da central de Documentos. */
  type: DocumentType;
  employees: Employee[];
  canManage: boolean;
}

const MAX_MB = 10;

export default function DocumentPanel({ type, employees, canManage }: DocumentPanelProps) {
  const typeLabel = DOCUMENT_LABELS[type].label;
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const listQuery = trpc.fds.list.useQuery({ type });
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
      toast.error(`O ${typeLabel} deve ser um arquivo PDF.`);
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
      toast.error(`Informe o nome do ${typeLabel}.`);
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
        type,
        name: name.trim(),
        fileName: file.name,
        fileData: base64,
        roles: selectedRoles,
      });

      toast.success(`${typeLabel} salvo com sucesso!`);
      setName('');
      setFile(null);
      setSelectedRoles([]);
      await utils.fds.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Erro ao salvar o ${typeLabel}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, sheetName: string) => {
    if (!window.confirm(`Excluir o ${typeLabel} "${sheetName}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success(`${typeLabel} excluído.`);
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

  return (
    <>
      <p className="text-xs text-muted-foreground px-1 pb-2">
        {listQuery.data?.length ?? 0} documento(s) de {typeLabel} cadastrado(s)
      </p>

      <div className="space-y-2">
          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
              <Loader size={14} className="animate-spin" /> Carregando...
            </p>
          )}

          {listQuery.data?.length === 0 && !listQuery.isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum documento de {typeLabel} cadastrado ainda.
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
              <Upload size={16} /> Novo {typeLabel}
            </p>

            <div>
              <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Nome do {typeLabel} <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Nome do ${typeLabel}`}
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
              {isUploading ? 'Enviando...' : `Salvar ${typeLabel}`}
            </button>
          </form>
        )}
    </>
  );
}
