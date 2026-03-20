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
  role: string;
  photoUrl?: string | null;
  trainings: Training[];
}

export interface Certificate {
  id: string;
  trainingId: string;
  employeeId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
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
