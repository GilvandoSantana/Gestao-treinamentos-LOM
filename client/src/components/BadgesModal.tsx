/*
 * Design: Industrial Blueprint — Neo-Industrial
 * BadgesModal: geração de crachás em lote.
 *
 * Antes só dava para gerar um crachá por vez, pelo cartão de cada colaborador.
 * Aqui a pessoa escolhe o tipo, marca quantos colaboradores quiser e baixa
 * todos de uma vez.
 */

import { useMemo, useState } from 'react';
import { X, CreditCard, Lock, Droplets, IdCard, Search, Loader, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from '@/lib/types';
import type { jsPDF } from 'jspdf';
import { generateBadgePDF } from './BadgeGenerator';
import { generateBadgeLockPDF } from './BadgeLockGenerator';
import { generateBadgeWaterPDF } from './BadgeWaterGenerator';
import { generateBadgeSupportPDF } from './BadgeSupportGenerator';

interface BadgesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
}

type BadgeType = 'padrao' | 'bloqueio' | 'agua' | 'support';

const BADGE_TYPES: { key: BadgeType; label: string; Icon: typeof CreditCard }[] = [
  { key: 'padrao', label: 'Padrão', Icon: CreditCard },
  { key: 'bloqueio', label: 'Bloqueio', Icon: Lock },
  { key: 'agua', label: 'Água', Icon: Droplets },
  { key: 'support', label: 'Support', Icon: IdCard },
];

const GENERATORS: Record<BadgeType, (employee: Employee, sharedDoc?: jsPDF) => Promise<jsPDF>> = {
  padrao: generateBadgePDF,
  bloqueio: generateBadgeLockPDF,
  agua: generateBadgeWaterPDF,
  support: generateBadgeSupportPDF,
};

const BADGE_TYPE_FILE_PREFIX: Record<BadgeType, string> = {
  padrao: 'crachas',
  bloqueio: 'crachas-bloqueio',
  agua: 'crachas-agua',
  support: 'crachas-support',
};

export default function BadgesModal({ isOpen, onClose, employees }: BadgesModalProps) {
  const [badgeType, setBadgeType] = useState<BadgeType>('padrao');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  // Um PDF por colaborador (como sempre) ou tudo junto num único arquivo com
  // várias páginas — mais prático para levar um lote inteiro pra gráfica.
  const [singleFile, setSingleFile] = useState(false);

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

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

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

    const generate = GENERATORS[badgeType];
    let failures = 0;
    let sharedDoc: jsPDF | undefined;

    // Um PDF por colaborador, em sequência: gerar tudo de uma vez trava o
    // navegador e alguns bloqueiam downloads simultâneos. No modo "arquivo
    // único", cada crachá vira uma página a mais no mesmo documento — só
    // salva ao final.
    for (let i = 0; i < chosen.length; i++) {
      try {
        const doc = await generate(chosen[i], singleFile ? sharedDoc : undefined);
        if (singleFile) sharedDoc = doc;
      } catch (error) {
        failures++;
        console.error('Erro ao gerar crachá:', chosen[i].name, error);
      }
      setProgress(i + 1);
      await new Promise((resolve) => setTimeout(resolve, singleFile ? 60 : 350));
    }

    if (singleFile && sharedDoc) {
      const dateStamp = new Date().toISOString().slice(0, 10);
      sharedDoc.save(`${BADGE_TYPE_FILE_PREFIX[badgeType]}-${dateStamp}.pdf`);
    }

    setIsGenerating(false);
    setProgress(0);

    const successCount = chosen.length - failures;
    if (failures === 0) {
      toast.success(
        singleFile
          ? `${successCount} crachá(s) gerado(s) num único PDF.`
          : `${successCount} crachá(s) gerado(s).`
      );
    } else {
      toast.error(`${failures} de ${chosen.length} crachá(s) falharam.`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <CreditCard className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Crachás</h2>
              <p className="text-xs text-muted-foreground">
                {selectedIds.size === 0
                  ? 'Escolha o tipo e os colaboradores'
                  : `${selectedIds.size} colaborador(es) selecionado(s)`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        {/* Tipo de crachá */}
        <div className="px-4 pt-3">
          <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Tipo de crachá
          </p>
          <div className="flex gap-2">
            {BADGE_TYPES.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setBadgeType(key)}
                disabled={isGenerating}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-50 ${
                  badgeType === key
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
              Gerar tudo num <strong>único arquivo</strong> (uma página por crachá)
            </span>
          </label>
        </div>

        {/* Busca e selecionar todos */}
        <div className="px-4 pt-3 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
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
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum colaborador encontrado.
            </p>
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
                  <span className="block text-sm font-medium text-foreground truncate">
                    {employee.name}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {employee.registration && (
                      <span className="font-technical">#{employee.registration} · </span>
                    )}
                    {employee.role}
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
                  ? `Baixar PDF único (${selectedIds.size} crachá${selectedIds.size !== 1 ? 's' : ''})`
                  : `Baixar ${selectedIds.size > 0 ? `${selectedIds.size} ` : ''}crachá${selectedIds.size !== 1 ? 's' : ''}`}
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
    </div>
  );
}
