import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

export async function startFixtureServer(
  fixtureDir: string,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const urlPath = req.url?.split('?')[0] ?? '/';
    const fileName = urlPath === '/' ? 'ready.html' : urlPath.replace(/^\//, '');
    const filePath = path.join(fixtureDir, fileName);
    if (!filePath.startsWith(path.resolve(fixtureDir)) || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
