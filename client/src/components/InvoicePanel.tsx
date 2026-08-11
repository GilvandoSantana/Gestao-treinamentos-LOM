/*
 * Design: Industrial Blueprint — Neo-Industrial
 * InvoicePanel: cadastro e consulta de Notas Fiscais e Recibos.
 *
 * Mesmo padrão do DocumentPanel (FDS): lista + formulário de cadastro,
 * mas com os campos financeiros da nota (fornecedor, valor, categoria,
 * forma de pagamento etc.).
 */

import { useMemo, useState } from 'react';
import { Upload, Trash2, Download, Loader, Pencil, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
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
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');

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
    });
    setFile(null);
    setShowForm(true);
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
  };

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

      await upsertMutation.mutateAsync({
        id: form.id,
        docType: form.docType,
        number: form.number.trim() || undefined,
        supplier: form.supplier.trim() || undefined,
        cnpj: form.cnpj.trim() || undefined,
        issueDate: form.issueDate,
        value: valueNum,
        taxes: form.taxes ? Number(form.taxes.replace(',', '.')) : 0,
        products: [],
        category: form.category.trim() || undefined,
        costCenter: form.costCenter.trim() || undefined,
        paymentMethod: form.paymentMethod || undefined,
        description: form.description.trim() || undefined,
        fileName,
        fileData,
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
                  <a
                    href={row.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 p-2 text-muted-foreground hover:text-orange transition-colors"
                    title="Baixar arquivo"
                  >
                    <Download size={17} />
                  </a>
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
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
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
            <label className={labelClass}>Arquivo (PDF, JPG ou PNG)</label>
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
