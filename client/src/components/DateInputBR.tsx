/*
 * DateInputBR: campo de data sempre no formato dd/mm/aaaa, digitado como
 * texto — não usa o <input type="date"> nativo do navegador porque esse
 * campo mostra o formato de acordo com a configuração regional do
 * computador de quem está usando (em um Windows em inglês, por exemplo,
 * aparece mm/dd/aaaa). Aqui o formato é sempre o mesmo, pra qualquer pessoa.
 *
 * O valor entra e sai sempre em ISO (aaaa-mm-dd), igual ao resto do sistema
 * — só a exibição/digitação é que é dd/mm/aaaa.
 */

import { useEffect, useState } from 'react';

interface DateInputBRProps {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

function isoToDisplay(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function displayToIso(display: string): string | null {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${year}-${month}-${day}`;
}

export default function DateInputBR({
  value,
  onChange,
  className,
  placeholder = 'dd/mm/aaaa',
  id,
  disabled = false,
}: DateInputBRProps) {
  const [text, setText] = useState(() => isoToDisplay(value));

  // Mantém o texto em sincronia se o valor mudar por fora (ex: ao abrir o
  // formulário para editar um colaborador já existente).
  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    setText(formatted);

    if (digits.length === 0) {
      onChange('');
      return;
    }
    if (digits.length === 8) {
      const iso = displayToIso(formatted);
      if (iso) onChange(iso);
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      maxLength={10}
      disabled={disabled}
      className={className}
    />
  );
}
