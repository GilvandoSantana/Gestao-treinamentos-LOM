import * as XLSX from 'xlsx';
import type { Employee } from './types';

export interface ExcelRow {
  [key: string]: string | number | undefined;
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
 * - Treinamento (opcional)
 * - Data de Realização (opcional, formato: DD/MM/YYYY)
 * - Data de Vencimento (opcional, formato: DD/MM/YYYY)
 *
 * Uma linha por treinamento: para dar vários treinamentos à mesma pessoa,
 * repita o nome dela em várias linhas (o modelo baixável já mostra isso).
 */
export async function parseExcelFile(file: File): Promise<Employee[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Arquivo vazio'));
          return;
        }

        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        if (!worksheet) {
          reject(new Error('Nenhuma planilha encontrada'));
          return;
        }

        const rows: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

        if (rows.length === 0) {
          reject(new Error('Nenhum dado encontrado na planilha'));
          return;
        }

        const employees: Employee[] = [];
        const employeeMap = new Map<string, Employee>();

        for (const row of rows) {
          const nome = String(row['Nome'] || row['name'] || '').trim();
          
          if (!nome) continue;

          // Get or create employee
          let employee = employeeMap.get(nome);
          if (!employee) {
            const birthDateStr = String(row['Data de Nascimento'] || row['birthDate'] || '').trim();
            const birthDate = parseDate(birthDateStr) || undefined;

            employee = {
              id: `emp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              name: nome,
              registration: String(row['Matrícula'] || row['registration'] || '').trim() || undefined,
              role: String(row['Função'] || row['role'] || '').trim(),
              educationLevel: String(row['Escolaridade'] || row['educationLevel'] || '').trim() || undefined,
              birthDate,
              phone: String(row['Telefone'] || row['phone'] || '').trim() || undefined,
              trainings: [],
            };
            employeeMap.set(nome, employee);
            employees.push(employee);
          }

          // Add training if present
          const trainingName = String(row['Treinamento'] || row['training'] || '').trim();
          if (trainingName) {
            const completionDateStr = String(row['Data de Realização'] || row['completionDate'] || '').trim();
            const expirationDateStr = String(row['Data de Vencimento'] || row['expirationDate'] || '').trim();

            const completionDate = parseDate(completionDateStr) || new Date().toISOString().split('T')[0];
            const expirationDate = parseDate(expirationDateStr) || new Date().toISOString().split('T')[0];

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

        resolve(employees);
      } catch (error) {
        reject(new Error(`Erro ao processar arquivo: ${error instanceof Error ? error.message : 'Desconhecido'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler arquivo'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse date string in DD/MM/YYYY or YYYY-MM-DD format
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Try DD/MM/YYYY format
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD format
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
export function generateExcelTemplate(): void {
  const sampleData = [
    {
      Nome: 'João Silva',
      Matrícula: '10482',
      Função: 'Motorista',
      Escolaridade: 'Ensino Médio',
      'Data de Nascimento': '12/03/1990',
      Telefone: '(11) 99999-9999',
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
      Treinamento: 'Trabalho a Quente',
      'Data de Realização': '20/07/2025',
      'Data de Vencimento': '20/07/2026',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Treinamentos');

  // Set column widths
  worksheet['!cols'] = [
    { wch: 25 }, // Nome
    { wch: 12 }, // Matrícula
    { wch: 22 }, // Função
    { wch: 18 }, // Escolaridade
    { wch: 16 }, // Data de Nascimento
    { wch: 16 }, // Telefone
    { wch: 25 }, // Treinamento
    { wch: 18 }, // Data de Realização
    { wch: 18 }, // Data de Vencimento
  ];

  XLSX.writeFile(workbook, 'template_colaboradores.xlsx');
}
