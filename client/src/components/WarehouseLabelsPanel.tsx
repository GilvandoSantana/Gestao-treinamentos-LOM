/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseLabelsPanel: etiquetas com QR code para colaboradores e itens do
 * almoxarifado, prontas para imprimir.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

// Cada folha impressa leva no máximo 12 QR codes (3 colunas × 4 linhas) —
// evita etiquetas espremidas ou minúsculas demais pra escanear.
const LABELS_PER_PAGE = 12;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q) || i.patrimonio?.toLowerCase().includes(q)
    );
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

      const generated: LabelData[][] = await Promise.all(
        selected.map(async (s): Promise<LabelData[]> => {
          if (kind === 'employee') {
            const emp = s as (typeof employees)[number];
            const code = emp.registration || emp.name.replace(/\s+/g, '_').toUpperCase();
            return [
              {
                kind: 'employee' as const,
                id: emp.id,
                code,
                title: emp.name,
                subtitle: emp.registration ? `Matrícula: ${emp.registration}` : emp.role,
                qrDataUrl: await generateQR(`FUNC:${code}`),
              },
            ];
          }
          const item = s as (typeof items)[number];
          // Ferramenta com patrimônio: uma etiqueta só, com nome + código +
          // patrimônio juntos no mesmo QR (não duas etiquetas separadas) —
          // assim qualquer leitor de QR já mostra os três de uma vez.
          if (item.type === 'ferramenta' && item.patrimonio) {
            const safeName = item.name.replace(/\|/g, ' ');
            return [
              {
                kind: 'item' as const,
                id: item.id,
                code: item.code,
                title: item.name,
                subtitle: `Código: ${item.code} · Patrimônio: ${item.patrimonio}`,
                qrDataUrl: await generateQR(`MAT:${item.code}|PAT:${item.patrimonio}|NOME:${safeName}`),
              },
            ];
          }
          return [
            {
              kind: 'item' as const,
              id: item.id,
              code: item.code,
              title: item.name,
              subtitle: `Código: ${item.code}`,
              qrDataUrl: await generateQR(`MAT:${item.code}`),
            },
          ];
        })
      );
      setLabels(generated.flat());
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => window.print();

  const pages = useMemo(() => chunk(labels, LABELS_PER_PAGE), [labels]);

  return (
    <div className="max-w-4xl">
      {/*
       * Impressão: o antigo esquema (visibility:hidden no resto da tela)
       * deixava o conteúdo escondido ocupando espaço mesmo assim, o que
       * empurrava as etiquetas e gerava folhas extras repetindo o mesmo
       * item. Agora as etiquetas de impressão vivem fora da árvore do app
       * (via portal, direto no body) e a impressão simplesmente esconde o
       * app inteiro (#root) e mostra só o portal — sem sobra de espaço.
       */}
      <style>{`
        @media print {
          body > *:not(#warehouse-labels-print-portal) { display: none !important; }
          #warehouse-labels-print-portal { display: block !important; }
        }
        #warehouse-labels-print-portal { display: none; }
      `}</style>

      <div className="flex gap-2 mb-4">
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

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={kind === 'employee' ? 'Buscar colaborador' : 'Buscar item por nome, código ou patrimônio'}
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
        />
      </div>

      <div className="max-h-52 overflow-y-auto border border-border rounded-xl divide-y divide-border mb-3">
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
              {'patrimonio' in entry && entry.patrimonio && (
                <span className="text-muted-foreground"> · Patrimônio: {entry.patrimonio}</span>
              )}
            </span>
          </label>
        ))}
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating || selectedIds.size === 0}
        className="w-full flex items-center justify-center gap-1.5 bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 mb-4"
      >
        <Tag size={16} />
        {generating ? 'Gerando...' : `Gerar ${selectedIds.size || ''} etiqueta(s)`}
      </button>

      {labels.length > 0 && (
        <>
          <button
            onClick={handlePrint}
            className="w-full flex items-center justify-center gap-1.5 border border-border rounded-lg py-2.5 font-semibold text-foreground hover:bg-muted transition mb-2"
          >
            <Printer size={16} />
            Imprimir
          </button>
          <p className="text-xs text-muted-foreground text-center mb-4">
            {labels.length} etiqueta(s) em {pages.length} folha{pages.length === 1 ? '' : 's'} (até {LABELS_PER_PAGE}{' '}
            por folha)
          </p>

          {/* Pré-visualização na tela — usa as cores do tema normalmente */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {labels.map((label) => (
              <div
                key={`${label.kind}-${label.id}`}
                className="border border-border rounded-lg p-3 flex flex-col items-center text-center bg-card"
              >
                {label.qrDataUrl && <img src={label.qrDataUrl} alt="" className="w-20 h-20 mb-2" />}
                <p className="text-xs font-semibold text-foreground leading-tight">{label.title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label.subtitle}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {labels.length > 0 &&
        createPortal(
          <div id="warehouse-labels-print-portal">
            {pages.map((page, pageIndex) => (
              <div
                key={pageIndex}
                className="grid grid-cols-3 gap-3 p-6"
                style={{ pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto' }}
              >
                {page.map((label) => (
                  <div
                    key={`${label.kind}-${label.id}`}
                    className="border border-black rounded-lg p-3 flex flex-col items-center text-center bg-white break-inside-avoid"
                  >
                    {label.qrDataUrl && <img src={label.qrDataUrl} alt="" className="w-24 h-24 mb-2" />}
                    <p className="text-sm font-semibold text-black leading-tight">{label.title}</p>
                    <p className="text-xs text-gray-700 leading-tight mt-0.5">{label.subtitle}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
