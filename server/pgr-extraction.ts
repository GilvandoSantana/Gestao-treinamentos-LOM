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
  setorTrabalho: string;
  maquinasEquipamentos: string;
  tarefas: string;
  agentesFisicos: string;
  agentesQuimicos: string;
  agentesBiologicos: string;
  agentesErgonomicos: string;
  agentesAcidentes: string;
  medidasAdministrativas: string;
  medidasEngenharia: string;
  episMinimos: string;
}

const FIELD_DESCRIPTIONS: Record<keyof ExtractedOsFields, string> = {
  area: "Área ou setor de atuação da função, conforme o PGR.",
  setorTrabalho: "Setor de trabalho específico da função.",
  maquinasEquipamentos: "Máquinas, equipamentos e ferramentas utilizados por quem exerce a função.",
  tarefas: "Descrição das atividades/tarefas realizadas pela função.",
  agentesFisicos: "Agentes de risco físico (ruído, calor, vibração, etc.) a que a função está exposta.",
  agentesQuimicos: "Agentes de risco químico a que a função está exposta.",
  agentesBiologicos: "Agentes de risco biológico a que a função está exposta. Se não houver exposição, use 'NA.'.",
  agentesErgonomicos: "Agentes de risco ergonômico a que a função está exposta.",
  agentesAcidentes: "Agentes de risco de acidente a que a função está exposta.",
  medidasAdministrativas: "Medidas administrativas de controle já existentes para a função.",
  medidasEngenharia: "Medidas de engenharia de controle já existentes para a função.",
  episMinimos: "Lista dos EPIs (Equipamentos de Proteção Individual) mínimos exigidos para a função.",
};

const FIELD_KEYS = Object.keys(FIELD_DESCRIPTIONS) as (keyof ExtractedOsFields)[];

const TOOL_NAME = "preencher_os_por_funcao";

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
export async function extractOsFieldsFromPgr(pgrFileUrl: string, role: string): Promise<ExtractedOsFields> {
  if (!ENV.anthropicApiKey) {
    throw new Error(
      "A extração automática não está configurada neste servidor (falta a variável ANTHROPIC_API_KEY)."
    );
  }

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
                `Encontre a parte referente especificamente à função "${role}" e extraia dela ` +
                `os campos pedidos pela ferramenta. Se alguma informação não existir no documento ` +
                `para essa função, deixe o campo como string vazia — nunca invente dados. ` +
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
