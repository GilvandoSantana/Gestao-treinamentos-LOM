/*
 * Design: Industrial Blueprint — Neo-Industrial
 * ComplianceStamp: o elemento-assinatura do design. Em vez de uma bolinha
 * colorida genérica, o status de um treinamento é "carimbado" como um selo
 * de conformidade oficial — reforça que isto é um registro, não só um chip
 * de UI.
 */

type StampStatus = 'valid' | 'expiring' | 'expired' | 'unknown';

interface ComplianceStampProps {
  status: StampStatus;
  label: string;
  size?: 'sm' | 'md';
}

const stampConfig: Record<StampStatus, { ring: string; text: string; word: string; rotate: string }> = {
  valid: {
    ring: 'border-teal text-teal',
    text: 'text-teal',
    word: 'VÁLIDO',
    rotate: '-rotate-6',
  },
  expiring: {
    ring: 'border-warning text-warning',
    text: 'text-warning',
    word: 'VENCENDO',
    rotate: 'rotate-3',
  },
  expired: {
    ring: 'border-danger text-danger',
    text: 'text-danger',
    word: 'VENCIDO',
    rotate: '-rotate-3',
  },
  unknown: {
    ring: 'border-muted-foreground text-muted-foreground',
    text: 'text-muted-foreground',
    word: 'S/ DATA',
    rotate: 'rotate-2',
  },
};

export default function ComplianceStamp({ status, size = 'md' }: ComplianceStampProps) {
  const config = stampConfig[status] ?? stampConfig.unknown;
  const dimension = size === 'sm' ? 'w-11 h-11 text-[7px]' : 'w-14 h-14 text-[8px]';

  return (
    <div
      className={`relative shrink-0 ${dimension} ${config.rotate} animate-stamp-punch select-none`}
      aria-hidden="true"
      title={config.word}
    >
      <div
        className={`absolute inset-0 rounded-full border-2 ${config.ring} flex items-center justify-center font-display font-bold tracking-wider opacity-90`}
        style={{
          borderStyle: 'double',
        }}
      >
        <span className="leading-none text-center px-0.5">{config.word}</span>
      </div>
      <div className={`absolute inset-[3px] rounded-full border ${config.ring} opacity-40`} />
    </div>
  );
}
