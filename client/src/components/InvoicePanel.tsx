/*
 * Design: Industrial Blueprint — Neo-Industrial
 * InvoicePanel: cadastro e consulta de Notas Fiscais e Recibos.
 *
 * Mesmo padrão do DocumentPanel (FDS): lista + formulário de cadastro,
 * mas com os campos financeiros da nota (fornecedor, valor, categoria,
 * forma de pagamento etc.).
 */

import { useMemo, useState } from 'react';
import { Upload, Trash2, Download, Loader, Pencil, X, FileText, Plus, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import DateInputBR from '@/components/DateInputBR';
import { suggestItemsFromInvoicePdf, type ExtractedInvoiceItem } from '@/lib/invoice-pdf-extract';
import {
  INVOICE_DOC_TYPES,
  INVOICE_DOC_TYPE_LABELS,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_PAYMENT_METHODS,
  INVOICE_PAYMENT_METHOD_LABELS,
  type InvoiceDocType,
  type InvoiceStatus,
  type InvoicePaymentMethod,
  type InvoiceProduct,
} from '@shared/invoices';

interface InvoicePanelProps {
  canManage: boolean;
  isMasterAdmin?: boolean;
}

const MAX_MB = 10;

const emptyForm = {
  id: undefined as string | undefined,
  docType: 'nota_fiscal' as InvoiceDocType,
  number: '',
  supplier: '',
  cnpj: '',
  issueDate: '',
  value: '',
  taxes: '',
  category: '',
  costCenter: '',
  paymentMethod: '' as InvoicePaymentMethod | '',
  description: '',
  status: 'processado' as InvoiceStatus,
  products: [] as InvoiceProduct[],
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const statusBadgeClass: Record<InvoiceStatus, string> = {
  pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  processado: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  confirmado: 'bg-teal/15 text-teal dark:bg-teal/20',
};

export default function InvoicePanel({ canManage, isMasterAdmin = false }: InvoicePanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [isExtracting, setIsExtracting] = useState(false);
  const [suggestedItems, setSuggestedItems] = useState<ExtractedInvoiceItem[]>([]);

  const contractsQuery = trpc.contracts.list.useQuery(undefined, { enabled: isMasterAdmin });
  const changeContractMutation = trpc.invoices.changeContract.useMutation();
  const utils = trpc.useUtils();
  const listQuery = trpc.invoices.list.useQuery();
  const categoriesQuery = trpc.invoices.categories.list.useQuery();
  const upsertMutation = trpc.invoices.upsertOne.useMutation();
  const deleteMutation = trpc.invoices.delete.useMutation();

  const filtered = useMemo(() => {
    const rows = listQuery.data ?? [];
    if (statusFilter === 'all') return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [listQuery.data, statusFilter]);

  const totalValue = useMemo(
    () => filtered.reduce((sum, row) => sum + row.value, 0),
    [filtered]
  );

  const resetForm = () => {
    setForm(emptyForm);
    setFile(null);
    setFile2(null);
    setSuggestedItems([]);
    setShowForm(false);
  };

  const handleEdit = (row: NonNullable<typeof listQuery.data>[number]) => {
    setForm({
      id: row.id,
      docType: row.docType,
      number: row.number ?? '',
      supplier: row.supplier ?? '',
      cnpj: row.cnpj ?? '',
      issueDate: row.issueDate,
      value: String(row.value),
      taxes: String(row.taxes ?? 0),
      category: row.category ?? '',
      costCenter: row.costCenter ?? '',
      paymentMethod: row.paymentMethod ?? '',
      description: row.description ?? '',
      status: row.status,
      products: row.products ?? [],
    });
    setFile(null);
    setFile2(null);
    setSuggestedItems([]);
    setShowForm(true);
  };

  /** Roda a extração de itens num PDF selecionado e junta com o que já tinha sido sugerido (sem duplicar). */
  const extractAndMerge = async (selected: File) => {
    if (selected.type !== 'application/pdf') return;
    setIsExtracting(true);
    try {
      const found = await suggestItemsFromInvoicePdf(selected);
      if (found.length === 0) return;
      setSuggestedItems((prev) => {
        const existingNames = new Set(prev.map((p) => p.name.toLowerCase()));
        const newOnes = found.filter((f) => !existingNames.has(f.name.toLowerCase()));
        return [...prev, ...newOnes];
      });
      toast.success(`${found.length} item(ns) identificado(s) no PDF — revise antes de adicionar.`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(selected.type)) {
      toast.error('Anexe um PDF, JPG ou PNG.');
      return;
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      toast.error(`O arquivo excede o limite de ${MAX_MB}MB.`);
      return;
    }
    setFile(selected);
    void extractAndMerge(selected);
  };

  const handleFile2Select = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(selected.type)) {
      toast.error('Anexe um PDF, JPG ou PNG.');
      return;
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      toast.error(`O arquivo excede o limite de ${MAX_MB}MB.`);
      return;
    }
    setFile2(selected);
    void extractAndMerge(selected);
  };

  const acceptSuggestedItem = (item: ExtractedInvoiceItem) => {
    setForm((f) => ({ ...f, products: [...f.products, { name: item.name, qty: item.qty, unit_price: item.unit_price, total: item.total }] }));
    setSuggestedItems((prev) => prev.filter((i) => i !== item));
  };

  const acceptAllSuggested = (confidence?: 'alta' | 'baixa') => {
    const toAccept = confidence ? suggestedItems.filter((i) => i.confidence === confidence) : suggestedItems;
    setForm((f) => ({
      ...f,
      products: [...f.products, ...toAccept.map((i) => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, total: i.total }))],
    }));
    setSuggestedItems((prev) => prev.filter((i) => !toAccept.includes(i)));
  };

  const dismissSuggestedItem = (item: ExtractedInvoiceItem) => {
    setSuggestedItems((prev) => prev.filter((i) => i !== item));
  };

  const addEmptyProduct = () => {
    setForm((f) => ({ ...f, products: [...f.products, { name: '', qty: 1, unit_price: 0, total: 0 }] }));
  };

  const updateProduct = (index: number, patch: Partial<InvoiceProduct>) => {
    setForm((f) => {
      const products = [...f.products];
      const updated = { ...products[index], ...patch };
      // Recalcula o total automaticamente quando qtd ou valor unitário mudam.
      if (patch.qty !== undefined || patch.unit_price !== undefined) {
        updated.total = Number((updated.qty * updated.unit_price).toFixed(2));
      }
      products[index] = updated;
      return { ...f, products };
    });
  };

  const removeProduct = (index: number) => {
    setForm((f) => ({ ...f, products: f.products.filter((_, i) => i !== index) }));
  };

  const productsTotal = form.products.reduce((sum, p) => sum + p.total, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.issueDate) {
      toast.error('Informe a data de emissão.');
      return;
    }
    const valueNum = Number(form.value.replace(',', '.'));
    if (!form.value || Number.isNaN(valueNum) || valueNum < 0) {
      toast.error('Informe o valor total.');
      return;
    }

    setIsSaving(true);
    try {
      let fileData: string | undefined;
      let fileName: string | undefined;
      if (file) {
        fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
          reader.readAsDataURL(file);
        });
        fileName = file.name;
      }

      let fileData2: string | undefined;
      let fileName2: string | undefined;
      if (file2) {
        fileData2 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
          reader.readAsDataURL(file2);
        });
        fileName2 = file2.name;
      }

      await upsertMutation.mutateAsync({
        id: form.id,
        docType: form.docType,
        number: form.number.trim() || undefined,
        supplier: form.supplier.trim() || undefined,
        cnpj: form.cnpj.trim() || undefined,
        issueDate: form.issueDate,
        value: valueNum,
        taxes: form.taxes ? Number(form.taxes.replace(',', '.')) : 0,
        products: form.products,
        category: form.category.trim() || undefined,
        costCenter: form.costCenter.trim() || undefined,
        paymentMethod: form.paymentMethod || undefined,
        description: form.description.trim() || undefined,
        fileName,
        fileData,
        fileName2,
        fileData2,
        status: form.status,
      });

      toast.success(form.id ? 'Nota fiscal atualizada!' : 'Nota fiscal cadastrada!');
      resetForm();
      await utils.invoices.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar a nota fiscal');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Excluir "${label}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success('Nota fiscal excluída.');
      await utils.invoices.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir');
    }
  };

  const handleMoveContract = async (id: string, label: string, contractSlug: string) => {
    try {
      await changeContractMutation.mutateAsync({ id, contractSlug });
      await utils.invoices.list.invalidate();
      toast.success(`"${label}" movido de contrato.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao mudar o contrato.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange text-sm';
  const labelClass = 'block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5';

  return (
    <>
      <div className="flex items-center justify-between px-1 pb-2 gap-2">
        <p className="text-xs text-muted-foreground">
          {filtered.length} documento(s) · {currencyFormatter.format(totalValue)}
        </p>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
          className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground"
        >
          <option value="all">Todos os status</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVOICE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {listQuery.isLoading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
            <Loader size={14} className="animate-spin" /> Carregando...
          </p>
        )}

        {filtered.length === 0 && !listQuery.isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma nota fiscal cadastrada ainda.
          </p>
        )}

        {filtered.map((row) => {
          const label = row.supplier || row.number || INVOICE_DOC_TYPE_LABELS[row.docType];
          return (
            <div key={row.id} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground truncate">{label}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusBadgeClass[row.status]}`}>
                      {INVOICE_STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate font-technical">
                    {INVOICE_DOC_TYPE_LABELS[row.docType]} {row.number ? `nº ${row.number}` : ''} ·{' '}
                    {new Date(row.issueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} ·{' '}
                    {currencyFormatter.format(row.value)}
                  </p>
                  {row.category && (
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            categoriesQuery.data?.find((c) => c.name === row.category)?.color ?? '#64748b',
                        }}
                      />
                      {row.category}
                    </p>
                  )}
                </div>

                {row.fileUrl && (
                  <button
                    onClick={async () => {
                      try {
                        const { url } = await utils.client.invoices.getDownloadUrl.query({ id: row.id, which: '1' });
                        window.open(url, '_blank', 'noreferrer');
                      } catch {
                        toast.error('Erro ao abrir o arquivo.');
                      }
                    }}
                    className="shrink-0 p-2 text-muted-foreground hover:text-orange transition-colors"
                    title="Baixar nota fiscal"
                  >
                    <Download size={17} />
                  </button>
                )}
                {row.fileUrl2 && (
                  <button
                    onClick={async () => {
                      try {
                        const { url } = await utils.client.invoices.getDownloadUrl.query({ id: row.id, which: '2' });
                        window.open(url, '_blank', 'noreferrer');
                      } catch {
                        toast.error('Erro ao abrir o arquivo.');
                      }
                    }}
                    className="shrink-0 p-2 text-muted-foreground hover:text-teal transition-colors"
                    title="Baixar pedido de compras / ordem de serviço"
                  >
                    <FileText size={17} />
                  </button>
                )}

                {isMasterAdmin && contractsQuery.data && contractsQuery.data.length > 1 && (
                  <select
                    value={row.contract}
                    onChange={(e) => handleMoveContract(row.id, label, e.target.value)}
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
                      onClick={() => handleEdit(row)}
                      className="shrink-0 p-2 text-muted-foreground hover:text-orange transition-colors"
                      title="Editar"
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      onClick={() => handleDelete(row.id, label)}
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

      {canManage && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mt-4 bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          <Upload size={16} /> Nova Nota Fiscal / Recibo
        </button>
      )}

      {canManage && showForm && (
        <form onSubmit={handleSubmit} className="border-t border-border mt-4 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Upload size={16} /> {form.id ? 'Editar' : 'Nova'} Nota Fiscal / Recibo
            </p>
            <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo</label>
              <select
                value={form.docType}
                onChange={(e) => setForm({ ...form, docType: e.target.value as InvoiceDocType })}
                disabled={isSaving}
                className={inputClass}
              >
                {INVOICE_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INVOICE_DOC_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Número</label>
              <input
                type="text"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                disabled={isSaving}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Fornecedor</label>
            <input
              type="text"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              disabled={isSaving}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>CNPJ</label>
              <input
                type="text"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                disabled={isSaving}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Data de emissão <span className="text-danger">*</span>
              </label>
              <DateInputBR
                value={form.issueDate}
                onChange={(iso) => setForm({ ...form, issueDate: iso })}
                disabled={isSaving}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Valor total <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                disabled={isSaving}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Impostos</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.taxes}
                onChange={(e) => setForm({ ...form, taxes: e.target.value })}
                disabled={isSaving}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                disabled={isSaving}
                className={inputClass}
              >
                <option value="">—</option>
                {categoriesQuery.data?.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Centro de custo</label>
              <input
                type="text"
                value={form.costCenter}
                onChange={(e) => setForm({ ...form, costCenter: e.target.value })}
                disabled={isSaving}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Forma de pagamento</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as InvoicePaymentMethod })}
                disabled={isSaving}
                className={inputClass}
              >
                <option value="">—</option>
                {INVOICE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {INVOICE_PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceStatus })}
                disabled={isSaving}
                className={inputClass}
              >
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INVOICE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={isSaving}
              rows={2}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Nota Fiscal (PDF, JPG ou PNG)</label>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={handleFileSelect}
              disabled={isSaving}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-border"
            />
            {file && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Pedido de Compras / Ordem de Serviço (opcional)</label>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={handleFile2Select}
              disabled={isSaving}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-border"
            />
            {file2 && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {file2.name} · {(file2.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          {isExtracting && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader size={12} className="animate-spin" />
              Lendo o PDF em busca dos itens...
            </p>
          )}

          {suggestedItems.length > 0 && (
            <div className="border border-orange/30 bg-orange/5 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles size={13} className="text-orange" />
                  {suggestedItems.length} item(ns) encontrado(s) no PDF — revise antes de adicionar
                </p>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => acceptAllSuggested()}
                    className="text-[11px] font-semibold text-orange hover:opacity-70"
                  >
                    Aceitar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestedItems([])}
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Descartar todos
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {suggestedItems.map((item, i) => (
                  <div
                    key={`${item.name}-${i}`}
                    className="flex items-center gap-2 bg-card border border-border rounded-lg px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.qty} × {currencyFormatter.format(item.unit_price)} = {currencyFormatter.format(item.total)}
                        {item.confidence === 'baixa' && <span className="text-orange"> · confira, confiança baixa</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => acceptSuggestedItem(item)}
                      title="Adicionar à lista de itens"
                      className="shrink-0 text-teal hover:opacity-70"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissSuggestedItem(item)}
                      title="Descartar"
                      className="shrink-0 text-muted-foreground hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelClass + ' mb-0'}>Itens ({form.products.length})</label>
              {productsTotal > 0 && (
                <span className="text-[11px] text-muted-foreground">Soma: {currencyFormatter.format(productsTotal)}</span>
              )}
            </div>
            <div className="space-y-1.5">
              {form.products.map((p, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input
                    value={p.name}
                    onChange={(e) => updateProduct(i, { name: e.target.value })}
                    placeholder="Nome do item"
                    disabled={isSaving}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={p.qty}
                    onChange={(e) => updateProduct(i, { qty: Number(e.target.value) || 0 })}
                    placeholder="Qtd."
                    disabled={isSaving}
                    className="w-16 shrink-0 px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={p.unit_price}
                    onChange={(e) => updateProduct(i, { unit_price: Number(e.target.value) || 0 })}
                    placeholder="Vlr. unit."
                    disabled={isSaving}
                    className="w-20 shrink-0 px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                  />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground text-right">
                    {currencyFormatter.format(p.total)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeProduct(i)}
                    disabled={isSaving}
                    className="shrink-0 text-muted-foreground hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addEmptyProduct}
              disabled={isSaving}
              className="w-full mt-1.5 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-border text-muted-foreground hover:text-orange hover:border-orange transition"
            >
              <Plus size={13} />
              Adicionar item manualmente
            </button>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {isSaving ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Cadastrar'}
          </button>
        </form>
      )}
    </>
  );
}
