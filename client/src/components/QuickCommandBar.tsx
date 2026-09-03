import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Zap, FileText, Eye, Pencil, Award } from 'lucide-react';
import { toast } from 'sonner';
import type { Employee } from '@/lib/types';
import { parseCommand, findMatchingEmployees, QUICK_COMMAND_HELP, type ParsedCommand } from '@/lib/quick-command';

interface QuickCommandBarProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onViewEmployee: (employee: Employee) => void;
  onEditEmployee: (employee: Employee) => void;
}

const ACTION_ICONS: Record<ParsedCommand['action'], React.ReactNode> = {
  badge: <FileText size={14} />,
  view: <Eye size={14} />,
  edit: <Pencil size={14} />,
  certificates: <Award size={14} />,
};

export default function QuickCommandBar({
  isOpen,
  onClose,
  employees,
  onViewEmployee,
  onEditEmployee,
}: QuickCommandBarProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setText('');
      // Espera o modal montar antes de focar.
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const parsed = useMemo(() => parseCommand(text), [text]);
  const matches = useMemo(
    () => (parsed ? findMatchingEmployees(employees, parsed.query) : []),
    [parsed, employees]
  );

  if (!isOpen) return null;

  const runAction = async (action: ParsedCommand['action'], employee: Employee) => {
    onClose();
    if (action === 'view' || action === 'certificates') {
      onViewEmployee(employee);
      return;
    }
    if (action === 'edit') {
      onEditEmployee(employee);
      return;
    }
    if (action === 'badge') {
      try {
        const { generateBadgePDF } = await import('@/components/BadgeGenerator');
        generateBadgePDF(employee);
        toast.success(`Crachá de ${employee.name} gerado.`);
      } catch {
        toast.error('Erro ao gerar o crachá.');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Enter' && parsed && matches.length === 1) {
      runAction(parsed.action, matches[0]);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[100] flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Zap size={16} className="text-orange shrink-0" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ex: crachá do João Silva"
            className="flex-1 outline-none text-sm"
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {!text.trim() && (
            <div className="px-4 py-4 text-xs text-gray-400">
              <p className="mb-2 font-medium text-gray-500">Comandos rápidos, sem IA — só busca de texto:</p>
              <ul className="space-y-1">
                {QUICK_COMMAND_HELP.map((example) => (
                  <li key={example}>&quot;{example}&quot;</li>
                ))}
              </ul>
            </div>
          )}

          {text.trim() && !parsed && (
            <div className="px-4 py-4 text-xs text-gray-500">
              Não entendi esse comando. Tente algo como:
              <ul className="mt-2 space-y-1">
                {QUICK_COMMAND_HELP.map((example) => (
                  <li key={example}>&quot;{example}&quot;</li>
                ))}
              </ul>
            </div>
          )}

          {parsed && matches.length === 0 && (
            <div className="px-4 py-4 text-xs text-gray-500">
              Entendi &quot;{parsed.actionLabel.toLowerCase()}&quot;, mas não achei ninguém chamado &quot;{parsed.query}&quot;.
            </div>
          )}

          {parsed &&
            matches.map((employee) => (
              <button
                key={employee.id}
                onClick={() => runAction(parsed.action, employee)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition"
              >
                <span className="text-orange">{ACTION_ICONS[parsed.action]}</span>
                <span className="flex-1 text-sm text-gray-800">{employee.name}</span>
                <span className="text-[11px] text-gray-400">{parsed.actionLabel}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
