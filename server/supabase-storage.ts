import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase credentials not configured. Certificate uploads will not work."
  );
}

// Cliente criado sob demanda, na hora do primeiro uso real — não na
// importação do módulo. Cada função já confere se as credenciais existem
// antes de chegar aqui, mas criar o cliente eagerly com string vazia
// derruba (createClient lança "supabaseUrl is required") assim que
// qualquer arquivo importa este módulo, mesmo sem nunca fazer upload —
// isso já quebrou testes automatizados que nem mexem com Supabase.
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

const BUCKET_NAME = "certificates";
const PHOTOS_BUCKET = "photos";

export interface UploadResult {
  path: string;
  url: string;
  fileName: string;
  size: number;
}

/**
 * Extrai o caminho DENTRO do bucket a partir de uma URL pública já
 * guardada no banco (ex: ".../object/public/certificates/fds/lom/167-
 * nome.pdf" -> "fds/lom/167-nome.pdf"). Usada tanto pra apagar quanto
 * pra gerar uma URL assinada nova a partir do que já está salvo — sem
 * precisar de nenhuma migração de dado, já que o caminho sempre esteve
 * embutido na própria URL guardada.
 */
export function extractStoragePath(bucketName: string, storedValue: string): string {
  const marker = `/object/public/${bucketName}/`;
  const idx = storedValue.indexOf(marker);
  if (idx === -1) return storedValue; // já veio só o caminho, sem URL completa
  return decodeURIComponent(storedValue.slice(idx + marker.length));
}

/**
 * URL assinada de curta duração — funciona independente do bucket estar
 * público ou privado, mas só passa a ser a ÚNICA forma de acessar o
 * arquivo depois que o bucket virar privado no painel do Supabase
 * (troca que exige acesso ao painel, não dá pra fazer só com a chave da
 * API — ver conversa sobre a auditoria de segurança, achado #8).
 */
async function getSignedUrl(bucketName: string, storedValue: string, expiresInSeconds = 3600): Promise<string> {
  const path = extractStoragePath(bucketName, storedValue);
  const { data, error } = await getSupabase().storage.from(bucketName).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error("Falha ao gerar link de download.");
  return data.signedUrl;
}

export async function uploadCertificateToSupabase(
  file: Buffer | Uint8Array,
  fileName: string,
  mimeType: string = "application/octet-stream"
): Promise<UploadResult> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured");
    }

    // Generate a unique file path
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;
    const filePath = `certificates/${uniqueFileName}`;

    // Upload to Supabase Storage
    const { data, error } = await getSupabase().storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase upload error: ${error.message}`);
    }

    if (!data) {
      throw new Error("No data returned from Supabase upload");
    }

    // Get the public URL
    const { data: publicUrlData } = getSupabase().storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return {
      path: filePath,
      url: publicUrlData.publicUrl,
      fileName: uniqueFileName,
      size: file.length,
    };
  } catch (error) {
    console.error("Error uploading certificate to Supabase:", error);
    throw error;
  }
}

export async function deleteCertificateFromSupabase(
  fileUrlOrPath: string
): Promise<boolean> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured");
    }

    // Achado de auditoria de segurança (07/09): esta função recebia a URL
    // PÚBLICA completa (o jeito que fica guardado no banco), mas passava
    // direto pro remove() sem extrair o caminho de dentro do bucket —
    // diferente de deleteFdsFromSupabase/deleteCloudFileFromSupabase, que
    // já faziam essa extração corretamente. Na prática, isso significava
    // que excluir um certificado nunca removia o arquivo de verdade do
    // Supabase, só o registro no banco.
    const filePath = extractStoragePath(BUCKET_NAME, fileUrlOrPath);

    const { error } = await getSupabase().storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      throw new Error(`Supabase delete error: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error("Error deleting certificate from Supabase:", error);
    throw error;
  }
}

export async function getCertificateUrl(filePath: string): Promise<string> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured");
    }

    const { data } = getSupabase().storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error("Error getting certificate URL from Supabase:", error);
    throw error;
  }
}

/** URL assinada (curta duração) a partir do que já está guardado no
 * banco (certificate.fileUrl) — usada pelo cliente pra abrir/baixar,
 * em vez de confiar na URL pública guardada, que deixa de funcionar
 * assim que o bucket virar privado. */
export async function getSignedCertificateUrl(storedFileUrl: string, expiresInSeconds = 3600): Promise<string> {
  return getSignedUrl(BUCKET_NAME, storedFileUrl, expiresInSeconds);
}

export async function uploadPhotoToSupabase(
  file: Buffer | Uint8Array,
  employeeId: string,
  mimeType: string = "image/jpeg"
): Promise<UploadResult> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured");
    }

    // Determine extension from mimeType
    let ext = 'jpg';
    if (mimeType === 'image/png') ext = 'png';
    else if (mimeType === 'image/jpeg') ext = 'jpeg';

    // Use employeeId as the filename to avoid database changes
    const filePath = `${employeeId}.${ext}`;

    const { data, error } = await getSupabase().storage
      .from(PHOTOS_BUCKET)
      .upload(filePath, file, {
        contentType: mimeType,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      throw new Error(`Supabase photo upload error: ${error.message}`);
    }

    const { data: publicUrlData } = getSupabase().storage
      .from(PHOTOS_BUCKET)
      .getPublicUrl(filePath);

    return {
      path: filePath,
      url: publicUrlData.publicUrl,
      fileName: `${employeeId}.${ext}`,
      size: file.length,
    };
  } catch (error) {
    console.error("Error uploading photo to Supabase:", error);
    throw error;
  }
}

export async function getPhotoUrl(employeeId: string): Promise<string | null> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) return null;

    // List files once with the employeeId prefix instead of checking each extension separately
    const { data: list, error } = await getSupabase().storage
      .from(PHOTOS_BUCKET)
      .list('', { limit: 5, search: employeeId });

    if (error || !list || list.length === 0) return null;

    const match = list.find(f => f.name.startsWith(employeeId));
    if (!match) return null;

    const { data, error: signError } = await getSupabase().storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(match.name, 3600);
    if (signError || !data) return null;

    return data.signedUrl;
  } catch (error) {
    return null;
  }
}

/**
 * Monta o mapa employeeId -> URL da foto com UMA única listagem no Supabase,
 * em vez de uma chamada de rede por colaborador (getPhotoUrl em loop), que era
 * o principal motivo da lentidão ao abrir a lista. createSignedUrls (plural)
 * assina TODOS os caminhos de uma vez, numa chamada só — createSignedUrl
 * (singular) em loop reintroduziria a mesma lentidão que isso corrigiu.
 */
export async function getAllPhotoUrls(): Promise<Map<string, string>> {
  const urls = new Map<string, string>();

  try {
    if (!supabaseUrl || !supabaseAnonKey) return urls;

    // Pagina a listagem para dar conta de bases maiores.
    const pageSize = 1000;
    let offset = 0;

    for (;;) {
      const { data: list, error } = await getSupabase().storage
        .from(PHOTOS_BUCKET)
        .list('', { limit: pageSize, offset });

      if (error || !list || list.length === 0) break;

      const employeeIdByFileName = new Map<string, string>();
      for (const file of list) {
        // Arquivos são salvos como "<employeeId>.<ext>"
        const employeeId = file.name.split('.')[0];
        if (!employeeId || urls.has(employeeId)) continue;
        employeeIdByFileName.set(file.name, employeeId);
      }

      if (employeeIdByFileName.size > 0) {
        const { data: signed } = await getSupabase()
          .storage
          .from(PHOTOS_BUCKET)
          .createSignedUrls(Array.from(employeeIdByFileName.keys()), 3600);
        for (const item of signed ?? []) {
          if (item.error || !item.path || !item.signedUrl) continue;
          const employeeId = employeeIdByFileName.get(item.path);
          if (employeeId) urls.set(employeeId, item.signedUrl);
        }
      }

      if (list.length < pageSize) break;
      offset += pageSize;
    }

    return urls;
  } catch (error) {
    console.error("[Supabase] Failed to list photos in batch:", error);
    return urls;
  }
}

/**
 * Upload de FDS (Ficha de Dados de Segurança).
 * Usa o mesmo bucket dos certificados, em pasta separada, para não exigir
 * criação de um bucket novo no Supabase.
 */
export async function uploadFdsToSupabase(
  file: Buffer | Uint8Array,
  fileName: string,
  mimeType: string = "application/pdf",
  contractSlug: string,
  documentType: string
): Promise<UploadResult> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured");
    }

    const uniqueFileName = `${Date.now()}-${fileName}`;
    const filePath = `fds/${contractSlug}/${documentType}/${uniqueFileName}`;

    const { data, error } = await getSupabase().storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { contentType: mimeType, upsert: false });

    if (error) throw new Error(`Supabase upload error: ${error.message}`);
    if (!data) throw new Error("No data returned from Supabase upload");

    const { data: publicUrlData } = getSupabase().storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return {
      path: filePath,
      url: publicUrlData.publicUrl,
      fileName: uniqueFileName,
      size: file.length,
    };
  } catch (error) {
    console.error("Error uploading FDS to Supabase:", error);
    throw error;
  }
}

export async function deleteFdsFromSupabase(fileUrl: string): Promise<void> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) return;
    const marker = `/${BUCKET_NAME}/`;
    const idx = fileUrl.indexOf(marker);
    if (idx === -1) return;
    const filePath = fileUrl.slice(idx + marker.length);
    await getSupabase().storage.from(BUCKET_NAME).remove([filePath]);
  } catch (error) {
    console.error("Error deleting FDS from Supabase:", error);
  }
}

export async function getSignedFdsUrl(storedFileUrl: string, expiresInSeconds = 3600): Promise<string> {
  return getSignedUrl(BUCKET_NAME, storedFileUrl, expiresInSeconds);
}

/**
 * Upload de um arquivo para a nuvem por contrato. Mesmo bucket usado pelos
 * certificados/FDS, em pasta própria, para não exigir configuração nova.
 */
export async function uploadCloudFileToSupabase(
  file: Buffer | Uint8Array,
  fileName: string,
  mimeType: string,
  contractSlug: string,
  folderPath: string = ""
): Promise<UploadResult> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured");
  }

  const uniqueFileName = `${Date.now()}-${fileName}`;
  const filePath = `cloud/${contractSlug}/${folderPath ? `${folderPath}/` : ""}${uniqueFileName}`;

  const { data, error } = await getSupabase().storage
    .from(BUCKET_NAME)
    .upload(filePath, file, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  if (!data) throw new Error("No data returned from Supabase upload");

  const { data: publicUrlData } = getSupabase().storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return { path: filePath, url: publicUrlData.publicUrl, fileName, size: file.length };
}

export async function deleteCloudFileFromSupabase(fileUrl: string): Promise<void> {
  try {
    const marker = `/object/public/${BUCKET_NAME}/`;
    const idx = fileUrl.indexOf(marker);
    if (idx === -1) return;
    const filePath = decodeURIComponent(fileUrl.slice(idx + marker.length));
    await getSupabase().storage.from(BUCKET_NAME).remove([filePath]);
  } catch (error) {
    console.error("[Supabase] Failed to delete cloud file:", error);
  }
}

/** Upload do anexo de uma nota fiscal — mesmo bucket, pasta própria por contrato. */
export async function uploadInvoiceFileToSupabase(
  file: Buffer | Uint8Array,
  fileName: string,
  mimeType: string,
  contractSlug: string
): Promise<UploadResult> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured");
  }

  const uniqueFileName = `${Date.now()}-${fileName}`;
  const filePath = `invoices/${contractSlug}/${uniqueFileName}`;

  const { data, error } = await getSupabase().storage
    .from(BUCKET_NAME)
    .upload(filePath, file, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  if (!data) throw new Error("No data returned from Supabase upload");

  const { data: publicUrlData } = getSupabase().storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return { path: filePath, url: publicUrlData.publicUrl, fileName, size: file.length };
}

export async function deleteInvoiceFileFromSupabase(fileUrl: string): Promise<void> {
  try {
    const marker = `/object/public/${BUCKET_NAME}/`;
    const idx = fileUrl.indexOf(marker);
    if (idx === -1) return;
    const filePath = decodeURIComponent(fileUrl.slice(idx + marker.length));
    await getSupabase().storage.from(BUCKET_NAME).remove([filePath]);
  } catch (error) {
    console.error("[Supabase] Failed to delete invoice file:", error);
  }
}

export async function getSignedInvoiceUrl(storedFileUrl: string, expiresInSeconds = 3600): Promise<string> {
  return getSignedUrl(BUCKET_NAME, storedFileUrl, expiresInSeconds);
}
