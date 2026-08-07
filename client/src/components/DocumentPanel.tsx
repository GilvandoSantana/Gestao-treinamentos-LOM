/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DocumentPanel: cadastro e consulta de um tipo de documento (FDS, ARA,
 * Checklist, LTCAT, PGR ou POS). Todos compartilham a mesma estrutura:
 * um PDF com um nome obrigatório.
 *
 * Os documentos não são vinculados a funções — ficam disponíveis para
 * consulta e download por qualquer pessoa com permissão de ver certificados.
 */

import { useMemo, useState } from 'react';
import { Upload, Trash2, Download, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { DOCUMENT_LABELS, type DocumentType } from '@shared/document-types';

interface DocumentPanelProps {
  /** Conteúdo de uma aba da central de Documentos. */
  type: DocumentType;
  canManage: boolean;
  /** Só o administrador principal pode mover um documento para outro contrato. */
  isMasterAdmin?: boolean;
}

const MAX_MB = 10;

export default function DocumentPanel({ type, canManage, isMasterAdmin = false }: DocumentPanelProps) {
  const typeLabel = DOCUMENT_LABELS[type].label;
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const contractsQuery = trpc.contracts.list.useQuery(undefined, { enabled: isMasterAdmin });
  const changeContractMutation = trpc.fds.changeContract.useMutation();

  const handleMoveContract = async (id: string, sheetName: string, contractSlug: string) => {
    try {
      await changeContractMutation.mutateAsync({ id, contractSlug });
      await utils.fds.list.invalidate();
      toast.success(`"${sheetName}" movido de contrato.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao mudar o contrato.');
    }
  };

  const utils = trpc.useUtils();
  const listQuery = trpc.fds.list.useQuery({ type });
  const uploadMutation = trpc.fds.upload.useMutation();
  const deleteMutation = trpc.fds.delete.useMutation();

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
      });

      toast.success(`${typeLabel} salvo com sucesso!`);
      setName('');
      setFile(null);
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
            return (
              <div key={sheet.id} className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">{sheet.name}</p>
                    <p className="text-xs text-muted-foreground truncate font-technical">
                      {sheet.fileName}
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

                  {isMasterAdmin && contractsQuery.data && contractsQuery.data.length > 1 && (
                    <select
                      value={sheet.contract}
                      onChange={(e) => handleMoveContract(sheet.id, sheet.name, e.target.value)}
                      disabled={changeContractMutation.isPending}
                      title="Mover para outro contrato"
                      className="shrink-0 text-xs border border-border rounded-lg px-1.5 py-1 bg-background text-foreground max-w-[110px]"
                    >
                      {contractsQuery.data.map((c) => (
                        <option key={c.id} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {canManage && (
                    <>
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
