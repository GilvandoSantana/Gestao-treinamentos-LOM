import express, { type Express, type Request } from 'express';
import { v4 as uuid } from 'uuid';
import { createContext } from './_core/context';
import { csrfProtection } from './_core/csrf';
import { reserveStorageCapacity, releaseStorageReservation, canAccessFile, canAccessFolder, createFileRecord, getFileById, getStorageInfo, isLockActive, uploadNewVersion } from './db-cloud';
import { abortMultipartUpload, completeMultipartUpload, createMultipartUpload, deleteFromR2, getObjectSize, isR2Configured, uploadPartToR2 } from './r2-storage';
import { logActivity } from './db-activity';
import { detectDangerousFileSignature } from './file-signature';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export function validateDeclaredSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > MAX_UPLOAD_BYTES) {
    throw new Error('Informe um tamanho válido, maior que zero e até 2 GB.');
  }
  return value;
}

type Part = { etag: string; size: number };
export function measuredParts(parts: Map<number, Part>, expectedSize: number) {
  const sorted = Array.from(parts).sort(([a], [b]) => a - b);
  if (!sorted.length || sorted.some(([n], index) => n !== index + 1)) throw new Error('Há partes faltando no envio.');
  const size = sorted.reduce((sum, [, part]) => sum + part.size, 0);
  if (size !== expectedSize) throw new Error('O tamanho recebido não corresponde ao arquivo informado.');
  return { size, parts: sorted.map(([partNumber, part]) => ({ partNumber, etag: part.etag })) };
}

type Upload = {
  reservationId: string;
  kind: 'cloud' | 'cloudVersion'; contract: string; owner: string; key: string;
  fileId: string; folderId: string | null; name: string; mimeType: string;
  expectedSize: number; startedAt: number; busy: boolean; parts: Map<number, Part>;
};

export function registerCloudUploadRoutes(app: Express) {
  const uploads = new Map<string, Upload>();
  const cleanup = setInterval(() => {
    for (const [id, upload] of Array.from(uploads)) {
      if (!upload.busy && Date.now() - upload.startedAt > 2 * 60 * 60 * 1000) {
        uploads.delete(id);
        void abortMultipartUpload(upload.key, id);
        void releaseStorageReservation(upload.reservationId).catch(error => console.error("[CloudUpload] Reservation cleanup failed", error));
      }
    }
  }, 15 * 60 * 1000);
  cleanup.unref();

  async function access(req: Request, res: express.Response) {
    const ctx = await createContext({ req, res } as Parameters<typeof createContext>[0]);
    if (!ctx.isSiteAdmin || !ctx.siteAdminUsername) throw new Error('Não autorizado.');
    if (ctx.siteRole !== 'admin' && !ctx.sitePermissions?.manageCloud) throw new Error('Sem permissão para enviar arquivos.');
    if (!ctx.siteContract) throw new Error('Selecione um contrato válido.');
    return ctx;
  }

  for (const kind of ['cloud', 'cloudVersion'] as const) {
    const base = kind === 'cloud' ? '/api/cloud-upload' : '/api/cloud-version-upload';
    app.post(`${base}/start`, csrfProtection, async (req, res) => {
      let reservationId: string | undefined;
      try {
        const ctx = await access(req, res);
        const expectedSize = validateDeclaredSize(req.body?.fileSize);
        if (!isR2Configured) throw new Error('Armazenamento não configurado.');
        const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : fileName;
        if (!fileName || !name) throw new Error('Informe o nome do arquivo.');
        if (Array.from(uploads.values()).filter(u => u.owner === ctx.siteAdminUsername).length >= 20) throw new Error('Há muitos envios pendentes. Aguarde a conclusão.');
        const fileId = kind === 'cloud' ? uuid() : String(req.body?.fileId ?? '');
        const existing = kind === 'cloudVersion' ? await getFileById(fileId) : undefined;
        const folderId = kind === 'cloudVersion' ? existing?.folderId ?? null : (typeof req.body?.folderId === 'string' ? req.body.folderId : null);
        const scope = { username: ctx.siteAdminUsername!, isMasterAdmin: ctx.siteRole === 'admin' };
        if (kind === 'cloudVersion') {
          if (!existing || existing.deletedAt || existing.contractSlug !== ctx.siteContract || !await canAccessFile(ctx.siteContract!, fileId, scope)) throw new Error('Arquivo não encontrado ou sem acesso.');
          if (existing.lockedBy && existing.lockedBy !== ctx.siteAdminUsername && isLockActive(existing.lockedBy, existing.lockedAt)) throw new Error('Arquivo em edição por outra pessoa.');
        } else if (folderId && !await canAccessFolder(ctx.siteContract!, folderId, scope)) throw new Error('Pasta não encontrada ou sem acesso.');
        const storage = await getStorageInfo(ctx.siteContract!);
        if (storage.usedBytes + expectedSize > storage.limitBytes) throw new Error('Espaço de armazenamento insuficiente.');
        const key = `${ctx.siteContract}/${uuid()}-${fileName.replace(/[/\\]/g, '_')}`;
        const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'application/octet-stream';
        reservationId = uuid();
        await reserveStorageCapacity(ctx.siteContract!, expectedSize, reservationId);
        const uploadId = await createMultipartUpload(key, mimeType);
        uploads.set(uploadId, { reservationId, kind, contract: ctx.siteContract!, owner: ctx.siteAdminUsername!, key, fileId, folderId, name, mimeType, expectedSize, startedAt: Date.now(), busy: false, parts: new Map() });
        res.json({ uploadId, r2Key: key });
      } catch (error) { if (reservationId) await releaseStorageReservation(reservationId).catch(console.error); res.status(400).json({ error: error instanceof Error ? error.message : 'Falha ao iniciar envio.' }); }
    });

    app.post(`${base}/part`, csrfProtection, express.raw({ limit: '20mb', type: 'application/octet-stream' }), async (req, res) => {
      let upload: Upload | undefined;
      try {
        const ctx = await access(req, res);
        const uploadId = String(req.query.uploadId ?? '');
        const candidate = uploads.get(uploadId);
        if (!candidate || candidate.kind !== kind || candidate.contract !== ctx.siteContract || candidate.owner !== ctx.siteAdminUsername) throw new Error('Envio não encontrado.');
        if (candidate.busy) throw new Error('Envio ocupado. Tente novamente.');
        const partNumber = Number(req.query.partNumber);
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new Error('Número de parte inválido.');
        if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('Parte vazia.');
        // Assinatura (primeiros bytes) só pode ser conferida na PRIMEIRA
        // parte — é onde ela sempre está, não importa o tamanho total do
        // arquivo. Rejeita o envio inteiro se bater com um formato
        // executável/script conhecido, não importa o nome ou tipo
        // declarado (achado de auditoria de segurança, 07/09). Limpa a
        // reserva de espaço e a sessão do R2 na hora — sem isso, ficaria
        // preso até a limpeza periódica (2h depois) resolver sozinha.
        if (partNumber === 1) {
          const dangerous = detectDangerousFileSignature(req.body);
          if (dangerous) {
            uploads.delete(uploadId);
            await abortMultipartUpload(candidate.key, uploadId).catch(() => {});
            await releaseStorageReservation(candidate.reservationId).catch(() => {});
            throw new Error(
              `Este arquivo parece ser um ${dangerous}, não o tipo de documento esperado — envio bloqueado por segurança.`
            );
          }
        }
        const received = Array.from(candidate.parts.values()).reduce((sum, part) => sum + part.size, 0);
        if (received - (candidate.parts.get(partNumber)?.size ?? 0) + req.body.length > candidate.expectedSize) throw new Error('O envio excede o tamanho informado.');
        upload = candidate; upload.busy = true;
        const etag = await uploadPartToR2(upload.key, uploadId, partNumber, req.body);
        upload.parts.set(partNumber, { etag, size: req.body.length });
        res.json({ etag });
      } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Falha ao enviar parte.' }); }
      finally { if (upload) upload.busy = false; }
    });

    app.post(`${base}/complete`, csrfProtection, async (req, res) => {
      let upload: Upload | undefined;
      let committed = false;
      const uploadId = String(req.body?.uploadId ?? '');
      try {
        const ctx = await access(req, res);
        const candidate = uploads.get(uploadId);
        if (!candidate || candidate.kind !== kind || candidate.contract !== ctx.siteContract || candidate.owner !== ctx.siteAdminUsername) throw new Error('Envio não encontrado.');
        if (candidate.busy) throw new Error('Envio ocupado. Tente novamente.');
        upload = candidate; upload.busy = true;
        const scope = { username: ctx.siteAdminUsername!, isMasterAdmin: ctx.siteRole === 'admin' };
        if (kind === 'cloudVersion' && !await canAccessFile(upload.contract, upload.fileId, scope)) throw new Error('Acesso ao arquivo removido.');
        if (kind === 'cloud' && upload.folderId && !await canAccessFolder(upload.contract, upload.folderId, scope)) throw new Error('Acesso à pasta removido.');
        const measured = measuredParts(upload.parts, upload.expectedSize);
        // Both the ETags and byte count come from the server, never /complete input.
        await completeMultipartUpload(upload.key, uploadId, measured.parts);
        const fileSize = await getObjectSize(upload.key);
        if (fileSize !== measured.size) throw new Error('Tamanho do objeto armazenado divergente.');
        const file = kind === 'cloud'
          ? await createFileRecord({ id: upload.fileId, contractSlug: upload.contract, folderId: upload.folderId, name: upload.name, r2Key: upload.key, reservationId: upload.reservationId, fileSize, mimeType: upload.mimeType, uploadedBy: upload.owner })
          : await uploadNewVersion(uuid(), upload.fileId, upload.contract, { r2Key: upload.key, reservationId: upload.reservationId, fileSize, mimeType: upload.mimeType, uploadedBy: upload.owner });
        committed = true;
        uploads.delete(uploadId);
        void logActivity({ username: upload.owner, role: ctx.siteRole, action: kind === 'cloud' ? 'cloud.fileUpload' : 'cloud.fileNewVersion', targetType: 'cloudFile', targetId: file.id, targetName: file.name });
        res.json({ success: true, file });
      } catch (error) {
        if (upload && !committed) {
          uploads.delete(uploadId);
          await abortMultipartUpload(upload.key, uploadId);
          await releaseStorageReservation(upload.reservationId).catch(console.error);
          try { await deleteFromR2(upload.key); } catch (cleanupError) { console.error('[CloudUpload] Cleanup failed:', cleanupError); }
        }
        res.status(400).json({ error: error instanceof Error ? error.message : 'Falha ao concluir envio.' });
      }
    });
  }
}

