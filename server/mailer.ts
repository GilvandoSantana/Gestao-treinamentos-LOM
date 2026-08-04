import nodemailer from "nodemailer";

/**
 * Envio real de e-mail via SMTP. Pensado para Gmail com senha de app, mas
 * funciona com qualquer provedor SMTP padrão — só trocar as variáveis de
 * ambiente.
 *
 * Variáveis de ambiente necessárias:
 * - SMTP_HOST (ex: smtp.gmail.com)
 * - SMTP_PORT (ex: 587)
 * - SMTP_USER (o endereço Gmail que envia)
 * - SMTP_PASSWORD (a senha de app do Gmail, NÃO a senha normal da conta)
 * - ALERT_RECIPIENT_EMAIL (para quem os alertas de treinamento vão; aceita
 *   múltiplos endereços separados por vírgula)
 */

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !port || !user || !pass) {
    throw new Error(
      "Configuração de e-mail incompleta. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASSWORD no Railway."
    );
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465, // 465 = SSL direto; 587 = STARTTLS
    auth: { user, pass },
  });

  return cachedTransporter;
}

export async function sendEmail(params: {
  subject: string;
  html: string;
}): Promise<boolean> {
  const recipients = process.env.ALERT_RECIPIENT_EMAIL;
  if (!recipients) {
    console.error(
      "[Mailer] ALERT_RECIPIENT_EMAIL não configurado — não há para quem enviar o e-mail."
    );
    return false;
  }

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Gestão de Treinamentos" <${process.env.SMTP_USER}>`,
      to: recipients,
      subject: params.subject,
      html: params.html,
    });
    return true;
  } catch (error) {
    console.error("[Mailer] Erro ao enviar e-mail:", error);
    return false;
  }
}
