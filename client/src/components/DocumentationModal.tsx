/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DocumentationModal: geração de documentos de admissão do colaborador
 * (contrato, termo, ficha, etc) a partir de modelos — igual ao crachá,
 * preenchendo automaticamente com os dados de cada colaborador. Exclusivo
 * do administrador principal.
 *
 * Cada novo documento-modelo vira uma entrada em DOCUMENT_TYPES. Por
 * enquanto só a Ficha de EPI está pronta; os próximos seguem o mesmo
 * gerador em client/src/lib/epi-form.ts (ou um lib próprio, se tiverem
 * layout muito diferente).
 */

import { useMemo, useState } from 'react';
import { X, FileStack, Search, Loader, Download, HardHat, ClipboardList, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from '@/lib/types';
import type { jsPDF } from 'jspdf';
import { generateEpiFormPDF } from '@/lib/epi-form';
import { generateOsFormPDF } from '@/lib/os-form';
import EpiRoleConfigModal from '@/components/EpiRoleConfigModal';
import OsRoleConfigModal from '@/components/OsRoleConfigModal';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
}

type DocumentType = 'epi' | 'os';

const DOCUMENT_TYPES: { key: DocumentType; label: string; Icon: typeof HardHat }[] = [
  { key: 'epi', label: 'Ficha de EPI', Icon: HardHat },
  { key: 'os', label: 'Ordem de Serviço', Icon: ClipboardList },
];

const GENERATORS: Record<DocumentType, (employee: Employee, sharedDoc?: jsPDF) => Promise<jsPDF>> = {
  epi: generateEpiFormPDF,
  os: generateOsFormPDF,
};

const DOCUMENT_TYPE_FILE_PREFIX: Record<DocumentType, string> = {
  epi: 'fichas-epi',
  os: 'ordens-de-servico',
};

export default function DocumentationModal({ isOpen, onClose, employees }: DocumentationModalProps) {
  const [documentType, setDocumentType] = useState<DocumentType>('epi');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [singleFile, setSingleFile] = useState(false);
  const [showEpiConfig, setShowEpiConfig] = useState(false);
  const [showOsConfig, setShowOsConfig] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query
      ? employees.filter(
          (e) =>
            e.name.toLowerCase().includes(query) ||
            e.role?.toLowerCase().includes(query) ||
            e.registration?.toLowerCase().includes(query)
        )
      : employees;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((e) => next.delete(e.id));
      else filtered.forEach((e) => next.add(e.id));
      return next;
    });
  };

  const handleGenerate = async () => {
    const chosen = employees.filter((e) => selectedIds.has(e.id));
    if (chosen.length === 0) {
      toast.error('Selecione ao menos um colaborador.');
      return;
    }

    setIsGenerating(true);
    setProgress(0);

    const generate = GENERATORS[documentType];
    let failures = 0;
    let firstErrorMessage: string | null = null;
    let sharedDoc: jsPDF | undefined;

    // Um PDF por colaborador, em sequência — gerar tudo de uma vez trava o
    // navegador. No modo "arquivo único", cada ficha vira duas páginas a
    // mais no mesmo documento (frente + verso), só salva ao final.
    for (let i = 0; i < chosen.length; i++) {
      try {
        const doc = await generate(chosen[i], singleFile ? sharedDoc : undefined);
        if (singleFile) sharedDoc = doc;
      } catch (error) {
        failures++;
        if (!firstErrorMessage) {
          firstErrorMessage = error instanceof Error ? error.message : null;
        }
        console.error('Erro ao gerar documento:', chosen[i].name, error);
      }
      setProgress(i + 1);
      await new Promise((resolve) => setTimeout(resolve, singleFile ? 60 : 350));
    }

    if (singleFile && sharedDoc) {
      const dateStamp = new Date().toISOString().slice(0, 10);
      sharedDoc.save(`${DOCUMENT_TYPE_FILE_PREFIX[documentType]}-${dateStamp}.pdf`);
    }

    setIsGenerating(false);
    setProgress(0);

    const successCount = chosen.length - failures;
    if (failures === 0) {
      toast.success(
        singleFile
          ? `${successCount} documento(s) gerado(s) num único PDF.`
          : `${successCount} documento(s) gerado(s).`
      );
    } else if (firstErrorMessage) {
      // Mostra o motivo real (ex: PGR não anexado) em vez de só a contagem —
      // é o que o usuário precisa pra saber o que corrigir.
      toast.error(firstErrorMessage);
    } else {
      toast.error(`${failures} de ${chosen.length} documento(s) falharam.`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="relative bg-gradient-to-r from-navy to-navy-light p-5 pt-6">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-3.5 h-3.5 rounded-full bg-background border border-black/10" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileStack className="text-orange-light shrink-0" size={21} />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-white truncate">Documentação</h2>
                <p className="text-xs text-white/60">
                  {selectedIds.size === 0
                    ? 'Escolha o documento e os colaboradores'
                    : `${selectedIds.size} colaborador(es) selecionado(s)`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white shrink-0">
              <X size={23} />
            </button>
          </div>
        </div>
        <div className="h-0 border-t border-dashed border-border/70" aria-hidden="true" />

        {/* Tipo de documento */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground">Documento</p>
            {documentType === 'epi' && (
              <button
                onClick={() => setShowEpiConfig(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-orange hover:opacity-80"
              >
                <Settings2 size={12} />
                Configurar EPIs por função
              </button>
            )}
            {documentType === 'os' && (
              <button
                onClick={() => setShowOsConfig(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-orange hover:opacity-80"
              >
                <Settings2 size={12} />
                Configurar OS por função
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {DOCUMENT_TYPES.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setDocumentType(key)}
                disabled={isGenerating}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-50 ${
                  documentType === key
                    ? 'bg-navy text-white border-navy'
                    : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2.5 mt-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
            <input
              type="checkbox"
              checked={singleFile}
              onChange={(e) => setSingleFile(e.target.checked)}
              disabled={isGenerating}
              className="w-4 h-4 accent-orange shrink-0"
            />
            <span className="text-sm text-foreground">
              Gerar tudo num <strong>único arquivo</strong> (frente + verso por colaborador)
            </span>
          </label>
        </div>

        {/* Busca e selecionar todos */}
        <div className="px-4 pt-3 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, função ou matrícula"
              disabled={isGenerating}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
            />
          </div>
          <button
            onClick={toggleAllFiltered}
            disabled={isGenerating || filtered.length === 0}
            className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/70 disabled:opacity-50 transition"
          >
            {allFilteredSelected ? 'Limpar' : 'Todos'}
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum colaborador encontrado.</p>
          ) : (
            filtered.map((employee) => (
              <label
                key={employee.id}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(employee.id)}
                  onChange={() => toggle(employee.id)}
                  disabled={isGenerating}
                  className="w-4 h-4 accent-orange shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground truncate">{employee.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {employee.registration && <span className="font-technical">#{employee.registration} · </span>}
                    {employee.role}
                    {!employee.admissionDate && (
                      <span className="text-warning"> · sem data de admissão cadastrada</span>
                    )}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>

        {/* Ação */}
        <div className="p-4 border-t border-border">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || selectedIds.size === 0}
            className="w-full flex items-center justify-center gap-2 bg-orange text-white rounded-xl py-3 font-bold hover:opacity-90 disabled:opacity-50 transition"
          >
            {isGenerating ? (
              <>
                <Loader size={17} className="animate-spin" />
                Gerando {progress} de {selectedIds.size}...
              </>
            ) : (
              <>
                <Download size={17} />
                {singleFile
                  ? `Baixar PDF único (${selectedIds.size} ficha${selectedIds.size !== 1 ? 's' : ''})`
                  : `Baixar ${selectedIds.size > 0 ? `${selectedIds.size} ` : ''}ficha${selectedIds.size !== 1 ? 's' : ''}`}
              </>
            )}
          </button>
          {isGenerating && (
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              {singleFile
                ? 'Montando o arquivo — não feche esta janela.'
                : 'Os arquivos são baixados um a um — não feche esta janela.'}
            </p>
          )}
        </div>
      </div>

      <EpiRoleConfigModal isOpen={showEpiConfig} onClose={() => setShowEpiConfig(false)} />
      <OsRoleConfigModal isOpen={showOsConfig} onClose={() => setShowOsConfig(false)} />
    </div>
  );
}
