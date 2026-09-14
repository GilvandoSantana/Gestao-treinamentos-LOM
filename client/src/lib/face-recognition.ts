/**
 * Reconhecimento facial de colaboradores, rodando inteiramente no
 * navegador (nada de foto é enviado a nenhum serviço externo) — usa as
 * fotos já cadastradas no sistema (mesma foto do crachá) como galeria de
 * comparação. Biblioteca: @vladmandic/face-api (fork mantido do
 * face-api.js), modelos hospedados no próprio projeto em /models.
 *
 * A biblioteca (~1.3MB com TensorFlow.js embutido) só é baixada quando
 * alguém de fato abre o leitor facial — import() dinâmico aqui, em vez de
 * import no topo do arquivo, pra não pesar o carregamento do Almoxarifado
 * pra quem nunca usa essa função.
 */

import type * as FaceApiNamespace from '@vladmandic/face-api';

const MODEL_URL = '/models';

let faceApiPromise: Promise<typeof FaceApiNamespace> | null = null;
function getFaceApi(): Promise<typeof FaceApiNamespace> {
  if (!faceApiPromise) {
    faceApiPromise = import('@vladmandic/face-api');
  }
  return faceApiPromise;
}

let modelsLoadedPromise: Promise<void> | null = null;

/** Carrega a biblioteca e os modelos uma única vez por sessão do navegador. */
export function loadFaceModels(): Promise<void> {
  if (!modelsLoadedPromise) {
    modelsLoadedPromise = getFaceApi().then((faceapi) =>
      Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]).then(() => undefined)
    );
  }
  return modelsLoadedPromise;
}

export interface FaceGalleryEntry {
  employeeId: string;
  employeeName: string;
  descriptor: Float32Array;
}

// Descritores já calculados nessa sessão do navegador, pra não reprocessar
// a mesma foto de novo toda vez que o leitor for aberto.
const descriptorCache = new Map<string, Float32Array>();

async function computeDescriptorFromUrl(url: string): Promise<Float32Array | null> {
  const faceapi = await getFaceApi();
  const img = await faceapi.fetchImage(url);
  const result = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result?.descriptor ?? null;
}

/**
 * Monta a galeria de rostos a partir dos colaboradores que têm foto
 * cadastrada. Colaborador sem foto, ou cuja foto não tem um rosto
 * detectável (foto de corpo inteiro, ilustração, etc.), fica de fora da
 * galeria — sem quebrar o resto.
 */
export async function buildFaceGallery(
  employees: { id: string; name: string; photoUrl: string | null }[]
): Promise<FaceGalleryEntry[]> {
  const withPhoto = employees.filter(
    (e): e is { id: string; name: string; photoUrl: string } => !!e.photoUrl
  );

  const entries = await Promise.all(
    withPhoto.map(async (e) => {
      const cacheKey = `${e.id}:${e.photoUrl}`;
      let descriptor = descriptorCache.get(cacheKey);
      if (!descriptor) {
        try {
          const computed = await computeDescriptorFromUrl(e.photoUrl);
          if (!computed) return null;
          descriptor = computed;
          descriptorCache.set(cacheKey, descriptor);
        } catch {
          return null;
        }
      }
      return { employeeId: e.id, employeeName: e.name, descriptor } as FaceGalleryEntry;
    })
  );

  return entries.filter((e): e is FaceGalleryEntry => e !== null);
}

// Distância euclidiana abaixo disso é considerada a mesma pessoa. Valor
// recomendado pela própria biblioteca pra esse modelo (128 dimensões).
const MATCH_THRESHOLD = 0.5;

export interface FaceMatchResult {
  employeeId: string;
  employeeName: string;
  distance: number;
}

/** Detecta o rosto num frame de vídeo/imagem ao vivo e compara com a galeria. */
export async function matchFaceFromVideo(
  video: HTMLVideoElement,
  gallery: FaceGalleryEntry[]
): Promise<FaceMatchResult | null> {
  if (gallery.length === 0) return null;

  const faceapi = await getFaceApi();
  const result = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result) return null;

  let best: FaceMatchResult | null = null;
  for (const entry of gallery) {
    const distance = faceapi.euclideanDistance(result.descriptor, entry.descriptor);
    if (distance < MATCH_THRESHOLD && (!best || distance < best.distance)) {
      best = { employeeId: entry.employeeId, employeeName: entry.employeeName, distance };
    }
  }
  return best;
}
