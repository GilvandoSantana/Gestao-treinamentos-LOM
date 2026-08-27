/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DocumentationModal: geração de documentos de admissão do colaborador
 * (contrato, termo, ficha, etc) a partir de modelos — igual ao crachá,
 * preenchendo automaticamente com os dados de cada colaborador. Exclusivo
 * do administrador principal.
 *
 * Por enquanto é só a aba/estrutura: os modelos de documento ainda vão ser
 * enviados e desenhados um por um, do mesmo jeito que o crachá foi feito
 * (BadgeGenerator.tsx) — este componente é o ponto de partida.
 */

import { X, FileStack, Sparkles } from 'lucide-react';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DocumentationModal({ isOpen, onClose }: DocumentationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileStack className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Documentação</h2>
              <p className="text-xs text-muted-foreground">Documentos de admissão gerados por colaborador</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <div className="p-3 rounded-full bg-orange/10 text-orange">
              <Sparkles size={28} />
            </div>
            <h3 className="font-display text-base font-bold text-foreground">Ainda não tem nenhum modelo aqui</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Assim que os modelos dos documentos de admissão forem enviados, cada um vira uma opção aqui —
              preenchida automaticamente com os dados do colaborador escolhido, do mesmo jeito que já funciona
              com o crachá.
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-border p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground">Como vai funcionar</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>Cada documento-modelo vira um botão de geração aqui dentro</li>
              <li>Escolhe o colaborador e o sistema já preenche nome, matrícula, função, contrato e outros dados do cadastro</li>
              <li>O documento pronto sai em PDF, pra imprimir ou assinar</li>
              <li>Igual ao crachá: se um dado do colaborador mudar, o documento sai sempre atualizado</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
