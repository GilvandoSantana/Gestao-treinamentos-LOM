/*
 * WarehouseItemCombobox: mesmo papel do <select> de item do almoxarifado,
 * mas pesquisável — digitar filtra por código ou nome, em vez de precisar
 * rolar uma lista enorme (tem contrato com centenas de itens cadastrados).
 */

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface WarehouseItemOption {
  id: string;
  code: string;
  name: string;
  quantity: number;
  unit: string;
}

interface WarehouseItemComboboxProps {
  items: WarehouseItemOption[];
  value: string;
  onChange: (itemId: string) => void;
  /** Itens já escolhidos em outras linhas — aparecem esmaecidos e não podem
   * ser selecionados de novo, para não duplicar o mesmo item no atendimento. */
  disabledIds?: string[];
  placeholder?: string;
}

export default function WarehouseItemCombobox({
  items,
  value,
  onChange,
  disabledIds = [],
  placeholder = 'Selecione um item',
}: WarehouseItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground text-left"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? `${selected.code} — ${selected.name}` : placeholder}
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemId, search) => {
            const item = items.find((i) => i.id === itemId);
            if (!item) return 0;
            const haystack = `${item.code} ${item.name}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Digite o código ou o nome do item..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
                const isDisabled = disabledIds.includes(item.id) && item.id !== value;
                return (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    disabled={isDisabled}
                    onSelect={(currentValue) => {
                      onChange(currentValue === value ? '' : currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      size={14}
                      className={cn('shrink-0', value === item.id ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="truncate">
                      {item.code} — {item.name}{' '}
                      <span className="text-muted-foreground">
                        (estoque: {item.quantity} {item.unit})
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
