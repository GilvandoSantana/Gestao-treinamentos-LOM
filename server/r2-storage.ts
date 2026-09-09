/**
 * Cloudflare R2 — armazenamento físico dos arquivos da Nuvem.
 *
 * O R2 é compatível com a API do S3, então usamos o SDK oficial da AWS
 * apontando pro endpoint do Cloudflare. As credenciais NUNCA saem do
 * servidor — o navegador nunca fala direto com o R2. Upload passa pelo
 * servidor (que recebe o arquivo e envia pro R2); download usa uma URL
 * assinada de curta duração, gerada aqui, nunca um link público fixo.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
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

/**
 * Upload em partes (multipart) — pra arquivo grande demais pra mandar
 * numa requisição só. Usado especialmente pelo instalador do programa de
 * sincronização (~80MB+): a Railway tem um limite rígido de 5 minutos por
 * requisição HTTP, sem exceção — numa conexão mais lenta, uma única
 * requisição de 80MB podia passar disso e travar sem erro claro. Dividido
 * em pedaços de alguns MB cada, cada um bem dentro do limite, não importa
 * a velocidade da conexão.
 */
export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const result = await requireClient().send(
    new CreateMultipartUploadCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: contentType })
  );
  if (!result.UploadId) throw new Error("Falha ao iniciar o envio em partes (sem UploadId).");
  return result.UploadId;
}

/** Envia uma parte (pedaço) do arquivo — precisa do ETag devolvido aqui
 * pra completar o envio depois (completeMultipartUpload). */
export async function uploadPartToR2(
  key: string,
  uploadId: string,
  partNumber: number,
  buffer: Buffer
): Promise<string> {
  const result = await requireClient().send(
    new UploadPartCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: buffer,
    })
  );
  if (!result.ETag) throw new Error(`Falha ao enviar a parte ${partNumber} (sem ETag).`);
  return result.ETag;
}

/** Junta todas as partes já enviadas num arquivo só, de verdade, no R2. */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<void> {
  await requireClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    })
  );
}

/** Cancela um envio em partes que não vai ser completado (ex: a pessoa
 * fechou a página no meio do envio) — evita partes órfãs ocupando espaço
 * no R2 sem nunca virar um arquivo de verdade. */
export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  try {
    await requireClient().send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET_NAME, Key: key, UploadId: uploadId }));
  } catch (error) {
    console.error(`[R2] Falha ao cancelar envio em partes de "${key}":`, error);
  }
}

export async function deleteFromR2(key: string): Promise<void> {
  try {
    await requireClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error(`[R2] Falha ao excluir "${key}":`, error);
  }
}

/** Lista objetos com um prefixo (ex: "system-backups/") — usada pra ver
 * quais backups já existem, decidir quais apagar (retenção), etc. */
export async function listObjectsInR2(
  prefix: string
): Promise<{ key: string; size: number; lastModified: Date | undefined }[]> {
  const results: { key: string; size: number; lastModified: Date | undefined }[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await requireClient().send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key) results.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: obj.LastModified });
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return results;
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


export async function getObjectSize(key: string): Promise<number> {
  const result = await requireClient().send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength! < 0) throw new Error("Tamanho do objeto indisponível.");
  return result.ContentLength!;
}
