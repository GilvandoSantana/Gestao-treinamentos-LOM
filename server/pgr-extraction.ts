/**
 * Extração automática dos dados de uma função a partir do PGR anexado no
 * contrato (ContractsModal), pra pré-preencher a configuração de Ordem de
 * Serviço por Função (OsRoleConfigModal).
 *
 * Usa a API da Anthropic diretamente (não o `forge` genérico de
 * server/_core/llm.ts, que é de outro provedor e usa outro modelo) porque
 * precisamos de leitura nativa de PDF com boa qualidade de extração de um
 * documento de PGR real (formatação livre, várias páginas, texto corrido).
 *
 * Isto é sempre uma SUGESTÃO: o admin revisa e confirma antes de salvar —
 * nunca grava direto no banco. É dado de segurança do trabalho; uma
 * extração errada não revisada pode ser perigosa.
 */

import { ENV } from "./_core/env";

export interface ExtractedOsFields {
  area: string;
  maquinasEquipamentos: string;
  tarefas: string;
  agentesFisicos: string;
  agentesQuimicos: string;
  agentesBiologicos: string;
  agentesErgonomicos: string;
  agentesAcidentes: string;
}

const FIELD_DESCRIPTIONS: Record<keyof ExtractedOsFields, string> = {
  area: "Área ou setor de atuação da função, conforme o PGR.",
  maquinasEquipamentos: "Máquinas, equipamentos e ferramentas utilizados por quem exerce a função.",
  tarefas: "Descrição das atividades/tarefas realizadas pela função — copie/resuma fielmente o que o PGR descreve, sem adicionar nada que não esteja lá.",
  agentesFisicos: "Agentes de risco físico (ruído, calor, vibração, etc.) a que a função está exposta, conforme descrito no PGR.",
  agentesQuimicos: "Agentes de risco químico a que a função está exposta, conforme descrito no PGR.",
  agentesBiologicos: "Agentes de risco biológico a que a função está exposta, conforme descrito no PGR. Se o PGR disser explicitamente que não há exposição, use 'NA.'.",
  agentesErgonomicos: "Agentes de risco ergonômico a que a função está exposta, conforme descrito no PGR.",
  agentesAcidentes: "Agentes de risco de acidente a que a função está exposta, conforme descrito no PGR.",
};

const FIELD_KEYS = Object.keys(FIELD_DESCRIPTIONS) as (keyof ExtractedOsFields)[];

const TOOL_NAME = "preencher_os_por_funcao";

// Limite de custo: cada chamada manda o PGR inteiro (até 32MB) pra API
// paga da Anthropic — sem limite nenhum, um clique repetido (por
// impaciência, ou testando várias funções seguidas) vira custo real sem
// controle. 20 por contrato a cada hora dá espaço de sobra pra configurar
// várias funções de uma vez, mas põe um teto contra uso descontrolado.
const EXTRACTION_LIMIT = 20;
const EXTRACTION_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const extractionAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

export function checkExtractionRateLimit(contractSlug: string): number | null {
  const now = Date.now();
  for (const [key, record] of Array.from(extractionAttempts.entries())) {
    if (now - record.firstAttemptAt > EXTRACTION_WINDOW_MS) extractionAttempts.delete(key);
  }

  const record = extractionAttempts.get(contractSlug);
  if (!record) return null;
  if (now - record.firstAttemptAt > EXTRACTION_WINDOW_MS) {
    extractionAttempts.delete(contractSlug);
    return null;
  }
  if (record.count >= EXTRACTION_LIMIT) {
    return EXTRACTION_WINDOW_MS - (now - record.firstAttemptAt);
  }
  return null;
}

export function registerExtractionAttempt(contractSlug: string): void {
  const now = Date.now();
  const record = extractionAttempts.get(contractSlug);
  if (!record || now - record.firstAttemptAt > EXTRACTION_WINDOW_MS) {
    extractionAttempts.set(contractSlug, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
  }
}

function buildToolSchema() {
  const properties: Record<string, unknown> = {};
  for (const key of FIELD_KEYS) {
    properties[key] = { type: "string", description: FIELD_DESCRIPTIONS[key] };
  }
  return {
    type: "object",
    properties,
    required: FIELD_KEYS,
  };
}

/**
 * Baixa o PGR (PDF) do contrato e pede pra IA extrair, especificamente para
 * a função informada, os campos que preenchem a Ordem de Serviço.
 */
export async function extractOsFieldsFromPgr(
  pgrFileUrl: string,
  role: string,
  contractSlug: string
): Promise<ExtractedOsFields> {
  if (!ENV.anthropicApiKey) {
    throw new Error(
      "A extração automática não está configurada neste servidor (falta a variável ANTHROPIC_API_KEY)."
    );
  }

  const remainingMs = checkExtractionRateLimit(contractSlug);
  if (remainingMs !== null) {
    const minutes = Math.ceil(remainingMs / 60000);
    throw new Error(
      `Limite de extrações automáticas atingido pra este contrato (protege contra custo descontrolado). ` +
        `Tente de novo em ${minutes} minuto${minutes !== 1 ? "s" : ""}, ou preencha manualmente por enquanto.`
    );
  }
  registerExtractionAttempt(contractSlug);

  const pdfResponse = await fetch(pgrFileUrl);
  if (!pdfResponse.ok) {
    throw new Error("Não foi possível baixar o PGR anexado para fazer a extração.");
  }

  const arrayBuffer = await pdfResponse.arrayBuffer();
  const MAX_BYTES = 32 * 1024 * 1024;
  if (arrayBuffer.byteLength > MAX_BYTES) {
    throw new Error("O PGR anexado é grande demais para a extração automática (limite de 32MB).");
  }
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Preenche os campos da Ordem de Serviço (NR-01) com os dados encontrados no PGR para a função pedida.",
          input_schema: buildToolSchema(),
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            {
              type: "text",
              text:
                `Este é o PGR (Programa de Gerenciamento de Riscos) de um contrato. ` +
                `Encontre a parte referente especificamente à função "${role}" e extraia dela, ` +
                `de forma completa e fiel ao que está escrito no documento, os campos pedidos pela ` +
                `ferramenta. Use o texto e os dados reais do PGR — nunca invente, resuma de menos ` +
                `nem complete com informação que não esteja no documento. Se alguma informação ` +
                `realmente não existir no PGR para essa função, deixe o campo como string vazia. ` +
                `Responda só chamando a ferramenta fornecida.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao consultar a IA para extrair os dados do PGR (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; input?: Record<string, unknown> }>;
  };
  const toolUse = (data.content ?? []).find((block) => block.type === "tool_use");
  if (!toolUse?.input) {
    throw new Error("A IA não retornou os dados extraídos. Tente novamente ou preencha manualmente.");
  }

  const input = toolUse.input as Partial<Record<keyof ExtractedOsFields, string>>;
  const result = {} as ExtractedOsFields;
  for (const key of FIELD_KEYS) {
    result[key] = typeof input[key] === "string" ? (input[key] as string) : "";
  }
  return result;
}
