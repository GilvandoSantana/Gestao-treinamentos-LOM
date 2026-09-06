/**
 * Acesso ao Stripe (cobrança por assinatura). Igual ao padrão já usado
 * pra Resend (server/mailer.ts) e Supabase: se as variáveis de ambiente
 * não estiverem configuradas, as funções aqui avisam com clareza em vez
 * de travar o site inteiro — o resto do sistema continua funcionando
 * normalmente, só a cobrança fica indisponível até configurar.
 *
 * Variáveis de ambiente necessárias:
 * - STRIPE_SECRET_KEY: chave secreta da API (começa com sk_)
 * - STRIPE_WEBHOOK_SECRET: segredo do endpoint de webhook (começa com whsec_)
 * - STRIPE_PRICE_ID: id do preço (Price) da assinatura mensal fixa (começa com price_)
 */

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey);
  }
  return stripeInstance;
}

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripePriceId(): string | undefined {
  return process.env.STRIPE_PRICE_ID;
}

export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
