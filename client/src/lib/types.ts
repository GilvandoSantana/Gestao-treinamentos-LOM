export interface Training {
  id: string;
  name: string;
  completionDate: string;
  expirationDate: string;
}

export interface Employee {
  id: string;
  name: string;
  registration?: string;
  educationLevel?: string;
  age?: number;
  birthDate?: string;
  role: string;
  phone?: string;
  /** Contrato ao qual o colaborador pertence (ver shared/contracts.ts) */
  contract?: string;
  photoUrl?: string | null;
  /** Demitido: sai das listas e contagens, mas o registro é preservado. */
  dismissed?: boolean;
  dismissedAt?: string | Date | null;
  updatedAt?: string | Date;
  /** Valores dos campos personalizados do contrato — {fieldKey: valor}. */
  customFields?: Record<string, string>;
  trainings: Training[];
}

export interface Certificate {
  id: string;
  trainingId: string;
  employeeId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TrainingStatus {
  status: 'expired' | 'expiring' | 'valid' | 'unknown';
  label: string;
  diffDays: number;
}

export type FilterType = 'all' | 'valid' | 'expiring' | 'expired';

export interface Statistics {
  total: number;
  expired: number;
  expiring: number;
  valid: number;
}

export const PREDEFINED_TRAININGS = [
  'ASO',
  'Bloqueio e Etiquetagem',
  'Direção Defensiva',
  'Equipamentos Móveis',
  'Movimentação de Carga',
  'Produtos Químicos',
  'Proteção de Máquinas',
  'SEP',
  'Trabalho a Quente',
  'Trabalho com Eletricidade',
  'Trabalho em Altura',
] as const;

export const PREDEFINED_ROLES = [
  'Assistente administrativo',
  'Auxiliar de mecânico',
  'Caldeireiro industrial',
  'Coordenador de planejamento',
  'Encarregado de mecânica',
  'Engenheiro de Manutenção',
  'Ferramenteiro',
  'Motorista',
  'Operador de equipamentos',
  'Operador mantenedor elétrico',
  'Operador mantenedor mecânico',
  'Soldador industrial',
  'Supervisor de elétrica',
  'Supervisor de mecânica',
  'Técnico de materiais',
  'Técnico de Segurança',
] as const;
