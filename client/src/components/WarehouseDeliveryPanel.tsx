/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseDeliveryPanel: entrega e devolução de ferramentas/EPIs para
 * colaboradores — usa quem já está cadastrado no sistema.
 */

import { useMemo, useState } from 'react';
import { UserCheck, PackageCheck, PackageOpen, Search, Plus, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface WarehouseDeliveryPanelProps {
  canManage: boolean;
  /** Quando definido, trava o modo e esconde o alternador — usado nas abas
   * dedicadas "Entrega de Ferramentas" e "Devolução de Ferramentas". */
  fixedMode?: Mode;
}

type Mode = 'deliver' | 'return';

export default function WarehouseDeliveryPanel({ canManage, fixedMode }: WarehouseDeliveryPanelProps) {
  const [mode, setMode] = useState<Mode>(fixedMode ?? 'deliver');
  const utils = trpc.useUtils();

  const employeesQuery = trpc.employees.list.useQuery();
  const itemsQuery = trpc.warehouse.listItems.useQuery();

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  // --- Modo entrega ---
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [obs, setObs] = useState('');
  const deliverMutation = trpc.warehouse.deliverItem.useMutation();

  // --- Modo devolução ---
  const activeDeliveriesQuery = trpc.warehouse.listActiveDeliveriesForEmployee.useQuery(
    { employeeId: selectedEmployeeId },
    { enabled: !!selectedEmployeeId && mode === 'return' }
  );
  const returnMutation = trpc.warehouse.returnItem.useMutation();
  const [returnObsById, setReturnObsById] = useState<Record<string, string>>({});

  const employees = employeesQuery.data ?? [];
  const items = (itemsQuery.data ?? []).filter((i) =>
    ['ferramenta', 'epi', 'equipamento'].includes(i.type)
  );

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees.slice(0, 30);
    const q = employeeSearch.trim().toLowerCase();
    return employees
      .filter((e) => e.name.toLowerCase().includes(q) || e.registration?.toLowerCase().includes(q))
      .slice(0, 30);
  }, [employees, employeeSearch]);

  const filteredItems = useMemo(() => {
    const available = items.filter((i) => i.quantity > 0);
    if (!itemSearch.trim()) return available.slice(0, 30);
    const q = itemSearch.trim().toLowerCase();
    return available
      .filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
      .slice(0, 30);
  }, [items, itemSearch]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const selectEmployee = (id: string, name: string) => {
    setSelectedEmployeeId(id);
    setEmployeeSearch(name);
  };

  const handleDeliver = async () => {
    if (!selectedEmployeeId || !selectedEmployee) {
      toast.error('Selecione um colaborador.');
      return;
    }
    if (!selectedItemId) {
      toast.error('Selecione uma ferramenta ou EPI.');
      return;
    }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      toast.error('Informe uma quantidade válida.');
      return;
    }
    try {
      await deliverMutation.mutateAsync({
        employeeId: selectedEmployeeId,
        employeeName: selectedEmployee.name,
        itemId: selectedItemId,
        quantity: qty,
        obs: obs || null,
      });
      toast.success('Entrega registrada.');
      setSelectedItemId('');
      setItemSearch('');
      setQuantity('1');
      setObs('');
      await Promise.all([utils.warehouse.listItems.invalidate(), utils.warehouse.listDeliveries.invalidate()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar entrega.');
    }
  };

  const handleReturn = async (deliveryId: string) => {
    try {
      await returnMutation.mutateAsync({ id: deliveryId, returnObs: returnObsById[deliveryId] || null });
      toast.success('Devolução registrada.');
      await Promise.all([
        utils.warehouse.listItems.invalidate(),
        utils.warehouse.listDeliveries.invalidate(),
        utils.warehouse.listActiveDeliveriesForEmployee.invalidate({ employeeId: selectedEmployeeId }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar devolução.');
    }
  };

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        Você não tem permissão para entregar ou devolver ferramentas.
      </p>
    );
  }

  return (
    <div className="max-w-3xl">
      {!fixedMode && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('deliver')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              mode === 'deliver'
                ? 'bg-orange text-white border-orange'
                : 'bg-card text-muted-foreground border-border'
            }`}
          >
            <PackageOpen size={15} />
            Entregar
          </button>
          <button
            onClick={() => setMode('return')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              mode === 'return' ? 'bg-teal text-white border-teal' : 'bg-card text-muted-foreground border-border'
            }`}
          >
            <PackageCheck size={15} />
            Devolver
          </button>
        </div>
      )}

      {/* Seleção de colaborador — comum aos dois modos */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
          <UserCheck size={13} />
          Colaborador
        </label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={employeeSearch}
            onChange={(e) => {
              setEmployeeSearch(e.target.value);
              setSelectedEmployeeId('');
            }}
            placeholder="Buscar por nome ou matrícula"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
          />
        </div>
        {employeeSearch && !selectedEmployeeId && (
          <div className="mt-1.5 max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {filteredEmployees.length === 0 && (
              <p className="text-xs text-muted-foreground p-2.5">Nenhum colaborador encontrado.</p>
            )}
            {filteredEmployees.map((e) => (
              <button
                key={e.id}
                onClick={() => selectEmployee(e.id, e.name)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {e.name}
                {e.registration && <span className="text-muted-foreground"> · Mat. {e.registration}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedEmployeeId && mode === 'deliver' && (
        <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Ferramenta ou EPI</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={itemSearch}
                onChange={(e) => {
                  setItemSearch(e.target.value);
                  setSelectedItemId('');
                }}
                placeholder="Buscar por nome ou código"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
              />
            </div>
            {itemSearch && !selectedItemId && (
              <div className="mt-1.5 max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {filteredItems.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2.5">Nada disponível em estoque com esse nome.</p>
                )}
                {filteredItems.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      setSelectedItemId(i.id);
                      setItemSearch(`${i.code} — ${i.name}`);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    {i.code} — {i.name}{' '}
                    <span className="text-muted-foreground">
                      (estoque: {i.quantity} {i.unit})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Quantidade</label>
              <input
                type="number"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Observação</label>
              <input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
          </div>

          <button
            onClick={handleDeliver}
            disabled={deliverMutation.isPending || !selectedItemId}
            className="w-full flex items-center justify-center gap-1.5 bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={16} />
            {deliverMutation.isPending ? 'Registrando...' : 'Registrar entrega'}
          </button>
        </div>
      )}

      {selectedEmployeeId && mode === 'return' && (
        <div>
          <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Itens com {selectedEmployee?.name} ({activeDeliveriesQuery.data?.length ?? 0})
          </p>
          {activeDeliveriesQuery.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
              <Loader size={14} className="animate-spin" /> Carregando...
            </p>
          )}
          {activeDeliveriesQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Esse colaborador não tem nada em mãos no momento.
            </p>
          )}
          <div className="space-y-2">
            {activeDeliveriesQuery.data?.map((d) => (
              <div key={d.id} className="p-3 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {d.itemName} <span className="text-muted-foreground">× {d.quantity}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Entregue em {new Date(d.deliveredAt).toLocaleDateString('pt-BR')}
                      {d.obs && <> · {d.obs}</>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleReturn(d.id)}
                    disabled={returnMutation.isPending}
                    className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <PackageCheck size={14} />
                    Devolver
                  </button>
                </div>
                <input
                  value={returnObsById[d.id] ?? ''}
                  onChange={(e) => setReturnObsById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  placeholder="Observação da devolução (opcional)"
                  className="w-full mt-2 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
