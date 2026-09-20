import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { SimpleWorkbook } from "./xlsx-compat";

/** Gera o buffer da planilha e devolve os valores da primeira aba já lidos
 * de volta pelo exceljs — mais confiável que inspecionar o objeto interno. */
async function firstSheetValues(wb: SimpleWorkbook): Promise<unknown[][]> {
  const buffer = await (wb as unknown as { wb: ExcelJS.Workbook }).wb.xlsx.writeBuffer();
  const readBack = new ExcelJS.Workbook();
  await readBack.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = readBack.worksheets[0];
  const out: unknown[][] = [];
  ws.eachRow(row => out.push((row.values as unknown[]).slice(1)));
  return out;
}

describe("SimpleWorkbook — sanitização contra injeção de fórmula (auditoria 18/09)", () => {
  it("prefixa com apóstrofo célula de texto que começa com =, +, -, @", async () => {
    const wb = new SimpleWorkbook();
    wb.addJsonSheet("Colaboradores", [
      { nome: "=HYPERLINK(\"http://evil.example\",\"clique\")", cargo: "+1+1", obs: "-teste", tel: "@fulano" },
    ]);
    const values = await firstSheetValues(wb);
    // values[0] = cabeçalho, values[1] = linha de dados
    const [nome, cargo, obs, tel] = values[1] as string[];
    expect(nome.startsWith("=")).toBe(false);
    expect(cargo.startsWith("+")).toBe(false);
    expect(obs.startsWith("-")).toBe(false);
    expect(tel.startsWith("@")).toBe(false);
    // O conteúdo original continua presente, só não é mais interpretado como fórmula.
    expect(nome).toContain("HYPERLINK");
  });

  it("não mexe em texto normal, número ou string vazia", async () => {
    const wb = new SimpleWorkbook();
    wb.addJsonSheet("Colaboradores", [{ nome: "João da Silva", idade: 30, obs: "" }]);
    const values = await firstSheetValues(wb);
    expect(values[1][0]).toBe("João da Silva");
    expect(values[1][1]).toBe(30);
  });

  it("sanitiza também em addAoaSheet (matriz bruta)", async () => {
    const wb = new SimpleWorkbook();
    wb.addAoaSheet("Instruções", [["=SOMA(A1:A2)", "texto normal", 42]]);
    const values = await firstSheetValues(wb);
    expect((values[0][0] as string).startsWith("=")).toBe(false);
    expect(values[0][1]).toBe("texto normal");
    expect(values[0][2]).toBe(42);
  });
});
