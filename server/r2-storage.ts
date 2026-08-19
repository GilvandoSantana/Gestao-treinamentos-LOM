/**
 * Cloudflare R2 — armazenamento físico dos arquivos da Nuvem.
 *
 * O R2 é compatível com a API do S3, então usamos o SDK oficial da AWS
 * apontando pro endpoint do Cloudflare. As credenciais NUNCA saem do
 * servidor — o navegador nunca fala direto com o R2. Upload passa pelo
 * servidor (que recebe o arquivo e envia pro R2); download usa uma URL
 * assinada de curta duração, gerada aqui, nunca um link público fixo.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";

export const isR2Configured = Boolean(accountId && accessKeyId && secretAccessKey && R2_BUCKET_NAME);

const client = isR2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  : null;

function requireClient(): S3Client {
  if (!client) {
    throw new Error(
      "Cloudflare R2 não está configurado. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET_NAME no Railway."
    );
  }
  return client;
}

export async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await requireClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

export async function deleteFromR2(key: string): Promise<void> {
  try {
    await requireClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error(`[R2] Falha ao excluir "${key}":`, error);
  }
}

/** URL temporária de download — expira em 1 hora por padrão. O bucket é
 * privado; esta é a única forma de baixar um arquivo. */
export async function getR2DownloadUrl(key: string, fileName: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
  });
  return getSignedUrl(requireClient(), command, { expiresIn: expiresInSeconds });
}

/** Mesma URL assinada, mas sem forçar download — usada pra pré-visualizar
 * PDF/imagem direto no navegador. */
export async function getR2PreviewUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key });
  return getSignedUrl(requireClient(), command, { expiresIn: expiresInSeconds });
}
