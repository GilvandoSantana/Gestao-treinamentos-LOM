export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Usada para extrair automaticamente os dados de função (área, tarefas,
  // agentes ambientais, EPIs) do PGR anexado no contrato, na Ordem de
  // Serviço (Documentação). Ver server/pgr-extraction.ts.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
};
