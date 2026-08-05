/*
 * Design: Industrial Blueprint — Neo-Industrial
 * EmployeeFdsButton: mostra as FDS vinculadas à função do colaborador e
 * permite baixá-las direto do cartão.
 *
 * Aparece só quando existe alguma ficha para aquela função — assim o cartão
 * não ganha um botão inútil para quem não tem FDS cadastrada.
 */

import { useMemo, useState } from 'react';
import { FileWarning, Download, ChevronDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface EmployeeFdsButtonProps {
  role?: string | null;
  /** Aparência do botão: no cabeçalho escuro do cartão ou em fundo claro. */
  variant?: 'onDark' | 'onLight';
}

export default function EmployeeFdsButton({ role, variant = 'onDark' }: EmployeeFdsButtonProps) {
  const [open, setOpen] = useState(false);
  const listQuery = trpc.fds.list.useQuery(undefined, { refetchOnWindowFocus: false });

  const sheets = useMemo(() => {
    const normalized = role?.trim().toLowerCase();
    if (!normalized) return [];
    return (listQuery.data ?? []).filter((sheet) =>
      sheet.roles.some((r) => r.trim().toLowerCase() === normalized)
    );
  }, [listQuery.data, role]);

  if (sheets.length === 0) return null;

  const buttonClass =
    variant === 'onDark'
      ? 'bg-white/15 hover:bg-white/25 text-white'
      : 'bg-muted hover:bg-muted/70 text-foreground';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${buttonClass} px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-sm font-medium`}
        title="Fichas de segurança da função"
      >
        <FileWarning size={14} />
        FDS
        <span className="font-technical text-[10px] opacity-80">({sheets.length})</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-64 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {sheets.map((sheet) => (
            <a
              key={sheet.id}
              href={sheet.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors border-b border-border last:border-b-0"
            >
              <Download size={15} className="text-orange shrink-0" />
              <span className="min-w-0 truncate">{sheet.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
