import type { Express } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createContext } from './_core/context';
import { getCurrentInstaller } from './db-desktop-installer';
import { getR2DownloadUrl } from './r2-storage';

export function registerDesktopUpdateRoutes(app: Express) {
  app.get('/api/desktop-update/:asset', async (req, res) => {
    try {
      const ctx = await createContext({ req, res } as unknown as Parameters<typeof createContext>[0]);
      if (!ctx.isSiteAdmin) { res.status(401).end(); return; }
      const installer = await getCurrentInstaller();
      if (!installer?.sha512) { res.status(404).end(); return; }
      res.setHeader('Cache-Control', 'no-store');
      if (req.params.asset === 'latest.yml') {
        const url = `installer.exe?version=${encodeURIComponent(installer.version)}`;
        // JSON is a valid YAML flow document. No filename or version is interpolated as YAML syntax.
        res.type('application/yaml').send(JSON.stringify({ version: installer.version,
          files: [{ url, sha512: installer.sha512, size: installer.fileSize }],
          path: url, sha512: installer.sha512, releaseDate: installer.uploadedAt.toISOString() }));
        return;
      }
      if (req.params.asset !== 'installer.exe' || req.query.version !== installer.version) { res.status(404).end(); return; }
      const url = await getR2DownloadUrl(installer.r2Key, installer.fileName);
      const download = await fetch(url, { signal: AbortSignal.timeout(240000) });
      if (!download.ok || !download.body) throw new Error('Installer storage unavailable');
      // Proxy only the selected installer: never forward desktop credentials to object storage.
      res.type('application/octet-stream');
      res.setHeader('Content-Length', installer.fileSize);
      await pipeline(Readable.fromWeb(download.body as any), res);
    } catch {
      if (!res.headersSent) res.status(503).json({ error: 'Atualização temporariamente indisponível.' });
      else res.destroy();
    }
  });
}
