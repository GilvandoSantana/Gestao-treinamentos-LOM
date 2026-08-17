import * as XLSX from 'xlsx';
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

        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
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
            const birthDate = parseDate(row['Data de Nascimento'] ?? row['birthDate']) || undefined;

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
            const completionDate =
              parseDate(row['Data de Realização'] ?? row['completionDate']) ||
              new Date().toISOString().split('T')[0];
            const expirationDate =
              parseDate(row['Data de Vencimento'] ?? row['expirationDate']) ||
              new Date().toISOString().split('T')[0];

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
