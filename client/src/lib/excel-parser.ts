import { daysUntilDate } from '@shared/calendar-date';
import { SimpleWorkbook, readSheetAsJson } from './xlsx-compat';
import type { Employee } from './types';

export interface ExcelRow {
  [key: string]: string | number | Date | undefined;
}

/**
 * Parse Excel file and extract employees with trainings
 * Expected columns:
 * - Nome (obrigatório)
 * - Matrícula (opcional)
 * - Função (opcional)
 * - Escolaridade (opcional)
 * - Data de Nascimento (opcional, formato: DD/MM/YYYY)
 * - Telefone (opcional)
 * - CPF (opcional)
 * - Data de Admissão (opcional, formato: DD/MM/YYYY)
 * - CNH Número (opcional)
 * - CNH Validade (opcional, formato: DD/MM/YYYY)
 * - CNH Categoria (opcional)
 * - Líder (opcional)
 * - Área (opcional)
 * - Treinamento (opcional)
 * - Data de Realização (opcional, formato: DD/MM/YYYY)
 * - Data de Vencimento (opcional, formato: DD/MM/YYYY)
 *
 * Uma linha por treinamento: para dar vários treinamentos à mesma pessoa,
 * repita o nome dela em várias linhas (o modelo baixável já mostra isso).
 *
 * Gerência não entra aqui: é do contrato (cadastrada uma vez em "Gerenciar
 * Contratos"), não de cada colaborador. Líder e Área são sempre opcionais —
 * só usados por quem usa o módulo de Lançamentos RQA's (achado do Gilvando,
 * 18/09: Área tinha ficado de fora quando Líder foi adicionado).
 */
export async function parseExcelFile(file: File): Promise<Employee[]> {
  const data = await file.arrayBuffer();
  const rows: ExcelRow[] = (await readSheetAsJson(data)) as ExcelRow[];

  if (rows.length === 0) {
    throw new Error('Nenhum dado encontrado na planilha');
  }

  const employees: Employee[] = [];
  const employeeMap = new Map<string, Employee>();

  for (const row of rows) {
    const nome = String(row['Nome'] || row['name'] || '').trim();

    if (!nome) continue;

    // Get or create employee
    let employee = employeeMap.get(nome);
    if (!employee) {
      const birthDate = parseDate(row['Data de Nascimento'] ?? row['birthDate']) || undefined;
      const admissionDate = parseDate(row['Data de Admissão'] ?? row['admissionDate']) || undefined;
      const cnhValidade = parseDate(row['CNH Validade'] ?? row['cnhValidade']) || undefined;

      employee = {
        id: `emp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: nome,
        registration: String(row['Matrícula'] || row['registration'] || '').trim() || undefined,
        role: String(row['Função'] || row['role'] || '').trim(),
        educationLevel: String(row['Escolaridade'] || row['educationLevel'] || '').trim() || undefined,
        birthDate,
        phone: String(row['Telefone'] || row['phone'] || '').trim() || undefined,
        cpf: String(row['CPF'] || row['cpf'] || '').trim() || undefined,
        admissionDate,
        cnhNumero: String(row['CNH Número'] || row['cnhNumero'] || '').trim() || undefined,
        cnhValidade,
        cnhCategoria: String(row['CNH Categoria'] || row['cnhCategoria'] || '').trim().toUpperCase() || undefined,
        leader: String(row['Líder'] || row['leader'] || '').trim() || undefined,
        area: String(row['Área'] || row['area'] || '').trim() || undefined,
        trainings: [],
      };
      employeeMap.set(nome, employee);
      employees.push(employee);
    }

    // Add training if present
    const trainingName = String(row['Treinamento'] || row['training'] || '').trim();
    if (trainingName) {
      const completionDate =
        parseDate(row['Data de Realização'] ?? row['completionDate']) ||
        '';
      const expirationDate =
        parseDate(row['Data de Vencimento'] ?? row['expirationDate']) ||
        '';

      const training = {
        id: `train-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: trainingName,
        completionDate,
        expirationDate,
      };

      // Avoid duplicate trainings
      if (!employee.trainings.some(t => t.name === trainingName)) {
        employee.trainings.push(training);
      }
    }
  }

  // Sort employees by name
  employees.sort((a, b) => a.name.localeCompare(b.name));

  return employees;
}

/**
 * Parse date string in DD/MM/YYYY or YYYY-MM-DD format
 */
/**
 * Converte o valor de uma célula de data para AAAA-MM-DD.
 *
 * Uma célula de data no Excel pode chegar aqui de três formas, dependendo de
 * como a pessoa digitou e do formato da célula:
 * - um objeto Date (quando a célula tem formato de data — o caso mais comum
 *   ao digitar direto no Excel, e o motivo do bug anterior: a leitura não
 *   pedia isso, então a data virava um número de série e era descartada)
 * - um número de série do Excel (dias desde 30/12/1899), se por algum motivo
 *   o objeto Date não vier
 * - um texto DD/MM/AAAA ou AAAA-MM-DD, quando a célula é só texto
 */
function parseDate(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const result = parseDateValue(value);
  if (!result || daysUntilDate(result) === null) throw new Error('Data inválida na planilha. Use DD/MM/AAAA ou deixe a célula vazia quando desconhecida.');
  return result;
}
function parseDateValue(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Usa os getters em UTC, não os locais: o SheetJS monta esse objeto Date
    // a partir do número de série do Excel usando UTC. Ler com getters locais
    // (getDate/getMonth) podia voltar um dia, dependendo do fuso do
    // navegador — em UTC-3 (Brasil), meia-noite UTC vira 21h do dia anterior.
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'number') {
    // Número de série do Excel: dias desde 30/12/1899.
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const dateStr = String(value).trim();
  if (!dateStr) return null;

  // DD/MM/AAAA (o formato do modelo). Se o primeiro número não puder ser dia
  // (>31) mas o segundo puder, ou se o segundo não puder ser mês (>12) mas o
  // primeiro puder, os dois estão invertidos (planilha editada num Excel em
  // inglês, que grava MM/DD) — corrige sozinho nesse caso.
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    let [, first, second, year] = slashMatch;
    let day = parseInt(first, 10);
    let month = parseInt(second, 10);
    if (month > 12 && day <= 12) {
      // Só pode ser MM/DD/AAAA — troca.
      [day, month] = [month, day];
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  // AAAA-MM-DD
  const yyyymmddMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyymmddMatch) {
    const [, year, month, day] = yyyymmddMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Generate a sample Excel template for users
 */
/**
 * Gera uma planilha já com os colaboradores atuais preenchidos (Nome,
 * Matrícula, Função, Escolaridade, Telefone e a Data de Nascimento que já
 * existir) — pra completar um campo em lote (como data de nascimento) sem
 * digitar tudo de novo. Uma linha por colaborador, sem repetir por
 * treinamento — essa planilha não mexe em treinamentos ao ser reimportada.
 */
export function generateEmployeesUpdateSheet(employees: Employee[]): void {
  const rows = [...employees]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((emp) => {
      const toDisplayDate = (value?: string) => {
        if (!value) return '';
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return '';
        const [, year, month, day] = match;
        return `${day}/${month}/${year}`;
      };
      return {
        Nome: emp.name,
        Matrícula: emp.registration || '',
        Função: emp.role || '',
        Escolaridade: emp.educationLevel || '',
        'Data de Nascimento': toDisplayDate(emp.birthDate),
        Telefone: emp.phone || '',
        CPF: emp.cpf || '',
        'Data de Admissão': toDisplayDate(emp.admissionDate),
        'CNH Número': emp.cnhNumero || '',
        'CNH Validade': toDisplayDate(emp.cnhValidade),
        'CNH Categoria': emp.cnhCategoria || '',
        Líder: emp.leader || '',
        Área: emp.area || '',
        Treinamento: '',
        'Data de Realização': '',
        'Data de Vencimento': '',
      };
    });

  const workbook = new SimpleWorkbook();
  workbook.addJsonSheet('Colaboradores', rows, [
    { wch: 25 }, // Nome
    { wch: 12 }, // Matrícula
    { wch: 22 }, // Função
    { wch: 18 }, // Escolaridade
    { wch: 16 }, // Data de Nascimento
    { wch: 16 }, // Telefone
    { wch: 16 }, // CPF
    { wch: 16 }, // Data de Admissão
    { wch: 14 }, // CNH Número
    { wch: 14 }, // CNH Validade
    { wch: 14 }, // CNH Categoria
    { wch: 20 }, // Líder
    { wch: 18 }, // Área
    { wch: 25 }, // Treinamento
    { wch: 18 }, // Data de Realização
    { wch: 18 }, // Data de Vencimento
  ]);
  void workbook.download('colaboradores-para-completar.xlsx');
}

export function generateExcelTemplate(): void {
  const sampleData = [
    {
      Nome: 'João Silva',
      Matrícula: '10482',
      Função: 'Motorista',
      Escolaridade: 'Ensino Médio',
      'Data de Nascimento': '12/03/1990',
      Telefone: '(11) 99999-9999',
      CPF: '123.456.789-00',
      'Data de Admissão': '03/01/2023',
      'CNH Número': '01234567890',
      'CNH Validade': '20/11/2029',
      'CNH Categoria': 'AB',
      Líder: 'Carlos Andrade',
      Área: 'Transporte',
      Treinamento: 'Direção Defensiva',
      'Data de Realização': '15/06/2025',
      'Data de Vencimento': '15/06/2026',
    },
    {
      Nome: 'Maria Santos',
      Matrícula: '10517',
      Função: 'Soldador industrial',
      Escolaridade: 'Ensino Técnico',
      'Data de Nascimento': '25/08/1988',
      Telefone: '(11) 98888-8888',
      CPF: '987.654.321-00',
      'Data de Admissão': '10/05/2022',
      'CNH Número': '',
      'CNH Validade': '',
      'CNH Categoria': '',
      Líder: 'Fernanda Lima',
      Área: 'Caldeiraria',
      Treinamento: 'Proteção de Máquinas',
      'Data de Realização': '10/05/2025',
      'Data de Vencimento': '10/05/2026',
    },
    {
      Nome: 'Maria Santos',
      Matrícula: '10517',
      Função: 'Soldador industrial',
      Escolaridade: 'Ensino Técnico',
      'Data de Nascimento': '25/08/1988',
      Telefone: '(11) 98888-8888',
      CPF: '987.654.321-00',
      'Data de Admissão': '10/05/2022',
      'CNH Número': '',
      'CNH Validade': '',
      'CNH Categoria': '',
      Líder: 'Fernanda Lima',
      Área: 'Caldeiraria',
      Treinamento: 'Trabalho a Quente',
      'Data de Realização': '20/07/2025',
      'Data de Vencimento': '20/07/2026',
    },
  ];

  const workbook = new SimpleWorkbook();
  workbook.addJsonSheet('Treinamentos', sampleData, [
    { wch: 25 }, // Nome
    { wch: 12 }, // Matrícula
    { wch: 22 }, // Função
    { wch: 18 }, // Escolaridade
    { wch: 16 }, // Data de Nascimento
    { wch: 16 }, // Telefone
    { wch: 16 }, // CPF
    { wch: 16 }, // Data de Admissão
    { wch: 14 }, // CNH Número
    { wch: 14 }, // CNH Validade
    { wch: 14 }, // CNH Categoria
    { wch: 20 }, // Líder
    { wch: 18 }, // Área
    { wch: 25 }, // Treinamento
    { wch: 18 }, // Data de Realização
    { wch: 18 }, // Data de Vencimento
  ]);
  void workbook.download('template_colaboradores.xlsx');
}

