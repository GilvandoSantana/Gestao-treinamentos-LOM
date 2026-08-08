/**
 * Envio de mensagem via WhatsApp, usando a API da Z-API.
 *
 * Variáveis de ambiente necessárias:
 * - ZAPI_INSTANCE_ID (painel da Z-API, criado ao configurar sua instância)
 * - ZAPI_TOKEN (token da instância)
 * - ZAPI_CLIENT_TOKEN (token de segurança da conta, exibido no painel —
 *   nem toda conta exige, mas quando exige o envio falha sem ele)
 *
 * A Z-API é um serviço pago (não tem plano gratuito permanente como o
 * Resend) — o WhatsApp Business API em si é operado pela Meta, e serviços
 * como a Z-API cobram pela ponte/instância que conecta ao número.
 */

function zapiBaseUrl(): string | null {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  if (!instanceId || !token) return null;
  return `https://api.z-api.io/instances/${instanceId}/token/${token}`;
}

/** Deixa só dígitos e garante o formato que a Z-API espera (com DDI). */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Sem código de país, assume Brasil (55) — a maioria dos números
  // cadastrados aqui deve vir só com DDD + número.
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function callZapi(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = zapiBaseUrl();
  if (!base) {
    return { ok: false, message: "ZAPI_INSTANCE_ID e/ou ZAPI_TOKEN não configurados no Railway." };
  }

  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  try {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(clientToken ? { "Client-Token": clientToken } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, message: `Z-API recusou (HTTP ${response.status}): ${text}` };
    }

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Falha de rede ao chamar a Z-API: ${detail}` };
  }
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return callZapi("/send-text", { phone: normalizePhone(phone), message });
}

export async function sendTestWhatsApp(
  phone: string
): Promise<{ success: boolean; message: string }> {
  if (!phone.trim()) {
    return { success: false, message: "Informe um número de telefone para o teste." };
  }

  const result = await sendWhatsAppMessage(
    phone,
    `Teste de envio — Gestão de Controle dos Contratos.\n\nSe você recebeu esta mensagem, os alertas de treinamento por WhatsApp estão configurados corretamente.\n\nEnviado em ${new Date().toLocaleString("pt-BR")}`
  );

  if (!result.ok) {
    return { success: false, message: result.message };
  }
  return { success: true, message: `Mensagem de teste enviada para ${phone}.` };
}
