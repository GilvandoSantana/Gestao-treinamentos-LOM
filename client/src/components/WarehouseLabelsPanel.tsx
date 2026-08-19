/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseLabelsPanel: etiquetas com QR code para colaboradores e itens do
 * almoxarifado, prontas para imprimir.
 */

import { useEffect, useMemo, useState } from 'react';
import { Tag, Printer, Search, Users, Package } from 'lucide-react';
import QRCode from 'qrcode';
import { trpc } from '@/lib/trpc';

type Kind = 'employee' | 'item';

interface LabelData {
  kind: Kind;
  id: string;
  code: string;
  title: string;
  subtitle: string;
  qrDataUrl: string;
}

async function generateQR(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 200,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

export default function WarehouseLabelsPanel() {
  const [kind, setKind] = useState<Kind>('employee');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [generating, setGenerating] = useState(false);

  const employeesQuery = trpc.employees.list.useQuery();
  const itemsQuery = trpc.warehouse.listItems.useQuery();

  const employees = employeesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.trim().toLowerCase();
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, search]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
  }, [items, search]);

  // Troca de aba (colaborador/item) limpa a seleção — evita misturar tipos.
  useEffect(() => {
    setSelectedIds(new Set());
    setLabels([]);
  }, [kind]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const source = kind === 'employee' ? filteredEmployees : filteredItems;
      const selected = source.filter((s) => selectedIds.has(s.id));

      const generated: LabelData[] = await Promise.all(
        selected.map(async (s) => {
          if (kind === 'employee') {
            const emp = s as (typeof employees)[number];
            const code = emp.registration || emp.name.replace(/\s+/g, '_').toUpperCase();
            return {
              kind: 'employee' as const,
              id: emp.id,
              code,
              title: emp.name,
              subtitle: emp.registration ? `Matrícula: ${emp.registration}` : emp.role,
              qrDataUrl: await generateQR(`FUNC:${code}`),
            };
          }
          const item = s as (typeof items)[number];
          return {
            kind: 'item' as const,
            id: item.id,
            code: item.code,
            title: item.name,
            subtitle: `Código: ${item.code}`,
            qrDataUrl: await generateQR(`MAT:${item.code}`),
          };
        })
      );
      setLabels(generated);
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <div className="max-w-4xl">
      {/* Impressão: só as etiquetas ficam visíveis nessa hora */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #warehouse-labels-print, #warehouse-labels-print * { visibility: visible; }
          #warehouse-labels-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <div className="flex gap-2 mb-4 print:hidden">
        <button
          onClick={() => setKind('employee')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
            kind === 'employee' ? 'bg-navy text-white border-navy' : 'bg-card text-muted-foreground border-border'
          }`}
        >
          <Users size={15} />
          Colaboradores
        </button>
        <button
          onClick={() => setKind('item')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
            kind === 'item' ? 'bg-navy text-white border-navy' : 'bg-card text-muted-foreground border-border'
          }`}
        >
          <Package size={15} />
          Itens
        </button>
      </div>

      <div className="relative mb-3 print:hidden">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={kind === 'employee' ? 'Buscar colaborador' : 'Buscar item'}
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
        />
      </div>

      <div className="max-h-52 overflow-y-auto border border-border rounded-xl divide-y divide-border mb-3 print:hidden">
        {(kind === 'employee' ? filteredEmployees : filteredItems).map((entry) => (
          <label
            key={entry.id}
            className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(entry.id)}
              onChange={() => toggle(entry.id)}
              className="w-4 h-4 accent-orange shrink-0"
            />
            <span className="text-sm text-foreground truncate">
              {entry.name}
              {'code' in entry && <span className="text-muted-foreground"> · {entry.code}</span>}
            </span>
          </label>
        ))}
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating || selectedIds.size === 0}
        className="w-full print:hidden flex items-center justify-center gap-1.5 bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 mb-4"
      >
        <Tag size={16} />
        {generating ? 'Gerando...' : `Gerar ${selectedIds.size || ''} etiqueta(s)`}
      </button>

      {labels.length > 0 && (
        <>
          <button
            onClick={handlePrint}
            className="w-full print:hidden flex items-center justify-center gap-1.5 border border-border rounded-lg py-2.5 font-semibold text-foreground hover:bg-muted transition mb-4"
          >
            <Printer size={16} />
            Imprimir
          </button>

          <div id="warehouse-labels-print" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {labels.map((label) => (
              <div
                key={`${label.kind}-${label.id}`}
                className="border border-border rounded-lg p-3 flex flex-col items-center text-center bg-card break-inside-avoid"
              >
                {label.qrDataUrl && <img src={label.qrDataUrl} alt="" className="w-20 h-20 mb-2" />}
                <p className="text-xs font-semibold text-foreground leading-tight">{label.title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label.subtitle}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
