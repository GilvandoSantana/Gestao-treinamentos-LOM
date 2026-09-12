/**
 * Confere os PRIMEIROS BYTES de um arquivo (a "assinatura"/"magic
 * number") contra formatos executáveis/script conhecidos — não importa
 * a extensão ou o tipo (MIME) que a pessoa (ou o navegador) declarou.
 *
 * Não é um antivírus de verdade (não detecta malware escondido dentro
 * de um PDF ou DOCX legítimo, por exemplo) — é a primeira linha de
 * defesa contra o caso mais simples e comum: renomear um .exe pra
 * "relatorio.pdf" e enviar pra Nuvem, esperando que alguém abra sem
 * desconfiar. Achado da auditoria de segurança (07/09): "MIME type não
 * deveria ser confiado apenas pelo cliente".
 *
 * Assinaturas em si são de domínio público (documentação de formato de
 * arquivo, não segredo de malware nenhum) — checar contra elas é seguro
 * e não exige nenhuma base de dados de vírus.
 */

interface DangerousSignature {
  label: string;
  matches: (buf: Buffer) => boolean;
}

const DANGEROUS_SIGNATURES: DangerousSignature[] = [
  {
    label: "executável do Windows (.exe, .dll)",
    matches: (buf) => buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a, // "MZ"
  },
  {
    label: "executável do Linux (ELF)",
    matches: (buf) => buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46,
  },
  {
    label: "executável do macOS (Mach-O)",
    matches: (buf) => {
      if (buf.length < 4) return false;
      const magic = buf.readUInt32BE(0);
      return magic === 0xfeedface || magic === 0xfeedfacf || magic === 0xcafebabe || magic === 0xcefaedfe || magic === 0xcffaedfe;
    },
  },
  {
    label: "script (shebang #!)",
    matches: (buf) => buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21, // "#!"
  },
];

/**
 * Devolve o nome do tipo perigoso detectado, ou null se o começo do
 * arquivo não bate com nenhuma assinatura conhecida. Só precisa dos
 * primeiros bytes — funciona bem mesmo recebendo só o primeiro pedaço
 * de um envio em partes, sem precisar do arquivo inteiro montado.
 */
export function detectDangerousFileSignature(buffer: Buffer): string | null {
  for (const signature of DANGEROUS_SIGNATURES) {
    if (signature.matches(buffer)) return signature.label;
  }
  return null;
}
